import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { auditLabeledIdentifierCarrier as audit } from "../src/labeled-benchmark-audit.mjs";
const sha1=source=>{
 const bytes=Buffer.from(source,"utf8");
 return createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
};
const src=[
"doi,openalex_id,label_included,method,pmid",
"https://doi.org/10.1000/a,https://openalex.org/W100,1,manual,",
"https://doi.org/10.1000/a,https://openalex.org/W100,0,search_title,",
"https://doi.org/10.1000/b,https://openalex.org/W200,0,search_title,",
",,1,unknown,",
].join("\n")+"\n";
const provenance=source=>({
 corpus:"Test_2026",path:"datasets/Test_2026/Test_2026_ids.csv",
 sourceCommit:"abcdef0123456789abcdef0123456789abcdef01",
 gitBlobSha1:sha1(source),publishedBenchmarkRecords:2,publishedIncluded:1,
});
test("contradictory labels on one original work are retained without training-time adjudication",()=>{
 const r=audit({rawText:src,provenance:provenance(src)});
 assert.equal(r.raw.rawRows,4);
 assert.equal(r.raw.rawPositiveRows,2);
 assert.equal(r.identity.uniqueOpenAlex,2);
 assert.equal(r.identity.conflictingLabelGroups,1);
 assert.equal(r.identity.absentOpenAlexPositiveRows,1);
 assert.equal(r.identity.conflictingGroups[0].identity,"https://openalex.org/W100");
 assert.equal(r.identity.conflictingGroups[0].positiveRows,1);
 assert.equal(r.identity.conflictingGroups[0].negativeRows,1);
 assert.equal(r.hypotheticalPolicies.excludeWins.includedIdentities,0);
 assert.equal(r.hypotheticalPolicies.includeWins.includedIdentities,1);
 assert.equal(r.authorization.validForTrainingWithoutAdjudication,false);
 assert.equal(r.reportedBenchmark.exactMatchOfUniqueOpenAlexCount,true);
});
test("no contradiction on raw rows gives a structural-only audit, not independently validated labels",()=>{
 const source=[
  "doi,openalex_id,label_included",
  "https://doi.org/10.1000/a,https://openalex.org/W100,1",
  "https://doi.org/10.1000/b,https://openalex.org/W200,0"
 ].join("\n")+"\n";
 const r=audit({rawText:source,provenance:provenance(source)});
 assert.equal(r.identity.conflictingLabelGroups,0);
 assert.equal(r.hypotheticalPolicies.includeWins.includedIdentities,1);
 assert.equal(r.hypotheticalPolicies.excludeWins.includedIdentities,1);
 assert.equal(r.authorization.validForTrainingWithoutAdjudication,false);
 assert.match(r.status,/structural-identity-audit-only/);
});
test("one DOI attached to two OpenAlex IDs is independently reported as possible false join",()=>{
 const source=[
  "doi,openalex_id,label_included",
  "https://doi.org/10.1000/a,https://openalex.org/W100,1",
  "https://doi.org/10.1000/a,https://openalex.org/W200,0"
 ].join("\n")+"\n";
 const r=audit({rawText:source,provenance:provenance(source)});
 assert.equal(r.identity.inconsistentDoiToOpenAlex.length,1);
 assert.equal(r.identity.conflictingLabelGroups,0);
 assert.equal(r.authorization.validForTrainingWithoutAdjudication,false);
});
test("source blob pin enforces exact bytes and explicit original provenance",()=>{
 assert.throws(()=>audit({rawText:src.replace("search_title","manual"),provenance:provenance(src)}),/pinned Git blob/);
 assert.throws(()=>audit({rawText:src,provenance:{...provenance(src),sourceCommit:"main"}}),/exact source/);
 assert.throws(()=>audit({rawText:src,provenance:{...provenance(src),publishedIncluded:99}}),/denominators/);
});
test("unsupported quoting, nonbinary labels and invalid identifiers refuse",()=>{
 const alter=source=>{
  const p=provenance(source);
  return ()=>audit({rawText:source,provenance:p});
 };
 assert.throws(alter(src.replace("1,manual","2,manual")),/nonbinary/);
 assert.throws(alter(src.replace("W100","Wabc")),/invalid OpenAlex/);
 assert.throws(alter(src.replace("unknown","\"unknown\"")),/unquoted/);
 assert.throws(alter(src.slice(0,-1)),/final LF/);
});
test("unresolved source identities do not disappear from a denominator",()=>{
 const r=audit({rawText:src,provenance:provenance(src)});
 assert.equal(r.raw.missingOpenAlex,1);
 assert.equal(r.identity.unlinkedSourceRows.length,1);
 assert.equal(r.raw.rawPositiveRows,2);
 assert.equal(r.identity.includedOnly,0);
});
