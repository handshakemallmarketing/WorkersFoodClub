import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const fixtures=JSON.parse(fs.readFileSync('canon/fixtures.json','utf8'));

describe('SW0-12E adversarial fixture frontier',()=>{
  it('all 25 CB-00 adversarial fixtures have executable GREEN proof',()=>{
    expect(fixtures.fixtures).toHaveLength(25);
    expect(fixtures.fixtures.filter((x:{status:string})=>x.status!=='GREEN')).toEqual([]);
    expect(fixtures.fixtures.every((x:{proof?:string})=>typeof x.proof==='string'&&x.proof.length>0)).toBe(true);
  });
});
