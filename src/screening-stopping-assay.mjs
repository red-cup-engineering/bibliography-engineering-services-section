/**
 * Prospective-information stopping heuristic evaluated RETROSPECTIVELY:
 * predictions are frozen from label-blind BM25; the next label is shown only
 * when its item is screened. Exact finite recall bounds are from the existing
 * canonical bibliography source and never authorize cessation.
 *
 * Not a SAFE implementation, trained ASReview learner, registered clinical
 * stopping protocol, provider-authenticated review, or live research action.
 */
import {
  admitCohenCorpus,
  rankWithBm25,
  randomRanks,
  scoreRetrospectiveRank,
} from "./screening-endpoint-pilot.mjs";
import { boundFiniteScreeningRecall } from "./reference-screening.mjs";

const refused=message=>{throw new TypeError(message)};
const empirical=Number.isFinite;

function validPolicy(policy) {
  if(!policy||typeof policy.id!=="string"||!/^stop-(07|10|20)pct$/u.test(policy.id)||
     ![7,10,20].includes(policy.irrelevantRunPercent)||
     policy.id!=="stop-"+String(policy.irrelevantRunPercent).padStart(2,"0")+"pct")
    refused("only the exact predeclared 7%, 10%, 20% consecutive-negative sensitivity policies are admitted");
}
function fractionRank(values,f) {
  const items=[...values].sort((a,b)=>a-b),k=(items.length-1)*f;
  return items[Math.floor(k)]+(items[Math.ceil(k)]-items[Math.floor(k)])*(k-Math.floor(k));
}
function distribution(values) {
  return {n:values.length,
    mean:values.reduce((s,x)=>s+x,0)/values.length,
    p05:fractionRank(values,0.05),
    median:fractionRank(values,0.5),
    p95:fractionRank(values,0.95),
    minimum:Math.min(...values),maximum:Math.max(...values)};
}
/**
 * Pure sequential observer. Only the already inspected documents' labels
 * affect the stopping decision. Revealed prefix is supplied by a fixed
 * ranking; actual unseen labels are accessed only to score the result.
 */
export function evaluateFiniteConsecutiveNegativeStop(
  {docs,ordered,label,irrelevantRunPercent,minScreenedPercent=10,
   targetNumerator=95,targetDenominator=100,requirePositive=true}={}
) {
  if(!Array.isArray(docs)||docs.length<2||docs.length>5000||
     !Array.isArray(ordered)||ordered.length!==docs.length||
     new Set(ordered).size!==docs.length||
     ordered.some(i=>!Number.isSafeInteger(i)||i<0||i>=docs.length)||
     !["initial","final"].includes(label)||![7,10,20].includes(irrelevantRunPercent)||
     minScreenedPercent!==10||requirePositive!==true||
     targetNumerator!==95||targetDenominator!==100||
     docs.some(d=>!d||![0,1].includes(d[label])))
    refused("source-closed finite screening requires exact declared policies, bounded permutations and typed 0/1 outcomes");
  const n=docs.length;
  const k=Math.ceil(irrelevantRunPercent*n/100);
  const minimum=Math.ceil(minScreenedPercent*n/100);
  const totalPos=docs.reduce((s,d)=>s+d[label],0);
  if(totalPos===0||totalPos===n)refused("review simulation requires both included and excluded source judgments");
  let inspected=0,found=0,negativeRun=0;
  let triggerReason="exhausted-complete-candidate-frame";
  for (const idx of ordered) {
    inspected++;
    // At this exact step, the identified source label becomes visible to
    // the simulated reviewer; the remaining records have not been opened.
    const observed=docs[idx][label];
    if(observed){found++;negativeRun=0}
    else negativeRun++;
    if(inspected>=minimum&&found>0&&negativeRun>=k) {
      triggerReason="consecutive-negative-heuristic-fired";
      break;
    }
  }
  const remaining=n-inspected;
  const sharpBound=boundFiniteScreeningRecall({
    included:found,excluded:inspected-found,unresolved:remaining,
    targetNumerator,targetDenominator,
  });
  const actualRecall=found/totalPos; // ONLY the retrospective evaluator sees totalPos
  const meetsTarget=found*targetDenominator>=totalPos*targetNumerator;
  return {
    policy:{irrelevantRunPercent,minScreenedPercent,requirePositive,
      irrelevantRunRequired:k,minimumScreenedRequired:minimum},
    stopProposal:triggerReason==="consecutive-negative-heuristic-fired",
    disposition:triggerReason,inspected,remaining,screenedFraction:inspected/n,
    revealedPrefix:{observedPositive:found,observedNegative:inspected-found,
      terminalConsecutiveNegatives:negativeRun},
    sharpFiniteFrame:sharpBound,
    retrospectiveEvaluation:{
      sourceLabeledPositives:totalPos,observedPositives:found,
      sourceLabeledMissedPositives:totalPos-found,
      actualRecall,meets95PercentRecall:meetsTarget,
      missed95PercentGoal:!meetsTarget,
      savedScreeningFraction:remaining/n
    },
    operativeStopAuthorized:false,
    epistemicStanding:"sequential revealed-label simulation on source-reported labels; truth of unseen labels is available ONLY to evaluator",
  };
}
/**
 * Source-locked, prespecified real-dataset comparison to 128 fixed random
 * permutations. The random baseline uses exactly the existing original
 * bibliography pilot's PRNG, no independently invented method.
 */
