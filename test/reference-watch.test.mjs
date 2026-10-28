import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateWindow, runWatch } from "../src/reference-watch.mjs";
import { assessCslRecordedScreening } from "../src/reference-screening-csl.mjs";

const fixture = name => JSON.parse(readFileSync(new URL("./fixtures/"+name,import.meta.url),"utf8"));
const originalLedger = () => fixture("watch-ledger.json");
const now="2026-08-31T12:00:00.000Z";
const spec=()=>({id:"cross-discipline-method-watch-2026",lookbackDays:30,
  queries:[{source:"openalex",query:"long covid"},{source:"pubmed",query:"post-exertional malaise"}]});
function fakeFetch(options={}) {
  const seen=[];
  const fetchImpl=async input=>{
    const url=new URL(String(input));
    seen.push(url);
    if(options.offline==="pubmed"&&url.hostname==="eutils.ncbi.nlm.nih.gov")throw new Error("upstream unavailable");
    let data;
    if(url.hostname==="api.openalex.org")data=fixture("watch-openalex-search-response.json");
    else if(url.pathname.endsWith("/esearch.fcgi"))data=fixture("watch-pubmed-esearch-response.json");
    else if(url.pathname.endsWith("/esummary.fcgi"))data=fixture("watch-pubmed-esummary-response.json");
    else throw new TypeError("foreign service "+url);
    return {ok:true,status:200,json:async()=>data};
  };
  return {fetchImpl,seen};
}
test("declared 30-day UTC period is exact, includes leap days and never depends on local timezone",()=>{
  assert.deepEqual(dateWindow({now,lookbackDays:30}),{from:"2026-08-02",to:"2026-08-31"});
  assert.deepEqual(dateWindow({now:"2024-03-01T00:00:00Z",lookbackDays:2}),{from:"2024-02-29",to:"2024-03-01"});
  assert.throws(()=>dateWindow({now:"2026-08-31",lookbackDays:7}),/offset-aware/);
  assert.throws(()=>dateWindow({now,lookbackDays:31}),/1–30/);
});
test("archived OpenAlex and PubMed receipts reuse the original clients and retain new-work identity separately",async()=>{
  const network=fakeFetch();const former=originalLedger();
  const r=await runWatch(spec(),{ledger:former,now,fetchImpl:network.fetchImpl});
  assert.equal(r.disposition,"recorded-pages-received");
  assert.equal(r.summary.attempted,2);
  assert.equal(r.summary.received,2);
  assert.equal(r.summary.refused,0);
  assert.equal(r.summary.newlyRecordedCandidateReceipts,4);
  assert.equal(r.summary.newUnscreenedWorkIdentityCandidates,2);
  assert.deepEqual(r.changes.newWorkIdentityKeys,["doi:10.1000/watchtest.002","doi:10.1000/watchtest.003"]);
  assert.equal(r.ledger.candidates.length,6);
  assert.equal(r.ledger.searches.length,2);
  assert.deepEqual(former.searches,[]);
  assert.equal(former.candidates.length,2);
  assert.deepEqual(network.seen.map(x=>x.hostname),[
    "api.openalex.org","eutils.ncbi.nlm.nih.gov","eutils.ncbi.nlm.nih.gov",
  ]);
  assert.equal(network.seen[0].searchParams.get("filter"),
    "from_publication_date:2026-08-02,to_publication_date:2026-08-31");
  assert.equal(network.seen[1].searchParams.get("mindate"),"2026/08/02");
  assert.equal(network.seen[1].searchParams.get("maxdate"),"2026/08/31");
  assert.equal(r.changes.candidateSourceRevisions.length,0);
});
test("rerun same recorded date is safely idempotent and does not refetch",async()=>{
  const network=fakeFetch();
  const first=await runWatch(spec(),{ledger:originalLedger(),now,fetchImpl:network.fetchImpl});
  const calls=network.seen.length;
  const second=await runWatch(spec(),{ledger:first.ledger,now,fetchImpl:network.fetchImpl});
  assert.equal(network.seen.length,calls);
  assert.equal(second.summary.newUnscreenedWorkIdentityCandidates,0);
  assert.equal(second.summary.newlyRecordedCandidateReceipts,0);
  assert.equal(second.refusals.length,2);
  assert.equal(second.ledger.candidates.length,first.ledger.candidates.length);
});
test("a second-day query can log zero novel candidates without claiming zero source hits",async()=>{
  const network=fakeFetch();
  const first=await runWatch(spec(),{ledger:originalLedger(),now,fetchImpl:network.fetchImpl});
  const tomorrow="2026-09-01T12:00:00.000Z";
  const second=await runWatch(spec(),{ledger:first.ledger,now:tomorrow,fetchImpl:network.fetchImpl});
  assert.equal(second.summary.newlyRecordedCandidateReceipts,0);
  assert.equal(second.summary.newUnscreenedWorkIdentityCandidates,0);
  assert.equal(second.ledger.searches.length,4);
  assert.ok(second.ledger.searches.every(s=>s.resultCount===2));
});
test("source metadata revisions are proposed for review but never overwrite older observations",async()=>{
  const network=fakeFetch();
  const first=await runWatch(spec(),{ledger:originalLedger(),now,fetchImpl:network.fetchImpl});
  const changed=async url=>{
    const response=await network.fetchImpl(url);
    if(String(url).includes("api.openalex.org")){
      const payload=await response.json();
      payload.results[0].title="CORRECTION CANDIDATE: a new title"; // controlled fixture, not real OpenAlex change
      return {ok:true,status:200,json:async()=>payload};
    }
    return response;
  };
  const second=await runWatch(spec(),{ledger:first.ledger,now:"2026-09-01T12:00:00Z",fetchImpl:changed});
  assert.equal(second.changes.candidateSourceRevisions.length,1);
  assert.match(second.changes.candidateSourceRevisions[0].state,/unverified/);
  assert.equal(second.ledger.candidates.length,first.ledger.candidates.length);
  assert.equal(first.ledger.candidates.find(c=>c.item.id==="W9000000001").item.title,
    "Post-viral fatigue after SARS-CoV-2 infection");
});
test("unreachable PubMed is a typed partial run, never a false null finding",async()=>{
  const network=fakeFetch({offline:"pubmed"});
  const result=await runWatch(spec(),{ledger:originalLedger(),now,fetchImpl:network.fetchImpl,
    timeoutMs:50});
  assert.equal(result.disposition,"partial-or-refused");
  assert.equal(result.summary.received,1);
  assert.equal(result.summary.refused,1);
  assert.equal(result.refusals[0].reason,"source-query-unavailable-or-invalid");
  assert.equal(result.ledger.searches.length,1);
  assert.equal(result.ledger.searches[0].source,"openalex");
});
test("reported database total above capped response is marked partial, not full coverage",async()=>{
  const only={...spec(),queries:[spec().queries[0]]};
  const network=async input=>{
    const base=fixture("watch-openalex-search-response.json");
    base.meta.count=200;
    return {ok:true,status:200,json:async()=>base};
  };
  const r=await runWatch(only,{ledger:originalLedger(),now,fetchImpl:network});
  assert.equal(r.disposition,"partial-source-coverage");
  assert.equal(r.ledger.searches[0].returnedCandidates,2);
  assert.equal(r.ledger.searches[0].resultCount,200);
  assert.equal(r.ledger.searches[0].coverage,"partial-retrieval");
});
test("invalid watch commands, duplicate queries and foreign sources are refused before acquisition",async()=>{
  const network=fakeFetch();
  await assert.rejects(runWatch({...spec(),lookbackDays:100},{ledger:originalLedger(),now,fetchImpl:network.fetchImpl}),/1–30/);
  await assert.rejects(runWatch({...spec(),queries:[spec().queries[0],spec().queries[0]]},{ledger:originalLedger(),now,fetchImpl:network.fetchImpl}),/repeats/);
  await assert.rejects(runWatch({...spec(),queries:[{source:"google",query:"anything"}]},{ledger:originalLedger(),now,fetchImpl:network.fetchImpl}),/WatchSpec query/);
  assert.equal(network.seen.length,0);
});

test("unlinked original fixture receipts stay in custody but cannot be laundered into screening evidence",async()=>{
  const network=fakeFetch();
  const r=await runWatch(spec(),{ledger:originalLedger(),now,fetchImpl:network.fetchImpl});
  assert.equal(r.unlinkedPriorCandidates.length,2);
  assert.equal(r.summary.priorUnlinkedCandidateReceipts,2);
  assert.equal(r.summary.screeningReadyCandidateReceipts,4);
  assert.equal(r.ledger.candidates.length,6);
  assert.equal(r.screeningInputLedger.candidates.length,4);
  const screened=assessCslRecordedScreening({ledger:r.screeningInputLedger,
    protocol:{id:"queued-literature-screening-2026",stage:"title-abstract",criteria:["wrong-study-design"]}});
  assert.equal(screened.flow.candidateReceipts,4);
  assert.equal(screened.flow.screeningRecords,4);
  assert.equal(screened.flow.pending,4);
  assert.equal(screened.releaseQualification.reviewRecordsAllResolved,false);
  assert.equal(screened.releaseQualification.reviewerIndependenceAuthenticated,false);
});
