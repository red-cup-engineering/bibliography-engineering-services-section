import test from "node:test";
import assert from "node:assert/strict";
import { boundFiniteScreeningRecall as bound } from "../src/reference-screening.mjs";
test("exact 95/100 comparison admits a mathematically sufficient finite-frame count but no operative authority",()=>{
 const r=bound({included:19,excluded:0,unresolved:1});
 assert.deepEqual(r.sharpWorstCaseRecall,{numerator:19,denominator:20,value:0.95});
 assert.equal(r.mathematicallyAtLeastTargetWithinAssumedClosedFrame,true);
 assert.equal(r.operativeStopAuthorized,false);
 assert.equal(bound({included:18,excluded:1,unresolved:1}).mathematicallyAtLeastTargetWithinAssumedClosedFrame,false);
});
test("early topical enrichment cannot certify 95% recall while hundreds remain unknown",()=>{
 // Actual preregistered urinary-incontinence title/abstract result:
 // top ceil(327*.2)=66 screened, 26 included, 40 excluded, 261 unread.
 const r=bound({included:26,excluded:40,unresolved:261});
 assert.equal(r.frameSize,327);
 assert.equal(r.compatibleIncludedTotals.maximum,287);
 assert.ok(Math.abs(r.sharpWorstCaseRecall.value-26/287)<1e-14);
 assert.equal(r.mathematicallyAtLeastTargetWithinAssumedClosedFrame,false);
 assert.equal(r.operativeStopAuthorized,false);
});
test("all-negative closed frame has undefined positive recall, never success",()=>{
 const r=bound({included:0,excluded:10,unresolved:0});
 assert.equal(r.sharpWorstCaseRecall,null);
 assert.equal(r.mathematicallyAtLeastTargetWithinAssumedClosedFrame,false);
 assert.equal(r.operativeStopAuthorized,false);
});
test("exact finite-frame worst-case bound is sharp under ALL completions of up to six unknown judgments",()=>{
 let checked=0;
 for(let p=0;p<=4;p++)for(let n=0;n<=4;n++)for(let u=0;u<=6;u++){
  if(p+n+u===0)continue;
  const r=bound({included:p,excluded:n,unresolved:u});
  for(let mask=0;mask<2**u;mask++){
   let unknownRelevant=0;
   for(let j=0;j<u;j++)unknownRelevant+=(mask>>>j)&1;
   const total=p+unknownRelevant;
   if(total===0){assert.equal(r.mathematicallyAtLeastTargetWithinAssumedClosedFrame,false);continue;}
   const actual=p/total;
   assert.ok(actual+1e-15>=r.sharpWorstCaseRecall.value);
   if(mask===(2**u-1)) assert.ok(Math.abs(actual-r.sharpWorstCaseRecall.value)<1e-15);
   checked++;
  }
  assert.equal(r.mathematicallyAtLeastTargetWithinAssumedClosedFrame,
    p>0&&BigInt(p)*100n>=BigInt(p+u)*95n);
 }
 assert.ok(checked>1000);
});
test("duplicate, negative, unsafe-integer and unbounded ratios refuse rather than forge mathematical authority",()=>{
 for(const a of [
  {included:-1,excluded:1,unresolved:2},
  {included:1,excluded:NaN,unresolved:2},
  {included:1,excluded:0,unresolved:1000001},
  {included:1,excluded:1,unresolved:0,targetNumerator:101,targetDenominator:100},
  {included:1,excluded:1,unresolved:0,targetNumerator:95,targetDenominator:0},
 ])assert.throws(()=>bound(a),/bounded disjoint/);
});
test("unresolved identity conflicts must be counted as unresolved and never as independent supports",()=>{
 const conservative=bound({included:1,excluded:1,unresolved:15});
 assert.ok(conservative.sharpWorstCaseRecall.value<.1);
 assert.equal(conservative.operativeStopAuthorized,false);
});

test("public bibliography command returns conditional proof while withholding native stop authority",async()=>{
 const {spawnSync}=await import("node:child_process");
 const cli=new URL("../apps/bibliography-cli.mjs",import.meta.url);
 const child=spawnSync(process.execPath,[cli.pathname,"recall-bound"],{
  encoding:"utf8",input:JSON.stringify({included:19,excluded:20,unresolved:1})
 });
 assert.equal(child.status,0,child.stderr);
 const value=JSON.parse(child.stdout);
 assert.equal(value.mathematicallyAtLeastTargetWithinAssumedClosedFrame,true);
 assert.equal(value.operativeStopAuthorized,false);
});
