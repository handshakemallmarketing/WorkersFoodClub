import fs from 'node:fs';
const j=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const k=j('canon/kernel.json').kernel, i=j('canon/invariants.json').invariants, f=j('canon/fixtures.json').fixtures;
if(k.length!==14) throw new Error(`kernel expected 14, got ${k.length}`);
if(i.length!==30) throw new Error(`invariants expected 30, got ${i.length}`);
if(f.length!==25) throw new Error(`fixtures expected 25, got ${f.length}`);
const unique=(xs,label)=>{const s=new Set(xs);if(s.size!==xs.length) throw new Error(`${label} duplicate id`);};
unique(k.map(x=>x.id),'kernel'); unique(i.map(x=>x.id),'invariant'); unique(f.map(x=>x.id),'fixture');
const statuses=new Set(['RED','PARTIAL_GREEN','GREEN']), priorities=new Set(['P0','P1']);
for(let n=1;n<=30;n++){ const id=`INV-${String(n).padStart(3,'0')}`; const inv=i.find(x=>x.id===id); if(!inv) throw new Error(`missing ${id}`); if(!priorities.has(inv.priority)) throw new Error(`${id} invalid priority`); if(!statuses.has(inv.status)) throw new Error(`${id} invalid status`); if(!inv.rule?.trim()) throw new Error(`${id} missing canonical rule`); }
for(let n=1;n<=25;n++){ const id=`FX-${String(n).padStart(3,'0')}`; if(!f.some(x=>x.id===id)) throw new Error(`missing ${id}`); }
for(const inv of i){ if(inv.proof){ for(const match of inv.proof.matchAll(/(?:tests|scripts)\/[A-Za-z0-9_./-]+\.mjs/g)){ if(!fs.existsSync(match[0])) throw new Error(`${inv.id} proof file missing: ${match[0]}`); } } }
console.log('canon registry valid: unique IDs, canonical rules, enums and proof paths checked');
