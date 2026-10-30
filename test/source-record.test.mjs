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

test("distinct same-author-year papers can be cited explicitly by their canonical source keys",()=>{
 const record=distinct();
 const body="Separate sources: [@moran2024b] then [@moran2024a].";
 const rows=citedRows(record,body);
 assert.deepEqual(rows.map(x=>x.item.id),["moran2024b","moran2024a"]);
 const refs=noteReferences(record,body);
 assert.deepEqual(Object.keys(refs),["moran2024b","moran2024a"]);
 assert.equal(refs.moran2024a.doi,"10.1234/one");
 assert.equal(refs.moran2024b.doi,"10.1234/two");
 const written=writeNoteReferences(record,note(body));
 assert.deepEqual(checkNote(record,{},written,"note.md"),[]);
});
test("original citation ordering respects both literal label and explicit source-key positions",()=>{
 const record={sources:[row("smith2024","Source A","Smith"),row("moran2024a","Source B","Moran")]};
 const selected=citedRows(record,"First [@moran2024a], and later Smith 2024.");
 assert.deepEqual(selected.map(x=>x.item.id),["moran2024a","smith2024"]);
 const other=citedRows(record,"First Smith 2024, and later [@moran2024a].");
 assert.deepEqual(other.map(x=>x.item.id),["smith2024","moran2024a"]);
});
test("fenced code showing source keys never manufactures a real citation",()=>{
 const record=distinct();
 const body="Code sample follows:\n```markdown\n[@moran2024a]\n```\n[@moran2024b] is the source.";
 assert.deepEqual(citedRows(record,body).map(x=>x.item.id),["moran2024b"]);
});
test("unmatched source citekeys refuse writing references and report a typed note error",()=>{
 const record=distinct(),body="Outside source [@unknown2024].";
 assert.throws(()=>noteReferences(record,body),/unmatched original source citation key: unknown2024/);
 assert.throws(()=>writeNoteReferences(record,note(body)),/unmatched original source citation key/);
 const issues=checkNote(record,{},note(body),"specific.md");
 assert.deepEqual(issues.filter(x=>x.level==="error").map(x=>x.message),[
  'citation "unknown2024" has no original source row'
 ]);
});
test("explicit one-source selection does not resolve a separate ambiguous author-year claim",()=>{
 const record=distinct();
 const body="Moran 2024 said it; compare [@moran2024a].";
 assert.throws(()=>citedRows(record,body),/ambiguous source citation label.*moran2024a, moran2024b/);
});
