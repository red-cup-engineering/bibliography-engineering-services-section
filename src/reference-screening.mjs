/**
 * Deterministic review of a recorded bibliographic search corpus.
 * Accepts the ORIGINAL bibliography screening-ledger shape:
 *   { searches:[{id,source,query,date,resultCount}], candidates:[{item,source,searchId,dedupeKey}] }
 * No retrieval, model inference, filesystem writes or invented reviewers.
 * This module deliberately DOES NOT normalize DOI/title itself: its dedupeKey
 * is supplied by the house CSL-JSON owner, not reimplemented here.
 */
const WORD = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const DOI_KEY = /^doi:10\.[0-9]{4,9}\/\S+$/u;
const TITLE_KEY = /^title:[^\s].+$/u;
const MAX = 5000;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const string = x => typeof x === "string" && x.trim() !== "";
const bad = message => { throw new TypeError(message); };
const encoded = x => encodeURIComponent(x);
function assertId(x, label) { if (!string(x) || x.length > 256) bad(label + " must be a nonempty bounded string"); }
function normalizeDiagnosticTitle(x) {
  // Only for detecting a suspicious DOI metadata collision. NOT a CSL identity key.
  return x.normalize("NFKC").toLowerCase().replace(/\s+/gu," ").trim();
}
function originalCandidateId(c) {
  if (DOI_KEY.test(c.dedupeKey)) return c.dedupeKey;
  return "unconfirmed:" + [c.source,c.searchId,c.item.id].map(encoded).join(":");
}
function memberId(c) { return [c.searchId,c.source,c.item.id].map(encoded).join("|"); }
function citeEvidence(record, evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) bad("screening decision requires source-anchored evidence");
  const { searchId, itemId, field, start, end, quote } = evidence;
  if (!string(searchId) || !string(itemId) || !["title","abstract"].includes(field) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end <= start || end - start > 240 || !string(quote) || quote.length > 240) {
    bad("screening evidence must specify a bounded title/abstract span");
  }
  const item = record.members.find(x => x.searchId === searchId && x.item.id === itemId)?.item;
  if (!item) bad("screening evidence cites no member of the selected source record");
  const text = item[field];
  if (typeof text !== "string" || text.slice(start,end) !== quote) {
    bad("screening quote/offset is not present in the supplied source record");
  }
  return Object.freeze({searchId,itemId,field,start,end,quote});
}
function decisionRecord(input, record, protocol, kind) {
  if (!input || typeof input !== "object" || Array.isArray(input)) bad("review must be a record");
  const {id,recordId,reviewerId,decision,criterion,evidence} = input;
  assertId(id,kind + " id"); assertId(reviewerId,kind + " reviewer");
  if (recordId !== record.id) bad("review belongs to a different source record");
  if (!["include","exclude","uncertain"].includes(decision)) bad("review decision is not an admitted outcome");
  if (decision === "exclude") {
    if (!protocol.criteria.includes(criterion)) bad("exclusion must cite an admitted protocol criterion");
  } else if (criterion !== undefined && criterion !== null) bad("non-exclusion cannot assert a failed criterion");
  const span = citeEvidence(record,evidence);
  return Object.freeze({id,recordId,reviewerId,decision,
    ...(decision === "exclude" ? {criterion}:{}),evidence:span});
}
function searchLedger(ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger) ||
      !Array.isArray(ledger.searches) || !Array.isArray(ledger.candidates) ||
      ledger.searches.length > MAX || ledger.candidates.length > MAX) {
    bad("screening ledger requires bounded searches and candidates");
  }
  const searches = new Map();
  for (const s of ledger.searches) {
    if (!s || typeof s !== "object") bad("invalid search record");
    assertId(s.id,"search id");
    if (searches.has(s.id) || !string(s.source) || !string(s.query) ||
        !Number.isSafeInteger(s.resultCount) || s.resultCount < 0) bad("invalid or duplicated search audit row");
    searches.set(s.id,s);
  }
  const records = new Map(), seenMembers = new Set();
  for (const c of ledger.candidates) {
    if (!c || typeof c !== "object" || !c.item || typeof c.item !== "object" ||
        !string(c.item.id) || !string(c.item.title) || !string(c.source) ||
        !string(c.searchId) || !string(c.dedupeKey) || c.dedupeKey.length > 320 ||
        (!DOI_KEY.test(c.dedupeKey) && !TITLE_KEY.test(c.dedupeKey))) bad("invalid candidate or canonical bibliography key");
    if (!searches.has(c.searchId) || searches.get(c.searchId).source !== c.source)
      bad("candidate does not belong to an original recorded search");
    const mId = memberId(c);
    if (seenMembers.has(mId)) bad("duplicate original candidate receipt");
    seenMembers.add(mId);
    const id = originalCandidateId(c);
    if (!records.has(id)) records.set(id,{id,dedupeKey:c.dedupeKey,
      identity:DOI_KEY.test(c.dedupeKey)?"doi-group":"unconfirmed-title",members:[]});
    records.get(id).members.push(c);
  }
  const out = [...records.values()].sort((a,b)=>compare(a.id,b.id)).map(group=>{
    const members = [...group.members].sort((a,b)=>compare(memberId(a),memberId(b)));
    const titleForms = new Set(members.map(c=>normalizeDiagnosticTitle(c.item.title)));
    return Object.freeze({...group,members,
      metadataConflict:group.identity==="doi-group" && titleForms.size>1,
      // This is NOT evidence of genuine distinct studies: two title-only records
      // cannot be safely collapsed without an original identifier.
      identityUnverified:group.identity==="unconfirmed-title"});
  });
  return out;
}
/**
 * Screen citations with two declared-distinct reviewer decisions and an
 * optional third-party adjudication. All include/exclude decisions carry exact
 * title/abstract quotes and offsets in the supplied original search records.
 *
 * Reviewer identity, underlying page authenticity, rights and quote truth are
 * NOT authenticated by this pure operation. Its output is screening evidence,
 * not accepted clinical conclusions, legal rights or systematic-review status.
 */
