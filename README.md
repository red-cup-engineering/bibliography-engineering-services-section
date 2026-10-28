# bibliography-engineering-services-section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Engineering policy and operations for the citation model ruled canonical by
`561-group-science-services-section`'s
`2026-08-30-science-topic-section-model.md`: depth-1 frontmatter
`references:` maps, depth-2 `<citekey>.md` bibliography carriers, and the
generated `.bib` build artifact at depth 3.

Seated as a direct sibling of `question-engineering-services-section` under
`computer-knowledge-systems-services-section/services/`: bibliography, like
question, is its own carrier-class topic rather than a subtype of another
system (contrast `term-engineering-services-section`, nested one level
deeper under `computer-glossary-systems-engineering-services-section`
because a term is specifically a glossary carrier).

## Operations

- `scripts/recognize-bibliography.mjs` / `render-bibliography.mjs` /
  `write-bibliography.mjs` / `read-bibliography.mjs` — one depth-2 carrier.
- `scripts/collect-set-of-references.mjs` — walk a scope and collect every
  `references:` triple, every depth-2 carrier, and every inline body
  citation in it.
- `scripts/reconcile-set-of-references.mjs` — the corpus's citation health
  numbers: conflicts (one citekey naming materially different works),
  probable duplicates (two citekeys naming the same work), uncovered
  citekeys (an inline `[@key]` body citation whose key is absent from that
  file's own depth-1 `references:` map — the model's actual health
  failure), citekeys without a carrier (depth-1 citekeys with no depth-2
  bibliography carrier — informational, since an ordinary depth-1-only
  citation is healthy under the model), and orphan carriers (a depth-2
  carrier no `references:` entry cites).
- `scripts/project-references-bibtex.mjs` — deterministic generated `.bib`.
- `scripts/record-set-of-references-health.mjs` — witnesses a reconciliation
  through `@red-cup-engineering/semiotic-eavt-services-section`.
- `scripts/parse-set-of-citations.mjs` — free-text citation lines to a keyed
  `references:` map, via the CSL-JSON landmark scanner in `src/citation-text.mjs`.
- `scripts/import-set-of-csl-references.mjs` — a CSL-JSON array, or a
  single bare CSL-JSON item object, to a keyed `references:` map, via the
  record formatter in `@red-cup-engineering/csl-json-services-section`. A citation carrying a DOI can be upgraded to
  CrossRef-authoritative metadata with
  `apps/bibliography-cli.mjs resolve-doi <doi> | apps/bibliography-cli.mjs import-csl`.
- `scripts/project-references-csl.mjs` — a scope's collected references as a
  CSL-JSON array, for a Pandoc `references:` bibliography.
- `src/bibliography-csl.mjs` (`./csl`) — `projectBibliographyRecordsCsl(records)`:
  depth-2 bibliography carrier records to CSL-JSON items sorted by citekey.
  The depth-1 fields go through csl-json's `toCslItem` under this engine's
  `admitReferenceEntry`; the carrier's `reference-type` (BibTeX word) names
  the CSL item type and `translator` becomes a CSL name list. Consumed by
  `@red-cup-engineering/csl-yaml-services-section` for Pandoc YAML.
- `scripts/migrate-reference-records-to-bibliography-records.mjs`
  (`src/bibliography-migration.mjs`, `./migration`) — a **one-time**
  migration of legacy `type: reference` carriers (`key, authors, year, title,
  venue` + annotation) to `type: bibliography`. No compatibility reading of
  the legacy shape exists anywhere; run it once and commit. Dry run by
  default; `--write` rewrites the migrated files in place. It never guesses:
  `key` becomes the filename stem; `authors` strings split on `;`; a year
  range keeps its first year as `year` and the original as `year-range`;
  `venue` becomes `publisher` for book-like reference types and
  `publication` otherwise; an absent `reference-type` becomes `misc` (and is
  listed as defaulted, for review, or set from `--reference-types types.json`
  keyed by filename stem); a record lacking authors, year or title, or whose
  filename stem is not a citekey, is refused and left untouched unless
  `--supplements supplements.json` (`{ "<stem>": { authors, year, title,
  "reference-type", publication, publisher } }`) supplies the missing values.
  Every migrated file is re-recognized under the bibliography carrier
  contract before it is emitted.
