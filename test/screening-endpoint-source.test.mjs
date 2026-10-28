import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encodeCsv } from "@red-cup-engineering/csv-services-section/csv-codec";
import { reproduceCohenPilot } from "../scripts/reproduce-cohen-screening-pilot.mjs";
const keys=["Antihistamines","Estrogens","UrinaryIncontinence"];
const rows=[
 {record_id:"1",pubmedID:"1000",title:"Urinary antibody study",authors:"A",
   abstract:"Antihistamine and estrogen study",year:"2006.0",label_included:"1",label_abstract_screening:"1"},
 {record_id:"2",pubmedID:"2000",title:"Urinary clinical evidence",authors:"B",
   abstract:"Estrogen histamine review",year:"2005.0",label_included:"0",label_abstract_screening:"0"},
 {record_id:"3",pubmedID:"3000",title:"Bladder trial",authors:"C",
   abstract:"Placebo treatment",year:"2004.0",label_included:"0",label_abstract_screening:"0"},
];
const text=encodeCsv(rows,{columns:Object.keys(rows[0]),lineEnding:"\n",quoting:"minimal"});
const buf=Buffer.from(text);
const blob=createHash("sha1").update(Buffer.from("blob "+buf.length+"\0")).update(buf).digest("hex");
const commit="ee5f9a88cbf7945c2d6d679385f8605f28b298e9";
const manifest=()=>({type:"PreRegisteredSourceQualifiedScreeningPilot",version:1,precommitted:true,
 corpusOwner:"LHofstee/systematic-review-datasets",upstreamCommit:commit,metric:{randomSeeds:32},
 tasks:keys.map(key=>({key,sourceCommit:commit,gitBlobSha1:blob,
   reportedRows:3,reportedFinalIncluded:1,query:"clinical evidence treatment",
   path:"datasets/Cohen_2006/output/online/"+key+".csv"})),
});
test("one public original-source URL per precommitted task and no original abstract/body in output",async()=>{
 const seen=[];
 const fake=async uri=>{seen.push(String(uri));return {ok:true,status:200,text:async()=>text};};
 const result=await reproduceCohenPilot({manifest:manifest(),fetchImpl:fake});
 assert.equal(result.comparisons.length,3);
 assert.equal(seen.length,3);
 assert.ok(seen.every(uri=>uri.startsWith("https://raw.githubusercontent.com/LHofstee/systematic-review-datasets/"+commit+"/")));
 assert.equal(result.overlap.sharedPubmedRecordsAcrossTasks,6);
 assert.equal(result.comparisons[0].evidence.stage.finalPositive,1);
 assert.ok(!JSON.stringify(result).includes("Urinary antibody study"));
 assert.ok(!JSON.stringify(result).includes("Placebo treatment"));
});
test("tampered source metadata or missing original page refuses rather than inventing a benchmark",async()=>{
 const invalid=manifest();invalid.tasks[0].gitBlobSha1="f".repeat(40);
 await assert.rejects(()=>reproduceCohenPilot({manifest:invalid,
   fetchImpl:async()=>({ok:true,text:async()=>text})}),/source revision differs/);
 let calls=0;
 const wrong=manifest();wrong.tasks[0].path="../private/secret";
 await assert.rejects(()=>reproduceCohenPilot({manifest:wrong,
   fetchImpl:async()=>{calls++;}}),/unapproved original cohort/);
 assert.equal(calls,0);
 await assert.rejects(()=>reproduceCohenPilot({manifest:manifest(),
   fetchImpl:async()=>({ok:false,status:404,text:async()=>""})}),/original source HTTP/);
});
