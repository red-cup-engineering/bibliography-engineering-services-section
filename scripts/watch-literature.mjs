#!/usr/bin/env node
/**
 * One explicit public-metadata literature read. This is NOT a scheduler.
 * Input: {spec, ledger, now} from stdin. Output: {result,ledger} in JSON.
 * No files are written; the receiving scientist/office owns durable custody.
 */
import { readFileSync } from "node:fs";
import { runWatch } from "../src/reference-watch.mjs";
if (process.argv.length !== 2) {
  console.error("usage: node scripts/watch-literature.mjs < watch-request.json");
  process.exitCode=2;
} else {
  try {
    const request=JSON.parse(readFileSync(0,"utf8"));
    if (!request || typeof request !== "object" ||
        !("spec" in request) || !("ledger" in request) || !("now" in request)) {
      throw new TypeError("explicit spec, ledger and fixed run timestamp are required");
    }
    const result=await runWatch(request.spec,{
      ledger:request.ledger,now:request.now,email:request.email,mailto:request.mailto,
      delayBetweenQueriesMs:1200,previousScreening:request.previousScreening,
    });
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if (result.disposition!=="recorded-pages-received" ||
      result.screeningContinuity?.reassessmentRecordIds.length ||
      result.screeningContinuity?.newRecordCandidates.length ||
      result.screeningContinuity?.heldUnqualifiedSourceRevisions.length ||
      result.screeningContinuity?.sourceQueryRefusals.length)
      process.exitCode=1;
  } catch (error) {
    console.error("literature watch refused: "+error.message);
    process.exitCode=2;
  }
}
