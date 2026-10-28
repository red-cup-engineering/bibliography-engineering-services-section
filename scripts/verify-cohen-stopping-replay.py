#!/usr/bin/env python3
"""Independent standard-library reproduction of six original Cohen screening
label endpoints and 18 prespecified stopping rules.

Does not import the JavaScript producer. Reads the pinned raw public sources a
second time, validates Git blob and SHA-256, reconstructs the static BM25
ranking from its recorded query, reveals source labels one at a time, and checks
the producer's source report. No paper text is written or echoed to stdout.

This verifier is independent computational evidence, NOT human peer review,
a scholarly publisher's rights grant, ASReview implementation or safe stopping
authority. Requires only Python 3 and public HTTPS to the original Git source.
"""
import csv
import hashlib
import io
import json
import math
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "research/source-pins/cohen-2006-text-screening-pilot-preregistration.json"
STOP = ROOT / "research/source-pins/cohen-2006-prospective-stopping-preregistration.json"
HEADER = ["record_id", "pubmedID", "title", "authors", "abstract", "year",
          "label_included", "label_abstract_screening"]
WORDS = re.compile(r"[a-z][a-z0-9]*")


def check(ok, msg):
    if not ok:
        raise ValueError(msg)


def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def tokenize(text):
    return WORD.findall(text.lower())


def read_original(task, commit):
    check(task["sourceCommit"] == commit, "source revision mismatch")
    path = "datasets/Cohen_2006/output/online/" + task["key"] + ".csv"
    check(task["path"] == path, "source path mismatch")
    url = f"https://raw.githubusercontent.com/LHofstee/systematic-review-datasets/{commit}/{path}"
    with urllib.request.urlopen(url, timeout=25) as response:
        check(response.status == 200, "source HTTP result not accepted")
        raw = response.read(2_000_001)
    check(len(raw) <= 2_000_000, "source exceeds bound")
    check(git_blob(raw) == task["gitBlobSha1"], "Git byte-identity drift")
    text = raw.decode("utf8")
    reader = csv.DictReader(io.StringIO(text, newline=""))
    check(reader.fieldnames == HEADER, "source schema differs")
    rows = list(reader)
    check(len(rows) == task["reportedRows"], "source count differs")
    ids = [r["pubmedID"] for r in rows]
    check(len(set(ids)) == len(ids), "duplicate source identity")
    for r in rows:
        check(r["label_included"] in ("0", "1") and
              r["label_abstract_screening"] in ("0", "1"),
              "missing/nonbinary source label")
    check(sum(int(x["label_included"]) for x in rows) == task["reportedFinalIncluded"],
          "source final count changed")
    return rows, hashlib.sha256(raw).hexdigest()


def rank(rows, query):
    # An independent Python rendering of original documented BM25 equations.
    # No source inclusion labels are read in this function.
    tokens = [tokenize(r["title"]) * 2 + tokenize(r["abstract"]) for r in rows]
    terms = [Counter(t) for t in tokens]
    lengths = [len(t) for t in tokens]
    n = len(rows)
    meanlen = sum(lengths) / n or 1.0
    q = list(dict.fromkeys(tokenize(query)))
    check(bool(q), "frozen query is empty")
    df = {word: sum(word in doc for doc in terms) for word in q}

    def score(i):
        norm = 1.2 * (0.25 + 0.75 * lengths[i] / meanlen)
        return sum(
            math.log(1 + (n - df[word] + 0.5) / (df[word] + 0.5)) *
            (terms[i][word] * 2.2) / (terms[i][word] + norm)
            for word in q if terms[i][word]
        )

    # JavaScript String.localeCompare can sort numeric-looking IDs differently
    # from Python for punctuation; PMIDs in this source are plain ASCII digits.
    # We only use the tie-breaker on exact score equality.
    ranks = sorted(range(n), key=lambda i: (-score(i), rows[i]["pubmedID"]))
    return ranks


def simulate(rows, ranked, field, pct):
    n = len(rows)
    k = math.ceil(pct * n / 100)
    minimum = math.ceil(0.10 * n)
    found = 0
    negative_run = 0
    inspected = 0
    proposed = False
    for i in ranked:
        inspected += 1
        if rows[i][field] == "1":
            found += 1
            negative_run = 0
        else:
            negative_run += 1
        if inspected >= minimum and found > 0 and negative_run >= k:
            proposed = True
            break
    total = sum(row[field] == "1" for row in rows)
    check(total > 0, "not a positive source experiment")
    return {
        "inspected": inspected,
        "found": found,
        "proposed": proposed,
        "actual": found / total,
        "sharp": found / (found + n - inspected),
        "missed95": found * 100 < total * 95,
    }


def verify(result_path):
    blob = SOURCE.read_bytes()
    prereg = json.loads(STOP.read_text(encoding="utf8"))
    original = json.loads(blob)
    report = json.loads(Path(result_path).read_text(encoding="utf8"))
    check(git_blob(blob) == prereg["existingBibliographyProtocolBlobSha1"],
          "preregistration base has changed")
    check(report["originalFrozenProtocolBlob"] == prereg["existingBibliographyProtocolBlobSha1"],
          "reported plan freeze changed")
    check(report["originalSourceCommit"] == prereg["originalSourceCommit"] ==
          original["upstreamCommit"], "source revision mismatch")
    check(len(report["comparisons"]) == 3, "unexpected cohort count")
    comparisons = 0
    for task, output in zip(prereg["tasks"], report["comparisons"], strict=True):
        rows, digest = read_original(task, report["originalSourceCommit"])
        check(digest == output["source"]["sha256"], "original-source SHA-256 disagrees")
        check(task["key"] == output["corpus"], "cohort name differs")
        ranked = rank(rows, task["query"])
        for label, field in (("titleAbstract", "label_abstract_screening"),
                             ("finalInclusion", "label_included")):
            for pct in (7, 10, 20):
                name = f"stop-{pct:02d}pct"
                actual = simulate(rows, ranked, field, pct)
                b = output["comparators"][label]["policies"][name]["bm25"]
                check(b["inspected"] == actual["inspected"] and
                      b["stopProposal"] == actual["proposed"] and
                      b["revealedPrefix"]["observedPositive"] == actual["found"] and
                      b["retrospectiveEvaluation"]["missed95PercentGoal"] == actual["missed95"] and
                      abs(b["retrospectiveEvaluation"]["actualRecall"] - actual["actual"]) < 1e-13 and
                      abs(b["sharpFiniteFrame"]["sharpWorstCaseRecall"]["value"] - actual["sharp"]) < 1e-13 and
                      b["operativeStopAuthorized"] is False,
                      "independent stopping disagreement: " + task["key"] + "/" + label + "/" + name)
                comparisons += 1
                print(task["key"], label, name, "inspected", actual["inspected"],
                      "actual_recall", f"{actual['actual']:.6f}",
                      "premature", actual["missed95"])
    check(comparisons == 18, "incomplete experiment")
    check(report["deploymentAuthorized"] is False,
          "published result spuriously grants permission to stop")
    print("Independent original-source Python reproduction PASS:", comparisons,
          "source-locked stopping policy assessments")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: python3 scripts/verify-cohen-stopping-replay.py cohen-stopping-study.json")
        verify(sys.argv[1])
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as e:
        print("INDEPENDENT STOPPING REPLAY REFUSED:", str(e), file=sys.stderr)
        sys.exit(1)
