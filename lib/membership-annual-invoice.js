import { randomUUID } from 'node:crypto';

export function annualFeeMinor(env=process.env,override){const n=Number(override??env.ANNUAL_MEMBERSHIP_FEE_MINOR);return Number.isSafeInteger(n)&&n>0?n:null;}
export function subscriptionYearAt(now=Date.now()){return new Date(now).getUTCFullYear();}
export function dueAtFor(now=Date.now()){return new Date(Number(now)+14*24*60*60*1000).toISOString();}

/** One authoritative annual invoice per membership + subscription year.
 * Membership identity must already exist. This service never creates or mutates Member Numbers.
 */
export async function ensureAnnualMembershipInvoice({sql,membershipId,publicMemberId,now=Date.now(),env=process.env,amountMinor,subscriptionYear,dueAt}){
 if(!sql)throw Object.assign(new Error('SQL_REQUIRED'),{code:'SQL_REQUIRED'});
 if(typeof membershipId!=='string'||!membershipId)throw Object.assign(new Error('MEMBERSHIP_ID_REQUIRED'),{code:'MEMBERSHIP_ID_REQUIRED'});
 if(typeof publicMemberId!=='string'||!publicMemberId)throw Object.assign(new Error('MEMBER_NUMBER_NOT_ISSUED'),{code:'MEMBER_NUMBER_NOT_ISSUED'});
 const amount=annualFeeMinor(env,amountMinor);if(amount===null)throw Object.assign(new Error('ANNUAL_MEMBERSHIP_FEE_NOT_CONFIGURED'),{code:'ANNUAL_MEMBERSHIP_FEE_NOT_CONFIGURED'});
 const year=subscriptionYear??subscriptionYearAt(now),due=dueAt??dueAtFor(now),candidate=`subscription-invoice:${randomUUID()}`;
 const rows=await sql`WITH member AS (SELECT membership_id,public_member_id,member_type FROM application_membership WHERE membership_id=${membershipId} AND public_member_id=${publicMemberId} LIMIT 1), inserted AS (INSERT INTO membership_subscription_invoice(invoice_id,membership_id,subscription_year,amount_minor,currency,state,due_at) SELECT ${candidate},membership_id,${year},${amount},'GHS','OPEN',${due} FROM member WHERE member_type='PRIMARY' ON CONFLICT (membership_id,subscription_year) DO NOTHING RETURNING invoice_id,membership_id,subscription_year,amount_minor,currency,state,due_at), authoritative AS (SELECT invoice_id,membership_id,subscription_year,amount_minor,currency,state,due_at,false AS existing FROM inserted UNION ALL SELECT i.invoice_id,i.membership_id,i.subscription_year,i.amount_minor,i.currency,i.state,i.due_at,true AS existing FROM membership_subscription_invoice i WHERE i.membership_id=${membershipId} AND i.subscription_year=${year} AND NOT EXISTS (SELECT 1 FROM inserted)) SELECT * FROM authoritative LIMIT 1`;
 if(rows.length!==1)throw Object.assign(new Error('ANNUAL_SUBSCRIPTION_INVOICE_NOT_CREATED'),{code:'ANNUAL_SUBSCRIPTION_INVOICE_NOT_CREATED'});
 const invoice=rows[0];if(String(invoice.membership_id)!==membershipId||Number(invoice.subscription_year)!==Number(year))throw Object.assign(new Error('ANNUAL_SUBSCRIPTION_INVOICE_INVARIANT'),{code:'ANNUAL_SUBSCRIPTION_INVOICE_INVARIANT'});
 return{invoiceId:String(invoice.invoice_id),membershipId,publicMemberId,subscriptionYear:Number(invoice.subscription_year),amountMinor:Number(invoice.amount_minor),currency:String(invoice.currency),state:String(invoice.state),dueAt:new Date(invoice.due_at).toISOString(),idempotent:Boolean(invoice.existing)};
}
