import test from 'node:test';
import assert from 'node:assert/strict';
import {asId,quantity,money} from '../../dist/packages/kernel/src/index.js';
import {InMemoryAuthorityStore,InMemoryConstraintStore,AuthorityEvaluator} from '../../dist/packages/authority/src/index.js';
import {CommandBus,DomainRejection,InMemoryCommandExecutionRegistry,InMemoryIdempotencyStore,InMemoryRejectionEvidenceSink} from '../../dist/packages/application/src/index.js';
import {InMemoryInventoryLedger} from '../../dist/packages/inventory/src/index.js';
import {InMemoryDemandCommitmentLedger} from '../../dist/packages/demand/src/index.js';

const pid=x=>asId(x), gid=x=>asId(x), xid=x=>asId(x), cid=x=>asId(x), oid=x=>asId(x), sid=x=>asId(x), ofid=x=>asId(x), eid=x=>asId(x);

test('SW0-07B allocation requires attributable evidence',()=>{
 const l=new InMemoryInventoryLedger();
 const lot={id:asId('lot:evidence'),specificationId:sid('spec:rice'),quantity:quantity(10,'kg')};
 l.receiveLot({lot,ownerId:pid('supplier'),custodianId:pid('club'),placeId:'warehouse:1',receivedAt:'2026-09-07T12:00:00Z',receiptEvidenceIds:[eid('ev:receipt')]});
 l.assessQuality({id:'qa:1',lotId:lot.id,state:'ACCEPTED',assessedAt:'2026-09-07T12:01:00Z',evidenceIds:[eid('ev:qa')]});
 const obligation={id:oid('obligation:evidence'),specificationId:lot.specificationId,quantity:quantity(5,'kg'),state:'OPEN'};
 assert.throws(()=>l.allocate({id:'allocation:no-evidence',lotId:lot.id,obligationId:obligation.id,specificationId:lot.specificationId,quantity:quantity(5,'kg'),allocatedAt:'2026-09-07T12:02:00Z',evidenceIds:[]},obligation),/ALLOCATION_EVIDENCE_REQUIRED/);
});

test('SW0-07B revoke and constraint release cannot silently move effective history',()=>{
 const grants=new InMemoryAuthorityStore(); const g=gid('grant:once');
 grants.put({id:g,grantorId:pid('board'),actorId:pid('operator'),actions:['AllocateLotQuantity'],validFrom:'2026-09-01T00:00:00Z'});
 grants.revoke(g,'2026-09-07T10:00:00Z');
 assert.throws(()=>grants.revoke(g,'2026-12-01T00:00:00Z'),/GRANT_ALREADY_REVOKED/);
 assert.equal(grants.get(g).revokedAt,'2026-09-07T10:00:00Z');
 const constraints=new InMemoryConstraintStore(); const x=xid('constraint:once');
 constraints.put({id:x,kind:'HOLD',reason:'inspection',activeFrom:'2026-09-01T00:00:00Z'});
 constraints.release(x,'2026-09-07T11:00:00Z');
 assert.throws(()=>constraints.release(x,'2026-12-01T00:00:00Z'),/CONSTRAINT_ALREADY_RELEASED/);
});

test('INV-027 expected domain rejection is evidence-backed and idempotently replayed',async()=>{
 const grants=new InMemoryAuthorityStore(); const actor=pid('operator'), g=gid('grant:domain');
 grants.put({id:g,grantorId:pid('board'),actorId:actor,actions:['AllocateLotQuantity'],validFrom:'2026-09-01T00:00:00Z'});
 const idem=new InMemoryIdempotencyStore(), sink=new InMemoryRejectionEvidenceSink(); let calls=0;
 const bus=new CommandBus(new AuthorityEvaluator(grants),{idempotencyStore:idem,rejectionEvidence:sink});
 bus.register({action:'AllocateLotQuantity',handle:()=>{calls++; throw new DomainRejection('LOT_NOT_ALLOCATABLE');}});
 const command={commandId:cid('command:domain'),idempotencyKey:'idem:domain',actorId:actor,action:'AllocateLotQuantity',authorityGrantIds:[g],evidenceIds:[],policyVersions:['policy:v1'],requestedAt:'2026-09-07T12:00:00Z',correlationId:'corr:domain',payload:{}};
 const a=await bus.execute(command), b=await bus.execute(command);
 assert.equal(a.status,'REJECTED'); assert.equal(a.reason,'LOT_NOT_ALLOCATABLE'); assert.equal(b.replayed,true); assert.equal(calls,1); assert.equal(sink.all().length,1);
});

