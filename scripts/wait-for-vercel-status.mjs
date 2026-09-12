import assert from 'node:assert/strict';

const repo=process.env.GITHUB_REPOSITORY;
const sha=process.env.EXPECTED_COMMIT_SHA;
const token=process.env.GITHUB_TOKEN;
if(!repo)throw new Error('GITHUB_REPOSITORY required');
if(!sha)throw new Error('EXPECTED_COMMIT_SHA required');
if(!token)throw new Error('GITHUB_TOKEN required');

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const url=`https://api.github.com/repos/${repo}/commits/${sha}/statuses?per_page=100`;
let last=[];
for(let i=0;i<60;i++){
  const r=await fetch(url,{headers:{
    authorization:`Bearer ${token}`,
    accept:'application/vnd.github+json',
    'x-github-api-version':'2022-11-28',
    'user-agent':'workers-food-club-rc2-ci'
  }});
  assert.equal(r.status,200,`GitHub status lookup failed: ${r.status}`);
  last=await r.json();
  const vercel=last.find(s=>s.context==='Vercel');
  if(vercel?.state==='success'){
    console.log(JSON.stringify({ok:true,sha,context:vercel.context,state:vercel.state,targetUrl:vercel.target_url},null,2));
    process.exit(0);
  }
  if(vercel&&['failure','error'].includes(vercel.state)){
    throw new Error(`Vercel deployment status ${vercel.state} for ${sha}`);
  }
  await sleep(5000);
}
throw new Error(`Vercel status never reached success for ${sha}; last statuses=${JSON.stringify(last.map(s=>({context:s.context,state:s.state})))}`);
