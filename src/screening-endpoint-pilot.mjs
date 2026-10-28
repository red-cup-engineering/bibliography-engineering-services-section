/**
 * Source-qualified retrospective text-screening pilot. Original work owner:
 * bibliography-engineering-services-section. This is a deterministic
 * baseline/assay, NOT the ASReview active learner, a blinded reviewer, or a
 * way of making final inclusion labels from title and abstract.
 *
 * All topic queries, corpora and endpoints live in a committed preregistered
 * manifest. No training-label access is permitted during ranking; labels are
 * read ONLY by the retrospective scorer after ranks have been fixed.
 *
 * The original CSV codec handles embedded commas, quotes and linebreaks.
 */
import { createHash } from "node:crypto";
import { decodeCsvRows } from "@red-cup-engineering/csv-services-section/csv-codec";

const HEADER=["record_id","pubmedID","title","authors","abstract","year",
  "label_included","label_abstract_screening"];
const EXACT_GIT=/^[a-f0-9]{40}$/u;
const MAX_BYTES=2_000_000, MAX_RECORDS=5000;
function refuse(message){ throw new TypeError(message) }
function sha(text) {
  const buffer=Buffer.from(text,"utf8");
  return {
    sha256:createHash("sha256").update(buffer).digest("hex"),
    gitBlobSha1:createHash("sha1").update(Buffer.from("blob "+buffer.length+"\0")).update(buffer).digest("hex"),
    byteCount:buffer.length,
  };
}
function tokenize(value) { return String(value??"").toLowerCase().match(/[a-z][a-z0-9]*/gu)??[] }
function frequencies(tokens){
  const out=new Map();
  for(const t of tokens)out.set(t,(out.get(t)??0)+1);
  return out;
}
export function admitCohenCorpus(rawText, profile) {
  if(typeof rawText!=="string"||!Buffer.byteLength(rawText,"utf8")||
    Buffer.byteLength(rawText,"utf8")>MAX_BYTES||!profile||
    !EXACT_GIT.test(profile.gitBlobSha1??"")||
    !EXACT_GIT.test(profile.sourceCommit??"")||
    profile.path!=="datasets/Cohen_2006/output/online/"+profile.key+".csv")
    refuse("bounded exact original Cohen source profile required");
  const source=sha(rawText);
  if(source.gitBlobSha1!==profile.gitBlobSha1)
    refuse("Cohen source revision differs from the immutable original Git blob");
  const [header,...rows]=decodeCsvRows(rawText);
  if(!header||header.length!==HEADER.length||header.some((h,i)=>h!==HEADER[i])||
    !rows.length||rows.length>MAX_RECORDS||rows.length!==profile.reportedRows)
    refuse("original article columns or precommitted population size changed");
  const seenPmids=new Set(),seenRecords=new Set();
  const docs=rows.map((cells,index)=>{
    if(cells.length!==HEADER.length)refuse("malformed original CSV record "+(index+1));
    const record=Object.fromEntries(HEADER.map((k,i)=>[k,cells[i]]));
    if(!/^[1-9][0-9]*$/u.test(record.pubmedID)||seenPmids.has(record.pubmedID)||
      !/^[1-9][0-9]*$/u.test(record.record_id)||seenRecords.has(record.record_id)||
      !["0","1"].includes(record.label_included)||
      !["0","1"].includes(record.label_abstract_screening))
      refuse("unknown or duplicate article identity / screening label in row "+(index+1));
    seenPmids.add(record.pubmedID);seenRecords.add(record.record_id);
    const titleTerms=tokenize(record.title);
    const abstractTerms=tokenize(record.abstract);
    const words=titleTerms.concat(titleTerms,abstractTerms);
    return {
      pmid:record.pubmedID,
      titleMissing:record.title.trim()==="",
      abstractMissing:record.abstract.trim()==="",
      terms:frequencies(words),length:words.length,
      final:Number(record.label_included),
      initial:Number(record.label_abstract_screening),
    };
  });
  if(docs.reduce((s,d)=>s+d.final,0)!==profile.reportedFinalIncluded)
    refuse("original source final-inclusion total differs from the preregistered value");
  return {source,docs};
}
export function rankWithBm25(docs,query){
  const qTerms=[...new Set(tokenize(query))];
  if(!qTerms.length)refuse("non-empty label-blind research question required");
  const n=docs.length,mean=docs.reduce((s,d)=>s+d.length,0)/n||1;
  const df=new Map(qTerms.map(t=>[t,docs.filter(d=>d.terms.has(t)).length]));
  const scores=docs.map(d=>{
    const denom=1.2*(0.25+0.75*d.length/mean);
    return qTerms.reduce((sum,t)=>{
      const f=d.terms.get(t)??0;
      const idf=Math.log(1+(n-(df.get(t)??0)+0.5)/((df.get(t)??0)+0.5));
      return sum+(f?idf*(f*2.2)/(f+denom):0);
    },0);
  });
  const ordered=Array.from({length:n},(_,i)=>i);
  ordered.sort((a,b)=>scores[b]-scores[a]||docs[a].pmid.localeCompare(docs[b].pmid));
  return {ordered,scores,qTerms};
}
function xorshift32(seed){
  let x=seed>>>0;
  return ()=>{
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return (x>>>0)/4294967296;
  };
}
export function randomRanks(docs,seed){
  const indices=docs.map((_,i)=>i);
  indices.sort((a,b)=>docs[a].pmid.localeCompare(docs[b].pmid));
  const next=xorshift32(seed||1);
  for(let i=indices.length-1;i>0;i--){
    const j=Math.floor(next()*(i+1));
    [indices[i],indices[j]]=[indices[j],indices[i]];
  }
  return indices;
}
/**
 * WSS@95 is a retrospective *oracle* measure: the true total relevant count
 * is known only to the benchmark evaluator. It is not a deployable stop rule.
 */
