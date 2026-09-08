import fs from 'node:fs';
const j=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const matrix=j('docs/traceability/matrix.json');
const canon=j('canon/invariants.json');
const releaseIndex=j('docs/traceability/release-index.json');
if(!matrix.baseline||matrix.baseline!==canon.baseline) throw new Error('traceability baseline mismatch');
if(releaseIndex.baseline!==canon.baseline) throw new Error('release index baseline mismatch');
if(matrix.slice!==releaseIndex.head) throw new Error(`traceability matrix stale: matrix=${matrix.slice} releaseHead=${releaseIndex.head}`);
if(!Array.isArray(matrix.mappings)||matrix.mappings.length!==canon.invariants.length) throw new Error('traceability mapping count mismatch');
const byId=new Map(matrix.mappings.map(x=>[x.invariantId,x]));
if(byId.size!==matrix.mappings.length) throw new Error('traceability duplicate invariant mapping');
for(const inv of canon.invariants){
 const m=byId.get(inv.id); if(!m) throw new Error(`traceability missing ${inv.id}`);
 if(m.status!==inv.status) throw new Error(`${inv.id} traceability status drift: matrix=${m.status} canon=${inv.status}`);
 if(m.priority!==inv.priority) throw new Error(`${inv.id} traceability priority drift`);
 if(m.rule!==inv.rule) throw new Error(`${inv.id} traceability rule drift`);
 if(inv.status!=='RED' && !m.proof?.trim()) throw new Error(`${inv.id} non-red mapping missing proof`);
}
const actualReleaseFiles=fs.readdirSync('evidence/releases').filter(x=>x.endsWith('.json')).sort();
const indexedReleaseFiles=[...(releaseIndex.evidenceFiles??[])].sort();
if(new Set(indexedReleaseFiles).size!==indexedReleaseFiles.length) throw new Error('release index contains duplicate evidence file');
if(JSON.stringify(actualReleaseFiles)!==JSON.stringify(indexedReleaseFiles)){
 const missing=actualReleaseFiles.filter(x=>!indexedReleaseFiles.includes(x));
 const stale=indexedReleaseFiles.filter(x=>!actualReleaseFiles.includes(x));
 throw new Error(`release index stale: unindexed=${missing.join(',')||'none'} missingFiles=${stale.join(',')||'none'}`);
}
for(const [invariantId,tokens] of Object.entries(releaseIndex.requiredCumulativeProofs??{})){
 const mapping=byId.get(invariantId); if(!mapping) throw new Error(`release index proof requirement references unknown ${invariantId}`);
 for(const token of tokens){if(!mapping.proof.includes(token)) throw new Error(`${invariantId} cumulative proof stale: missing ${token}`);}
}
console.log(`traceability baseline ${matrix.baseline}; head=${matrix.slice}; releases=${actualReleaseFiles.length}; cumulative mappings=${matrix.mappings.length}; canon synchronized`);
