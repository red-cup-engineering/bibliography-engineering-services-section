import assert from "node:assert/strict";
import { test } from "node:test";
import { bibliographyRecordToCslItem, projectBibliographyRecordsCsl } from "../src/bibliography-csl.mjs";

const AHMED = { type: "bibliography", key: "ahmed2004", "reference-type": "book", authors: ["Sara Ahmed"], year: 2004, title: "The Cultural Politics of Emotion", publisher: "Edinburgh University Press", body: "# x\n" };
const ARNOLD = { type: "bibliography", key: "arnold1995", "reference-type": "article", authors: ["Arnold, V. I."], year: 1995, title: "Remarks", publication: "Some Journal", doi: "10.1/x", translator: "Jane Doe" };

test("bibliographyRecordToCslItem names the CSL type from reference-type and keeps depth-1 fields", () => {
  const book = bibliographyRecordToCslItem(AHMED);
  assert.equal(book.id, "ahmed2004");
  assert.equal(book.type, "book");
  assert.equal(book.publisher, "Edinburgh University Press");
  assert.deepEqual(book.issued, { "date-parts": [[2004]] });
  const article = bibliographyRecordToCslItem(ARNOLD);
  assert.equal(article.type, "article-journal");
  assert.equal(article["container-title"], "Some Journal");
  assert.equal(article.DOI, "10.1/x");
  assert.deepEqual(article.translator, [{ family: "Doe", given: "Jane" }]);
  assert.equal(bibliographyRecordToCslItem({ ...AHMED, "reference-type": "misc" }).type, "document");
  assert.equal(bibliographyRecordToCslItem({ ...AHMED, "reference-type": "mystery" }).type, "document");
});

test("projectBibliographyRecordsCsl sorts by citekey and refuses duplicates and malformed records", () => {
  assert.deepEqual(projectBibliographyRecordsCsl([AHMED, ARNOLD]).map((item) => item.id), ["ahmed2004", "arnold1995"]);
  assert.deepEqual(projectBibliographyRecordsCsl([ARNOLD, AHMED]).map((item) => item.id), ["ahmed2004", "arnold1995"]);
  assert.throws(() => projectBibliographyRecordsCsl([AHMED, AHMED]), /duplicate citekey ahmed2004/u);
  assert.throws(() => projectBibliographyRecordsCsl([{ ...AHMED, year: "2004" }]), /records\[0\]/u);
  assert.throws(() => projectBibliographyRecordsCsl("x"), TypeError);
});
