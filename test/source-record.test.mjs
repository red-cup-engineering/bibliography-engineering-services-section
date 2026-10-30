import test from "node:test";
import assert from "node:assert/strict";
import {
  citedRows, noteReferences, uncitedRows, checkNote, writeNoteReferences
} from "../src/source-record.mjs";

// Two original bibliographic works may have equal human-readable author/year
// labels even when their original source keys, titles and DOI claims differ.
const row=(id,title,author="Moran",year=2024,doi)=>({
  item:{id,type:"article-journal",title,author:[{given:"A",family:author}],
    issued:{"date-parts":[[year]]},
    ...(doi?{DOI:doi}:{})}
});
const distinct=()=>({sources:[
  row("moran2024a","First experimental method","Moran",2024,"10.1234/one"),
  row("moran2024b","Different experimental method","Moran",2024,"10.1234/two"),
  row("smith2024","Independent control article","Smith",2024,"10.1234/control"),
]});
const note=body=>"---\nreferences: {}\n---\n"+body+"\n";

test("a single author-year mention cannot silently cite two distinct original works",()=>{
 const record=distinct();
 assert.throws(()=>citedRows(record,"Moran 2024 finds something"),/ambiguous source citation label.*moran2024a, moran2024b/);
 assert.throws(()=>noteReferences(record,"Moran 2024 finds something"),/ambiguous source citation label/);
});
test("original note authoring refuses to manufacture several references from one source mention",()=>{
 const record=distinct();
 assert.throws(()=>writeNoteReferences(record,note("Moran 2024 argues for a model")),
   /ambiguous source citation label.*moran2024a, moran2024b/);
});
test("note checking reports an explicitly unresolved citation source rather than choosing arbitrarily",()=>{
 const findings=checkNote(distinct(),{},note("Moran 2024 and Smith 2024 are discussed"),"note.md");
 assert.ok(findings.some(x=>x.level==="error"&&x.where==="note.md"&&x.message.includes("moran2024a")&&x.message.includes("moran2024b")));
});
test("uncited source audit cannot treat one ambiguous mention as two independently cited works",()=>{
 assert.throws(()=>uncitedRows(distinct(),[note("Moran 2024 is the source")]),
   /ambiguous source citation label/);
});
test("independent unambiguous citations still resolve one original record",()=>{
 const record=distinct();
 const found=citedRows(record,"Smith 2024 studied an unrelated question.");
 assert.deepEqual(found.map(x=>x.item.id),["smith2024"]);
 assert.equal(citedRows(record,"There are no source citations.").length,0);
});
test("a duplicate display label is not an error if no such label occurs in the actual note",()=>{
 const record=distinct();
 const result=uncitedRows(record,[note("Smith 2024 found a control")]);
 assert.deepEqual(result.map(x=>x.message.includes("Moran 2024")), [true,true]);
});
test("source-identity collision diagnostics are order-independent",()=>{
 const record=distinct(),reverse={sources:[...record.sources].reverse()};
 const errors=[record,reverse].map(x=>{
  const findings=checkNote(x,{},note("Moran 2024 made an ambiguous claim"),"note.md");
  return findings.filter(f=>f.level==="error").map(f=>f.message);
 });
 assert.deepEqual(errors[0],errors[1]);
});
