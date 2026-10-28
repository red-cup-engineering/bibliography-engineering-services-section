/**
 * Original CSL-JSON source-identity owner is the only normalizer. The pure
 * screening reducer consumes those canonical keys without cloning CSL logic.
 */
import { bareDoi, normalizeTitle } from "@red-cup-engineering/csl-json-services-section";
import { assessRecordedScreening } from "./reference-screening.mjs";

export function dedupeKeyForItem(item) {
  if (!item || typeof item !== "object") throw new TypeError("CSL work metadata is required");
  const doi = bareDoi(item.DOI);
  if (typeof doi === "string" && doi.trim() !== "") {
    const key = doi.toLowerCase();
    if (!/^10\.[0-9]{4,9}\/\S+$/u.test(key)) throw new TypeError("CSL item has malformed DOI");
    return "doi:" + key;
  }
  const title = normalizeTitle(item.title);
  if (!title) throw new TypeError("CSL work without DOI must have an identifiable title");
  return "title:" + title;
}
export function makeCandidateRecord({ item, source, searchId } = {}) {
  if (typeof source !== "string" || !source.trim() || typeof searchId !== "string" || !searchId.trim()) {
    throw new TypeError("candidate requires recorded retrieval source and search id");
  }
  if (!item || typeof item.id !== "string" || !item.id.trim()) throw new TypeError("CSL item requires id");
  return Object.freeze({item,source,searchId,dedupeKey:dedupeKeyForItem(item)});
}
/** Reject forged alias keys: source metadata is still not independently authenticated. */
export function verifyCslScreeningKeys(ledger) {
  if (!ledger || !Array.isArray(ledger.candidates)) throw new TypeError("screening candidates required");
  for (const c of ledger.candidates) {
    if (c.dedupeKey !== dedupeKeyForItem(c.item)) {
      throw new TypeError("candidate identity disagrees with original CSL-JSON normalization: " + String(c.item?.id));
    }
  }
  return ledger;
}
/** Native, published package: independently derives CSL identity before screening. */
export function assessCslRecordedScreening(request) {
  return assessRecordedScreening({...request,ledger:verifyCslScreeningKeys(request?.ledger)});
}
