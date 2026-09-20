import test from 'node:test';
import assert from 'node:assert/strict';
import applyHandler from '../../api/membership-apply.js';

function response(){const result={statusCode:null,body:null,headers:{}};return{result,setHeader(n,v){result.headers[String(n).toLowerCase()]=v;return this},status(c){result.statusCode=c;return this},json(b){result.body=b;return this}}}
function request(method,body={},headers={}){return{method,headers,body}}
function fakeSql({existingApplication=null}={}){const inserts=[];const sql=async(strings,...values)=>{const text=strings.join('?');if(text.includes('FROM membership_application'))return existingApplication?[existingApplication]:[];if(text.includes('INSERT INTO membership_application')){inserts.push({table:'membership_application',values});return []}throw new Error(`UNEXPECTED_QUERY: ${text}`)};sql.inserts=inserts;return sql}
const options=sql=>({env:{VERCEL_ENV:'preview'},sql});

test('membership-apply rejects non-POST methods',async()=>{const res=response();await applyHandler(request('GET'),res,{});assert.equal(res.result.statusCode,405)});
test('guest can apply with no Authorization header and no Google/OIDC token',async()=>{const sql=fakeSql(),res=response();await applyHandler(request('POST',{fullName:'Ama Mensah',email:'AMA@example.com',contactNote:' hello '}),res,options(sql));assert.equal(res.result.statusCode,201);assert.equal(res.result.body.ok,true);const insert=sql.inserts[0];assert.equal(insert.values[1],null);assert.equal(insert.values[2],null);assert.equal(insert.values[3],'Ama Mensah');assert.equal(insert.values[4],'ama@example.com');assert.equal(insert.values[7],'hello')});
test('Authorization header is irrelevant to enrollment authority',async()=>{const sql=fakeSql(),res=response();await applyHandler(request('POST',{fullName:'Kojo Doe',phone:'+233200000000'},{authorization:'Bearer not-a-google-token'}),res,options(sql));assert.equal(res.result.statusCode,201);assert.equal(sql.inserts.length,1)});
test('requires full name',async()=>{const res=response();await applyHandler(request('POST',{email:'a@example.com'}),res,options(fakeSql()));assert.equal(res.result.statusCode,400);assert.equal(res.result.body.error,'FULL_NAME_REQUIRED')});
test('requires email or phone',async()=>{const res=response();await applyHandler(request('POST',{fullName:'Ama Mensah'}),res,options(fakeSql()));assert.equal(res.result.statusCode,400);assert.equal(res.result.body.error,'EMAIL_OR_PHONE_REQUIRED')});
test('rejects malformed email',async()=>{const res=response();await applyHandler(request('POST',{fullName:'Ama Mensah',email:'bad'}),res,options(fakeSql()));assert.equal(res.result.statusCode,400);assert.equal(res.result.body.error,'EMAIL_INVALID')});
test('pending application is idempotent by supplied contact',async()=>{const sql=fakeSql({existingApplication:{application_id:'application:existing-1'}}),res=response();await applyHandler(request('POST',{fullName:'Ama Mensah',email:'ama@example.com'}),res,options(sql));assert.equal(res.result.statusCode,200);assert.equal(res.result.body.alreadySubmitted,true);assert.equal(sql.inserts.length,0)});
