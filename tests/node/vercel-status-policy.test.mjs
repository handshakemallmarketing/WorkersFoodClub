import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCanonicalVercelStatus} from '../../lib/vercel-status-policy.js';

const canonicalPrefix='https://vercel.com/origin-os/workers-food-club/';

test('selects the canonical Vercel project and ignores legacy installations',()=>{
  const statuses=[
    {context:'Vercel – workers-food-club',state:'failure',target_url:'https://vercel.com/food-club/workers-food-club/legacy'},
    {context:'Vercel – workers-food-club',state:'pending',target_url:'https://vercel.com/another-team/workers-food-club/pending'},
    {context:'Vercel – workers-food-club',state:'success',target_url:`${canonicalPrefix}canonical`},
  ];
  assert.deepEqual(selectCanonicalVercelStatus(statuses,canonicalPrefix),statuses[2]);
});

test('does not accept a generic Vercel success without the canonical target',()=>{
  assert.equal(selectCanonicalVercelStatus([
    {context:'Vercel',state:'success',target_url:'https://vercel.com/food-club/workers-food-club/legacy'},
  ],canonicalPrefix),null);
});

test('uses the newest canonical status returned by the GitHub statuses API',()=>{
  const statuses=[
    {context:'Vercel – workers-food-club',state:'pending',target_url:`${canonicalPrefix}new`},
    {context:'Vercel – workers-food-club',state:'success',target_url:`${canonicalPrefix}old`},
  ];
  assert.deepEqual(selectCanonicalVercelStatus(statuses,canonicalPrefix),statuses[0]);
});

test('fails closed for invalid target-prefix configuration',()=>{
  assert.throws(()=>selectCanonicalVercelStatus([], 'https://vercel.com/origin-os/workers-food-club'),/ending in/);
  assert.throws(()=>selectCanonicalVercelStatus([], 'https://example.com/'),/EXPECTED_VERCEL_TARGET_PREFIX/);
});
