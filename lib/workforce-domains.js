export const WORKFORCE_DOMAINS=Object.freeze({
 FINANCE:{label:'Finance',functions:{payments:['finance:payments.reconcile'],cagd:['finance:cagd.enrollment.manage','finance:cagd.reconcile'],credit:['finance:credit.manage'],refunds:['operator:refund.authorize','operator:refund.complete'],reporting:['finance:reporting.view']}},
 LOGISTICS:{label:'Logistics',functions:{fulfillment:['operator:fulfillment.manage'],release:['operator:release.manage'],dispatch:['logistics:dispatch.manage'],delivery:['logistics:delivery.manage']}},
 OPERATIONS:{label:'Operations',functions:{orders:['operations:orders.manage'],demand:['operations:demand.manage'],exceptions:['operations:exceptions.manage']}},
 PROCUREMENT_INVENTORY:{label:'Procurement & Inventory',functions:{suppliers:['procurement:suppliers.manage'],rfq:['procurement:rfq.manage'],purchase_orders:['procurement:po.manage','procurement:po.approve'],catalog:['operator:catalog.manage'],inventory:['inventory:stock.manage','inventory:adjust.manage']}},
 ENGAGEMENT:{label:'Engagement: Surveys & Promotions',functions:{surveys:['engagement:surveys.manage'],promotions:['operator:promotions.manage'],rewards:['engagement:rewards.manage'],raffles:['engagement:raffles.manage']}},
 MEMBERSHIP_SUPPORT:{label:'Membership & Customer Support',functions:{applications:['membership:applications.manage'],standing:['membership:standing.manage'],household:['membership:household.manage'],support:['support:cases.manage']}},
 ADMIN_RISK_COMPLIANCE:{label:'Administration, Risk & Compliance',functions:{workforce:['authority:admin','workforce:assign.manage','workforce:tasks.manage'],audit:['risk:audit.view'],risk:['risk:exceptions.manage'],compliance:['compliance:evidence.manage']}}
});
export const WORKFORCE_CAPABILITIES=Object.freeze(Object.fromEntries(Object.entries(WORKFORCE_DOMAINS).flatMap(([domain,d])=>Object.entries(d.functions).flatMap(([fn,caps])=>caps.map(cap=>[cap,Object.freeze({domain,function:fn,label:d.label})])))));
export function isKnownWorkforceCapability(cap){return Object.hasOwn(WORKFORCE_CAPABILITIES,String(cap));}
export function capabilitiesForDomain(domain){const d=WORKFORCE_DOMAINS[String(domain)];return d?[...new Set(Object.values(d.functions).flat())]:[];}
