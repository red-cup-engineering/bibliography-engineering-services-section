/**
 * Evidence audit for LABELLED BIBLIOGRAPHIC IDENTIFIER FILES.
 *
 * A raw row is an observation of its source carrier, NOT a unique work.
 * An OpenAlex identity may carry both 0/1 labels in the same raw file.
 * We NEVER choose a winner from those labels: doing so could leak gold labels
 * into an active-learning screen or erase included studies.
 *
 * Restricted source profile: UTF-8 unquoted comma-separated identifier
 * values only. It deliberately refuses general CSV quoting/embedded commas;
 * use the original house CSV codec for other record formats.
 *
 * No network, input mutation, full-text inference, model prediction or
 * external rights/authentication granted by this function.
 */
import { createHash } from "node:crypto";
const SHA1=/^[0-9a-f]{40}$/u, COMMIT=/^[0-9a-f]{40}$/u;
const ID=/^https:\/\/openalex\.org\/W[0-9]+$/u;
const MAX_ROWS=100000, MAX_BYTES=12_000_000;
function refusal(reason) { throw new TypeError(reason); }
function sourceIdentity(rawText) {
  const bytes=Buffer.from(rawText,"utf8");
  return {
    gitBlobSha1:createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex"),
    sha256:createHash("sha256").update(bytes).digest("hex"), bytes:bytes.length,
  };
}
function readStrictIdentifierCsv(rawText) {
  if (typeof rawText!=="string" || rawText.length<20 ||
      Buffer.byteLength(rawText,"utf8")>MAX_BYTES || rawText.includes('"') ||
      rawText.includes("\r") || rawText.includes("\0") ||
      !rawText.endsWith("\n")) refusal("requires bounded unquoted UTF-8 CSV with final LF");
  const lines=rawText.slice(0,-1).split("\n");
  if (lines.length<2 || lines.length>MAX_ROWS+1) refusal("invalid bounded CSV row count");
  const header=lines.shift().split(",");
  if (header.length<3 || header.length>16 || new Set(header).size!==header.length ||
      header.some(k=>!/^[a-z][a-z_]*$/u.test(k))) refusal("malformed identifier CSV header");
  for (const col of ["label_included","openalex_id","doi"]) if (!header.includes(col))
    refusal("expected original identifier column "+col);
  const rows=lines.map((line,index)=>{
    const cells=line.split(",");
    if(cells.length!==header.length || cells.some(v=>v.includes("\n")))
      refusal("malformed identifier fields on source row "+(index+2));
    const row=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));
    if(!["0","1"].includes(row.label_included))refusal("nonbinary/unknown source label at row "+(index+2));
    if(row.openalex_id && !ID.test(row.openalex_id))
      refusal("invalid OpenAlex identity at row "+(index+2));
    return {...row,sourceRow:index+2};
  });
  return rows;
}
function countIdentity(group) {
  const support=group.filter(x=>x.label_included==="1").length;
  const against=group.filter(x=>x.label_included==="0").length;
  return {
    labelStatus:support&&against ? "conflicting" : support ? "included-only":"excluded-only",
    positiveRows:support,negativeRows:against,
    sourceRows:group.map(x=>x.sourceRow),
  };
}
/**
 * Admit a source-locked original identifier observation for **audit only**.
 * Missing IDs and contradictory labels are first-class results, not grounds
 * for self-adjudication; the output intentionally has NO usable gold labels
 * for classifier training on conflicting groups.
 */
