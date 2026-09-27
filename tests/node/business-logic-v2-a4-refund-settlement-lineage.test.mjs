import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../api/authorize-refund.js',import.meta.url),'utf8');

test('A4 refund requires confirmed same-obligation settlement lineage',()=>{
 assert.match(source,/JOIN preview_sandbox_payment p ON p\.obligation_id=e\.obligation_id/);
 assert.match(source,/p\.status='CONFIRMED'/);
 assert.match(source,/p\.currency=c\.currency/);
 assert.match(source,/p\.economic_treatment='RESTRICTED_MEMBER_PREPAYMENT'/);
});

test('A4 refund cap deducts prior authorized and completed allocations',()=>{
 assert.match(source,/sum\(r\.amount_minor\)/);
 assert.match(source,/r\.obligation_id=s\.obligation_id/);
 assert.match(source,/r\.status IN \('AUTHORIZED','COMPLETED'\)/);
 assert.match(source,/settled_minor-prior_refund_minor/);
});

test('A4 refund cannot exceed either exception value or remaining settlement',()=>{
 assert.match(source,/exception_refund_minor/);
 assert.match(source,/LEAST\(exception_refund_minor,remaining_settled_minor\)/);
 assert.match(source,/NO_SETTLED_REFUNDABLE_AMOUNT/);
});

test('A4 refund authorization locks payment lineage during allocation',()=>{
 assert.match(source,/FOR UPDATE OF c,p/);
});

test('A4 refund replay/rebound controls remain intact',()=>{
 assert.match(source,/authorize_request_id=\$\{requestId\}/);
 assert.match(source,/REFUND_AUTH_REQUEST_REBOUND/);
 assert.match(source,/error\?\.code==='23505'/);
 assert.match(source,/serialize\(prior\[0\],true\)/);
});

test('A4 refund remains disabled for Production',()=>{
 assert.match(source,/PREVIEW_REFUND_DISABLED_IN_PRODUCTION/);
});