- `scripts/project-references-aria.mjs` (`src/bibliography-aria.mjs`) — a
  scope's collected references as W3C DPUB-ARIA 1.1 bibliography HTML
  (`doc-bibliography` / `doc-biblioentry` roles for the rendered list,
  `doc-biblioref` for `renderBiblioRefLink`'s inline citation links), the
  canonical backend for what koios.news's `bibliography.mts` currently
  hand-rolls. The visible heading label and its id/`aria-labelledby` are a
  `{label, id}` options argument (defaults `"References"` / `"references"`),
  never hardcoded English, so a site can display its own nomenclature (e.g.
  koios.news's `"Sources"`) over the one standards-conformant projection.
- `scripts/verify-set-of-references.mjs` — resolves every reference row's
  `doi` against CrossRef (via this section's own `scripts/resolve-doi.mjs`)
  and reports `agreed` / `title-mismatch` / `year-mismatch` /
  `unresolved` / `no-doi` per row, exiting 1 when any defect is found — the
  deterministic check a fabricated or paraphrased `references:` entry has
  never had.
### Bibliographic-record retrieval

Retrieving a work's authoritative record from a bibliographic database is
this section's work, not a separate one: the noun is the reference, and
these are verbs on it. They arrived here from the deleted
`scholarly-literature-services-section`, whose only real consumer was this
section's own verifier.

- `scripts/resolve-doi.mjs` — CrossRef `/works/{doi}` -> CSL-JSON.
- `scripts/search-openalex-works.mjs` / `scripts/fetch-openalex-work.mjs` —
  OpenAlex `/works` search and single-work fetch (by OpenAlex id or DOI).
  `searchOpenAlexWorks` takes an optional `filter` passed through to
  OpenAlex.
- `scripts/search-pubmed.mjs` / `scripts/fetch-pubmed-summaries.mjs` —
  PubMed E-utilities `esearch` (query -> PMIDs) and `esummary` (PMIDs ->
  CSL-JSON items). `searchPubmed` takes an optional `from`/`to` publication
  date window.

All three sources are free and keyless. Every fetching function takes an
injected `fetchImpl` (defaulting to global `fetch`), so tests run against
the recorded fixtures under `test/fixtures/` rather than the network. A
`mailto`/`email` option, when given, identifies the caller to OpenAlex's and
CrossRef's polite pools and per NCBI's usage guidelines; it never gates
access. The record shapes themselves are not decoded here — the CSL-JSON
projections of an OpenAlex work, a PubMed summary, and a CrossRef work are
a data format's business and live in
`@red-cup-engineering/csl-json-services-section`.

### Source-witnessed dual-review screening (implemented)

The package now offers a bounded **title/abstract bibliographic screening audit**,
not a general AI reviewer, a systematic-review completion certificate, or a
source-authenticating agent. It receives the pre-existing original
screening-ledger.json search/candidate form with recorded search IDs,
queries, source names and result counts.

- src/reference-screening.mjs provides dependency-free `assessRecordedScreening`.
  It preserves every original retrieval receipt, groups exact DOI-key hits,
  refuses to silently collapse **title-only apparent duplicates**, and keeps
  publisher or metadata-title conflicts unresolved. It accepts at most two
  named reviewers per candidate and an optional distinct adjudicator, with
  each vote quoting an exact UTF-16 [start,end) span of supplied metadata.
  It reports pending, included, excluded, conflict, and identity-conflict
  outcomes, per-criterion exclusions, confirmed DOI duplicate counts,
  incomplete search coverage, and unresolved candidate identities.
- src/reference-screening-csl.mjs uses the **existing original**
  `@red-cup-engineering/csl-json-services-section` bareDoi/normalizeTitle
  definitions to make/verify the identity keys; it refuses forged DOI/title
  key aliases before native screening. It does not clone CSL normalization.
- scripts/screen-candidates.mjs accepts {ledger,protocol,reviews,adjudications}
  JSON from stdin and emits an audit with no network/file writes. Its pure
  source-only mode **trusts already normalized candidate dedupe keys**.
  `--require-resolved` exits 1 on unresolved screening cases and 2 on
  malformed inputs; the normal mode can preserve negative/unfinished work.
- The existing `bibliography screen-review` command runs **CSL-verified**
  screening with the original bibliography dependency closure.
- test/reference-screening.test.mjs uses the existing cross-provider
  screening-ledger fixture and controlled adversarial decisions. It tests
  exact excerpt spans, reviewer conflicts, adjudication, missing full text,
  DOI metadata conflicts, source-search bindings, title-only duplicates,
  canonical ordering, null searches and refusal behavior.
  test/reference-screening-csl.test.mjs checks the authentic CSL adapter.

**Reconciled search counts:** the original archived fixture has 6 total
reported hits and 6 total candidate receipts, yet one OpenAlex source
records **3 receipts against 2 reported hits**, while one PubMed source
records only **2 against 3**. Aggregate totals cancel the discrepancies.
The reducer now returns perSearchReconciliation, explicit excess and
unrecorded counts, and releaseQualification.sourceCountReconciled=false.
That finding is a *metadata/audit consistency failure in a mixed demonstration
fixture*, not a discovery about OpenAlex or PubMed's real indexes.

**Machine contract:** schemas/bibliography/source-witnessed-review-request.schema.json
defines the JSON Schema 2020-12 buyer/agent request and is a package export.
It types the protocol, recorded search, citations, reviewer votes, evidence
spans and adjudication records. Schema validation does not attest that the
quoted excerpt actually appears in a source; the executable operation checks
the UTF-16 offsets against the supplied original metadata. No arbitrary
publisher-identity grant, reviewer authentication or full-text license
comes from passing this schema. See the native schema regression tests.
Reproduction (Node 22+, no installed private dependencies for the pure check):

```sh
node --test test/reference-screening.test.mjs
node scripts/screen-candidates.mjs < your-review-request.json > screening-audit.json
node scripts/screen-candidates.mjs --require-resolved < your-review-request.json
# With package dependencies installed:
bibliography screen-review < your-review-request.json
```

**Scientific validity and ethics.** Exact excerpts are verified only against
the **supplied** CSL metadata, not independent fetched paper bytes; a forged
input corpus can still contain invented passages. Distinct reviewer labels
are not authenticated independent human/agent identities. A DOI is an
identity identifier, not an endorsement of the methods or factual findings.
Returned snippets may have copyright, privacy or community-rights limits;
they are not authorized for unrestricted republication. The output
explicitly refuses full-text screening without an authorized full-text
evidence provider. Different title-only entries remain separate and marked
unconfirmed until a source-authorized identity reconciliation exists.
Counts reflect the current ledger's discovered candidate receipts, not
systematic-search recall, true study prevalence, clinical evidence
certainty or independently established source diversity.

**External comparator, not claimed parity.** Elicit currently provides
multi-database search, optional two-stage screening and source-linked
extraction, including independent dual screening on some plans
(https://support.elicit.com/en/articles/14759154-systematic-reviews-in-elicit).
Consensus provides large-corpus hybrid search, evidence-backed synthesis and
research agents (https://help.consensus.app/en/articles/9922673-how-consensus-works).
Scite classifies citation *contexts* as supporting/contrasting/mentioning
(https://scite.ai/features). This package has not demonstrated their
retrieval coverage, extraction accuracy, quality ranking, user experience
or performance at scale. Its independently testable advantage is explicit
fail-closed source-span/reviewer/identity refusal and deterministic
reproduction. A future comparison requires a preregistered held-out
reference corpus and identical buyer tasks, not speculative feature counts.

### Replayable on-demand literature discovery (implemented; not an alert daemon)

`src/reference-watch.mjs` now implements `dateWindow` and `runWatch` over the original bibliography ledger, using the existing OpenAlex and PubMed search and PubMed summary adapters, and the canonical CSL-JSON dedupe key. A caller explicitly supplies a bounded `WatchSpec`, the earlier `{searches,candidates}` ledger and an **offset-aware UTC observation instant**. Query dates are **one through 30 days inclusive**; one run permits one through four typed public metadata queries with capped 25-item first pages. It is a single **read-only acquisition call**, not a recurring scheduled job, credentialed monitoring service, full-text harvesting, or a cross-source accuracy theorem.

```json
{
  "spec": {
    "id": "library-science-publication-watch",
    "lookbackDays": 7,
    "queries": [
      { "source": "openalex", "query": "scientific metadata reproducibility" },
      { "source": "pubmed", "query": "research transparency" }
    ]
  },
  "ledger": { "searches": [], "candidates": [] },
  "now": "2026-10-27T20:00:00Z"
}
```

```sh
# Read only: stdin request, stdout result including a proposed updated ledger.
node scripts/watch-literature.mjs < watch-request.json > watch-result.json
# Or use the original bibliography command:
bibliography watch-literature < watch-request.json
# Reproduce the recorded OpenAlex and PubMed responses without network:
node --test test/reference-watch.test.mjs
```

Machine input: `schemas/bibliography/literature-watch-request.schema.json` (package export). The result carries an explicit source/time window; per-search query, count, returned-page limit and status; source-normalized new and repeated citation receipts; newly encountered DOI/title identity **candidates** awaiting review; possible source metadata edition changes that require reassessment; and provider failures as **refusals**, never fake zero-result searches. It returns `screeningInputLedger` that the existing dual-review assay can consume. `ledger` preserves the complete old receipt history without rewriting original entries.

**Recovered data-integrity obstruction:** The historical `test/fixtures/watch-ledger.json` contains two example candidates with search IDs but `searches: []`, so their original source retrieval receipts are missing. The watch retains them in custody and reports `unlinkedPriorCandidates`; it cannot invent their acquisition events. These unqualified historical candidates do **not** enter `screeningInputLedger` until a real receiving source supplies a recorded search. The archive fixtures are **synthetic examples**, not new real 2026 scientific papers.

A repeated query on the same date is refused as already observed and performs no new network request. A repeated paper from another indexed source may add a new **bibliographic source receipt** without becoming a second original work or independent scientific witness. A changed title or metadata field generates `candidateSourceRevisions`, not a claimed correction or retraction. PubMed/OpenAlex metadata do not certify complete article text, consent, source-rights for republication, scientific validity or a true retraction. Partial first-page coverage is explicit when the source reports more hits than were retrieved.

**Agentic integration boundaries:** A research agent may run the original retrieval operation and pass only newly admitted source-linked candidates to `bibliography screen-review`, then to original Science for warranted claim decisions and original Coesite research operations for actual repeated execution. Durable storage, source reconciliation, cost, approved human/editorial authority, network credentials, run scheduling, citation-context classification and external paid research orders are **not installed** by this module. For continuous autonomous watches, assign this pure, bounded run to the existing authenticated Operations Work scheduler rather than launch a second cron system or invent a self-authorizing research agent.

### Externally pinned research-benchmark identity audit (implemented)

A screening engine cannot meaningfully measure recall against **unadjudicated raw labels** and treat repeated source rows as distinct papers. The original SYNERGY research project (ASReview, [dataset/source documentation](https://github.com/asreview/synergy-dataset)) provides independent review-selection labels. Its **raw identifier CSVs** are not the finalized text-rich analysis datasets.

\`src/labeled-benchmark-audit.mjs\` introduces \`auditLabeledIdentifierCarrier({rawText,provenance})\`, a pure, source-locked assay of exactly this research-data quality boundary. It verifies the **original Git blob SHA-1 of the raw UTF-8 bytes**, also computes a SHA-256 research digest, requires a versioned upstream 40-hex Git commit and a correctly scoped identifier-file path, admits only a bounded restricted unquoted ID-CSV profile, and preserves source line numbers and exact OpenAlex work identities. It returns all unresolved contradictory labels, duplicate original identities, missing identifier observations, DOI/OpenAlex identity-map ambiguities and descriptive best/worst candidate inclusion counts **without manufacturing a gold label**. No raw source CSV is checked into the Engineering repository.

\`scripts/reproduce-synergy-identity-audit.mjs\` independently fetches only the three immutable, source-pinned upstream source paths from \`raw.githubusercontent.com/asreview/synergy-dataset\`, uses the **original bibliography fetch/retry and timeout policy**, and refuses unexpected source bytes or provider failures instead of reporting fabricated zero results. The three-pin research manifest is \`research/source-pins/synergy-2026-benchmark-identity-profiles.json\`. The command \`bibliography benchmark-audit\` also accepts a direct \`{rawText,provenance}\` JSON input for an authorized benchmark study. The operator can regenerate the original-source aggregate:

\`\`\`sh
npm install --ignore-scripts
node --test test/labeled-benchmark*.test.mjs
node scripts/reproduce-synergy-identity-audit.mjs > synergy-identity-source-audit.json
\`\`\`

The research question is whether one original indexed scholarly work can appear with **both** positive and negative labels in a raw upstream screening corpus, and how identity resolution changes admissible sample denominators. The pinned SYNERGY upstream revision is \`dc2dadfdbb98eb1b4259604789abd640aa3b693e\`. Its official README declares **271** identified Sep 2021 studies (40 included), **258** Donners 2021 studies (15 included), and **2,627** Smid 2020 studies (27 included).

| SYNERGY original ID carrier | Raw rows | Distinct OpenAlex work IDs | Label-conflicted work IDs | Raw rows lacking any DOI/OpenAlex/PMID |
| --- | ---: | ---: | ---: | ---: |
| Sep 2021 (psychology) | 273 | 271 | 0 | 0 |
| Donners 2021 (medicine) | 660 | 258 | **15** | **157** |
| Smid 2020 (mathematics/computing) | 3,980 | 2,627 | **21** | **1,035** |

A **raw label conflict** means both 0 and 1 appear among source rows for one OpenAlex identifier. In Donners all 15 positive-labeled source records have such an opposing source row; in Smid 21 of 27 positive-labeled source records do. If a naive deduplicator chooses exclusion for a conflicting ID, it could erase every Donners raw positive and all but six Smid positives. **That is a counterfactual demonstration of bad benchmark admission, NOT a statement about ASReview's actual implemented deduplicator.** The fact that unique OpenAlex identity counts equal published benchmark sizes is an important cross-check, but does not prove the original dataset compilation algorithm or independently authenticate labels.

**Epistemic and rights boundaries.** These labels are reported systematic-review *inclusion decisions*, not scientific facts. An inclusion-plus-exclusion pair is not evidence that the **published systematic review** is scientifically contradictory; it can reflect overlapping acquisition and final dataset processing. We do not infer a resolved gold label or a full-text screening verdict. The pinned ID-only files do not contain title/abstract text sufficient to evaluate screening recall, an active-learning model or Elicit/ASReview accuracy. GitHub's SYNERGY repository is marked CC0, but source-specific data and original published work have distinct attribution and rights; this package republishes only aggregates, externally addressable scholarly IDs and software, not a vendor's paper corpus. Unknown and contradictory data remain typed, not silently repaired or promoted to verified truth.

**Next independent scientific requirement:** acquire and rights-qualify the actual text-rich finalized dataset editions, original adjudication rules and benchmark study protocols; preregister train/test splits and held-out model/baseline comparison; then measure WSS@95, missed studies, reviewer interventions, time and cost. [Original Lenticule Library Science issue #1](https://github.com/lenticule-science/library-science-services-section/issues/1) owns that external performance experiment. An actual benchmark comparison or economic claim of beating ASReview remains **unverified**.

### Pinned two-endpoint screening efficiency pilot (implemented)

The same externally sourced bibliographic question may have TWO valid but
different screening targets: title/abstract eligibility and final systematic
review inclusion after later screening. Work-saved scores are not meaningful
without naming the target and the reference population.

Original [Cohen et al. 2006, DOI 10.1197/jamia.M1929](https://doi.org/10.1197/jamia.M1929)
drug-review source data, as processed by the public LHofstee systematic
review dataset repository, provide three text-bearing labeled topics.
The precommitted immutable Git revision, original SHA-1 blobs, topical query
terms, label endpoints and randomization strategy are in
`research/source-pins/cohen-2006-text-screening-pilot-preregistration.json`.
That protocol was committed before running any ranking evaluation, at
`2b86d82830e8cb19f7a8b57d5778cd73d33661ba`.

Original `src/screening-endpoint-pilot.mjs` checks exact original Git blob
source bytes, distinct PubMed IDs, two independently named binary label
columns, sample size, and the ordinary Group RFC4180 CSV decoder.
Missing titles and abstracts stay in the denominator. A frozen label-blind
BM25 score uses the declared topic query with title doubled, k1=1.2, b=.75;
128 deterministic xorshift/Fisher-Yates random permutations are the
comparator. The output records retrospective 95%-recall workload, WSS@95,
recall at 20% of records screened, average precision and source digests.
Gold labels are read only at the retrospective scorer, never used to train
or tune the ranks. This is NOT an ASReview machine-learning model.

| Task | Title/abstract positives → final included | WSS@95 on title/abstract | WSS@95 on final included | Final-label random mean WSS@95 |
| --- | ---: | ---: | ---: | ---: |
| Antihistamines (310) | 92 → 16 | +0.0855 | +0.1274 | −0.0023 |
| Estrogens (368) | 80 → 80 | +0.1185 | +0.1185 | +0.0094 |
| Urinary incontinence (327) | 78 → 40 | **−0.0286** | +0.1090 | +0.0196 |

**New source-specific result:** Across these three tasks, the frozen topical
ranker has positive retrospective WSS@95 against final inclusion labels.
Against title/abstract labels it fails on urinary incontinence:
the ranker finds 33.3% of title/abstract positives in the top 20% of
the file, but requires 320/327 records for 95% recall. Thus initial
enrichment is NOT a warranted safe stopping rule. In these three corpora
114 of 250 initial title/abstract positives were not final inclusions.
The source files contain no overlapping PubMed IDs across the three topics.

**Reproduce using the public source and Node 22+ (no raw full texts
or datasets checked into this repository):**

```sh
npm install --ignore-scripts --no-audit --no-fund
node --test test/screening-endpoint-*.test.mjs
node scripts/reproduce-cohen-screening-pilot.mjs > screening-endpoint-pilot.json
```

Actual original-source GitHub Actions audit:
https://github.com/red-cup-engineering/bibliography-engineering-services-section/actions/runs/40630137248
(success: complete source/tests, genuine original raw data acquisition,
source digest checks, two endpoints and machine-readable artifact).

**Critical limits.** The underlying original Cohen index reports
`custom open license`; this package publishes AGGREGATES, SOURCE HASHES
and algorithm only, never the source abstracts. Separate source permissions
must be independently qualified before commercial redistribution.
All three tasks are derived from one parent Cohen review source family;
no cross-discipline inference, external customer or vendor accuracy
comparison is established. The random baseline has 128 fixed repetitions,
not a formal population confidence interval. WSS@95 uses the known
positive total retrospectively, not an implementable unseen-total stopping
criterion; absent a real evidence-backed stop rule, screening must continue.
Unchanged standard BM25 is prior art, not a new theorem. A production
research agent must validate independent source identity, permitted
metadata use, reviewer authority, and early stopping separately.

### Exact conditional early-stopping bound (mathematical instrument)

Retrospective WSS@95 is an **oracle** metric: it relies on already knowing
how many relevant records exist in the corpus. A live research agent may
not stop merely because a ranker's top documents look relevant.

`boundFiniteScreeningRecall({included,excluded,unresolved,
targetNumerator:95,targetDenominator:100})`, exported through the
original `./screening-core` entrypoint and `bibliography recall-bound`,
computes an **exact conditional finite-source recall lower bound**.
If p positively adjudicated identities and u unresolved/unread/contested
identities remain in a *closed and correct* census, the total relevant
count could be p+u. Therefore recalled proportion is **at least**
`p/(p+u)`; this is sharp when every unresolved item really is positive.
The target comparison is done with integer BigInt arithmetic rather than
trusting floating-point equality at 95/100. Source-identity conflicts
are counted as unresolved, never both positive and negative.

```sh
echo '{"included":26,"excluded":40,"unresolved":261}' | bibliography recall-bound
```

The preregistered urinary-incontinence title/abstract pilot found 26
positives among 66 documents (top 20%) with 261 not yet read. The exact
worst-case lower bound is **26/287 ≈ 9.06% recall**, far below 95%,
even though the *retrospective* final positive count showed 33.3%
of positive documents in that early slice. In the absence of an accepted
bound on remaining positives, early score enrichment cannot establish
safe stopping. This is ordinary finite counting, **not** a newly invented
general mathematical theorem or an independently authenticated human
screening system.

The output **always** reports `operativeStopAuthorized:false`: the caller
has not established a complete original source frame, valid review
permissions, independent reviewer/adjudicator identities, or an authorized
operational stop policy merely by supplying three integers. A mathematical
threshold may hold conditionally while the real service must still refuse
an automated stop. Tests exhaustively enumerate every possible labeling
of up to six unresolved records, show the lower bound is sharp, and
refuse malformed or identity-collapsing counts. See
`test/finite-recall-bound.test.mjs`.

### Conditional finite recall versus evaluated real stopping decisions

The earlier **source-locked** Cohen text-screening study demonstrated WSS@95 for a
fixed, label-blind BM25 baseline against three original drug-review corpora and
both original label endpoints. WSS@95 is *retrospective*: the number of relevant
papers is available to the evaluator but not a prospective screening agent.
The original \`boundFiniteScreeningRecall\` mathematically refuses to grant
operative stop authority based on a mere retrospective WSS score.

The original source is now extended by \`./screening-stopping-assay\` and
\`scripts/reproduce-cohen-stopping-study.mjs\`. We reused, rather than cloned,
the **original source-pinned Cohen acquisition, original CSV codec, original
BM25 ranking and 128 original seeded random permutations**. A source
pre-registration at
\`research/source-pins/cohen-2006-prospective-stopping-preregistration.json\`
was committed before computing the actual findings and itself binds the
original text-screening pre-registration's **Git blob SHA-1**, source edition,
queries, original three study tasks and label definitions.

An explicit sequential simulation reveals one source-record label to the
stopping rule at a time. Three **predeclared sensitivity rules** are evaluated
at both source labels: stop after \`ceil(7% * N)\`, \`ceil(10% * N)\` or
\`ceil(20% * N)\` consecutive negative judgments, *after* at least
\`ceil(10% * N)\` records and at least one observed positive. The rule sees
only inspected labels. The retrospective assessor—**never the stopping
decision**—then reveals all records to assess actual source-labeled recall,
number of remaining relevant works, inspected fraction, and comparison with
the 128 fixed random permutations. The original
\`boundFiniteScreeningRecall\` independently computes exact
p/(p+u) worst-case recall under the **conditional** hypothesis of a complete
source-identity frame, and always keeps \`operativeStopAuthorized: false\`.

\`\`\`sh
npm install --ignore-scripts --no-audit --no-fund
node --test test/screening-stopping-*.test.mjs
node scripts/reproduce-cohen-stopping-study.mjs > cohen-stopping-study.json
\`\`\`

This is **not** the full SAFE method or an adaptive active-learning system,
does **not** simulate ASReview's model nor authenticate a live reviewer, and
does **not** authorize any clinical or scientific stop. The test answers a
narrow scientific question: can a seemingly sensible consecutive-negative
rule **fail on actual source-labeled records when the ranking and threshold
were frozen in advance?** A negative result must remain published as a
counterexample, not hidden by post-hoc tuning. It cannot establish
a general population failure rate across independent scientific domains,
because all three reviews came from one Cohen drug-review collection.

Relevant independent prior art includes the SAFE multi-condition procedure
(Boetje & van de Schoot 2024,
https://doi.org/10.1186/s13643-024-02502-7), the 2026 evaluation of fifteen
stopping methods across 81 review datasets (Repke et al.,
https://doi.org/10.1002/cesm.70068), and the 2026 ASReview screening
simulation (https://doi.org/10.1016/j.ijmedinf.2026.106516). None is
represented by our single-factor baseline. Source data remains subject to
the original author's separately declared "custom open license"; no article
text is republished or commercially sublicensed by the result.

### Registers and source records

- `src/register.mjs` — `searchRegister(register, variables)`. A register is
  data, `{ query, item }`: a JSON API query (`http-services-section`
  `json-api-query`: RFC 6570 template, shared variables, RFC 6901 result and
  count pointers) and the CSL projection (`csl-json-services-section`
  `projection`) of one result. A section adds a register by writing that
  pair; no client is written.
- `src/source-record.mjs` — a source record: CSL-JSON items as read
  (`sources[].item`, plus the owning section's own row fields) and the
  searches run (`searches[]`, each with the ids it `included`, so a search
  including none records a null result). The record names its JSON Schema in
  `$schema`; that schema's `x-citation-policy` says which rows a note may
  cite (`uncitable`) and what a cited row carries (`requires`), and its
  `x-row-defaults` fill a newly read row. A note cites a row by its house
  citation label (`formatCitationLabel`), and its frontmatter `references:`
  map is derived from the rows it cites. `record-search`, `record-read`,
  `record-check` and `record-references` are its CLI verbs.

- `apps/bibliography-cli.mjs` — the composed CLI face over all of the above.

## Design note

Depth-1 `references:` map entries are validated under the closed contract
mirrored from `term-engineering-services-section`'s
`term.schema.json` (`additionalProperties: false`): authors, title, year
required; publication, publisher, translator, url, doi, note, eprint
optional. Depth-2 bibliography carrier frontmatter is validated for its
required fields (type, key, reference-type, authors, year, title) but is
*not* closed to additional bibliographic detail fields (journal, volume,
number, pages, ...): the specification states what a depth-2 carrier's
frontmatter carries without ruling it a closed vocabulary, and the
existing math-section corpus legitimately uses such fields.

### Source-change propagation into screened evidence

The existing one-shot OpenAlex/PubMed `watch-literature` can report changed source
metadata without replacing the original search/candidate receipts. Merely
re-running a title/abstract screening on that immutable ledger would preserve
old `included`/`excluded` decisions as if the later source observation did not
exist. The source-owned `screen-continuity` operation now closes **that precise
dependency gap** without a new provenance registry.

It accepts `{ "previous": { "ledger": ..., "protocol": ...,
"reviews": [...], "adjudications": [...] }, "watchResult": ... }`, where
`watchResult` is the original `runWatch` result.

The old screening ledger must be the source-qualified subset of the original
watch's historical search/candidate prefix. The original watch **also**
preserves earlier candidates lacking their source-search receipt; these remain
in custody as `unlinkedPriorCandidates`, not admissible previous reviewer
evidence. A changed orphan is reported as
`heldUnqualifiedSourceRevisions`, never fabricated into an earlier review.
The existing `runWatch` optionally accepts `previousScreening` and
returns `screeningContinuity` in the **same original watch result**, preserving
the existing network clients, old bytes, caller-controlled time and source
receipt admission. Both `scripts/watch-literature.mjs` and
`bibliography watch-literature` accept that optional field in the original
request schema. Native tests exercise this with the original archived
OpenAlex/PubMed fixtures and their deliberately orphaned historic records. It executes the original
screening reducer on the previous and subsequent evidence snapshots and reports
(1) changed source item and original review-quote dependencies, (2) changes to
DOI-based record status when another original source receipt joins the record,
(3) genuinely new, still-unreviewed identities, and (4) source retrieval
refusals. A source-content change requires reassessment even when the original
quote still occurs at the original offset; changed nearby context may matter.

A revision notice must match original unchanged source bytes and a newly
recorded source search. Previously recorded ledger entries must be append-only;
revision assertions lacking an original source, fabricated new receipts,
contradictory versions and silent previous-row replacement fail closed.
`reassessmentRecordIds` and `previouslyResolvedNowReassessmentRequired` are
machine-actionable investigation inputs for the **existing** Science and
Coesite Work owners; this operation makes no automatic vote changes or Work
writes. A retraction/authoritative publisher correction is **not established**
by OpenAlex/PubMed metadata changes alone. Neither a numeric report nor exit
code 0 certifies a complete corpus, reviewer identity, source authenticity,
publication, or permission to stop screening.

```sh
# Generate watch-result.json separately from a recorded prior ledger:
node scripts/watch-literature.mjs < watch-request.json > watch-result.json
# Compose {previous: <old screening request>, watchResult: <that watch result>}.
node scripts/review-screening-continuity.mjs < continuity-request.json > impact.json
# Or use the original bibliography CLI with installed package dependencies:
bibliography screen-continuity < continuity-request.json
node --test test/screening-continuity.test.mjs
```

The standalone script exits 1 when a previous decision needs review, a new
unreviewed identity is seen, or a source query was refused; 2 for malformed
input. Only absence of *these observed changes* yields exit 0, never scientific
clearance. This is a replayable computational result over supplied source
observations; independent re-acquisition, licensure, scientific interpretation,
operational execution and market settlement remain distinct.
