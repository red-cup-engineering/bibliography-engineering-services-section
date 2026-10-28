/**
 * A bounded, source-replayable OpenAlex/PubMed literature watch.
 * One explicit invocation, NO background scheduler, no file write, no
 * full-text acquisition and no independent publication rights claim.
 *
 * Consume the ORIGINAL bibliography.searches/candidates ledger and the
 * source-owned CSL-normalized identities. Return an append-only proposed
 * new ledger plus original and new source receipts for downstream screening.
 */
import { searchOpenAlexWorks } from "../scripts/search-openalex-works.mjs";
import { searchPubmed } from "../scripts/search-pubmed.mjs";
import { fetchPubmedSummaries } from "../scripts/fetch-pubmed-summaries.mjs";
import { makeCandidateRecord, verifyCslScreeningKeys } from "./reference-screening-csl.mjs";
import { reliableBibliographyFetch } from "./reference-check.mjs";

const MAX_QUERIES=4, MAX_ITEMS_PER_QUERY=25, MAX_PRIOR=5000, MAX_QUERY_LENGTH=300;
const SOURCE=new Set(["openalex","pubmed"]);
const sortedObject = value => Array.isArray(value) ? "[" + value.map(sortedObject).join(",") + "]" :
  value && typeof value === "object" ? "{" + Object.keys(value).sort().filter(key=>value[key]!==undefined)
    .map(key=>JSON.stringify(key)+":"+sortedObject(value[key])).join(",") + "}" : JSON.stringify(value);
const evidenceIdentity=c => c.source + "\u0000" + c.item.id;
function ensureSpec(spec) {
  if(!spec || typeof spec!=="object" || Array.isArray(spec) ||
      typeof spec.id!=="string" || spec.id.length<1 || spec.id.length>128 ||
      !Number.isSafeInteger(spec.lookbackDays) || spec.lookbackDays<1 || spec.lookbackDays>30 ||
      !Array.isArray(spec.queries) || spec.queries.length<1 || spec.queries.length>MAX_QUERIES)
    throw new TypeError("bounded WatchSpec requires id, lookbackDays 1–30 and 1–4 queries");
  const keys=new Set();
  for(const q of spec.queries) {
    if(!q || !SOURCE.has(q.source) || typeof q.query!=="string" || !q.query.trim() ||
        q.query.length>MAX_QUERY_LENGTH) throw new TypeError("WatchSpec query must name OpenAlex or PubMed and bounded text");
    const key=q.source+"\u0000"+q.query;
    if(keys.has(key)) throw new TypeError("WatchSpec repeats a source/query pair");
    keys.add(key);
  }
}
function isoUtcDay(now) {
  if(typeof now!=="string" || !/^\d{4}-\d{2}-\d{2}T/u.test(now) || !/(?:Z|[+-]\d\d:\d\d)$/u.test(now))
    throw new TypeError("watch run requires an explicit offset-aware ISO instant");
  const when=new Date(now);
  if(!Number.isFinite(when.getTime())) throw new TypeError("watch run instant is invalid");
  return when.toISOString().slice(0,10);
}
export function dateWindow({now,lookbackDays}) {
  if(!Number.isSafeInteger(lookbackDays) || lookbackDays<1 || lookbackDays>30)
    throw new RangeError("lookbackDays must be 1–30");
  const to=isoUtcDay(now);
  const end=Date.parse(to+"T00:00:00.000Z");
  return Object.freeze({from:new Date(end-(lookbackDays-1)*86400000).toISOString().slice(0,10),to});
}
function ensureLedger(ledger) {
  if(!ledger || !Array.isArray(ledger.searches) || !Array.isArray(ledger.candidates) ||
      ledger.searches.length>MAX_PRIOR || ledger.candidates.length>MAX_PRIOR)
    throw new TypeError("watch requires a bounded existing bibliography ledger");
  verifyCslScreeningKeys(ledger);
  const ids=new Set();
  for(const x of ledger.searches){
    if(typeof x?.id!=="string" || ids.has(x.id)) throw new TypeError("prior watch has invalid/duplicate search ids");
    ids.add(x.id);
  }
  return ids;
}
/**
 * Caller controls explicit time and source transport. Query adapters remain
 * the existing independent bibliography producers. No new citation ontology.
 */
