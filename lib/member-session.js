import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
const VERSION='wfc-member-v1';export const MEMBER_SESSION_TTL_SECONDS=12*60*60;
const sign=(secret,id)=>createHmac('sha256',secret).update(`${VERSION}.${id}`).digest('base64url');
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
export const generateMemberSessionId=()=>randomUUID();
export function signMemberSessionToken(secret,id){return `${VERSION}.${id}.${sign(secret,id)}`;}
export function verifyMemberSessionTokenShape(secret,token){if(typeof secret!=='string'||secret.length<32||typeof token!=='string')return null;const p=token.split('.');if(p.length!==3||p[0]!==VERSION||!p[1]||!equal(p[2],sign(secret,p[1])))return null;return p[1];}
export function extractMemberSessionToken(req){const h=req?.headers?.authorization;if(typeof h==='string'&&h.startsWith('Member '))return h.slice(7);const x=req?.headers?.['x-member-session'];return typeof x==='string'?x:null;}
