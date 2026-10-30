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
    return WORDS.findall(text.lower())


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



# Independently recompute the already frozen 128-rank comparator.
# All operations are unsigned 32-bit integers, not JavaScript float code.
MASK32 = 0xffffffff


def frozen_random_ranks(rows, ordinal):
    check(type(ordinal) is int and 0 <= ordinal < 128,
          "random seed ordinal differs from predeclared protocol")
    state = (20261027 + 2654435761 * (ordinal + 1)) & MASK32
    state = state or 1
    ordered = sorted(range(len(rows)), key=lambda i: rows[i]["pubmedID"])
    for i in range(len(ordered) - 1, 0, -1):
        state = (state ^ ((state << 13) & MASK32)) & MASK32
        state = (state ^ (state >> 17)) & MASK32
        state = (state ^ ((state << 5) & MASK32)) & MASK32
        j = (state * (i + 1)) >> 32
        ordered[i], ordered[j] = ordered[j], ordered[i]
    return ordered


def random_distribution(values):
    check(len(values) == 128, "baseline must retain 128 seeded outcomes")
    sorted_values = sorted(values)

    def quantile(fraction):
        pos = (len(values) - 1) * fraction
        lower, upper = math.floor(pos), math.ceil(pos)
        return (sorted_values[lower] +
                (sorted_values[upper] - sorted_values[lower]) * (pos - lower))

    return {
        "n": len(values),
        "mean": sum(values) / len(values),
        "p05": quantile(0.05),
        "median": quantile(0.5),
        "p95": quantile(0.95),
        "minimum": sorted_values[0],
        "maximum": sorted_values[-1],
    }


def independent_random_summary(rows, field, pct):
    trials = [simulate(rows, frozen_random_ranks(rows, ordinal), field, pct)
              for ordinal in range(128)]
    n = len(rows)
    proposed = sum(t["proposed"] for t in trials)
    premature = sum(t["proposed"] and t["missed95"] for t in trials)
    return {
        "n": 128,
        "proposedEarlyStops": proposed,
        "prematureStopsUnder95": premature,
        "missed95AmongProposed": premature / proposed if proposed else None,
        "recall": random_distribution([t["actual"] for t in trials]),
        "savedFraction": random_distribution([(n-t["inspected"]) / n for t in trials]),
    }


def verify_random_summary(rows, field, pct, reported):
    expected = independent_random_summary(rows, field, pct)
    check(type(reported) is dict, "random baseline needs a result record")
    for key in ("n", "proposedEarlyStops", "prematureStopsUnder95"):
        check(type(reported.get(key)) is int and reported[key] == expected[key],
              "independently reconstructed random count mismatch: " + key)
    observed_rate, expected_rate = reported.get("missed95AmongProposed"), expected["missed95AmongProposed"]
    check((observed_rate is None and expected_rate is None) or
          (type(observed_rate) in (float, int) and expected_rate is not None and
           math.isclose(observed_rate, expected_rate, rel_tol=1e-12, abs_tol=1e-12)),
          "independently reconstructed missed-95 rate mismatch")
    for dimension in ("recall", "savedFraction"):
        observed = reported.get(dimension)
        check(type(observed) is dict, "missing random result distribution: " + dimension)
        for stat, actual in expected[dimension].items():
            value = observed.get(stat)
            check(type(value) in (int, float) and (
                  value == actual if stat == "n" else
                  math.isclose(value, actual, rel_tol=1e-12, abs_tol=1e-12)),
                  "independent random distribution mismatch: " + dimension + "." + stat)
    return 128


def self_test():
    # Reference permutations from the original JS randomRanks, computed
    # separately before creating this independent Python implementation.
    pmids = ["10", "2", "31", "9", "7", "1"]
    rows = [{"pubmedID": p, "label_abstract_screening": str(int(i in (0, 1, 5)))}
            for i, p in enumerate(pmids)]
    golden = {
        0: [3, 4, 5, 0, 2, 1],
        1: [3, 4, 5, 2, 0, 1],
        127: [2, 0, 3, 5, 1, 4],
    }
    for ordinal, expected in golden.items():
        check(frozen_random_ranks(rows, ordinal) == expected,
              "frozen JS seeded permutation differs at ordinal " + str(ordinal))
    good = independent_random_summary(rows, "label_abstract_screening", 7)
    check(verify_random_summary(rows, "label_abstract_screening", 7, good) == 128,
          "valid random summary rejected")
    for field, invalid in (("prematureStopsUnder95", 999), ("recall.p95", -1)):
        forgery = json.loads(json.dumps(good))
        if field == "recall.p95":
            forgery["recall"]["p95"] = invalid
        else:
            forgery[field] = invalid
        try:
            verify_random_summary(rows, "label_abstract_screening", 7, forgery)
        except ValueError:
            continue
        raise ValueError("forged random statistic was incorrectly accepted: " + field)
    print("Independent source-free random baseline controls PASS: "
          "3 original JavaScript seeds, 1 valid summary, 2 forged summaries refused")


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
    random_trials = 0
    check(prereg["experiment"]["baseline"] == 128 and
          "xorshift32" in prereg["experiment"]["baselineRandomization"] and
          prereg["experiment"]["minScreenedPercent"] == 10,
          "frozen baseline inputs differ")
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
                random_trials += verify_random_summary(
                    rows, field, pct, output["comparators"][label]["policies"][name]["random128"])
                comparisons += 1
                print(task["key"], label, name, "inspected", actual["inspected"],
                      "actual_recall", f"{actual['actual']:.6f}",
                      "premature", actual["missed95"])
    check(comparisons == 18, "incomplete experiment")
    check(random_trials == 18 * 128, "incomplete independent randomized replication")
    check(report["deploymentAuthorized"] is False,
          "published result spuriously grants permission to stop")
    print("Independent original-source Python reproduction PASS:", comparisons,
          "source-locked BM25 outcomes and", random_trials,
          "independently replayed random stopping outcomes")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: python3 scripts/verify-cohen-stopping-replay.py [--self-test|cohen-stopping-study.json]")
        if sys.argv[1] == "--self-test":
            self_test()
        else:
            verify(sys.argv[1])
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as e:
        print("INDEPENDENT STOPPING REPLAY REFUSED:", str(e), file=sys.stderr)
        sys.exit(1)