export async function runWatch(spec, {ledger,now,fetchImpl=fetch,email,mailto,
    delayBetweenQueriesMs=0,timeoutMs=10000,searchOpenAlex=searchOpenAlexWorks,
    searchPubMed=searchPubmed,readPubmed=fetchPubmedSummaries}={}) {
  ensureSpec(spec);
  const priorIds=ensureLedger(ledger);
  const window=dateWindow({now,lookbackDays:spec.lookbackDays});
  if(!Number.isSafeInteger(delayBetweenQueriesMs)||delayBetweenQueriesMs<0||
      delayBetweenQueriesMs>5000||!Number.isSafeInteger(timeoutMs)||
      timeoutMs<50||timeoutMs>20000) throw new RangeError("watch requires bounded pacing and source timeout");
  const runDay=window.to;
  const knownReceipt=new Map(ledger.candidates.map(c=>[evidenceIdentity(c),c]));
  const knownStudies=new Set(ledger.candidates.map(c=>c.dedupeKey));
  const searches=[...ledger.searches], candidates=[...ledger.candidates];
  const sourceRevisions=[], newCandidateReceipts=[], candidateWorkIds=new Set(), observedKnownStudies=new Set(), refused=[];
  for(const [index,q] of spec.queries.entries()) {
    const searchId=q.source+"::"+runDay+"::"+q.query;
    if(priorIds.has(searchId)) { refused.push({searchId,reason:"already-queried-on-this-date"}); continue; }
    const limitedFetch=reliableBibliographyFetch(fetchImpl,{timeoutMs,budgetMs:20000});
    let outcome;
    try {
      if(q.source==="openalex") {
        outcome=await searchOpenAlex(q.query,{fetchImpl:limitedFetch,mailto,perPage:MAX_ITEMS_PER_QUERY,
          filter:"from_publication_date:"+window.from+",to_publication_date:"+window.to});
      } else {
        const found=await searchPubMed(q.query,{fetchImpl:limitedFetch,email,retmax:MAX_ITEMS_PER_QUERY,
          from:window.from,to:window.to});
        const ids=found.ids;
        const items=ids.length ? await readPubmed(ids,{fetchImpl:limitedFetch,email}):[];
        outcome={count:found.count,items,requestedIds:ids};
      }
      if(!outcome || !Number.isSafeInteger(outcome.count)||outcome.count<0||
          !Array.isArray(outcome.items)||outcome.items.length>MAX_ITEMS_PER_QUERY ||
          outcome.items.length>outcome.count || outcome.items.some(item=>!item||typeof item!=="object")) {
        throw new TypeError("research source returned an incoherent search page");
      }
      const candidateIds=new Set(), acquired=[];
      for(const item of outcome.items) {
        const candidate=makeCandidateRecord({item,source:q.source,searchId});
        const sourceKey=evidenceIdentity(candidate);
        if(candidateIds.has(sourceKey)) throw new TypeError("source returned duplicate original item IDs");
        candidateIds.add(sourceKey);
        acquired.push(candidate);
      }
      // Only after a complete valid query response is the search receipt
      // admitted. Missing summaries are explicitly partial, never null results.
      const sourceCoverage=outcome.count>acquired.length ? "partial-retrieval":"recorded-page-complete";
      const search={id:searchId,source:q.source,query:q.query,date:runDay,resultCount:outcome.count,
        observedAt:now,window,returnedCandidates:acquired.length,
        coverage:sourceCoverage,provenance:"source-metadata-only-not-full-text-or-retraction-feed"};
      searches.push(search);priorIds.add(searchId);
      for(const candidate of acquired) {
        const key=evidenceIdentity(candidate), prior=knownReceipt.get(key);
        if(prior) {
          // A candidate metadata change may be a live source edition drift;
          // it is NOT independently verified correction or retraction.
          if(sortedObject(prior.item)!==sortedObject(candidate.item)) {
            sourceRevisions.push({source:q.source,itemId:candidate.item.id,dedupeKey:candidate.dedupeKey,
              priorSearchId:prior.searchId,newSearchId:searchId,
              priorItem:prior.item,candidateItem:candidate.item,
              state:"candidate-source-metadata-change-unverified"});
          }
          if(knownStudies.has(candidate.dedupeKey)) observedKnownStudies.add(candidate.dedupeKey);
          continue;
        }
        knownReceipt.set(key,candidate);
        candidates.push(candidate);newCandidateReceipts.push(candidate);
        if(!knownStudies.has(candidate.dedupeKey)) candidateWorkIds.add(candidate.dedupeKey);
        else observedKnownStudies.add(candidate.dedupeKey);
        // Retain one receipt per original source item. Multiple sources with
        // same DOI are not independent original authors or new studies.
      }
    } catch(error) {
      // Failed retrieval cannot become 'zero articles'. No search result is
      // silently committed for an incomplete request.
      refused.push({searchId,reason:"source-query-unavailable-or-invalid",kind:error instanceof TypeError ?
        "invalid-or-unqualified-source-data":"retrieval-failed"});
    }
    if(index<spec.queries.length-1 && delayBetweenQueriesMs>0)
      await new Promise(accept=>setTimeout(accept,delayBetweenQueriesMs));
  }
  // A historical ledger may contain candidates whose source search receipts
  // were lost. Retain those in custody but NEVER inject fabricated searches or
  // admit them into review screening as independently witnessed acquisitions.
  const admittedSearches=new Map(searches.map(row=>[row.id,row]));
  const screeningReadyCandidates=candidates.filter(c=>admittedSearches.get(c.searchId)?.source===c.source);
  const unlinkedPriorCandidates=ledger.candidates.filter(c=>admittedSearches.get(c.searchId)?.source!==c.source)
    .map(c=>({source:c.source,itemId:c.item.id,searchId:c.searchId,
      reason:"missing-or-contradictory-original-retrieval-receipt"}));
  const completed=searches.length-ledger.searches.length;
  const partial=searches.slice(ledger.searches.length).some(s=>s.coverage!=="recorded-page-complete");
  return {
    type:"RecordedLiteratureWatchResult",version:1,watch:{id:spec.id,queries:spec.queries.map(q=>({...q})),
      interval:window,observedAt:now,execution:"single-invocation-no-scheduler"},
    disposition:refused.length ? "partial-or-refused" : partial ? "partial-source-coverage":"recorded-pages-received",
    ledger:{...ledger,searches,candidates},
    screeningInputLedger:{searches,candidates:screeningReadyCandidates},
    unlinkedPriorCandidates,
    changes:{newCandidateReceipts,newWorkIdentityCount:candidateWorkIds.size,
      newWorkIdentityKeys:[...candidateWorkIds].sort(),reseens:[...observedKnownStudies].sort(),
      candidateSourceRevisions:sourceRevisions},
    refusals:refused,
    summary:{attempted:spec.queries.length,received:completed,refused:refused.length,
      priorUnlinkedCandidateReceipts:unlinkedPriorCandidates.length,screeningReadyCandidateReceipts:screeningReadyCandidates.length,
      newlyRecordedCandidateReceipts:newCandidateReceipts.length,
      newUnscreenedWorkIdentityCandidates:candidateWorkIds.size},
    limits:"Fetched source metadata only; single capped first page per query, no pagination/full-text/retraction detection, authentication, source rights, independent origin identity, screening decisions, scheduling or merchant settlement. New candidates remain unscreened.",
    externalEffects:["read-only-polite-public-bibliographic-API-requests"],
  };
}
