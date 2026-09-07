import fs from 'node:fs';
const j=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const k=j('canon/kernel.json').kernel, i=j('canon/invariants.json').invariants, f=j('canon/fixtures.json').fixtures;
if(k.length!==14) throw new Error(`kernel expected 14, got ${k.length}`);
if(i.length!==30) throw new Error(`invariants expected 30, got ${i.length}`);
if(f.length!==25) throw new Error(`fixtures expected 25, got ${f.length}`);
console.log('canon registry structurally valid; conformance intentionally RED');
