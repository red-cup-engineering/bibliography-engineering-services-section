import { extname } from "node:path";
import { CITEKEY, readBibliographyMarkdown, recognizeBibliographyMarkdown, renderBibliographyMarkdown } from "./bibliography-carrier.mjs";

/**
 * One-time migration of the legacy `type: reference` carriers (a science
 * section's `key, authors, year, title, venue` + annotation shape) to the
 * `type: bibliography` carrier contract. There is no compatibility reading
 * of the legacy shape anywhere else: run this once, commit the result, and
 * the legacy shape is gone. Nothing is guessed: a record that cannot be
 * migrated from its own explicit fields (or from the caller's explicit
 * `supplements`) is refused with findings and left untouched.
 */

/** Legacy `class` words that name a BibTeX-like reference type. */
export const CLASS_TO_REFERENCE_TYPE = Object.freeze({ monograph: "book" });

/** Reference types whose legacy `venue` is a publisher, not a periodical or conference. */
export const PUBLISHER_VENUE_TYPES = Object.freeze(["book", "booklet", "manual", "mastersthesis", "phdthesis", "techreport"]);

const DEFAULT_REFERENCE_TYPE = "misc";
const SUPPLEMENT_FIELDS = Object.freeze(["authors", "year", "title", "reference-type", "publication", "publisher"]);
const finding = (rule, message) => Object.freeze({ rule, message });
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim() !== "";

function stemOf(filename) {
  if (!nonempty(filename) || filename.includes("/") || extname(filename).toLowerCase() !== ".md" || filename === ".md") throw new TypeError("filename must be one safe Markdown basename");
  return filename.slice(0, -3);
}

function authorsOf(value) {
  if (typeof value === "string") return value.split(";").map((name) => name.trim()).filter(Boolean);
  if (Array.isArray(value) && value.every((name) => typeof name === "string")) return value.map((name) => name.trim()).filter(Boolean);
  return [];
}

function yearOf(value) {
  if (Number.isInteger(value) && value >= 1) return { year: value };
  if (typeof value === "string") {
    const single = /^\s*(\d{4})\s*$/u.exec(value);
    if (single) return { year: Number(single[1]) };
    const range = /^\s*(\d{4})\s*[-–—]\s*(\d{2,4})\s*$/u.exec(value);
    if (range) return { year: Number(range[1]), range: value.trim() };
  }
  return null;
}

/**
 * Migrate one legacy reference carrier.
 *
 * @param {{filename: string, text: string}} file - the carrier's Markdown basename and source.
 * @param {{supplement?: object, referenceType?: string}} [options] - explicit human-supplied values: `supplement` may set authors, year, title, reference-type, publication, publisher; `referenceType` sets only the type.
 * @returns {{disposition: "migrated"|"unchanged"|"refused", filename: string, text?: string, changes: string[], findings: object[]}} frozen result.
 */