export function scoreRetrospectiveRank(docs,ordered,label) {
  if(!Array.isArray(docs)||!Array.isArray(ordered)||!["initial","final"].includes(label)||
    ordered.length!==docs.length||!docs.length||
    new Set(ordered).size!==docs.length||
    ordered.some(i=>!Number.isInteger(i)||i<0||i>=docs.length))
    refuse("invalid retrospective permutation or label endpoint");
  const positive=docs.reduce((s,d)=>s+d[label],0);
  if(positive===0||positive===docs.length)refuse("benchmark requires both positive and negative held-out labels");
  const target=Math.ceil(0.95*positive),budget=Math.ceil(0.2*docs.length);
  let found=0,seenForTarget=null,foundAt20=0,precisionSum=0;
  for(let rank=0;rank<ordered.length;rank++){
    if(docs[ordered[rank]][label]===1){
      found++;
      precisionSum+=found/(rank+1);
      if(rank<budget)foundAt20++;
      if(found===target&&seenForTarget===null)seenForTarget=rank+1;
    }
  }
  return {
    total:docs.length,positives:positive,
    targetIncluded:target,
    inspectedAt95Recall:seenForTarget,
    workSavedOverSamplingAt95:0.95-seenForTarget/docs.length,
    recallAt20PercentScreened:foundAt20/positive,
    averagePrecision:precisionSum/positive,
  };
}
function percentile(values,fraction) {
  const a=[...values].sort((x,y)=>x-y);
  const k=(a.length-1)*fraction,lo=Math.floor(k),hi=Math.ceil(k);
  return a[lo]+(a[hi]-a[lo])*(k-lo);
}
function seededRandomComparison(docs,label,seeds) {
  if(!Number.isSafeInteger(seeds)||seeds<16||seeds>1024)refuse("fixed random replicate count must be 16–1024");
  const outcomes=Array.from({length:seeds},(_,i)=>
    scoreRetrospectiveRank(docs,randomRanks(docs,(20261027+Math.imul(2654435761,i+1))>>>0),label));
  const measure=key=>{
    const xs=outcomes.map(o=>o[key]);
    return {mean:xs.reduce((sum,x)=>sum+x,0)/xs.length,
      p05:percentile(xs,0.05),median:percentile(xs,0.5),p95:percentile(xs,0.95)};
  };
  return {
    nPermutations:seeds,randomization:"xorshift32 Fisher-Yates sorted PMID, fixed manifest seed",
    inspectedAt95Recall:measure("inspectedAt95Recall"),
    workSavedOverSamplingAt95:measure("workSavedOverSamplingAt95"),
    recallAt20PercentScreened:measure("recallAt20PercentScreened"),
    averagePrecision:measure("averagePrecision"),
  };
}
export function assayCohenScreeningEndpoint({rawText,profile,randomReplicates=128}={}){
  const {docs,source}=admitCohenCorpus(rawText,profile);
  if(typeof profile.query!=="string"||profile.query.trim()==="")
    refuse("predeclared label-blind topical query required");
  const ranked=rankWithBm25(docs,profile.query);
  const stage={initialPositive:0,finalPositive:0,bothPositive:0,
    initialOnly:0,finalOnly:0,bothNegative:0};
  for(const d of docs){
    if(d.initial)stage.initialPositive++;
    if(d.final)stage.finalPositive++;
    if(d.initial&&d.final)stage.bothPositive++;
    else if(d.initial&&!d.final)stage.initialOnly++;
    else if(!d.initial&&d.final)stage.finalOnly++;
    else stage.bothNegative++;
  }
  const endpoints={};
  for(const [key,label] of [["titleAbstract","initial"],["finalInclusion","final"]]){
    endpoints[key]={
      rank:scoreRetrospectiveRank(docs,ranked.ordered,label),
      random:seededRandomComparison(docs,label,randomReplicates),
    };
  }
  return {
    type:"SourceQualifiedScreeningEndpointPilot",version:1,
    source:{owner:"LHofstee/systematic-review-datasets",
      commit:profile.sourceCommit,path:profile.path,...source,
      license:"underlying Cohen/MEDLINE task declared 'custom open license'; full text not redistributed"},
    task:profile.key,question:profile.query,
    method:{name:"frozen query BM25 on title*2 plus abstract*1, k1=1.2 b=0.75",
      queryTokens:ranked.qTerms,usesGoldLabelsToRank:false,
      randomizedComparator:"128 prespecified deterministic PRNG permutations, no model training"},
    evidence:{records:docs.length,missingTitle:docs.filter(d=>d.titleMissing).length,
      missingAbstract:docs.filter(d=>d.abstractMissing).length,
      bothMissing:docs.filter(d=>d.titleMissing&&d.abstractMissing).length,
      stage},
    endpoints,
    epistemicStanding:"retrospective computational pilot on one source family, not a live screening stopping rule or ASReview/Elicit comparative benchmark",
  };
}
