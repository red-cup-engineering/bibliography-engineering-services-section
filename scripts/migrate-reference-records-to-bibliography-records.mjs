#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { migrateReferenceRecordsToBibliographyRecords } from "../src/bibliography-migration.mjs";

export { migrateReferenceRecordsToBibliographyRecords, migrateReferenceRecordToBibliographyRecord } from "../src/bibliography-migration.mjs";

/**
 * Migrate the `type: reference` carriers directly inside `directory` (not
 * recursive) to `type: bibliography`. A dry run unless `write` is true.
 * `supplementsPath` names a JSON file `{ "<stem>": { authors, year, title, "reference-type", ... } }`;
 * `referenceTypesPath` a JSON file mapping stems to reference types.
 */
export function migrateReferenceDirectory(directory, { write = false, supplementsPath, referenceTypesPath } = {}) {
  const base = resolve(directory);
  const files = readdirSync(base).filter((name) => name.endsWith(".md")).sort().map((filename) => ({ filename, text: readFileSync(join(base, filename), "utf8") }));
  const supplements = supplementsPath === undefined ? {} : JSON.parse(readFileSync(resolve(supplementsPath), "utf8"));
  const referenceTypes = referenceTypesPath === undefined ? {} : JSON.parse(readFileSync(resolve(referenceTypesPath), "utf8"));
  const report = migrateReferenceRecordsToBibliographyRecords({ files, supplements, referenceTypes });
  if (write) for (const entry of report.migrated) writeFileSync(join(base, entry.filename), entry.text);
  return Object.freeze({ directory: base, written: write, report });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args.splice(index, 2)[1]; };
  const supplementsPath = flag("--supplements");
  const referenceTypesPath = flag("--reference-types");
  const write = args.includes("--write");
  const directory = args.find((arg) => !arg.startsWith("--"));
  if (directory === undefined) { process.stderr.write("usage: migrate-reference-records-to-bibliography-records <directory> [--supplements supplements.json] [--reference-types types.json] [--write]\n"); process.exit(2); }
  const { report } = migrateReferenceDirectory(directory, { write, supplementsPath, referenceTypesPath });
  const summary = (entries) => entries.map(({ filename, changes, findings }) => ({ filename, changes, findings }));
  process.stdout.write(`${JSON.stringify({ written: write, counts: { migrated: report.migrated.length, unchanged: report.unchanged.length, refused: report.refused.length }, migrated: summary(report.migrated), unchanged: summary(report.unchanged), refused: summary(report.refused) }, null, 2)}\n`);
  process.exitCode = report.refused.length > 0 ? 1 : 0;
}
