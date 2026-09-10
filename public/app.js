const titles={dashboard:'Member Overview',catalog:'Member Offers',orders:'My Orders',operator:'Operator Console',controls:'RC2 Control Status'};
function activate(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.getElementById('page-title').textContent=titles[id]||'Food Club Ghana';window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.go)));

async function refreshDatabaseHealth(){
  const badge=document.getElementById('db-status');
  const metric=document.getElementById('db-metric');
  try{
    const response=await fetch('/api/db-health',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json();
    if(response.ok&&data.ok===true){
      badge.textContent=`Neon connected · ${data.governedTableCount}/7`;
      badge.className='badge neutral';
      metric.textContent='Neon PostgreSQL · live';
      return;
    }
    throw new Error('degraded');
  }catch{
    badge.textContent='Neon unavailable';
    badge.className='badge danger';
    metric.textContent='Database unavailable';
  }
}
refreshDatabaseHealth();
setInterval(refreshDatabaseHealth,30000);