export function assayCohenHeuristicStopping({rawText,profile,protocol}={}) {
  if(!protocol||protocol.type!=="PreregisteredFiniteScreeningStopHeuristicAssay"||
     protocol.version!==1||
     protocol.originalSourceOwner!=="LHofstee/systematic-review-datasets"||
     protocol.originalSourceCommit!==profile?.sourceCommit||
     !Array.isArray(protocol.tasks)||protocol.tasks.length!==3||
     JSON.stringify(protocol.tasks.map(t=>t.key))!==
       JSON.stringify(["Antihistamines","Estrogens","UrinaryIncontinence"])||
     JSON.stringify(protocol.experiment?.policies)!==
       JSON.stringify([{id:"stop-07pct",irrelevantRunPercent:7},
         {id:"stop-10pct",irrelevantRunPercent:10},
         {id:"stop-20pct",irrelevantRunPercent:20}])||
     protocol.experiment.minScreenedPercent!==10||
     protocol.experiment.requireAtLeastOnePositiveBeforeTrigger!==true||
     protocol.experiment.baseline!==128)
    refused("predeclared source-coupled stopping assay and all exact policies required");
  const matching=protocol.tasks.find(t=>t.key===profile.key);
  if(!matching||matching.gitBlobSha1!==profile.gitBlobSha1||
     matching.reportedRows!==profile.reportedRows||
     matching.reportedFinalIncluded!==profile.reportedFinalIncluded||
     matching.query!==profile.query||
     matching.path!==profile.path)
    refused("original corpus profile differs from frozen stopping preregistration");
  const {source,docs}=admitCohenCorpus(rawText,profile);
  const ranking=rankWithBm25(docs,profile.query);
  const comparators={};
  for(const [endpoint,label] of [["titleAbstract","initial"],["finalInclusion","final"]]) {
    const ideal=scoreRetrospectiveRank(docs,ranking.ordered,label);
    const policies={};
    for(const policy of protocol.experiment.policies) {
      validPolicy(policy);
      const result=evaluateFiniteConsecutiveNegativeStop({
        docs,ordered:ranking.ordered,label,irrelevantRunPercent:policy.irrelevantRunPercent
      });
      const randomTrials=Array.from({length:128},(_,i)=>
        evaluateFiniteConsecutiveNegativeStop({
          docs,ordered:randomRanks(docs,(20261027+Math.imul(2654435761,i+1))>>>0),
          label,irrelevantRunPercent:policy.irrelevantRunPercent
        })
      );
      const invalid=randomTrials.filter(t=>t.stopProposal && !t.retrospectiveEvaluation.meets95PercentRecall).length;
      const stopped=randomTrials.filter(t=>t.stopProposal).length;
      policies[policy.id]={
        bm25:result,
        random128:{
          n:randomTrials.length,proposedEarlyStops:stopped,
          prematureStopsUnder95:invalid,
          missed95AmongProposed:stopped>0?invalid/stopped:null,
          recall:distribution(randomTrials.map(t=>t.retrospectiveEvaluation.actualRecall)),
          savedFraction:distribution(randomTrials.map(t=>t.retrospectiveEvaluation.savedScreeningFraction)),
        },
      };
    }
    comparators[endpoint]={
      sourceReportedPositives:docs.reduce((s,d)=>s+d[label],0),
      retrospectiveOracleScreenedAt95:ideal.inspectedAt95Recall,
      retrospectiveOracleWss95:ideal.workSavedOverSamplingAt95,
      policies,
    };
  }
  return {
    type:"SourceQualifiedConsecutiveIrrelevantStopAssay",version:1,
    corpus:profile.key,source:{
      owner:"LHofstee/systematic-review-datasets",path:profile.path,
      revision:profile.sourceCommit,...source,
    },
    population:docs.length,
    ranking:{name:"source-locked static BM25, source-topic query, label-blind",
      query:profile.query,notActiveLearning:true,queryFrozen:true},
    comparators,
    limitation:"This is a retrospective replay of sequentially revealed source labels over a static ranking; no external peer review, true live source completeness, prospective reviewer outcome, certified stopped clinical review, or trained ASReview comparator.",
    operativeStopAuthorized:false,
  };
}
