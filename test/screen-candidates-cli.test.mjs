import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const executable = new URL("../scripts/screen-candidates.mjs",import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("./fixtures/screening-ledger.json",import.meta.url),"utf8"));
const request = JSON.stringify({ledger:fixture,protocol:{
  id:"cli-execution-2026",stage:"title-abstract",criteria:["wrong-study-design"],
}});
test("public pure-Node screening CLI reads real recorded ledger, reports every unresolved record",()=>{
  const p=spawnSync(process.execPath,[executable.pathname],{encoding:"utf8",input:request});
  assert.equal(p.status,0,p.stderr);
  const report=JSON.parse(p.stdout);
  assert.equal(report.type,"SourceWitnessedReviewAssay");
  assert.equal(report.flow.screeningRecords,5);
  assert.equal(report.flow.pending,5);
  assert.equal(report.releaseQualification.sourceCountReconciled,false);
});
test("strict CLI returns one for unresolved outcomes without deleting source records",()=>{
  const p=spawnSync(process.execPath,[executable.pathname,"--require-resolved"],{encoding:"utf8",input:request});
  assert.equal(p.status,1,p.stderr);
  const report=JSON.parse(p.stdout);
  assert.equal(report.flow.reportedHits,6);
  assert.equal(report.records.length,5);
});
test("strict CLI rejects malformed evidence as refusal, not a false screening success",()=>{
  const bad=spawnSync(process.execPath,[executable.pathname],{encoding:"utf8",input:"{"});
  assert.equal(bad.status,2);
  assert.match(bad.stderr,/screening refusal/);
});
