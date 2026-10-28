#!/usr/bin/env node
/**
 * No side effects: stdin receives {ledger,protocol,reviews,adjudications}.
 * Exit 0 for admitted review report, 1 in --require-resolved mode if any
 * records remain pending/conflicted/identity-conflicted, 2 on malformed input.
 * stdout is JSON; no overwrites, network, or private/source-body exfiltration.
 */
import { readFileSync } from "node:fs";
import { assessRecordedScreening } from "../src/reference-screening.mjs";
const args = process.argv.slice(2);
if (args.some(x => !["--require-resolved"].includes(x))) {
  console.error("usage: node scripts/screen-candidates.mjs [--require-resolved] < review-request.json");
  process.exitCode=2;
} else {
  try {
    const request = JSON.parse(readFileSync(0,"utf8"));
    const result = assessRecordedScreening(request);
    process.stdout.write(JSON.stringify(result,null,2) + "\n");
    if (args.includes("--require-resolved") && !result.releaseQualification.reviewRecordsAllResolved) process.exitCode=1;
  } catch(error) {
    console.error("screening refusal: " + error.message);
    process.exitCode=2;
  }
}
