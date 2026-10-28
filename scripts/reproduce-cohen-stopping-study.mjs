#!/usr/bin/env node
/** Independent-supplier, source-locked bounded study of stop heuristics.
 * The original bibliography Cohen source fetcher remains the only network
 * code; the result contains aggregate statistics, never paper abstracts.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { fetchPinnedCohenTask } from "./reproduce-cohen-screening-pilot.mjs";
import { assayCohenHeuristicStopping } from "../src/screening-stopping-assay.mjs";

const sourceProtocol=new URL("../research/source-pins/cohen-2006-text-screening-pilot-preregistration.json",import.meta.url);
const stopProtocol=new URL("../research/source-pins/cohen-2006-prospective-stopping-preregistration.json",import.meta.url);
function gitBlob(text) {
  const buffer=Buffer.from(text,"utf8");
  return createHash("sha1").update(Buffer.from("blob "+buffer.length+"\0")).update(buffer).digest("hex");
}
export async function reproduceCohenStoppingStudy(
 {protocol,originalProtocolText,fetchImpl=fetch}={}
) {
  if(!protocol || protocol.type!=="PreregisteredFiniteScreeningStopHeuristicAssay" ||
     !/^[a-f0-9]{40}$/u.test(protocol.originalSourceCommit??"")||
     typeof originalProtocolText!=="string"||
     gitBlob(originalProtocolText)!==protocol.existingBibliographyProtocolBlobSha1)
    throw new TypeError("original frozen Cohen ranking protocol is not source admitted");
  let original;
  try{original=JSON.parse(originalProtocolText)}catch {throw new TypeError("original study manifest malformed")}
  if(original.type!=="PreRegisteredSourceQualifiedScreeningPilot"||
    !original.precommitted||
    original.upstreamCommit!==protocol.originalSourceCommit||
    JSON.stringify(original.tasks.map(t=>[t.key,t.sourceCommit,t.path,t.gitBlobSha1,t.reportedRows,t.reportedFinalIncluded,t.query]))!==
    JSON.stringify(protocol.tasks.map(t=>[t.key,t.sourceCommit,t.path,t.gitBlobSha1,t.reportedRows,t.reportedFinalIncluded,t.query])))
    throw new TypeError("stopping study mismatches the original preregistered ranking inputs");
  const comparisons=[];
  for(const task of protocol.tasks) {
    const {rawText,locator}=await fetchPinnedCohenTask({
      task,sourceCommit:protocol.originalSourceCommit,fetchImpl
    });
    const result=assayCohenHeuristicStopping({rawText,profile:task,protocol});
    comparisons.push({...result,originalPublicSource:locator});
  }
  const eligibleResults=comparisons.flatMap(s=>
    Object.entries(s.comparators).flatMap(([endpoint,e])=>
      Object.entries(e.policies).map(([policyId,p])=>({
        corpus:s.corpus,endpoint,policyId,
        proposed:p.bm25.stopProposal,
        missedTarget:p.bm25.retrospectiveEvaluation.missed95PercentGoal
      }))
    ));
  return {
    type:"SourceVerifiedCohenSequentialStoppingStudy",version:1,
    originalSourceCommit:protocol.originalSourceCommit,
    originalFrozenProtocolBlob:protocol.existingBibliographyProtocolBlobSha1,
    stoppingPreRegistration:"research/source-pins/cohen-2006-prospective-stopping-preregistration.json",
    sourceDomain:"Three drug-review topics, one common Cohen systematic-review source family",
    comparisons,
    aggregate:{
      tests:eligibleResults.length,
      earlyStopProposals:eligibleResults.filter(r=>r.proposed).length,
      prematureProposalOutcomes:eligibleResults.filter(r=>r.proposed&&r.missedTarget).length,
      byPolicy:protocol.experiment.policies.map(({id})=>{
        const v=eligibleResults.filter(r=>r.policyId===id);
        return {id,tests:v.length,proposed:v.filter(x=>x.proposed).length,
          below95AtProposal:v.filter(x=>x.proposed&&x.missedTarget).length};
      })
    },
    scientificStatus:"retrospective observation of sequential heuristic under fixed label-blind source ranking; not a prospective verified human stop or comparative ASReview algorithm experiment",
    deploymentAuthorized:false,
    rights:"The source fork reports custom open source-data licenses. No text-bearing article bodies are republished or commercially licensed here.",
  };
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try{
    if(process.argv.length!==2)throw new TypeError("usage: node scripts/reproduce-cohen-stopping-study.mjs");
    const protocol=JSON.parse(readFileSync(stopProtocol,"utf8"));
    const originalProtocolText=readFileSync(sourceProtocol,"utf8");
    process.stdout.write(JSON.stringify(await reproduceCohenStoppingStudy({protocol,originalProtocolText}),null,2)+"\n");
  }catch(error){
    console.error("research stopping study refused: "+error.message);
    process.exitCode=1;
  }
}
