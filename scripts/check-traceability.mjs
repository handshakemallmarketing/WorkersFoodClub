import fs from 'node:fs';
const j=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const matrix=j('docs/traceability/matrix.json');
const canon=j('canon/invariants.json');
if(!matrix.baseline||matrix.baseline!==canon.baseline) throw new Error('traceability baseline mismatch');
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
console.log(`traceability baseline ${matrix.baseline}; cumulative mappings=${matrix.mappings.length}; canon synchronized`);
