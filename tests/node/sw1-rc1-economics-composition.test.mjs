import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemoryEconomicsLedger} from '../../dist/packages/economics/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {GovernedMemberEconomicsService} from '../../dist/packages/pilot-member-economics/src/index.js';

test('SW1-RC1 member economics rejects remedies backed by a different resolution store',()=>{
 const economicsResolution=new InMemoryObligationResolutionLedger();
 const remedyResolution=new InMemoryObligationResolutionLedger();
 const remedies=new InMemoryRemedyLedger(remedyResolution);
 assert.throws(()=>new GovernedMemberEconomicsService({getCommitment:()=>undefined,paymentsFor:()=>[]},economicsResolution,new InMemoryEconomicsLedger(),remedies),/MEMBER_ECONOMICS_REMEDY_RESOLUTION_LEDGER_MISMATCH/);
});
