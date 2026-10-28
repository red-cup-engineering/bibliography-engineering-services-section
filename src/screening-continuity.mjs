/**
 * Source-change dependency assay for the original bibliography screening/watch
 * carriers. Derives consequences; never mutates past source, vote or Work.
 * A reported API metadata change is a candidate observation, NOT a verified
 * article correction, retraction, scientific conclusion or stop authorization.
 */
import { assessRecordedScreening } from './reference-screening.mjs';

const cmp = (a,b) => a<b?-1:a>b?1:0;
const key = (source,id) => JSON.stringify([source,id]);
const stable = x => Array.isArray(x) ? '['+x.map(stable).join(',')+']' :
  x && typeof x==='object' ? '{'+Object.keys(x).sort().filter(k=>x[k]!==undefined)
    .map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}' : JSON.stringify(x);
const equal = (a,b) => stable(a)===stable(b);
function requireRecord(ok,message) { if(!ok) throw new TypeError(message); }
function evidenceRefs(row) {
  return [...row.reviews,...(row.adjudication?[row.adjudication]:[])];
}
/**
 * Compare two ORIGINAL screening evaluations around one ORIGINAL literature
 * watch. The old source rows remain append-only, so source revisions need an
 * explicit dependency check; re-running screening alone misses them.
 *
 * Input: {previous:{ledger,protocol,reviews?,adjudications?},watchResult}
 * The output is a machine-actionable request for scientific reassessment,
 * not proof that the returned source revision occurred in the world.
 */
