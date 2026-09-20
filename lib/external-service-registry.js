export const EXTERNAL_SERVICES=Object.freeze({
 payments:{label:'Payments',providers:{PAYSTACK:{label:'Paystack',fields:['publicKey','secretKey','webhookSecret'],required:['publicKey','secretKey','webhookSecret']}},activation:'SYSTEM_OWNER'},
 email:{label:'Email',providers:{MAILERLITE:{label:'MailerLite',fields:['apiKey','fromEmail','fromName'],required:['apiKey','fromEmail']}},activation:'ADMIN'},
 sms:{label:'Text / SMS',providers:{TWILIO:{label:'Twilio',fields:['accountSid','authToken','fromNumber'],required:['accountSid','authToken','fromNumber']}},activation:'ADMIN'},
 google_login:{label:'Optional Google member login',providers:{GOOGLE:{label:'Google',fields:['clientId','clientSecret'],required:['clientId','clientSecret']}},activation:'SYSTEM_OWNER'},
 database:{label:'Database',providers:{NEON:{label:'Neon PostgreSQL',fields:['databaseUrl'],required:['databaseUrl']}},activation:'SYSTEM_OWNER'},
 observability:{label:'Error monitoring / observability',providers:{GENERIC:{label:'Generic endpoint',fields:['dsn'],required:['dsn']}},activation:'ADMIN'}
});
export function publicRegistry(){return Object.fromEntries(Object.entries(EXTERNAL_SERVICES).map(([id,s])=>[id,{label:s.label,activation:s.activation,providers:Object.fromEntries(Object.entries(s.providers).map(([p,v])=>[p,{label:v.label,fields:v.fields}]))}]));}
export function validateServiceConfig(service,provider,credentials){const s=EXTERNAL_SERVICES[service],p=s?.providers?.[provider];if(!p)return{ok:false,error:'SERVICE_PROVIDER_INVALID'};const missing=p.required.filter(k=>typeof credentials?.[k]!=='string'||!credentials[k].trim());return missing.length?{ok:false,error:'REQUIRED_CREDENTIALS_MISSING',missing}:{ok:true};}
