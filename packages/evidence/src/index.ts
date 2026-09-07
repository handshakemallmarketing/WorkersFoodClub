import type {CanonicalEvent,Evidence,EvidenceId,EventId,LineageEdge} from '../../kernel/src/index.js';
export class EvidenceLedger {
 private evidence=new Map<EvidenceId,Evidence>(); private events=new Map<EventId,CanonicalEvent>(); private lineage:LineageEdge[]=[];
 appendEvidence(e:Evidence){ if(this.evidence.has(e.id)) throw new Error('EVIDENCE_ID_DUPLICATE'); this.evidence.set(e.id,Object.freeze({...e})); if(e.supersedes) this.lineage.push({fromId:e.supersedes,toId:e.id,kind:'CORRECTS'}); }
 appendEvent(e:CanonicalEvent){ if(this.events.has(e.id)) throw new Error('EVENT_ID_DUPLICATE'); this.events.set(e.id,Object.freeze({...e})); }
 getEvidence(id:EvidenceId){ return this.evidence.get(id); }
 getEvent(id:EventId){ return this.events.get(id); }
 lineageEdges(){ return [...this.lineage]; }
}
