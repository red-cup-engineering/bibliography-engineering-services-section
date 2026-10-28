#!/usr/bin/env node
/**
 * Dependency-free, independent original-source reproduction of source-method
 * disagreement counts in three already-selected SYNERGY raw-ID corpora.
 * NO imports from the bibliography producer, no guessed final gold labels,
 * no study-article text, no output of individual source rows.
 *
 * This is an exploratory post hoc verification, not prospective registration,
 * publisher authentication, a screening model, or legal reuse approval.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fail=message=>{throw new Error(message)};
const manifest=JSON.parse(readFileSync(
  new URL('../research/source-pins/synergy-2026-benchmark-identity-profiles.json',import.meta.url),'utf8'));
const revision='dc2dadfdbb98eb1b4259604789abd640aa3b693e';
const expectations=[
  ['Sep_2021',273,271,0,0,0,0,0,0,0],
  ['Donners_2021',660,258,15,14,10,9,5,1,0],
  ['Smid_2020',3980,2627,21,7,17,3,4,14,0]
];
if(manifest.sourceOwner!=='asreview/synergy-dataset'||
   manifest.sourceCommit!==revision||
   manifest.profiles?.length!==3||
   JSON.stringify(manifest.profiles.map(x=>x.corpus))!==
     JSON.stringify(expectations.map(x=>x[0])))
  fail('original manifest or source ownership changed');
const results=[];
for(const [name,nRows,nIds,nConflicts,nSame,nDiff,nBoth,nSameOnly,nDiffOnly,nUnknown] of expectations){
  const profile=manifest.profiles.find(x=>x.corpus===name);
  const path='datasets/'+name+'/'+name+'_ids.csv';
  if(profile.path!==path||profile.sourceCommit!==revision||
     !/^[a-f0-9]{40}$/u.test(profile.gitBlobSha1))
    fail('unqualified source pin in '+name);
  const url='https://raw.githubusercontent.com/asreview/synergy-dataset/'+revision+'/'+path;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(response.status!==200)fail(name+' original source HTTP '+response.status);
  const raw=Buffer.from(await response.arrayBuffer());
  if(raw.length<20||raw.length>12_000_000)fail(name+' exceeded source limits');
  const blob=createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  if(blob!==profile.gitBlobSha1)fail(name+' original Git source bytes drifted');
  const digest=createHash('sha256').update(raw).digest('hex');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  if(!text.endsWith('\n')||text.includes('\r')||text.includes('"'))fail(name+' source CSV dialect changed');
  const [header,...lines]=text.slice(0,-1).split('\n');
  const columns=header.split(',');
  if(!['openalex_id','label_included','method'].every(k=>columns.includes(k))||
      columns.length!==new Set(columns).size||lines.length!==nRows)
    fail(name+' original source columns/denominators changed');
  const groups=new Map();
  for(let i=0;i<lines.length;i++){
    const cells=lines[i].split(',');
    if(cells.length!==columns.length)fail(name+' malformed row '+(i+2));
    const cell=k=>cells[columns.indexOf(k)];
    const id=cell('openalex_id'),label=cell('label_included'),method=cell('method');
    if(!['0','1'].includes(label))fail(name+' invalid original source label');
    if(!id)continue;
    if(!/^https:\/\/openalex\.org\/W[0-9]+$/u.test(id))fail(name+' malformed indexed work identity');
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push({label,method});
  }
  const count={conflicting:0,same:0,different:0,both:0,sameOnly:0,differentOnly:0,unattributed:0};
  for(const rows of groups.values()){
    const pos=rows.filter(r=>r.label==='1'),neg=rows.filter(r=>r.label==='0');
    if(!pos.length||!neg.length)continue;
    count.conflicting++;
    const posNames=new Set(pos.map(r=>r.method).filter(Boolean));
    const negNames=new Set(neg.map(r=>r.method).filter(Boolean));
    const same=[...posNames].some(m=>negNames.has(m));
    const different=posNames.size>0&&negNames.size>0&&
      !(posNames.size===1&&negNames.size===1&&
        posNames.values().next().value===negNames.values().next().value);
    if(same)count.same++;
    if(different)count.different++;
    if(same&&different)count.both++;
    else if(same)count.sameOnly++;
    else if(different)count.differentOnly++;
    if(rows.some(r=>!r.method))count.unattributed++;
  }
  const actual=[lines.length,groups.size,count.conflicting,count.same,count.different,
    count.both,count.sameOnly,count.differentOnly,count.unattributed];
  const expected=[nRows,nIds,nConflicts,nSame,nDiff,nBoth,nSameOnly,nDiffOnly,nUnknown];
  if(actual.some((value,i)=>value!==expected[i]))
    fail(name+' independently counted retrieval-method witnesses disagree with original-source expectations: '+JSON.stringify(actual));
  if(count.sameOnly+count.differentOnly+count.both!==count.conflicting)
    fail(name+' an unclassified original conflict was treated as a known retrieval method');
  results.push({corpus:name,sourceCommit:revision,gitBlobSha1:blob,sha256:digest,
    rawRows:lines.length,distinctOpenAlex:groups.size,methodContrasts:count});
}
process.stdout.write(JSON.stringify({
  type:'IndependentSourceMethodOppositionReproduction',version:1,
  sourceOwner:manifest.sourceOwner,sourceCommit:revision,results,
  standing:'Post hoc source-data computation; not study-label adjudication, active-learning comparison or research release authority',
},null,2)+'\n');
