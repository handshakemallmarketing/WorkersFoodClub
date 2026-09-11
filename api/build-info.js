export default function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:true,
    environment:process.env.VERCEL_ENV||'unknown',
    commitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,
    branch:process.env.VERCEL_GIT_COMMIT_REF||null,
    deploymentUrl:process.env.VERCEL_URL||null,
    branchUrl:process.env.VERCEL_BRANCH_URL||null,
    deploymentId:process.env.VERCEL_DEPLOYMENT_ID||null
  });
}
