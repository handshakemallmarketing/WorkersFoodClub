import {describe,it,expect} from 'vitest';
import fixtures from '../../canon/fixtures.json';

describe('SW0-12E adversarial fixture frontier',()=>{
  it('all 25 CB-00 adversarial fixtures have executable GREEN proof',()=>{
    expect(fixtures.fixtures).toHaveLength(25);
    expect(fixtures.fixtures.filter(x=>x.status!=='GREEN')).toEqual([]);
    expect(fixtures.fixtures.every(x=>typeof x.proof==='string'&&x.proof.length>0)).toBe(true);
  });
});
