const titles={dashboard:'Member Overview',catalog:'Member Offers',orders:'My Orders',operator:'Operator Console',controls:'RC2 Control Status'};
function activate(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.getElementById('page-title').textContent=titles[id]||'Food Club Ghana';window.scrollTo({top:0,behavior:'smooth'});if(id==='orders')refreshOrders();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.go)));

function escapeHtml(value){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function formatPrice(offer){if(offer.priceMinor===null||offer.currency===null)return 'Coming soon';return `${escapeHtml(offer.currency)} ${(offer.priceMinor/100).toFixed(2)}`;}
function formatOrderPrice(order){return `${escapeHtml(order.currency)} ${(order.committedPriceMinor/100).toFixed(2)}`;}
function makeRequestId(){return crypto.randomUUID();}

function renderOffers(offers){
  const grid=document.getElementById('offer-grid');
  const source=document.getElementById('offers-source');
  if(!Array.isArray(offers)||offers.length===0){grid.innerHTML='<article class="offer-card muted"><div class="offer-icon">—</div><div><h3>No offers available</h3><p>No staging offers are open at this time.</p></div><button class="secondary small" disabled>Unavailable</button></article>';source.textContent='Neon · 0 offers';return;}
  grid.innerHTML=offers.map((offer)=>{
    const open=offer.status==='OPEN';
    const icon=(offer.name||'?').trim().charAt(0).toUpperCase();
    const fulfillment=offer.fulfillmentMethod==='PICKUP'?'pickup fulfillment':'delivery fulfillment';
    const state=open?'Open in staging':offer.status==='COMING_SOON'?'Not open':'Closed';
    return `<article class="offer-card${open?'':' muted'}"><div class="offer-icon">${escapeHtml(icon)}</div><div><h3>${escapeHtml(offer.name)}</h3><p>${escapeHtml(offer.description)} · ${escapeHtml(fulfillment)}</p><div class="offer-meta"><strong>${formatPrice(offer)}</strong><span>${escapeHtml(state)}</span></div></div><button class="${open?'primary':'secondary'} small" ${open?`data-commit-offer="${escapeHtml(offer.offerId)}"`:'disabled'}>${open?'Commit in sandbox':'Unavailable'}</button></article>`;
  }).join('');
  source.textContent=`Neon live · ${offers.length} offer${offers.length===1?'':'s'}`;
}

async function refreshOffers(){
  const source=document.getElementById('offers-source');
  try{
    const response=await fetch('/api/member-offers',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data.ok!==true)throw new Error('offers unavailable');
    source.className='badge neutral';
    renderOffers(data.offers);
  }catch{
    source.textContent='Neon offers unavailable';source.className='badge danger';
    document.getElementById('offer-grid').innerHTML='<article class="offer-card muted"><div class="offer-icon">!</div><div><h3>Offers unavailable</h3><p>The staging catalog could not be read from Neon.</p></div><button class="secondary small" disabled>Retry after refresh</button></article>';
  }
}

function renderOrders(orders){
  const list=document.getElementById('orders-list');
  const source=document.getElementById('orders-source');
  source.textContent=`Neon live · ${orders.length} order${orders.length===1?'':'s'}`;source.className='badge neutral';
  if(!orders.length){list.innerHTML='<div class="timeline-row"><span class="timeline-dot"></span><div><strong>No sandbox commitments yet</strong><p>Choose an open member offer and commit in sandbox.</p></div><time>Staging</time></div>';return;}
  list.innerHTML=orders.map(order=>`<div class="timeline-row"><span class="timeline-dot done"></span><div><strong>${escapeHtml(order.offerName)} · ${escapeHtml(order.state)}</strong><p>${escapeHtml(order.quantity)} ${escapeHtml(order.unit)} · ${formatOrderPrice(order)} · ${escapeHtml(order.fulfillmentMethod.toLowerCase())}</p><p class="order-evidence">Canonical event: ${escapeHtml(order.canonicalEventId)} · ${escapeHtml(order.policyVersion)}</p></div><time>${new Date(order.acceptedAt).toLocaleString()}</time></div>`).join('');
}

async function refreshOrders(){
  const source=document.getElementById('orders-source');
  try{
    const response=await fetch('/api/member-orders',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data.ok!==true)throw new Error('orders unavailable');
    renderOrders(data.orders);
  }catch{
    source.textContent='Neon orders unavailable';source.className='badge danger';
    document.getElementById('orders-list').innerHTML='<div class="timeline-row"><span class="timeline-dot"></span><div><strong>Orders unavailable</strong><p>The staging order projection could not be read from Neon.</p></div><time>Retry</time></div>';
  }
}

async function commitSandbox(offerId,button){
  const original=button.textContent;button.disabled=true;button.textContent='Committing…';
  try{
    const response=await fetch('/api/commit-sandbox',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({offerId,requestId:makeRequestId()})});
    const data=await response.json();
    if(!response.ok||data.ok!==true)throw new Error(data.error||'commit failed');
    button.textContent=data.commitment.idempotent?'Already committed':'Committed ✓';
    await refreshOrders();activate('orders');
  }catch(error){
    button.disabled=false;button.textContent=original;alert(`Sandbox commitment failed: ${error.message}`);
  }
}

document.getElementById('offer-grid').addEventListener('click',(event)=>{const button=event.target.closest('[data-commit-offer]');if(button)commitSandbox(button.dataset.commitOffer,button);});

async function refreshDatabaseHealth(){
  const badge=document.getElementById('db-status');const metric=document.getElementById('db-metric');
  try{
    const response=await fetch('/api/db-health',{headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();
    if(response.ok&&data.ok===true){badge.textContent=`Neon connected · ${data.governedTableCount}/7`;badge.className='badge neutral';metric.textContent='Neon PostgreSQL · live';return;}
    throw new Error('degraded');
  }catch{badge.textContent='Neon unavailable';badge.className='badge danger';metric.textContent='Database unavailable';}
}
refreshDatabaseHealth();refreshOffers();refreshOrders();
setInterval(refreshDatabaseHealth,30000);setInterval(refreshOffers,30000);setInterval(refreshOrders,30000);