export function assessRecordedScreening({ledger,protocol,reviews=[],adjudications=[]} = {}) {
  if (!protocol || typeof protocol !== "object" || Array.isArray(protocol)) bad("screening protocol required");
  assertId(protocol.id,"protocol id");
  if (!["title-abstract","full-text"].includes(protocol.stage)) bad("screening stage must be declared");
  if (!Array.isArray(protocol.criteria) || protocol.criteria.length === 0 ||
      protocol.criteria.length > 80 || new Set(protocol.criteria).size !== protocol.criteria.length ||
      protocol.criteria.some(x=>!WORD.test(x))) bad("screening exclusion criteria must be uniquely named");
  if (protocol.stage === "full-text") {
    // This service does not inspect or store third-party full text, and the
    // initial ledger has only bibliographic metadata. Refuse rather than imply.
    bad("full-text screening requires a qualified full-text evidence provider");
  }
  const items = searchLedger(ledger), byId = new Map(items.map(x=>[x.id,x]));
  if (!Array.isArray(reviews) || !Array.isArray(adjudications) || reviews.length > 2 * MAX ||
      adjudications.length > MAX) bad("review/adjudication records exceed bounded corpus budget");
  const seenIds = new Set(), reviewMap = new Map();
  for (const raw of reviews) {
    const group = byId.get(raw?.recordId);
    if (!group) bad("review references a missing original source group");
    const result = decisionRecord(raw,group,protocol,"review");
    if (seenIds.has(result.id)) bad("duplicate review identifier");
    seenIds.add(result.id);
    if (!reviewMap.has(result.recordId)) reviewMap.set(result.recordId,[]);
    const arr = reviewMap.get(result.recordId);
    if (arr.some(r=>r.reviewerId===result.reviewerId) || arr.length>=2)
      bad("one work has duplicate reviewer identity or more than two reviews");
    arr.push(result);
  }
  const adjudicationMap = new Map();
  for (const raw of adjudications) {
    const group = byId.get(raw?.recordId);
    if (!group) bad("adjudication references a missing source group");
    const decision = decisionRecord(raw,group,protocol,"adjudication");
    if (seenIds.has(decision.id) || adjudicationMap.has(decision.recordId)) bad("duplicate adjudication");
    seenIds.add(decision.id);
    const seen = reviewMap.get(decision.recordId)||[];
    if (seen.length !== 2 || seen.some(r=>r.reviewerId===decision.reviewerId) ||
        !Array.isArray(raw.reviewIds) || raw.reviewIds.length!==2 ||
        [...raw.reviewIds].sort(compare).join("|")!==seen.map(r=>r.id).sort(compare).join("|"))
      bad("adjudication must bind exactly two different existing reviewer records");
    if (seen.some(r=>r.decision==="uncertain")) bad("uncertain votes require additional evidence, not a fabricated arbitration");
    if (seen[0].decision===seen[1].decision && seen[0].criterion===seen[1].criterion)
      bad("adjudication is not justified by a disagreement");
    if (decision.decision==="uncertain") bad("adjudication must resolve to include or exclude");
    adjudicationMap.set(decision.recordId,Object.freeze({...decision,reviewIds:[...raw.reviewIds].sort(compare)}));
  }
  const titleGroups = new Map();
  for (const g of items) if (g.identityUnverified) {
    if (!titleGroups.has(g.dedupeKey)) titleGroups.set(g.dedupeKey,[]);
    titleGroups.get(g.dedupeKey).push(g.id);
  }
  const possibleDuplicateGroups = [...titleGroups.entries()]
    .filter(([,ids])=>ids.length>1).sort((a,b)=>compare(a[0],b[0]))
    .map(([key,ids])=>({dedupeKey:key,unresolvedRecordIds:ids.sort(compare)}));
  const screened = items.map(group=>{
    const evidence = [...(reviewMap.get(group.id)||[])].sort((a,b)=>compare(a.reviewerId,b.reviewerId));
    const adjudication = adjudicationMap.get(group.id)||null;
    let status="pending",criterion=null;
    if (group.metadataConflict) status="identity-conflict";
    else if (evidence.length===2) {
      const [a,b]=evidence;
      if (a.decision===b.decision && a.criterion===b.criterion &&
          a.decision!=="uncertain") {status=a.decision==="include"?"included":"excluded";criterion=a.criterion??null;}
      else if (a.decision==="uncertain" || b.decision==="uncertain") status="pending";
      else if (adjudication) {status=adjudication.decision==="include"?"included":"excluded";criterion=adjudication.criterion??null;}
      else status="conflict";
    }
    return {
      recordId:group.id,identity:group.identity,identityUnverified:group.identityUnverified,
      metadataConflict:group.metadataConflict,sourceReceipts:group.members.map(c=>({
        searchId:c.searchId,source:c.source,itemId:c.item.id,title:c.item.title,
        ...(typeof c.item.DOI==="string"?{doi:c.item.DOI}:{}),
      })),
      reviews:evidence,adjudication,status,criterion,
      epistemicStanding:"supplied-metadata-excerpt-matches-not-authenticated-reviewer-or-source",
    };
  });
  const statusCounts={included:0,excluded:0,pending:0,conflict:0,"identity-conflict":0};
  for (const row of screened) statusCounts[row.status]+=1;
  const exclusionReasons=Object.fromEntries(protocol.criteria.map(c=>[c,0]));
  for (const row of screened) if (row.status==="excluded")exclusionReasons[row.criterion]+=1;
  const confirmedDuplicateReceipts = ledger.candidates.length - screened.reduce((n,row)=>n+ (row.identity==="doi-group"?1:row.sourceReceipts.length),0);
  // Per-search reconciliation is essential: deficits in one source can
  // exactly cancel excess candidate receipts in another when totals alone
  // are compared. That does not establish valid PRISMA source coverage.
  const perSearch=ledger.searches.map(search=>{
    const receipts=ledger.candidates.filter(c=>c.searchId===search.id).length;
    return {id:search.id,source:search.source,reportedHits:search.resultCount,
      recordedCandidates:receipts,
      discrepancy:receipts>search.resultCount?"more-receipts-than-reported-hits"
        :receipts<search.resultCount?"partial-capture":"count-reconciled"};
  });
  const overRecorded=perSearch.filter(x=>x.discrepancy==="more-receipts-than-reported-hits");
  const searchCoverage={
    searchesRecorded:ledger.searches.length,
    reportedHits:ledger.searches.reduce((s,x)=>s+x.resultCount,0),
    candidateReceipts:ledger.candidates.length,
    notRecordedFromReportedHits:perSearch.reduce((sum,x)=>sum+Math.max(0,x.reportedHits-x.recordedCandidates),0),
    excessReceiptsBeyondReportedHits:perSearch.reduce((sum,x)=>sum+Math.max(0,x.recordedCandidates-x.reportedHits),0),
    sourceCountInconsistencies:overRecorded.map(x=>x.id),
  };
  return {
    type:"SourceWitnessedReviewAssay",version:1,protocol:{id:protocol.id,stage:protocol.stage,criteria:[...protocol.criteria]},
    searches:ledger.searches.map(x=>({id:x.id,source:x.source,query:x.query,date:x.date??null,resultCount:x.resultCount})),
    perSearchReconciliation:perSearch,
    records:screened,possibleDuplicateGroups,exclusionReasons,
    flow:{...searchCoverage,confirmedDoiDuplicateReceipts:confirmedDuplicateReceipts,screeningRecords:screened.length,...statusCounts,
      unverifiedTitleOnlyRecords:screened.filter(x=>x.identityUnverified).length},
    releaseQualification:{
      reviewRecordsAllResolved:screened.every(x=>["included","excluded"].includes(x.status)),
      uniqueStudiesEstablished:possibleDuplicateGroups.length===0 && screened.every(x=>!x.identityUnverified),
      sourceCountReconciled:overRecorded.length===0,
      reviewerIndependenceAuthenticated:false,sourceAuthenticityVerified:false,
      fullTextScreeningPerformed:false,
      warrantedClaim:"reviewer decisions and exact supplied metadata spans only; not a complete systematic review",
    },
    externalEffects:[],
  };
}

