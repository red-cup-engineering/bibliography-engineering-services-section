import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { recognizeBibliographyMarkdown, readBibliographyMarkdown } from "../src/bibliography-carrier.mjs";
import { migrateReferenceRecordsToBibliographyRecords } from "../src/bibliography-migration.mjs";
import { migrateReferenceDirectory } from "../scripts/migrate-reference-records-to-bibliography-records.mjs";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "legacy-reference-records");
const read = (name) => ({ filename: name, text: readFileSync(join(FIXTURES, name), "utf8") });
const SUPPLEMENTS = { coulthard2014: { authors: ["Coulthard, Glen Sean"], year: 2014, title: "Red Skin, White Masks", publisher: "University of Minnesota Press" } };

let directory;
before(() => { directory = mkdtempSync(join(tmpdir(), "bibliography-migration-")); cpSync(FIXTURES, directory, { recursive: true }); });
after(() => { rmSync(directory, { recursive: true, force: true }); });

test("five real legacy carriers: four migrate and one is refused without a supplement", () => {
  const report = migrateReferenceRecordsToBibliographyRecords({ files: readdirSync(FIXTURES).map(read) });
  assert.deepEqual(report.migrated.map((entry) => entry.filename), ["abs2024.md", "ahmed2004.md", "cooper2017.md", "weber1904.md"]);
  assert.deepEqual(report.refused.map((entry) => entry.filename), ["coulthard2014.md"]);
  assert.deepEqual(report.refused[0].findings.map((entry) => entry.rule), ["authors", "year"]);
  for (const entry of report.migrated) {
    const recognized = recognizeBibliographyMarkdown({ text: entry.text, filename: entry.filename });
    assert.equal(recognized.admitted, true, `${entry.filename}: ${JSON.stringify(recognized.findings)}`);
  }
});

test("the migration is explicit about each repair and keeps the annotation body and extra fields", () => {
  const byName = Object.fromEntries(migrateReferenceRecordsToBibliographyRecords({ files: readdirSync(FIXTURES).map(read) }).migrated.map((entry) => [entry.filename, entry]));
  const cooper = readBibliographyMarkdown(byName["cooper2017.md"].text);
  assert.equal(cooper.frontmatter.key, "cooper2017");
  assert.deepEqual(cooper.frontmatter.authors, ["Melinda Cooper"]);
  assert.equal(cooper.frontmatter.status, "source-qualified-annotation");
  assert.equal(cooper.frontmatter.publication, "Zone Books / Near Futures series, 2017");
  assert.equal(cooper.frontmatter.venue, undefined);
  assert.ok(byName["cooper2017.md"].changes.some((change) => change.startsWith("key:")));
  const weber = readBibliographyMarkdown(byName["weber1904.md"].text);
  assert.equal(weber.frontmatter.year, 1904);
  assert.equal(weber.frontmatter["year-range"], "1904-1905");
  const original = readBibliographyMarkdown(read("cooper2017.md").text);
  assert.equal(cooper.body.trim(), original.body.trim());
  assert.ok(byName["ahmed2004.md"].changes.some((change) => change.includes("defaulted")));
});

test("a supplement and an explicit reference type complete a refused record; nothing is guessed otherwise", () => {
  const report = migrateReferenceRecordsToBibliographyRecords({ files: [read("coulthard2014.md"), read("ahmed2004.md")], supplements: SUPPLEMENTS, referenceTypes: { ahmed2004: "book" } });
  assert.equal(report.refused.length, 0);
  const coulthard = readBibliographyMarkdown(report.migrated[1].text).frontmatter;
  assert.equal(coulthard["reference-type"], "book");
  assert.equal(coulthard.publisher, "University of Minnesota Press");
  const ahmed = readBibliographyMarkdown(report.migrated[0].text).frontmatter;
  assert.equal(ahmed["reference-type"], "book");
  assert.equal(ahmed.publisher, "Edinburgh University Press");
  assert.equal(ahmed.publication, undefined);
});

test("a supplement naming no file, a non-citekey stem, and non-reference records are handled without damage", () => {
  assert.throws(() => migrateReferenceRecordsToBibliographyRecords({ files: [read("ahmed2004.md")], supplements: { nobody2000: {} } }), /name no file/u);
  const text = read("ahmed2004.md").text;
  const refused = migrateReferenceRecordsToBibliographyRecords({ files: [{ filename: "no-year.md", text }] });
  assert.deepEqual(refused.refused[0].findings.map((entry) => entry.rule), ["stem-not-citekey"]);
  const note = migrateReferenceRecordsToBibliographyRecords({ files: [{ filename: "n2000.md", text: "---\ntype: note\n---\n\nx\n" }, { filename: "b2000.md", text: "---\ntype: bibliography\n---\n\nx\n" }] });
  assert.deepEqual(note.unchanged.map((entry) => entry.findings[0].rule), ["already-bibliography", "not-a-reference-record"]);
});

test("the directory face is a dry run unless --write, is idempotent, and rewrites only migrated files", () => {
  const dry = migrateReferenceDirectory(directory, { supplementsPath: undefined });
  assert.equal(dry.written, false);
  assert.match(readFileSync(join(directory, "ahmed2004.md"), "utf8"), /type: reference/u);
  const written = migrateReferenceDirectory(directory, { write: true });
  assert.equal(written.report.migrated.length, 4);
  assert.match(readFileSync(join(directory, "ahmed2004.md"), "utf8"), /type: bibliography/u);
  assert.match(readFileSync(join(directory, "coulthard2014.md"), "utf8"), /type: reference/u);
  const again = migrateReferenceDirectory(directory);
  assert.equal(again.report.migrated.length, 0);
  assert.equal(again.report.unchanged.length, 4);
});
