import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reproduceSynergyIdentityAudit } from "../scripts/reproduce-synergy-identity-audit.mjs";
const commit="abcdef0123456789abcdef0123456789abcdef01";
const names=["Sep_2021","Donners_2021","Smid_2020"];
const texts=names.map((x,i)=>[
"doi,openalex_id,label_included",
"https://doi.org/10.1000/"+i+",https://openalex.org/W"+(100+i)+",1",
"https://doi.org/10.1000/"+i+",https://openalex.org/W"+(100+i)+",0",
].join("\n")+"\n");
const blob=s=>{
 const b=Buffer.from(s);
 return createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
};
const manifest=()=>({type:"ExternalLabeledBibliographyIdentityAuditManifest",sourceOwner:"asreview/synergy-dataset",sourceCommit:commit,
 profiles:names.map((corpus,i)=>({corpus,path:"datasets/"+corpus+"/"+corpus+"_ids.csv",
 gitBlobSha1:blob(texts[i]),sourceCommit:commit,publishedBenchmarkRecords:1,publishedIncluded:1}))
});
test("one authentic source response per pinned discipline becomes a bounded conflicting-label audit",async()=>{
 const seen=[];
 const fakeFetch=async (uri)=>{
  seen.push(String(uri));
  const i=names.findIndex(n=>String(uri).includes(n+"/"+n+"_ids.csv"));
  assert.ok(i>=0);
  return {ok:true,text:async()=>texts[i]};
 };
 const r=await reproduceSynergyIdentityAudit({manifest:manifest(),fetchImpl:fakeFetch});
 assert.equal(seen.length,3);
 assert.equal(r.studies.length,3);
 assert.equal(r.totals.rawRows,6);
 assert.equal(r.totals.openAlexIdentities,3);
 assert.equal(r.totals.conflictingIdentityGroups,3);
 assert.equal(r.status,"computational-source-quality-result-not-admitted-ground-truth-screening-benchmark");
 assert.ok(seen.every(s=>s.startsWith("https://raw.githubusercontent.com/asreview/synergy-dataset/"+commit+"/")));
});
test("bad source bytes and non-admitted upstream source are refused instead of becoming empty research",async()=>{
 const corrupt=async()=>({ok:true,text:async()=>texts[0]});
 await assert.rejects(()=>reproduceSynergyIdentityAudit({manifest:manifest(),fetchImpl:corrupt}),/pinned Git blob/);
 const notFound=async()=>({ok:false,status:404,text:async()=>""});
 await assert.rejects(()=>reproduceSynergyIdentityAudit({manifest:manifest(),fetchImpl:notFound}),/accepted HTTP page/);
});
test("manifest cannot redirect research fetch to another host or another corpus",async()=>{
 const bad=manifest();bad.profiles[0].path="../private/key";
 let fetched=0;
 await assert.rejects(()=>reproduceSynergyIdentityAudit({manifest:bad,fetchImpl:async()=>{fetched++;}}),/path or source revision/);
 assert.equal(fetched,0);
 const wrong=manifest();wrong.profiles.reverse();
 await assert.rejects(()=>reproduceSynergyIdentityAudit({manifest:wrong,fetchImpl:async()=>{fetched++;}}),/exactly the three/);
 assert.equal(fetched,0);
});
