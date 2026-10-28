#!/usr/bin/env node
/**
 * One explicit read-only reassessment of an earlier screening request after a
 * recorded literature watch. stdin {previous,watchResult}; stdout audit JSON.
 * Exit 1 for impacted previous decisions, newly seen works, or source failure;
 * exit 2 for malformed inputs. Exit 0 never authorizes publication or stopping.
 */
import { readFileSync } from 'node:fs';
import { assessScreeningContinuity } from '../src/screening-continuity.mjs';
if (process.argv.length!==2) {
  console.error('usage: node scripts/review-screening-continuity.mjs < continuity-request.json');
  process.exitCode=2;
} else {
  try {
    const output=assessScreeningContinuity(JSON.parse(readFileSync(0,'utf8')));
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
    if(output.reassessmentRecordIds.length || output.newRecordCandidates.length ||
      output.sourceQueryRefusals.length) process.exitCode=1;
  } catch(err) {
    console.error('screening continuity refused: '+err.message);
    process.exitCode=2;
  }
}
