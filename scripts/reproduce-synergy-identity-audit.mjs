#!/usr/bin/env node
/**
 * Reproduce an external, independently published **raw-ID** source audit.
 * No original copyrighted papers or large input datasets are republished.
 * Reads a checked-in 3-source pin manifest; GET only hardcoded GitHub raw
 * host and immutable upstream commit. Records SHA-256 and Git blob hashes.
 * Never emits model training labels or asserts final SYNERGY study eligibility.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { auditLabeledIdentifierCarrier } from "../src/labeled-benchmark-audit.mjs";
import { reliableBibliographyFetch } from "../src/reference-check.mjs";
const defaultManifest=new URL("../research/source-pins/synergy-2026-benchmark-identity-profiles.json",import.meta.url);
const defaultPath=fileURLToPath(defaultManifest);
export async function reproduceSynergyIdentityAudit({manifest,fetchImpl=fetch}={}){
  if(!manifest || manifest.type!=="ExternalLabeledBibliographyIdentityAuditManifest" ||
      !Array.isArray(manifest.profiles) || manifest.profiles.length!==3 ||
      !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit||"") ||
      manifest.sourceOwner!=="asreview/synergy-dataset")
    throw new TypeError("source-qualified three-discipline SYNERGY manifest required");
  const names=["Sep_2021","Donners_2021","Smid_2020"];
  if(JSON.stringify(manifest.profiles.map(p=>p.corpus))!==JSON.stringify(names))
    throw new TypeError("this reproduction measures exactly the three prior selected disciplines");
  const studies=[];
  for(const profile of manifest.profiles){
    if(profile.sourceCommit!==manifest.sourceCommit ||
        profile.path!=="datasets/"+profile.corpus+"/"+profile.corpus+"_ids.csv")
      throw new TypeError("path or source revision crossed the manifest boundary");
    const uri="https://raw.githubusercontent.com/asreview/synergy-dataset/"+manifest.sourceCommit+"/"+profile.path;
    const limitedFetch=reliableBibliographyFetch(fetchImpl,{timeoutMs:20000,budgetMs:45000});
    const r=await limitedFetch(uri);
    if(!r.ok)throw new TypeError("original SYNERGY public source did not return an accepted HTTP page: "+r.status);
    const rawText=await r.text();
    const audit=auditLabeledIdentifierCarrier({rawText,provenance:profile});
    studies.push({...audit,sourceUrl:uri,declaredDiscipline:profile.discipline,
      rightsQualification:"Original corpus-level license and source-article rights must be checked independently before redistributing source bytes."});
  }
  const totals={
    rawRows:studies.reduce((s,r)=>s+r.raw.rawRows,0),
    openAlexIdentities:studies.reduce((s,r)=>s+r.identity.uniqueOpenAlex,0),
    conflictingIdentityGroups:studies.reduce((s,r)=>s+r.identity.conflictingLabelGroups,0),
    excludedByUnmatchedOpenAlex:studies.reduce((s,r)=>s+r.raw.missingOpenAlex,0),
    conflictMethodContrast:Object.fromEntries([
      "sameNamedMethodGroups","differentNamedMethodGroups","bothKindsGroups",
      "sameNamedOnlyGroups","differentNamedOnlyGroups","methodUnattributedGroups",
    ].map(key=>[key,studies.reduce((sum,study)=>
      sum+study.identity.conflictMethodContrast[key],0)])),
  };
  return {
    type:"CrossDisciplinaryLabeledBenchmarkSourceAudit",version:1,
    researchQuestion:"Can unreviewed original identifier-table rows be used as reliable, unique, binary systematic-review labels?",
    sourceOwner:manifest.sourceOwner,sourceCommit:manifest.sourceCommit,
    studies,totals,
    inference:"A raw source label conflict is a disagreement among source rows of the same indexed identity, not evidence that the final review has contradictory adjudicated conclusions.",
    status:"computational-source-quality-result-not-admitted-ground-truth-screening-benchmark",
    releaseStatus:"reproducible software and aggregate study permitted; paper text and original third-party raw datasets not republished",
    scientificLimitations:[
      "No independent human adjudication of raw conflicting labels.",
      "The published unique-record counts coincide with retained OpenAlex identities, but this equality does not prove the upstream construction pipeline.",
      "Missing identifiers and duplicated source records may be created by dataset linkage/selection rather than source publication history.",
      "Labels are upstream review decisions, not observations of experimental truth.",
      "No access to sufficiently complete source text in these identifier-only CSV files; active-learning screening recall cannot be measured from them."
    ],
  };
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length>3){console.error("usage: node scripts/reproduce-synergy-identity-audit.mjs [manifest-json]");process.exitCode=2}
  else try{
    const path=process.argv[2]||defaultPath;
    const manifest=JSON.parse(readFileSync(path,"utf8"));
    process.stdout.write(JSON.stringify(await reproduceSynergyIdentityAudit({manifest}),null,2)+"\n");
  }catch(error){console.error("SYNERGY source audit refused: "+error.message);process.exitCode=1}
}