export function migrateReferenceRecordToBibliographyRecord({ filename, text } = {}, { supplement = {}, referenceType } = {}) {
  const stem = stemOf(filename);
  const result = (disposition, extra) => Object.freeze({ disposition, filename, changes: Object.freeze(extra.changes ?? []), findings: Object.freeze(extra.findings ?? []), ...(extra.text === undefined ? {} : { text: extra.text }) });
  let parsed;
  try { parsed = readBibliographyMarkdown(text); } catch (error) { return result("refused", { findings: [finding("markdown", error.message)] }); }
  const meta = parsed.frontmatter ?? {};
  if (meta.type === "bibliography") return result("unchanged", { findings: [finding("already-bibliography", "type is already bibliography")] });
  if (meta.type !== "reference") return result("unchanged", { findings: [finding("not-a-reference-record", `type is ${JSON.stringify(meta.type ?? null)}, not reference`)] });
  if (!isRecord(supplement) || Object.keys(supplement).some((key) => !SUPPLEMENT_FIELDS.includes(key))) throw new TypeError(`supplement may set only ${SUPPLEMENT_FIELDS.join(", ")}`);

  const findings = [];
  const changes = ["type: reference -> bibliography"];
  if (!CITEKEY.test(stem)) findings.push(finding("stem-not-citekey", `filename stem ${stem} is not a citekey (surnameYYYY); rename the file first`));
  if (meta.key === undefined) changes.push(`key: absent -> ${stem} (filename stem)`);
  else if (meta.key !== stem) changes.push(`key: ${JSON.stringify(meta.key)} -> ${stem} (the key must equal the filename stem)`);

  const authors = supplement.authors !== undefined ? supplement.authors.map((name) => String(name).trim()).filter(Boolean) : authorsOf(meta.authors);
  if (authors.length === 0) findings.push(finding("authors", "no authors in the record; supply them in the supplement"));
  else if (supplement.authors !== undefined) changes.push("authors: from supplement");
  else if (typeof meta.authors === "string") changes.push(`authors: string -> list of ${authors.length}`);

  const read = supplement.year !== undefined ? yearOf(supplement.year) : yearOf(meta.year);
  if (read === null) findings.push(finding("year", `year ${JSON.stringify(meta.year ?? null)} is absent or not a year; supply it in the supplement`));
  else if (supplement.year !== undefined) changes.push("year: from supplement");
  else if (typeof meta.year === "string") changes.push(`year: ${JSON.stringify(meta.year)} -> ${read.year}`);

  const title = supplement.title ?? meta.title;
  if (!nonempty(title)) findings.push(finding("title", "title is absent"));
  else if (supplement.title !== undefined) changes.push("title: from supplement");

  const classType = CLASS_TO_REFERENCE_TYPE[meta.class];
  const type = supplement["reference-type"] ?? referenceType ?? meta["reference-type"] ?? classType ?? DEFAULT_REFERENCE_TYPE;
  if (!nonempty(type)) findings.push(finding("reference-type", "reference-type must be nonempty"));
  else if (supplement["reference-type"] === undefined && referenceType === undefined && meta["reference-type"] === undefined) {
    changes.push(classType === undefined ? `reference-type: absent -> ${DEFAULT_REFERENCE_TYPE} (defaulted; review)` : `reference-type: class ${meta.class} -> ${classType}`);
  }
  if (!nonempty(parsed.body)) findings.push(finding("body", "the annotation body is empty"));
  if (findings.length > 0) return result("refused", { changes, findings });

  const { venue, key: _key, authors: _authors, year: _year, title: _title, "reference-type": _type, ...rest } = meta;
  const record = { ...rest, type: "bibliography", key: stem, "reference-type": type.trim(), authors, year: read.year, title, body: parsed.body };
  if (read.range !== undefined) { record["year-range"] = read.range; changes.push(`year-range: ${JSON.stringify(read.range)} kept (year is its first year)`); }
  for (const field of ["publication", "publisher"]) if (supplement[field] !== undefined) { record[field] = supplement[field]; changes.push(`${field}: from supplement`); }
  if (venue !== undefined) {
    const target = PUBLISHER_VENUE_TYPES.includes(type.trim().toLowerCase()) ? "publisher" : "publication";
    if (record[target] === undefined && nonempty(venue)) { record[target] = venue.trim(); changes.push(`venue -> ${target}`); }
    else { record.venue = venue; changes.push(`venue kept as venue (${target} already set or venue is empty)`); }
  }
  let rendered;
  try { rendered = renderBibliographyMarkdown(record); } catch (error) { return result("refused", { changes, findings: [finding("render", error.message)] }); }
  const recognized = recognizeBibliographyMarkdown({ text: rendered, filename });
  if (!recognized.admitted) return result("refused", { changes, findings: recognized.findings });
  return result("migrated", { changes, text: rendered });
}

/**
 * Migrate a set of legacy reference carriers; pure (no filesystem).
 *
 * @param {{files: Array<{filename: string, text: string}>, supplements?: Record<string, object>, referenceTypes?: Record<string, string>}} request
 *   `supplements` and `referenceTypes` are keyed by filename stem.
 * @returns {{migrated: object[], unchanged: object[], refused: object[]}} frozen, each in filename order.
 */
export function migrateReferenceRecordsToBibliographyRecords({ files, supplements = {}, referenceTypes = {} } = {}) {
  if (!Array.isArray(files)) throw new TypeError("files must be an array of {filename, text}");
  const sorted = [...files].sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));
  const results = sorted.map((file) => {
    const stem = stemOf(file.filename);
    return migrateReferenceRecordToBibliographyRecord(file, { supplement: supplements[stem], referenceType: referenceTypes[stem] });
  });
  const unknown = [...Object.keys(supplements), ...Object.keys(referenceTypes)].filter((stem) => !sorted.some((file) => stemOf(file.filename) === stem));
  if (unknown.length > 0) throw new TypeError(`supplements name no file: ${[...new Set(unknown)].sort().join(", ")}`);
  const by = (disposition) => Object.freeze(results.filter((entry) => entry.disposition === disposition));
  return Object.freeze({ migrated: by("migrated"), unchanged: by("unchanged"), refused: by("refused") });
}
