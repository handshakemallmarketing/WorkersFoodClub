import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('docs/traceability/matrix.json','utf8'));
if(!m.baseline) throw new Error('missing baseline');
console.log(`traceability baseline ${m.baseline}; mappings=${m.mappings.length}`);
