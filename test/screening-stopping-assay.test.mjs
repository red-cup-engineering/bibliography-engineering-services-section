import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeCsv } from "@red-cup-engineering/csv-services-section/csv-codec";
import {
 evaluateFiniteConsecutiveNegativeStop,
 assayCohenHeuristicStopping
} from "../src/screening-stopping-assay.mjs";

const rows=(n=30)=>{
 const docs=Array.from({length:n},(_,i)=>({
   pmid:String(1000+i),initial:0,final:0
 }));
 docs[0].initial=1; docs[0].final=1;
 docs[n-1].initial=1;docs[n-1].final=1;
 return docs;
};
const order=n=>Array.from({length:n},(_,i)=>i);
const fields=["record_id","pubmedID","title","authors","abstract","year","label_included","label_abstract_screening"];
const source=docs=>encodeCsv(docs.map((d,i)=>({
 record_id:String(i+1),pubmedID:d.pmid,
 title:i===0?"Relevant histamine trial":"Other title "+i,
 authors:"Source Author",abstract:i===0?"Clinical outcome evidence":"Control text description",
 year:"2006.0",label_included:String(d.final),label_abstract_screening:String(d.initial)
})),{columns:fields,lineEnding:"\n",quoting:"minimal"});
const blob=raw=>{
 const buffer=Buffer.from(raw,"utf8");
 return createHash("sha1").update(Buffer.from("blob "+buffer.length+"\0")).update(buffer).digest("hex");
};
function protocolFor(text){
 const key="Antihistamines",sourceCommit="ee5f9a88cbf7945c2d6d679385f8605f28b298e9";
 const first={key,sourceCommit,path:"datasets/Cohen_2006/output/online/"+key+".csv",
   gitBlobSha1:blob(text),reportedRows:30,reportedFinalIncluded:2,
   query:"antihistamine histamine allergy allergic H1 receptor treatment"};
 const others=["Estrogens","UrinaryIncontinence"].map(id=>({...first,key:id,
   path:"datasets/Cohen_2006/output/online/"+id+".csv"}));
 return {
   profile:first,
   protocol:{
     type:"PreregisteredFiniteScreeningStopHeuristicAssay",version:1,
     originalSourceOwner:"LHofstee/systematic-review-datasets",
     originalSourceCommit:sourceCommit,
     tasks:[first,...others],
     experiment:{
       policies:[{id:"stop-07pct",irrelevantRunPercent:7},
         {id:"stop-10pct",irrelevantRunPercent:10},
         {id:"stop-20pct",irrelevantRunPercent:20}],
       minScreenedPercent:10,
       requireAtLeastOnePositiveBeforeTrigger:true,baseline:128
     }
   }
 };
}
test("7% consecutive-negative heuristic stops at a genuine counterexample without an oracle",()=>{
 const docs=rows(),r=evaluateFiniteConsecutiveNegativeStop({
   docs,ordered:order(docs.length),label:"initial",irrelevantRunPercent:7
 });
 assert.equal(r.policy.irrelevantRunRequired,3);
 assert.equal(r.policy.minimumScreenedRequired,3);
 assert.equal(r.stopProposal,true);
 assert.equal(r.inspected,4);
 assert.equal(r.retrospectiveEvaluation.sourceLabeledMissedPositives,1);
 assert.equal(r.retrospectiveEvaluation.actualRecall,0.5);
 assert.equal(r.retrospectiveEvaluation.missed95PercentGoal,true);
 assert.equal(r.sharpFiniteFrame.sharpWorstCaseRecall.numerator,1);
 assert.equal(r.sharpFiniteFrame.sharpWorstCaseRecall.denominator,27);
 assert.equal(r.sharpFiniteFrame.mathematicallyAtLeastTargetWithinAssumedClosedFrame,false);
 assert.equal(r.operativeStopAuthorized,false);
});
test("100% actual recall does not imply authorization to stop an independently unverified review",()=>{
 const docs=Array.from({length:30},(_,i)=>({
   pmid:String(i+1),initial:i%3===0?1:0,final:i%3===0?1:0
 }));
 const r=evaluateFiniteConsecutiveNegativeStop({docs,ordered:order(30),label:"final",irrelevantRunPercent:7});
 assert.equal(r.stopProposal,false);
 assert.equal(r.inspected,30);
 assert.equal(r.retrospectiveEvaluation.actualRecall,1);
 assert.equal(r.operativeStopAuthorized,false);
});
test("an unseen positive at the final record cannot be inferred away by a long negative streak",()=>{
 const docs=rows(),r=evaluateFiniteConsecutiveNegativeStop({
   docs,ordered:order(30),label:"final",irrelevantRunPercent:20
 });
 assert.equal(r.stopProposal,true);
 assert.equal(r.inspected,7);
 assert.equal(r.retrospectiveEvaluation.actualRecall,0.5);
 assert.equal(r.operativeStopAuthorized,false);
});
test("no observed positives cannot trigger the proposed heuristic until actual evidence arrives",()=>{
 const docs=Array.from({length:30},(_,i)=>({
   pmid:String(i+1),initial:Number(i===29),final:Number(i===29)
 }));
 const r=evaluateFiniteConsecutiveNegativeStop({docs,ordered:order(30),label:"initial",irrelevantRunPercent:7});
 assert.equal(r.stopProposal,false);
 assert.equal(r.inspected,30);
 assert.equal(r.retrospectiveEvaluation.actualRecall,1);
});
test("attempted policy changes, fake indices, unknown labels and all-positive populations refuse",()=>{
 const docs=rows();
 assert.throws(()=>evaluateFiniteConsecutiveNegativeStop({docs,ordered:order(30),label:"final",irrelevantRunPercent:5}),/declared policies/);
 assert.throws(()=>evaluateFiniteConsecutiveNegativeStop({docs,ordered:[0,...order(29)],label:"final",irrelevantRunPercent:7}),/permutations/);
 assert.throws(()=>evaluateFiniteConsecutiveNegativeStop({docs:docs.map(d=>({...d,final:1})),ordered:order(30),label:"final",irrelevantRunPercent:7}),/both included and excluded/);
 const fake=[...docs];fake[0]={...fake[0],initial:"unknown"};
 assert.throws(()=>evaluateFiniteConsecutiveNegativeStop({docs:fake,ordered:order(30),label:"initial",irrelevantRunPercent:7}),/typed 0\/1/);
});
test("original frozen 3-corpus protocol drives deterministic per-endpoint 128-run comparison",()=>{
 const docs=rows(),rawText=source(docs),{profile,protocol}=protocolFor(rawText);
 const result=assayCohenHeuristicStopping({rawText,profile,protocol});
 assert.equal(result.type,"SourceQualifiedConsecutiveIrrelevantStopAssay");
 assert.equal(result.population,30);
 assert.equal(result.comparators.finalInclusion.policies["stop-07pct"].random128.n,128);
 assert.ok(result.comparators.finalInclusion.policies["stop-07pct"].random128.proposedEarlyStops>=0);
 assert.equal(result.operativeStopAuthorized,false);
 assert.deepEqual(result,assayCohenHeuristicStopping({rawText,profile,protocol}));
 const edited={...protocol,experiment:{...protocol.experiment,
   policies:[...protocol.experiment.policies].reverse()}};
 assert.throws(()=>assayCohenHeuristicStopping({rawText,profile,protocol:edited}),/exact policies/);
});
test("unpinned source edition and changed preregistered query are refused",()=>{
 const docs=rows(),rawText=source(docs),{profile,protocol}=protocolFor(rawText);
 const tampered=rawText.replace("Clinical outcome evidence","Rewritten outcome evidence");
 assert.throws(()=>assayCohenHeuristicStopping({rawText:tampered,profile,protocol}),/source revision differs/);
 assert.throws(()=>assayCohenHeuristicStopping({rawText,profile:{...profile,query:"new fitted query"},protocol}),/frozen stopping preregistration/);
});
