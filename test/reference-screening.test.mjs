import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessRecordedScreening } from "../src/reference-screening.mjs";

const ledger = () => JSON.parse(readFileSync(new URL("./fixtures/screening-ledger.json",import.meta.url),"utf8"));
const proto = { id:"audit-across-disciplines-2026",stage:"title-abstract",criteria:["wrong-study-design","wrong-population"] };
const doiId = "doi:10.1038/nature14539";
const evidence = (searchId,itemId,title) => ({
  searchId,itemId,field:"title",start:0,end:title.length,quote:title,
});
const vote = (id,recordId,reviewerId,decision,searchId,itemId,title,criterion) => ({
  id,recordId,reviewerId,decision,...(criterion?{criterion}:{}),
  evidence:evidence(searchId,itemId,title),
});
const a = () => vote("vote-a",doiId,"reviewer-A","include",
  "openalex::2026-08-30::deep learning","W1","Deep learning");
const b = () => vote("vote-b",doiId,"reviewer-B","include",
  "crossref::2026-08-30::10.1038/nature14539","10.1038/nature14539","Deep learning");

test("real recorded Crossref and OpenAlex duplicate: source-contingent, two reviewer agreement",()=>{
  const r=assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[a(),b()]});
  assert.equal(r.flow.reportedHits,6);
  assert.equal(r.flow.candidateReceipts,6);
  assert.equal(r.flow.confirmedDoiDuplicateReceipts,1);
  assert.equal(r.flow.screeningRecords,5);
  assert.equal(r.flow.included,1);
  assert.equal(r.flow.pending,4);
  assert.equal(r.records.find(x=>x.recordId===doiId).sourceReceipts.length,2);
  assert.equal(r.releaseQualification.reviewerIndependenceAuthenticated,false);
  assert.equal(r.releaseQualification.sourceAuthenticityVerified,false);
  assert.deepEqual(r.externalEffects,[]);
});
test("title-only duplicate is surfaced rather than falsely coalesced into one study",()=>{
  const r=assessRecordedScreening({ledger:ledger(),protocol:proto});
  assert.equal(r.possibleDuplicateGroups.length,1);
  const g=r.possibleDuplicateGroups[0];
  assert.equal(g.dedupeKey,"title:attention is all you need");
  assert.equal(g.unresolvedRecordIds.length,2);
  assert.equal(r.flow.unverifiedTitleOnlyRecords,3);
  assert.equal(r.releaseQualification.uniqueStudiesEstablished,false);
});
test("two agreeing but distinctly identified reviewers can include a DOI item",()=>{
  const r=assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[b(),a()]});
  const row=r.records.find(x=>x.recordId===doiId);
  assert.equal(row.status,"included");
  assert.deepEqual(row.reviews.map(x=>x.reviewerId),["reviewer-A","reviewer-B"]);
});
test("disagreement remains a conflict until a third reviewer adjudicates with a source quote",()=>{
  const disagree={...b(),id:"vote-b2",decision:"exclude",criterion:"wrong-study-design"};
  const raw={ledger:ledger(),protocol:proto,reviews:[a(),disagree]};
  const before=assessRecordedScreening(raw);
  assert.equal(before.records.find(x=>x.recordId===doiId).status,"conflict");
  const arb=vote("adjudication-1",doiId,"reviewer-C","exclude",
    "openalex::2026-08-30::deep learning","W1","Deep learning","wrong-study-design");
  arb.reviewIds=["vote-a","vote-b2"];
  const after=assessRecordedScreening({...raw,adjudications:[arb]});
  const row=after.records.find(x=>x.recordId===doiId);
  assert.equal(row.status,"excluded");
  assert.equal(row.criterion,"wrong-study-design");
  assert.equal(after.exclusionReasons["wrong-study-design"],1);
  assert.equal(row.adjudication.reviewerId,"reviewer-C");
});
test("self-adjudication, unmatched votes and duplicate reviewer identifiers refuse",()=>{
  const arb=vote("adjudication-1",doiId,"reviewer-A","include",
    "openalex::2026-08-30::deep learning","W1","Deep learning");
  arb.reviewIds=["vote-a","vote-b"];
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:proto,
    reviews:[a(),{...b(),decision:"exclude",criterion:"wrong-population"}],adjudications:[arb]}),/two different existing reviewer/);
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[a(),{...b(),reviewerId:"reviewer-A"}]}),/duplicate reviewer/);
});
test("fabricated excerpt and wrong source or invalid criterion are rejected",()=>{
  const hallucinated={...a(),evidence:{...a().evidence,quote:"Randomized controlled trial"}};
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[hallucinated]}),/not present/);
  const foreign={...a(),evidence:{...a().evidence,searchId:"unlisted-work"}};
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[foreign]}),/no member/);
  const bad={...b(),decision:"exclude",criterion:"unknown-criterion"};
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:proto,reviews:[a(),bad]}),/admitted protocol criterion/);
});
test("DOI metadata conflict is not laundered into an admitted article",()=>{
  const input=ledger();
  input.candidates[1].item.title="An unrelated paper with the same DOI";
  // Title mismatch is detectable before any reviewer supplies source-specific excerpts.
  const r=assessRecordedScreening({ledger:input,protocol:proto});
  assert.equal(r.records.find(x=>x.recordId===doiId).status,"identity-conflict");
  assert.equal(r.flow["identity-conflict"],1);
});
test("repeatability is invariant to search, candidate and reviewer ordering",()=>{
  const x=ledger(),y=ledger();
  y.searches.reverse();y.candidates.reverse();
  const one=assessRecordedScreening({ledger:x,protocol:proto,reviews:[a(),b()]});
  const two=assessRecordedScreening({ledger:y,protocol:proto,reviews:[b(),a()]});
  assert.deepEqual(one.records,two.records);
  assert.deepEqual(one.flow,two.flow);
  // Search chronology is presented as supplied, never rewritten as an event-order claim.
});
test("all-zero search records retain meaningful null results",()=>{
  const empty={searches:[{id:"empty-query-2026",source:"openalex",query:"unproductive sentinel",date:"2026-10-27",resultCount:0}],candidates:[]};
  const r=assessRecordedScreening({ledger:empty,protocol:proto});
  assert.equal(r.flow.searchesRecorded,1);
  assert.equal(r.flow.reportedHits,0);
  assert.equal(r.flow.screeningRecords,0);
  assert.equal(r.releaseQualification.reviewerIndependenceAuthenticated,false);
});
test("unavailable full text cannot be promoted into full-text screening",()=>{
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:{...proto,stage:"full-text"}}),/requires a qualified full-text/);
});
test("malformed or nonexistent search provenance, repeated receipts and unstated protocols refuse",()=>{
  const x=ledger(); x.candidates[0].searchId="unrecorded"; 
  assert.throws(()=>assessRecordedScreening({ledger:x,protocol:proto}),/original recorded search/);
  const y=ledger();y.candidates.push(y.candidates[0]);
  assert.throws(()=>assessRecordedScreening({ledger:y,protocol:proto}),/duplicate original candidate receipt/);
  assert.throws(()=>assessRecordedScreening({ledger:ledger(),protocol:{...proto,criteria:[]}}),/uniquely named/);
});
