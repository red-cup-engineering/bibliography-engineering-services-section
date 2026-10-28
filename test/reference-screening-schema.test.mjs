import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSchemaInstance } from "@red-cup-engineering/json-schema-services-section/validate-schema-instance";
const schema=JSON.parse(readFileSync(new URL("../schemas/bibliography/source-witnessed-review-request.schema.json",import.meta.url),"utf8"));
const fixture=()=>({protocol:{id:"library-science-2026",stage:"title-abstract",criteria:["wrong-design"]},
 ledger:JSON.parse(readFileSync(new URL("./fixtures/screening-ledger.json",import.meta.url),"utf8"))});
test("original JSON Schema accepts canonical recorded search and review input shape",()=>{
  const r=validateSchemaInstance({schema,instance:fixture()});
  assert.deepEqual(r.errors,[]);
});
test("original JSON Schema refuses undocumented reviewer output and missing source search",()=>{
  const input=fixture();
  input.reviews=[{id:"review-1",recordId:"doi:10.1038/nature14539",reviewerId:"agent-1",
    decision:"include",evidence:{searchId:"search-1",itemId:"W1",field:"title",start:0,end:13,quote:"Deep learning"},
    forgedPublisherStanding:"self-attested"}];
  assert.ok(validateSchemaInstance({schema,instance:input}).errors.length>0);
  const broken=fixture();delete broken.ledger.candidates[0].source;
  assert.ok(validateSchemaInstance({schema,instance:broken}).errors.length>0);
});
test("schema cannot by itself certify an actual excerpt, publisher or reviewer identity",()=>{
  const input=fixture();
  input.reviews=[{id:"review-1",recordId:"doi:10.1038/nature14539",reviewerId:"person-a",
    decision:"include",evidence:{searchId:"search-1",itemId:"W1",field:"title",start:0,end:15,quote:"Fabricated text"}}];
  assert.deepEqual(validateSchemaInstance({schema,instance:input}).errors,[]);
  // The executable assessor must independently refuse this declared-but-false quote.
});
