import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity} from '../../dist/packages/kernel/src/index.js';
import {AuthorityEvaluator,InMemoryAuthorityStore} from '../../dist/packages/authority/src/index.js';
import {InMemoryRemedyLedger} from '../../dist/packages/remedy/src/index.js';
import {InMemoryObligationResolutionLedger} from '../../dist/packages/resolution/src/index.js';
import {GovernedPilotRemedyService} from '../../dist/packages/pilot-remedies/src/index.js';

const pid=x=>asId(x),oid=x=>asId(x),sid=x=>asId(x),gid=x=>asId(x),eid=x=>asId(x);
const at='2026-09-09T09:30:00Z';
const member=pid('participant:member');
const obligationId=oid('obligation:sw1-07');
const spec=sid('spec:rice');
const obligation={id:obligationId,participantId:member,specificationId:spec,quantity:quantity(5,'kg')};
const commitment={obligation:{id:obligationId,obligor:member,beneficiary:pid('participant:club'),specificationId:spec,quantity:quantity(5,'kg'),state:'OPEN'},participantId:member};

function setup(){
 const operator=pid('participant:finance-1'); const store=new InMemoryAuthorityStore(); const grant=gid('grant:remedy-1');
 store.put({id:grant,grantorId:pid('participant:club'),actorId:operator,actions:['remedy.substitution.propose','remedy.create','remedy.complete'],targetPrefix:'obligation:',validFrom:'2026-09-09T00:00:00Z',maxQuantity:5});
 const resolution=new InMemoryObligationResolutionLedger(); const remedies=new InMemoryRemedyLedger(resolution);
 const demand={getCommitment:id=>id===obligationId?commitment:undefined};
 const service=new GovernedPilotRemedyService(new AuthorityEvaluator(store),demand,remedies,resolution);
 remedies.recordException({id:'exception:shortfall',obligationId,participantId:member,kind:'SHORTFALL',affectedQuantity:quantity(2,'kg'),occurredAt:'2026-09-09T09:00:00Z',evidenceIds:[eid('e:shortfall')]},obligation);
 return {operator,grant,service,remedies,resolution};
}

const refund=()=>({id:'remedy:refund',sourceExceptionId:'exception:shortfall',originalObligationId:obligationId,participantId:member,kind:'REFUND',quantity:quantity(2,'kg'),createdAt:'2026-09-09T09:10:00Z',authorizedEventId:'event:refund-authorized',evidenceIds:[eid('e:refund-auth')],economicClassification:'REMEDY_SETTLEMENT'});

test('SW1-07 remedy creation requires bounded authority and canonical exception linkage',()=>{
 const {operator,grant,service}=setup();
 assert.throws(()=>service.createRemedy({actorId:operator,grantIds:[],at},refund()),/REMEDY_UNAUTHORIZED/);
 assert.throws(()=>service.createRemedy({actorId:operator,grantIds:[grant],at},{...refund(),sourceExceptionId:'exception:forged'}),/REMEDY_EXCEPTION_MISMATCH/);
 service.createRemedy({actorId:operator,grantIds:[grant],at},refund());
});

test('SW1-07 completion is evidence-backed, idempotent and conserves unresolved quantity',()=>{
 const {operator,grant,service}=setup(); service.createRemedy({actorId:operator,grantIds:[grant],at},refund());
 const completion={id:'completion:refund',remedyObligationId:'remedy:refund',quantity:quantity(2,'kg'),completedAt:'2026-09-09T09:20:00Z',evidenceIds:[eid('e:refund-settled')]};
 service.completeRemedy({actorId:operator,grantIds:[grant],at},completion);
 assert.equal(service.position(obligationId).remediedQuantity.amount,2);
 assert.equal(service.position(obligationId).unresolvedQuantity.amount,3);
 assert.throws(()=>service.completeRemedy({actorId:operator,grantIds:[grant],at},completion),/REMEDY_COMPLETION_ID_DUPLICATE/);
});

test('SW1-07 remedy quantity cannot exceed the recorded exception',()=>{
 const {operator,grant,service}=setup();
 assert.throws(()=>service.createRemedy({actorId:operator,grantIds:[grant],at},{...refund(),quantity:quantity(3,'kg')}),/REMEDY_OVERALLOCATION/);
});

test('SW1-07 replacement with substitution cannot bypass member consent',()=>{
 const {operator,grant,service}=setup();
 service.proposeSubstitution({actorId:operator,grantIds:[grant],at},{id:'sub:1',exceptionId:'exception:shortfall',obligationId,originalSpecificationId:spec,substituteSpecificationId:sid('spec:maize'),affectedQuantity:quantity(2,'kg'),equivalenceRuleVersion:'equiv:v1',equivalenceEvidenceIds:[eid('e:equiv')],consent:'PENDING',consentEvidenceIds:[],economicRecomputationEvidenceIds:[eid('e:recompute')],proposedAt:'2026-09-09T09:12:00Z'});
 assert.throws(()=>service.createRemedy({actorId:operator,grantIds:[grant],at},{...refund(),id:'remedy:replacement',kind:'REPLACEMENT',substitutionProposalId:'sub:1'}),/SUBSTITUTION_NOT_CONSENTED/);
});

test('SW1-07 future-dated remedy effects fail closed at the application boundary',()=>{
 const {operator,grant,service}=setup();
 assert.throws(()=>service.createRemedy({actorId:operator,grantIds:[grant],at},{...refund(),createdAt:'2026-09-10T00:00:00Z'}),/REMEDY_TIME_INVALID/);
});
