import test from 'node:test';
import assert from 'node:assert/strict';
import { assessScreeningContinuity } from '../src/screening-continuity.mjs';

const clone=x=>structuredClone(x);
const title='A source-grounded study';
const item=(id,doi='10.1234/example',t=title)=>({id,DOI:doi,title:t,abstract:'The original study reports a bounded result.',issued:{'date-parts':[[2025]]}});
const oldLedger=()=>({
  searches:[
    {id:'oa-1',source:'openalex',query:'example',date:'2026-10-26',resultCount:1},
    {id:'pm-1',source:'pubmed',query:'example',date:'2026-10-26',resultCount:1},
  ],
  candidates:[
    {searchId:'oa-1',source:'openalex',dedupeKey:'doi:10.1234/example',item:item('W1')},
    {searchId:'pm-1',source:'pubmed',dedupeKey:'doi:10.1234/example',item:item('P1')},
  ],
});
const previous=()=>({ledger:oldLedger(),protocol:{id:'two-source-evidence-assay',stage:'title-abstract',criteria:['irrelevant']},reviews:[
  {id:'r1',recordId:'doi:10.1234/example',reviewerId:'Alice',decision:'include',
    evidence:{searchId:'oa-1',itemId:'W1',field:'title',start:0,end:title.length,quote:title}},
  {id:'r2',recordId:'doi:10.1234/example',reviewerId:'Bob',decision:'include',
    evidence:{searchId:'pm-1',itemId:'P1',field:'title',start:0,end:title.length,quote:title}},
]});
function watch(old, {revisions=[],extra=[],refusals=[],searchIds=['oa-2']}={}){
  const newSearches=searchIds.map(id=>({id,source:id.startsWith('pm')?'pubmed':id.startsWith('cr')?'crossref':'openalex',
    query:'example',date:'2026-10-27',resultCount:extra.filter(c=>c.searchId===id).length}));
  const ledger={searches:[...clone(old.searches),...newSearches],candidates:[...clone(old.candidates),...extra]};
  return {type:'RecordedLiteratureWatchResult',version:1,ledger,screeningInputLedger:clone(ledger),
    summary:{received:searchIds.length,priorUnlinkedCandidateReceipts:0},
    unlinkedPriorCandidates:[],
    changes:{newCandidateReceipts:clone(extra),candidateSourceRevisions:revisions,newWorkIdentityKeys:[]},refusals};
}
function revision(old,changes={},candidateOverrides={}){
  const prior=old.candidates[0];
  const updated={...clone(prior.item),...changes};
  return {source:'openalex',itemId:'W1',priorSearchId:'oa-1',newSearchId:'oa-2',
    dedupeKey:candidateOverrides.dedupeKey||prior.dedupeKey,
    priorItem:clone(prior.item),candidateItem:updated,
    state:'candidate-source-metadata-change-unverified'};
}
const run=(settings={},req=previous())=>assessScreeningContinuity({previous:req,watchResult:watch(req.ledger,settings)});