export function auditLabeledIdentifierCarrier({rawText,provenance}={}){
  if(!provenance || typeof provenance!=="object" ||
      !/^[A-Za-z][A-Za-z0-9_-]{2,95}$/u.test(provenance.corpus||"") ||
      !COMMIT.test(provenance.sourceCommit||"") || !SHA1.test(provenance.gitBlobSha1||"") ||
      typeof provenance.path!=="string" ||
      provenance.path!=="datasets/"+provenance.corpus+"/"+provenance.corpus+"_ids.csv")
    refusal("explicit exact source owner, path, commit and git blob are required");
  if(!Number.isSafeInteger(provenance.publishedBenchmarkRecords) ||
      provenance.publishedBenchmarkRecords<=0 ||
      !Number.isSafeInteger(provenance.publishedIncluded) ||
      provenance.publishedIncluded<0 ||
      provenance.publishedIncluded>provenance.publishedBenchmarkRecords)
    refusal("independently reported benchmark denominators required");
  const source=sourceIdentity(rawText);
  if(source.gitBlobSha1!==provenance.gitBlobSha1) refusal("external source bytes differ from pinned Git blob");
  const rows=readStrictIdentifierCsv(rawText);
  const group=new Map(),unlinkedRows=[];
  const count={rawRows:rows.length,rawPositiveRows:0,rawNegativeRows:0,
    rowsWithOpenAlex:0,rowsWithDoi:0,rowsWithPubmed:0,
    missingOpenAlex:0,missingAllIdentifiers:0,missingDoi:0};
  const doiGroups=new Map();
  for(const row of rows){
    if(row.label_included==="1") count.rawPositiveRows++; else count.rawNegativeRows++;
    if(row.doi) count.rowsWithDoi++;else count.missingDoi++;
    if(row.pmid) count.rowsWithPubmed++;
    if(!row.openalex_id && !row.doi && !row.pmid) count.missingAllIdentifiers++;
    if(!row.openalex_id){count.missingOpenAlex++;unlinkedRows.push(row);continue;}
    count.rowsWithOpenAlex++;
    if(!group.has(row.openalex_id)) group.set(row.openalex_id,[]);
    group.get(row.openalex_id).push(row);
    if(row.doi){
      if(!doiGroups.has(row.doi))doiGroups.set(row.doi,new Set());
      doiGroups.get(row.doi).add(row.openalex_id);
    }
  }
  const classCounts={includedOnly:0,excludedOnly:0,conflicting:0,duplicateIdentityGroups:0};
  const conflicts=[],multiDoiPerIdentity=[],selected=[];
  for(const [id,rr] of [...group].sort(([a],[b])=>a.localeCompare(b))){
    const c=countIdentity(rr);
    if(rr.length>1)classCounts.duplicateIdentityGroups++;
    if(c.labelStatus==="conflicting") {
      classCounts.conflicting++;
      conflicts.push({identity:id,positiveRows:c.positiveRows,negativeRows:c.negativeRows,sourceRows:c.sourceRows});
    }else if(c.labelStatus==="included-only")classCounts.includedOnly++; else classCounts.excludedOnly++;
    const dois=[...new Set(rr.map(x=>x.doi).filter(Boolean))];
    if(dois.length>1)multiDoiPerIdentity.push({identity:id,count:dois.length});
    selected.push(c);
  }
  const noIdPos=unlinkedRows.filter(x=>x.label_included==="1").length;
  const collidedDoi=[...doiGroups].filter(([_,values])=>values.size>1)
    .map(([doi,values])=>({doi,openAlexCount:values.size}));
  // Counterfactual policies, not actual published adjudications. Never output
  // a joined label to use as a validated screening training target.
  const minimumPos=classCounts.includedOnly;
  const maximumPos=minimumPos+classCounts.conflicting;
  const discoveredPos=classCounts.includedOnly+classCounts.conflicting;
  return {
    type:"LabeledBibliographyIdentityAudit",version:1,
    status:classCounts.conflicting || count.missingOpenAlex || multiDoiPerIdentity.length || collidedDoi.length
      ? "identity-and-label-reconciliation-required":"structural-identity-audit-only",
    provenance:{
      corpus:provenance.corpus,sourceOwner:"asreview/synergy-dataset",
      sourceCommit:provenance.sourceCommit,path:provenance.path,...source,
      benchmarkCountsSource:"SYNERGY README at the same upstream revision; not asserted to be the raw file's row count",
    },
    reportedBenchmark:{
      records:provenance.publishedBenchmarkRecords,included:provenance.publishedIncluded,
      exactMatchOfUniqueOpenAlexCount:group.size===provenance.publishedBenchmarkRecords,
      // The equality is a useful cross-check, not proof that the project used this exact join.
    },
    raw:count,
    identity:{
      uniqueOpenAlex:group.size,duplicateOpenAlexGroups:classCounts.duplicateIdentityGroups,
      includedOnly:classCounts.includedOnly,excludedOnly:classCounts.excludedOnly,
      conflictingLabelGroups:classCounts.conflicting,
      conflictingGroups:conflicts,
      absentOpenAlexPositiveRows:noIdPos,
      unlinkedSourceRows:unlinkedRows.map(x=>x.sourceRow),
      inconsistentOpenAlexToDoi:multiDoiPerIdentity,
      inconsistentDoiToOpenAlex:collidedDoi,
    },
    hypotheticalPolicies:{
      excludeWins:{includedIdentities:minimumPos},
      includeWins:{includedIdentities:maximumPos},
      undecided:{includedMin:minimumPos,includedMax:maximumPos},
      meaning:"These are sensitivity bounds, not accepted benchmark labels or model predictions.",
    },
    machineFinding:classCounts.conflicting
      ? "the same OpenAlex work has both inclusion and exclusion labels in raw source rows"
      : "no within-OpenAlex raw label conflicts detected",
    authorization:{
      validForTrainingWithoutAdjudication:false,
      validatesStudyLabelTruth:false,verifiedAbstractOrFullText:false,
      establishesPublisherRights:false,
      permissibleUse:"source-locked aggregate research-data quality and benchmark-admission audit only",
    },
  };
}
