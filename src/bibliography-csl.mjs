import { nameFromString, toCslType } from "@red-cup-engineering/csl-json-services-section";
import { toCslItem } from "@red-cup-engineering/csl-json-services-section/record-formatting";
import { admitReferenceEntry, REFERENCE_ENTRY_SCHEMA } from "../schemas/bibliography/reference-entry.schema.mjs";
import { admitBibliographyRecord } from "../schemas/bibliography/bibliography.schema.mjs";

/** BibTeX-like `reference-type` words to CSL 1.0.2 item types; an unlisted word that is not itself a CSL type becomes `document`. */
export const REFERENCE_TYPE_TO_CSL = Object.freeze({
  article: "article-journal",
  book: "book",
  booklet: "pamphlet",
  inbook: "chapter",
  incollection: "chapter",
  inproceedings: "paper-conference",
  conference: "paper-conference",
  manual: "report",
  mastersthesis: "thesis",
  phdthesis: "thesis",
  misc: "document",
  proceedings: "book",
  techreport: "report",
  unpublished: "manuscript",
});

/**
 * Project one depth-2 bibliography carrier record to a CSL-JSON item. The
 * depth-1 fields go through csl-json's own `toCslItem` under this engine's
 * `admitReferenceEntry`; the carrier's `reference-type` then names the CSL
 * item type (the depth-1 inference from publication/publisher only applies
 * when no reference type is known) and `translator` becomes a CSL name list.
 *
 * @param {object} record - an admissible bibliography record (`body` optional: a projection never reads the argument).
 * @returns {object} the frozen CSL-JSON item, `id` = the record's citekey.
 * @throws {TypeError|RangeError} when the record does not admit.
 */
export function bibliographyRecordToCslItem(record) {
  const admitted = admitBibliographyRecord({ body: "projection", ...record });
  const entry = {};
  for (const key of Object.keys(REFERENCE_ENTRY_SCHEMA.properties)) if (admitted[key] !== undefined) entry[key] = admitted[key];
  const item = { ...toCslItem(admitted.key, entry, { admitReferenceEntry }) };
  item.type = toCslType(admitted["reference-type"].trim().toLowerCase(), REFERENCE_TYPE_TO_CSL);
  if (admitted.translator !== undefined) item.translator = [nameFromString(admitted.translator)];
  return Object.freeze(item);
}

/**
 * Project bibliography carrier records to CSL-JSON items, sorted by citekey.
 *
 * @param {ReadonlyArray<object>} records - bibliography records.
 * @returns {ReadonlyArray<object>} the frozen items, ascending by `id`.
 * @throws {TypeError} when `records` is not an array, a record does not admit, or two records share a key.
 */
export function projectBibliographyRecordsCsl(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array of bibliography records");
  const seen = new Set();
  const items = records.map((record, index) => {
    let item;
    try { item = bibliographyRecordToCslItem(record); } catch (error) { throw new TypeError(`records[${index}]: ${error.message}`); }
    if (seen.has(item.id)) throw new TypeError(`records[${index}]: duplicate citekey ${item.id}`);
    seen.add(item.id);
    return item;
  });
  return Object.freeze(items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