/**
 * Finite WORST-CASE recall bound, assuming exactly the identified source frame.
 *
 * Included = positively adjudicated, excluded = negatively adjudicated,
 * unresolved = not judged OR discordant source/reviewer identity. A disputed
 * source cannot be counted as both included and excluded or as a new work.
 *
 * If p included and u unresolved identities remain, the true number of
 * included works in the closed frame can be as large as p+u, so observed
 * recall is >= p/(p+u). This is sharp: let every unresolved work be positive.
 * All-excluded is the opposite completion, with recall 1 when p>0.
 *
 * This is an elementary exact integer inequality, NOT a learned confidence
 * score, independent evidence of frame completeness, or authority to stop.
 * An incomplete acquisition frame can hide arbitrary extra works outside it.
 */
export function boundFiniteScreeningRecall({included,excluded,unresolved,
  targetNumerator=95,targetDenominator=100}={}) {
  const counts=[included,excluded,unresolved];
  if(counts.some(x=>!Number.isSafeInteger(x)||x<0||x>1000000)||
     counts.reduce((s,x)=>s+x,0)===0||
     !Number.isSafeInteger(targetNumerator)||!Number.isSafeInteger(targetDenominator)||
     targetNumerator<1||targetNumerator>targetDenominator||
     targetDenominator>10000)
    throw new TypeError("screening recall requires bounded disjoint observed/unresolved counts and a rational target");
  const size=included+excluded+unresolved;
  const totalMax=included+unresolved;
  const defined=totalMax>0;
  // Exact comparison, avoids an IEEE-754 false threshold at e.g. 95/100.
  const meets=defined&&included>0&&
    BigInt(included)*BigInt(targetDenominator)>=
    BigInt(totalMax)*BigInt(targetNumerator);
  const optimistic= included>0 ? 1 : 0;
  const pessimistic=defined ? included/totalMax : null;
  return Object.freeze({
    type:"FiniteScreeningRecallLowerBound",
    frameSize:size,confirmedIncluded:included,confirmedExcluded:excluded,
    unresolvedWorkIdentities:unresolved,
    target:{numerator:targetNumerator,denominator:targetDenominator},
    compatibleIncludedTotals:{minimum:included,maximum:totalMax},
    sharpWorstCaseRecall:defined?{numerator:included,denominator:totalMax,value:pessimistic}:null,
    optimisticRecall:defined?optimistic:null,
    mathematicallyAtLeastTargetWithinAssumedClosedFrame:meets,
    countermodel:"All unresolved works count as relevant; no unobserved external works are assumed.",
    epistemicStanding:defined?"exact finite-frame arithmetic conditional on complete identity census and authenticated independent decisions":"recall undefined when no positive can exist",
    operativeStopAuthorized:false,
    withheldAuthority:["independent complete source frame","actual reviewer/adjudication identity","source rights and scientific validity","externally approved screening protocol and stopping law"],
  });
}