export function assessScreeningContinuity({previous,watchResult}={}) {
  requireRecord(previous && typeof previous==='object' && previous.ledger,
    'original screening request and ledger required');
  requireRecord(watchResult?.type==='RecordedLiteratureWatchResult' &&
    watchResult.ledger && watchResult.screeningInputLedger &&
    Array.isArray(watchResult.changes?.candidateSourceRevisions) &&
    Array.isArray(watchResult.changes?.newCandidateReceipts) &&
    Array.isArray(watchResult.refusals), 'original typed watch result required');
  const old=previous.ledger, next=watchResult.screeningInputLedger, all=watchResult.ledger;
  requireRecord(Array.isArray(old.searches)&&Array.isArray(old.candidates)&&
    Array.isArray(next.searches)&&Array.isArray(next.candidates)&&
    Array.isArray(all.searches)&&Array.isArray(all.candidates) &&
    Array.isArray(watchResult.unlinkedPriorCandidates) &&
    Number.isSafeInteger(watchResult.summary?.received) &&
    Number.isSafeInteger(watchResult.summary?.priorUnlinkedCandidateReceipts),
    'bounded original watch/search and screening evidence required');
  const newReceipts=watchResult.changes.newCandidateReceipts;
  const newSearchCount=watchResult.summary.received;
  requireRecord(newSearchCount>=0 && newSearchCount<=all.searches.length &&
    newReceipts.length<=all.candidates.length &&
    [old.searches.length,old.candidates.length,next.searches.length,
      next.candidates.length,all.searches.length,all.candidates.length].every(n=>n<=5000) &&
    watchResult.changes.candidateSourceRevisions.length<=5000,
    'source-change assay exceeds original budget or impossible watch additions');

  // Original literature watch preserves orphaned historical candidates for
  // custody, while deliberately omitting them from screening. The previous
  // screen must match only the *admitted* original source receipts; its
  // historical raw search/candidate prefix remains independently checkable.
  const priorSearches=all.searches.slice(0,all.searches.length-newSearchCount);
  const priorCandidates=all.candidates.slice(0,all.candidates.length-newReceipts.length);
  const searchIndex=rows=>new Map(rows.map(row=>[row.id,row]));
  const admitted=(candidates,searches)=>candidates.filter(c=>
    searches.get(c.searchId)?.source===c.source);
  const previouslyAdmitted=admitted(priorCandidates,searchIndex(priorSearches));
  const nowAdmitted=admitted(all.candidates,searchIndex(all.searches));
  const priorOrphans=priorCandidates.filter(c=>
    searchIndex(priorSearches).get(c.searchId)?.source!==c.source);
  requireRecord(equal(old.searches,priorSearches) &&
    equal(old.candidates,previouslyAdmitted),
    'previous screening is not the original source-qualified watch prefix');
  requireRecord(equal(next.searches,all.searches) &&
    equal(next.candidates,nowAdmitted),
    'screeningInputLedger disagrees with native source-receipt admission');
  requireRecord(equal(all.candidates.slice(priorCandidates.length),newReceipts),
    'new candidate receipts disagree with original appended ledger');
  requireRecord(watchResult.summary.priorUnlinkedCandidateReceipts===priorOrphans.length &&
    equal(watchResult.unlinkedPriorCandidates,priorOrphans.map(c=>({
      source:c.source,itemId:c.item.id,searchId:c.searchId,
      reason:'missing-or-contradictory-original-retrieval-receipt'
    }))), 'orphaned historical source records were omitted or reclassified');
  const newSearchIds=new Set(all.searches.slice(priorSearches.length).map(s=>s.id));

  const before=assessRecordedScreening(previous);
  const after=assessRecordedScreening({...previous,ledger:next});
  const priorRows=new Map(before.records.map(r=>[r.recordId,r]));
  const afterRows=new Map(after.records.map(r=>[r.recordId,r]));
  const receiptToRecord=new Map();
  for(const row of before.records) for(const r of row.sourceReceipts)
    receiptToRecord.set(JSON.stringify([r.searchId,r.source,r.itemId]),row.recordId);
  const searchRows=new Map(next.searches.map(r=>[r.id,r]));
  const priorSources=new Map(priorCandidates.map(c=>[JSON.stringify([c.searchId,c.source,c.item.id]),c]));
  const revisions=[],heldRevisions=[],revisionVersions=new Map(),needs=new Set();
  for(const change of watchResult.changes.candidateSourceRevisions) {
    requireRecord(change && typeof change==='object' &&
      typeof change.source==='string' && typeof change.itemId==='string' &&
      typeof change.priorSearchId==='string' && typeof change.newSearchId==='string',
      'source revision has invalid original identities');
    const receipt=JSON.stringify([change.priorSearchId,change.source,change.itemId]);
    const original=priorSources.get(receipt),recordId=receiptToRecord.get(receipt);
    requireRecord(original && equal(original.item,change.priorItem),
      'revision lacks unchanged original source testimony');
    requireRecord(newSearchIds.has(change.newSearchId) &&
      searchRows.get(change.newSearchId)?.source===change.source &&
      change.newSearchId!==change.priorSearchId &&
      change.candidateItem?.id===change.itemId &&
      typeof change.dedupeKey==='string',
      'revision lacks a newly recorded same-source observation');
    requireRecord(!equal(change.priorItem,change.candidateItem),
      'unchanged metadata cannot assert a source revision');
    const distinct=key(change.source,change.itemId);
    if(revisionVersions.has(distinct)) requireRecord(
      equal(revisionVersions.get(distinct),change.candidateItem),
      'conflicting observed revisions of one source item');
    else revisionVersions.set(distinct,change.candidateItem);
    if(!recordId) {
      // The changed source item was retained in the original watch's
      // non-review-ready historical corpus. Never fabricate its absent
      // search receipt, a past review, or a FOUR opposition witness.
      heldRevisions.push({source:change.source,itemId:change.itemId,
        priorSearchId:change.priorSearchId,newSearchId:change.newSearchId,
        reason:'prior-source-unlinked-no-original-review-admission',
        epistemicStanding:'source-metadata-revision-candidate-only'});
      continue;
    }
    const previousRow=priorRows.get(recordId);
    const bound=evidenceRefs(previousRow).filter(v=>
      v.evidence.searchId===change.priorSearchId && v.evidence.itemId===change.itemId);
    const changedText=['title','abstract'].filter(field=>
      !equal(change.priorItem[field],change.candidateItem[field]));
    const identityChange=original.dedupeKey!==change.dedupeKey;
    const affectedVotes=bound.map(v=>({id:v.id,reviewerId:v.reviewerId,
      citedField:v.evidence.field,
      originalQuoteStillAtOffset:typeof change.candidateItem[v.evidence.field]==='string' &&
        change.candidateItem[v.evidence.field].slice(v.evidence.start,v.evidence.end)===v.evidence.quote}));
    revisions.push({recordId,source:change.source,itemId:change.itemId,
      priorSearchId:change.priorSearchId,newSearchId:change.newSearchId,
      priorIdentityKey:original.dedupeKey,observedIdentityKey:change.dedupeKey,
      identityKeyChanged:identityChange,changedTextFields:changedText,
      affectedVotes,
      significance:identityChange?'possible-work-identity-change':
        changedText.length?'screening-source-content-changed':'other-source-metadata-changed',
      epistemicStanding:'reported-source-metadata-difference-not-an-authenticated-correction'});
    needs.add(recordId);
  }
  const addedToExisting=[];
  for(const row of after.records) {
    const former=priorRows.get(row.recordId);
    if(!former) continue;
    const older=new Set(former.sourceReceipts.map(r=>JSON.stringify([r.searchId,r.source,r.itemId])));
    const receipts=row.sourceReceipts.filter(r=>!older.has(JSON.stringify([r.searchId,r.source,r.itemId])));
    if(receipts.length){
      needs.add(row.recordId);
      addedToExisting.push({recordId:row.recordId,receipts,
        previousStatus:former.status,projectedStatus:row.status,
        possibleIndependentSource:false});
    }
  }
  const transitions=[];
  for(const former of before.records) {
    const updated=afterRows.get(former.recordId);
    requireRecord(updated,'previous study identity vanished after append-only watch');
    if(updated.status!==former.status) {
      needs.add(former.recordId);
      transitions.push({recordId:former.recordId,from:former.status,to:updated.status});
    }
  }
  const newRecordCandidates=after.records.filter(r=>!priorRows.has(r.recordId))
    .map(r=>({recordId:r.recordId,identityUnverified:r.identityUnverified,status:r.status}));
  const reassessmentRecordIds=[...needs].sort(cmp);
  return {
    type:'SourceWitnessedScreeningContinuityAssay',version:1,
    protocolId:before.protocol.id,
    baseline:{records:before.records.length,resolved:before.records.filter(r=>
      ['included','excluded'].includes(r.status)).length},
    subsequent:{records:after.records.length,unreviewed:newRecordCandidates.length},
    candidateSourceRevisions:revisions.sort((a,b)=>cmp(a.recordId,b.recordId)||cmp(a.source,b.source)||cmp(a.itemId,b.itemId)),
    heldUnqualifiedSourceRevisions:heldRevisions.sort((a,b)=>cmp(a.source,b.source)||cmp(a.itemId,b.itemId)),
    unlinkedPriorCandidates:watchResult.unlinkedPriorCandidates,
    newReceiptsInPreviouslyKnownRecords:addedToExisting.sort((a,b)=>cmp(a.recordId,b.recordId)),
    statusTransitions:transitions.sort((a,b)=>cmp(a.recordId,b.recordId)),
    newRecordCandidates,
    reassessmentRecordIds,
    previouslyResolvedNowReassessmentRequired:reassessmentRecordIds.filter(id=>
      ['included','excluded'].includes(priorRows.get(id)?.status)),
    sourceQueryRefusals:watchResult.refusals,
    releaseQualification:{
      priorResolvedDecisionsStillUncontestedByObservedChanges:
        reassessmentRecordIds.every(id=>!['included','excluded'].includes(priorRows.get(id)?.status)),
      unchangedPriorReviewSourceFrameComplete:false,
      completeSourceFrameEstablished:false,
      priorSourceAuthenticityProven:false,
      automaticScreeningOrPublicationAuthorized:false,
    },
    epistemicStanding:'replayable-computational-dependency-audit-over-supplied-source-observations',
    externalEffects:[],
  };
}