test('unexpected handler failure is not laundered into permanent business rejection',async()=>{
 const grants=new InMemoryAuthorityStore(); const actor=pid('operator'), g=gid('grant:infra');
 grants.put({id:g,grantorId:pid('board'),actorId:actor,actions:['RecordPriceEvidence'],validFrom:'2026-09-01T00:00:00Z'});
 const idem=new InMemoryIdempotencyStore(), sink=new InMemoryRejectionEvidenceSink(); let calls=0;
 const bus=new CommandBus(new AuthorityEvaluator(grants),{idempotencyStore:idem,rejectionEvidence:sink});
 bus.register({action:'RecordPriceEvidence',handle:()=>{calls++; throw new Error('DATABASE_UNAVAILABLE');}});
 const command={commandId:cid('command:infra'),idempotencyKey:'idem:infra',actorId:actor,action:'RecordPriceEvidence',authorityGrantIds:[g],evidenceIds:[],policyVersions:['policy:v1'],requestedAt:'2026-09-07T12:00:00Z',correlationId:'corr:infra',payload:{}};
 await assert.rejects(()=>bus.execute(command),/DATABASE_UNAVAILABLE/); await assert.rejects(()=>bus.execute(command),/DATABASE_UNAVAILABLE/);
 assert.equal(calls,2); assert.equal(sink.all().length,0);
});

test('INV-004 commitment verifies a real ACCEPTED command and resulting event',async()=>{
 const grants=new InMemoryAuthorityStore(); const actor=pid('member'), g=gid('grant:checkout');
 grants.put({id:g,grantorId:pid('club'),actorId:actor,actions:['AcceptMemberPurchase'],validFrom:'2026-09-01T00:00:00Z'});
 const registry=new InMemoryCommandExecutionRegistry();
 const bus=new CommandBus(new AuthorityEvaluator(grants),{executionRegistry:registry});
 bus.register({action:'AcceptMemberPurchase',handle:()=>['event:purchase-accepted']});
 const command={commandId:cid('command:checkout'),idempotencyKey:'idem:checkout',actorId:actor,action:'AcceptMemberPurchase',authorityGrantIds:[g],evidenceIds:[],policyVersions:['checkout:v1'],requestedAt:'2026-09-07T10:00:00Z',correlationId:'corr:checkout',payload:{}};
 assert.equal((await bus.execute(command)).status,'ACCEPTED');
 const member={id:'membership:1',participantId:actor,state:'ACTIVE',establishedAt:'2026-09-01T00:00:00Z',eligibilityPolicyVersion:'worker-v1',eligibilityEvidenceIds:[eid('ev:member')]};
 const offer={id:ofid('offer:rice'),offerorId:pid('club'),specificationId:sid('spec:rice'),quantity:quantity(5,'kg'),memberPrice:money(5000n,'GHS'),priceBasis:quantity(5,'kg'),pickupPlace:'pickup:1',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-09-30T00:00:00Z',priceEvidenceIds:[eid('ev:price')],policyVersions:['price:v1']};
 const ledger=new InMemoryDemandCommitmentLedger(registry);
 const record=await ledger.commitPurchase({obligationId:oid('obligation:verified'),participantId:actor,membership:member,offer,quantity:quantity(5,'kg'),authorizedCommandId:command.commandId,authorizedEventId:'event:purchase-accepted',acceptedAt:'2026-09-07T10:00:01Z',policyVersions:['checkout:v1']});
 assert.equal(record.obligation.state,'OPEN');
 await assert.rejects(()=>ledger.commitPurchase({...record,obligationId:oid('obligation:forged'),participantId:actor,membership:member,offer,quantity:quantity(5,'kg'),authorizedCommandId:command.commandId,authorizedEventId:'event:forged',acceptedAt:'2026-09-07T10:00:01Z',policyVersions:['checkout:v1']}),/AUTHORIZED_COMMITMENT_NOT_VERIFIED/);
});
