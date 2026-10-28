#!/usr/bin/env node
/**
 * Reproduce the preregistered three-task retrospective pilot from immutable
 * original public research data, with no republishing of paper text.
 * This is one bounded acquisition, not a background monitor or a seller.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeCsvRows } from "@red-cup-engineering/csv-services-section/csv-codec";
import { reliableBibliographyFetch } from "../src/reference-check.mjs";
import { assayCohenScreeningEndpoint } from "../src/screening-endpoint-pilot.mjs";
const manifestPath=new URL("../research/source-pins/cohen-2006-text-screening-pilot-preregistration.json",import.meta.url);
export async function reproduceCohenPilot({manifest,fetchImpl=fetch}={}){
 if(!manifest||manifest.type!=="PreRegisteredSourceQualifiedScreeningPilot"||
    !manifest.precommitted||manifest.version!==1||
    manifest.corpusOwner!=="LHofstee/systematic-review-datasets"||
    !/^[0-9a-f]{40}$/u.test(manifest.upstreamCommit??"")||
    !Array.isArray(manifest.tasks)||manifest.tasks.length!==3||
    JSON.stringify(manifest.tasks.map(x=>x.key))!==
    JSON.stringify(["Antihistamines","Estrogens","UrinaryIncontinence"]))
   throw new TypeError("preregistered three-corpus original Cohen pilot manifest required");
 const outcomes=[],seenIds=new Map(),overlaps=[];
 for(const task of manifest.tasks){
   if(task.sourceCommit!==manifest.upstreamCommit||
      task.path!=="datasets/Cohen_2006/output/online/"+task.key+".csv")
     throw new TypeError("unapproved original cohort path or revision");
   const url="https://raw.githubusercontent.com/LHofstee/systematic-review-datasets/"+manifest.upstreamCommit+"/"+task.path;
   const boundedFetch=reliableBibliographyFetch(fetchImpl,{timeoutMs:20000,budgetMs:35000});
   const response=await boundedFetch(url);
   if(!response.ok)throw new TypeError("original source HTTP response not admitted: "+response.status);
   const rawText=await response.text();
   const result=assayCohenScreeningEndpoint({rawText,profile:task,
     randomReplicates:manifest.metric?.randomSeeds});
   // Only identifier membership (not source text or labels) is checked for
   // potential topic overlap; never share a paper across train/test silently.
   const rows=decodeCsvRows(rawText),headers=rows.shift(),idAt=headers.indexOf("pubmedID");
   for(const row of rows){
     const id=row[idAt];
     const prior=seenIds.get(id);
     if(prior)overlaps.push({pubmedID:id,taskA:prior,taskB:task.key});
     else seenIds.set(id,task.key);
   }
   outcomes.push({...result,locator:url,sourceVerifiedAgainstOriginalGit:true});
 }
 return {
   type:"CrossTopicSourceQualifiedTextScreeningPilot",version:1,
   preregistration:"research/source-pins/cohen-2006-text-screening-pilot-preregistration.json",
   sourceCommit:manifest.upstreamCommit,
   comparisons:outcomes,
   overlap:{sharedPubmedRecordsAcrossTasks:overlaps.length,
     // Only first 50 overlap IDs are included; no study abstracts exported.
     examples:overlaps.slice(0,50),identityAssurance:"PubMed IDs, not independently authenticated study-level identity"},
   interpretation:"Retrospective fixed-query BM25 versus seeded random screening, not ASReview model comparison, an authenticated source review or a deployed stopping rule.",
   publicationLimits:"Only derived metrics and source hashes may be published; underlying source license is custom and source text redistribution has not been authorized.",
 };
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
   if(process.argv.length!==2)throw new TypeError("usage: node scripts/reproduce-cohen-screening-pilot.mjs");
   const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
   process.stdout.write(JSON.stringify(await reproduceCohenPilot({manifest}),null,2)+"\n");
 }catch(error){
   console.error("text-screening pilot refused: "+error.message);
   process.exitCode=1;
 }
}
