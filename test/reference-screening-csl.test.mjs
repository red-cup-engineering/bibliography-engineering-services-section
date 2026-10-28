import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dedupeKeyForItem, makeCandidateRecord, verifyCslScreeningKeys, assessCslRecordedScreening }
  from "../src/reference-screening-csl.mjs";
const file = () => JSON.parse(readFileSync(new URL("./fixtures/screening-ledger.json",import.meta.url),"utf8"));
test("original CSL identity owner canonicalizes real recorded DOI casing and URL spellings",()=>{
  assert.equal(dedupeKeyForItem({title:"Deep learning",DOI:"https://doi.org/10.1038/NATURE14539"}),
    "doi:10.1038/nature14539");
  assert.equal(dedupeKeyForItem({title:"  Attention  IS all You Need  "}),
    "title:attention is all you need");
  const item = makeCandidateRecord({item:{id:"W4",title:"Deep learning",DOI:"doi:10.1038/NATURE14539"},
    source:"openalex",searchId:"search-1"});
  assert.equal(item.dedupeKey,"doi:10.1038/nature14539");
});
test("original retrieval fixture has valid normalized bibliography identities",()=>{
  const ledger=file();
  assert.strictEqual(verifyCslScreeningKeys(ledger),ledger);
  const result=assessCslRecordedScreening({ledger,protocol:{id:"qualify-metadata",stage:"title-abstract",criteria:["wrong-study-design"]}});
  assert.equal(result.flow.candidateReceipts,6);
  assert.equal(result.flow.confirmedDoiDuplicateReceipts,1);
});
test("forged DOI identity and mislabeled title cannot silently merge separate studies",()=>{
  const x=file(); x.candidates[0].dedupeKey="doi:10.1000/other";
  assert.throws(()=>verifyCslScreeningKeys(x),/identity disagrees/);
  const y=file(); y.candidates[2].dedupeKey="title:some unrelated article";
  assert.throws(()=>assessCslRecordedScreening({ledger:y,protocol:{id:"x",stage:"title-abstract",criteria:["excluded"]}}),/identity disagrees/);
});
test("malformed DOI and missing title are refused, never turned into fake source keys",()=>{
  assert.throws(()=>dedupeKeyForItem({title:"test",DOI:"broken"}),/malformed DOI/);
  assert.throws(()=>dedupeKeyForItem({title:"",DOI:""}),/identifiable title/);
});
