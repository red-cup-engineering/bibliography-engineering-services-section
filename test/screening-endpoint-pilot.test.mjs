import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeCsv } from "@red-cup-engineering/csv-services-section/csv-codec";
import { assayCohenScreeningEndpoint,scoreRetrospectiveRank } from "../src/screening-endpoint-pilot.mjs";
const cols=["record_id","pubmedID","title","authors","abstract","year","label_included","label_abstract_screening"];
const original=[
 {record_id:"1",pubmedID:"1000001",title:"Antihistamine allergy trial",authors:"A Researcher",abstract:"Histamine receptor randomized study",year:"2001.0",label_included:"1",label_abstract_screening:"1"},
 {record_id:"2",pubmedID:"1000002",title:"Histamine H1 receptor",authors:"B Researcher",abstract:"A published trial",year:"2000.0",label_included:"0",label_abstract_screening:"1"},
 {record_id:"3",pubmedID:"1000003",title:"Measuring the weather",authors:"C Researcher",abstract:"Environmental research",year:"1999.0",label_included:"0",label_abstract_screening:"0"},
 {record_id:"4",pubmedID:"1000004",title:"Treatment for allergy",authors:"D Researcher",abstract:"Randomized histamine treatment",year:"2002.0",label_included:"1",label_abstract_screening:"1"},
 {record_id:"5",pubmedID:"1000005",title:"Histamine observation",authors:"E Researcher",abstract:"Study sample abstract",year:"2003.0",label_included:"0",label_abstract_screening:"0"},
 {record_id:"6",pubmedID:"1000006",title:"",authors:"F Researcher",abstract:"",year:"2004.0",label_included:"0",label_abstract_screening:"0"},
];
const text=rows=>encodeCsv(rows,{columns:cols,lineEnding:"\n",quoting:"minimal"});
const sha1=content=>{const buf=Buffer.from(content,"utf8");return createHash("sha1").update(Buffer.from("blob "+buf.length+"\0")).update(buf).digest("hex")};
const profile=source=>({key:"Antihistamines",path:"datasets/Cohen_2006/output/online/Antihistamines.csv",
 sourceCommit:"ee5f9a88cbf7945c2d6d679385f8605f28b298e9",
 gitBlobSha1:sha1(source),reportedRows:6,reportedFinalIncluded:2,
 query:"antihistamine histamine allergy H1 receptor treatment"});
test("canonical CSV parses quotations, two distinct stages, and keeps missing evidence in denominators",()=>{
 const raw=text(original),result=assayCohenScreeningEndpoint({rawText:raw,profile:profile(raw),randomReplicates:32});
 assert.equal(result.evidence.records,6);
 assert.deepEqual(result.evidence.stage,{initialPositive:3,finalPositive:2,bothPositive:2,initialOnly:1,finalOnly:0,bothNegative:3});
 assert.equal(result.evidence.bothMissing,1);
 assert.equal(result.endpoints.titleAbstract.rank.positives,3);
 assert.equal(result.endpoints.finalInclusion.rank.positives,2);
 assert.equal(result.endpoints.finalInclusion.random.nPermutations,32);
 assert.equal(result.method.usesGoldLabelsToRank,false);
 for(const outcome of Object.values(result.endpoints)){
   assert.ok(outcome.rank.inspectedAt95Recall>=outcome.rank.targetIncluded);
   assert.ok(outcome.rank.inspectedAt95Recall<=6);
   assert.ok(Number.isFinite(outcome.rank.workSavedOverSamplingAt95));
   assert.ok(outcome.rank.recallAt20PercentScreened>=0&&outcome.rank.recallAt20PercentScreened<=1);
 }
});
test("same pinned source, query and deterministic random seeds reproduce byte-identical output",()=>{
 const raw=text(original),input={rawText:raw,profile:profile(raw),randomReplicates:32};
 assert.deepEqual(assayCohenScreeningEndpoint(input),assayCohenScreeningEndpoint(input));
});
test("rewritten published labels invalidate original source pin, rather than silently recalibrating metrics",()=>{
 const raw=text(original),rewritten=text(original.map((r,i)=>i===2?{...r,label_included:"1"}:r));
 assert.throws(()=>assayCohenScreeningEndpoint({rawText:rewritten,profile:profile(raw)}),/source revision differs/);
});
test("false source sizes, duplicate works, nonbinary decisions and malformed CSV refuse",()=>{
 const raw=text(original);
 assert.throws(()=>assayCohenScreeningEndpoint({rawText:raw,profile:{...profile(raw),reportedRows:7}}),/population size/);
 const duplicates=text(original.map((r,i)=>i===1?{...r,pubmedID:"1000001"}:r));
 assert.throws(()=>assayCohenScreeningEndpoint({rawText:duplicates,profile:profile(duplicates)}),/duplicate article identity/);
 const broken=text(original.map((r,i)=>i===1?{...r,label_abstract_screening:"unknown"}:r));
 assert.throws(()=>assayCohenScreeningEndpoint({rawText:broken,profile:profile(broken)}),/screening label/);
 assert.throws(()=>assayCohenScreeningEndpoint({rawText:raw,profile:{...profile(raw),reportedFinalIncluded:5}}),/final-inclusion total/);
});
test("gold labels are revealed only to retrospective metric computation",()=>{
 const docs=[{pmid:"1",initial:1,final:0},{pmid:"2",initial:0,final:1},{pmid:"3",initial:0,final:0},{pmid:"4",initial:0,final:0}];
 const order=[0,2,3,1];const pre=scoreRetrospectiveRank(docs,order,"initial");
 const after=scoreRetrospectiveRank(docs,order,"final");
 assert.equal(pre.inspectedAt95Recall,1);
 assert.equal(after.inspectedAt95Recall,4);
 assert.ok(pre.workSavedOverSamplingAt95>after.workSavedOverSamplingAt95);
 assert.throws(()=>scoreRetrospectiveRank(docs,[0,0,1,2],"initial"),/permutation/);
});
test("cannot fabricate a WSS@95 with no included or with all included records",()=>{
 const docs=[{pmid:"1",initial:0,final:0},{pmid:"2",initial:0,final:0}];
 assert.throws(()=>scoreRetrospectiveRank(docs,[0,1],"final"),/both positive and negative/);
});
