import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeCsv } from "@red-cup-engineering/csv-services-section/csv-codec";
import { reproduceCohenStoppingStudy } from "../scripts/reproduce-cohen-stopping-study.mjs";
const keys=["Antihistamines","Estrogens","UrinaryIncontinence"];
const originalCommit="ee5f9a88cbf7945c2d6d679385f8605f28b298e9";
const hash=s=>{const bytes=Buffer.from(s,"utf8");return createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex")};
const cols=["record_id","pubmedID","title","authors","abstract","year","label_included","label_abstract_screening"];
const sourceFor=ordinal=>encodeCsv(Array.from({length:30},(_,i)=>({
 record_id:String(i+1),pubmedID:String(100000+100*ordinal+i),
 title:i===0?"A source study":"Other topic article",
 authors:"Independent Source",abstract:"Bibliographic body observation",
 year:"2006",label_included:i===0||i===29?"1":"0",
 label_abstract_screening:i===0||i===29?"1":"0"
})),{columns:cols,lineEnding:"\n",quoting:"minimal"});
const sources=keys.map((_,i)=>sourceFor(i));
const build=()=>{
 const tasks=keys.map((key,i)=>({
  key,sourceCommit:originalCommit,path:"datasets/Cohen_2006/output/online/"+key+".csv",
  gitBlobSha1:hash(sources[i]),reportedRows:30,reportedFinalIncluded:2,
  query:"topic article"
 }));
 const original={type:"PreRegisteredSourceQualifiedScreeningPilot",version:1,
  precommitted:true,corpusOwner:"LHofstee/systematic-review-datasets",
  upstreamCommit:originalCommit,tasks};
 const originalProtocolText=JSON.stringify(original,null,2)+"\n";
 const protocol={
  type:"PreregisteredFiniteScreeningStopHeuristicAssay",version:1,
  originalSourceCommit:originalCommit,originalSourceOwner:"LHofstee/systematic-review-datasets",
  existingBibliographyProtocolBlobSha1:hash(originalProtocolText),tasks,
  experiment:{
   policies:[{id:"stop-07pct",irrelevantRunPercent:7},
    {id:"stop-10pct",irrelevantRunPercent:10},
    {id:"stop-20pct",irrelevantRunPercent:20}],
   minScreenedPercent:10,requireAtLeastOnePositiveBeforeTrigger:true,baseline:128
  }};
 return {protocol,originalProtocolText};
};
test("one exact pinned original producer source per task gives 18 finite-stop assessments",async()=>{
 const args=build(),seen=[];
 const out=await reproduceCohenStoppingStudy({...args,fetchImpl:async url=>{
  seen.push(String(url));const i=keys.findIndex(k=>String(url).endsWith("/"+k+".csv"));
  return {ok:true,status:200,text:async()=>sources[i]};
 }});
 assert.equal(out.aggregate.tests,18);
 assert.equal(out.comparisons.length,3);
 assert.equal(seen.length,3);
 assert.ok(seen.every(s=>s.startsWith("https://raw.githubusercontent.com/LHofstee/systematic-review-datasets/"+originalCommit)));
 assert.equal(out.deploymentAuthorized,false);
 assert.equal(out.aggregate.earlyStopProposals,18);
 assert.equal(out.aggregate.prematureProposalOutcomes,18);
 assert.ok(!JSON.stringify(out).includes("Bibliographic body observation"));
});
test("mutated old preregistration, altered original corpus bytes and HTTP failure refuse",async()=>{
 const args=build();
 await assert.rejects(()=>reproduceCohenStoppingStudy({...args,originalProtocolText:args.originalProtocolText+" ",
  fetchImpl:async()=>{throw Error("network should not run")}}),/not source admitted/);
 await assert.rejects(()=>reproduceCohenStoppingStudy({...args,
  fetchImpl:async()=>({ok:true,status:200,text:async()=>sources[0]})}),/source revision differs/);
 await assert.rejects(()=>reproduceCohenStoppingStudy({...args,
  fetchImpl:async()=>({ok:false,status:404,text:async()=>""})}),/original source HTTP response/);
});