test('unchanged historical screening remains a qualified source-bound baseline, not publication authority',()=>{
  const report=run();
  assert.equal(report.baseline.resolved,1);
  assert.equal(report.reassessmentRecordIds.length,0);
  assert.equal(report.subsequent.records,1);
  assert.equal(report.releaseQualification.priorResolvedDecisionsStillUncontestedByObservedChanges,true);
  assert.equal(report.releaseQualification.automaticScreeningOrPublicationAuthorized,false);
  assert.deepEqual(report.externalEffects,[]);
});
test('source title change propagates to an included DOI group and pinpoints a broken quotation',()=>{
  const req=previous();const changed=revision(req.ledger,{title:'A corrected source title'});
  const impact=run({revisions:[changed]},req);
  assert.deepEqual(impact.previouslyResolvedNowReassessmentRequired,['doi:10.1234/example']);
  assert.equal(impact.candidateSourceRevisions[0].significance,'screening-source-content-changed');
  assert.deepEqual(impact.candidateSourceRevisions[0].changedTextFields,['title']);
  assert.deepEqual(impact.candidateSourceRevisions[0].affectedVotes.map(x=>[x.id,x.originalQuoteStillAtOffset]),[['r1',false]]);
  assert.equal(impact.releaseQualification.priorResolvedDecisionsStillUncontestedByObservedChanges,false);
});
test('abstract changes force reconsideration even when the originally quoted title still matches',()=>{
  const req=previous();const change=revision(req.ledger,{abstract:'A different finding.'});
  const impact=run({revisions:[change]},req);
  assert.deepEqual(impact.candidateSourceRevisions[0].changedTextFields,['abstract']);
  assert.equal(impact.candidateSourceRevisions[0].affectedVotes[0].originalQuoteStillAtOffset,true);
  assert.deepEqual(impact.reassessmentRecordIds,['doi:10.1234/example']);
});
test('same source item reporting a different DOI creates an identity warning, not a discovered new study',()=>{
  const req=previous();const changed=revision(req.ledger,{DOI:'10.1234/other'},
    {dedupeKey:'doi:10.1234/other'});
  const impact=run({revisions:[changed]},req);
  assert.equal(impact.candidateSourceRevisions[0].identityKeyChanged,true);
  assert.equal(impact.candidateSourceRevisions[0].significance,'possible-work-identity-change');
  assert.equal(impact.newRecordCandidates.length,0);
});
test('author/issued metadata change still requires original source identity review',()=>{
  const req=previous();const changed=revision(req.ledger,{issued:{'date-parts':[[2026]]}});
  const impact=run({revisions:[changed]},req);
  assert.equal(impact.candidateSourceRevisions[0].significance,'other-source-metadata-changed');
  assert.deepEqual(impact.candidateSourceRevisions[0].changedTextFields,[]);
  assert.equal(impact.previouslyResolvedNowReassessmentRequired.length,1);
});
test('new same-DOI source with opposing title surfaces identity-conflict despite pre-existing reviewer agreement',()=>{
  const req=previous();const extra={searchId:'pm-2',source:'pubmed',dedupeKey:'doi:10.1234/example',
    item:item('P2','10.1234/example','A completely different work')};
  const report=run({extra:[extra],searchIds:['pm-2']},req);
  assert.deepEqual(report.statusTransitions,[{recordId:'doi:10.1234/example',from:'included',to:'identity-conflict'}]);
  assert.equal(report.newReceiptsInPreviouslyKnownRecords.length,1);
  assert.deepEqual(report.previouslyResolvedNowReassessmentRequired,['doi:10.1234/example']);
  assert.equal(report.releaseQualification.priorResolvedDecisionsStillUncontestedByObservedChanges,false);
});
test('genuinely new candidate remains pending without retroactively falsifying old sourced reviewer votes',()=>{
  const req=previous();const newStudy={searchId:'oa-2',source:'openalex',dedupeKey:'doi:10.1234/new',
    item:item('W2','10.1234/new','Newly observed question')};
  const report=run({extra:[newStudy]},req);
  assert.deepEqual(report.reassessmentRecordIds,[]);
  assert.deepEqual(report.newRecordCandidates.map(r=>[r.recordId,r.status]),[['doi:10.1234/new','pending']]);
  assert.equal(report.releaseQualification.completeSourceFrameEstablished,false);
});
test('query failure is never fabricated into negative or empty evidence',()=>{
  const report=run({refusals:[{searchId:'pm-2',reason:'source-query-unavailable-or-invalid'}]});
  assert.equal(report.sourceQueryRefusals.length,1);
  assert.deepEqual(report.reassessmentRecordIds,[]);
  assert.equal(report.releaseQualification.completeSourceFrameEstablished,false);
});
test('forged previous source bytes fail closed',()=>{
  const req=previous(),bad=revision(req.ledger,{title:'A revision'});
  bad.priorItem.title='Forgery';
  assert.throws(()=>run({revisions:[bad]},req),/original source testimony/);
});
test('watch that rewrites a prior candidate in-place fails closed',()=>{
  const req=previous(),result=watch(req.ledger);
  result.screeningInputLedger.candidates[0].item.title='Silent overwrite';
  assert.throws(()=>assessScreeningContinuity({previous:req,watchResult:result}),/changed original candidates/);
});
test('duplicate conflicting observations of the same source item fail closed',()=>{
  const req=previous();const a=revision(req.ledger,{title:'A changed title'});
  const b={...revision(req.ledger,{title:'Another changed title'}),newSearchId:'oa-3'};
  assert.throws(()=>run({revisions:[a,b],searchIds:['oa-2','oa-3']},req),/conflicting observed revisions/);
});
test('a revision cannot launder an unknown source item or unknown search receipt into authority',()=>{
  const req=previous(),bad=revision(req.ledger,{title:'A change'});
  bad.itemId='UNKNOWN';
  assert.throws(()=>run({revisions:[bad]},req),/original source testimony/);
  const missing=revision(req.ledger,{title:'A change'});missing.newSearchId='missing-search';
  assert.throws(()=>run({revisions:[missing]},req),/newly recorded same-source/);
});
test('a fabricated new candidate receipt list is refused',()=>{
  const req=previous(),result=watch(req.ledger);
  result.changes.newCandidateReceipts.push({fake:true});
  assert.throws(()=>assessScreeningContinuity({previous:req,watchResult:result}),/candidate receipts disagree/);
});

test('standalone operation emits JSON and signals reassessment as exit 1, not automatic clearance',async()=>{
  const { spawnSync }=await import('node:child_process');
  const req=previous();const change=revision(req.ledger,{title:'Changed'});
  const execution=spawnSync(process.execPath,[new URL('../scripts/review-screening-continuity.mjs',import.meta.url).pathname],{
    input:JSON.stringify({previous:req,watchResult:watch(req.ledger,{revisions:[change]})}),encoding:'utf8'});
  assert.equal(execution.status,1,execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout).reassessmentRecordIds,['doi:10.1234/example']);
});
test('standalone operation returns zero only when there are no observed changes',async()=>{
  const { spawnSync }=await import('node:child_process');
  const req=previous();const execution=spawnSync(process.execPath,[new URL('../scripts/review-screening-continuity.mjs',import.meta.url).pathname],{
    input:JSON.stringify({previous:req,watchResult:watch(req.ledger)}),encoding:'utf8'});
  assert.equal(execution.status,0,execution.stderr);
  assert.equal(JSON.parse(execution.stdout).releaseQualification.automaticScreeningOrPublicationAuthorized,false);
});
test('standalone operation refuses malformed research data as exit 2',async()=>{
  const { spawnSync }=await import('node:child_process');
  const execution=spawnSync(process.execPath,[new URL('../scripts/review-screening-continuity.mjs',import.meta.url).pathname],{
    input:JSON.stringify({unrelated:true}),encoding:'utf8'});
  assert.equal(execution.status,2);
  assert.match(execution.stderr,/original screening request/);
});
