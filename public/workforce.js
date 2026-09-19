(() => {
  let state={people:[],teams:[],assignments:[],tasks:[],domains:{},capabilities:{},selected:null,loading:false,error:null};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge=(text,kind='neutral')=>`<span class="badge ${kind}">${esc(text)}</span>`;
  const personId=p=>p.participantId||p.actorId||p.id||'';
  const personName=p=>p.displayName||p.name||p.email||personId(p);
  const selectedPerson=()=>state.people.find(p=>String(personId(p))===String(state.selected));

  async function api(path,init={}){
    const r=await fetch(path,{cache:'no-store',...init,headers:{Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}});
    const b=await r.json().catch(()=>({}));
    if(!r.ok||b.ok===false)throw new Error(b.error||`HTTP_${r.status}`);
    return b;
  }

  function normalizeDirectory(directory){
    const grants=(directory.grants||[]).filter(g=>!g.revokedAt&&(!g.validUntil||Date.parse(g.validUntil)>Date.now()));
    const ids=[...new Set(grants.map(g=>String(g.actorId)))];
    const people=ids.map(id=>({participantId:id,systemOwner:grants.some(g=>String(g.actorId)===id&&g.actions?.includes('authority:owner'))}));
    const assignments=grants.flatMap(g=>(g.actions||[]).map(action=>({participantId:String(g.actorId),action,state:'ACTIVE',grantId:g.grantId})));
    return {people,assignments};
  }

  async function load(){
    state.loading=true;state.error=null;render();
    try{
      const [directory,teams,tasks,domainData]=await Promise.all([
        api('/api/authority-directory'),
        api('/api/workforce-teams'),
        api('/api/workforce-tasks'),
        api('/api/workforce-domains')
      ]);
      const normalized=normalizeDirectory(directory);
      state.people=normalized.people;
      state.assignments=normalized.assignments;
      state.teams=teams.teams||[];
      state.tasks=tasks.tasks||[];
      state.domains=domainData.domains||{};
      state.capabilities=domainData.capabilities||{};
      if(!state.selected&&state.people[0])state.selected=personId(state.people[0]);
    }catch(e){state.error=e.message;}
    finally{state.loading=false;render();}
  }

  function effectiveCapabilities(p){const id=personId(p);return state.assignments.filter(a=>String(a.participantId||a.actorId)===String(id)&&a.state!=='REVOKED').map(a=>a.capability||a.action).filter(Boolean);}
  function renderPeople(){
    const q=($('workforce-search')?.value||'').toLowerCase();
    const rows=state.people.filter(p=>personName(p).toLowerCase().includes(q)||String(p.email||'').toLowerCase().includes(q));
    return rows.length?rows.map(p=>{const id=personId(p),active=String(id)===String(state.selected),caps=effectiveCapabilities(p);return `<button class="wf-person ${active?'active':''}" data-person="${esc(id)}"><span class="wf-avatar">${esc(personName(p).slice(0,2).toUpperCase())}</span><span><strong>${esc(personName(p))}</strong><small>${esc(p.email||id)}</small><small>${caps.length} capabilities · ${esc(p.status||p.state||'ACTIVE')}</small></span></button>`}).join(''):'<p class="employees-empty">No workforce records found.</p>';
  }

  function capabilityRows(p){
    const caps=new Set(effectiveCapabilities(p));
    const owner=Boolean(p?.systemOwner||caps.has('authority:owner'));
    const grouped={};
    Object.entries(state.capabilities).forEach(([action,meta])=>{const domain=meta.domain||'other';(grouped[domain]??=[]).push([action,meta]);});
    return Object.entries(grouped).map(([domain,items])=>`<article class="wf-domain"><header><strong>${esc(state.domains[domain]?.label||domain)}</strong></header><div class="wf-functions">${items.map(([action,meta])=>`<label><input type="checkbox" ${owner||caps.has(action)?'checked':''} disabled><span>${esc(meta.function||action)}</span></label>`).join('')}</div></article>`).join('');
  }

  function renderMatrix(p){
    if(!p)return '<div class="card"><p>Select an employee to inspect authority.</p></div>';
    const caps=new Set(effectiveCapabilities(p)),owner=Boolean(p.systemOwner||caps.has('authority:owner'));
    return `<div class="wf-matrix-head"><div><h3>${esc(personName(p))}</h3><p>${owner?'System Owner · all workforce domains by constitutional authority':'Effective authority is read from the governed authority directory. Changes use the Employees authority workflow.'}</p></div>${owner?badge('System Owner','warning'):badge(`${caps.size} capabilities`)}</div><div class="wf-domain-grid">${capabilityRows(p)}</div><div class="wf-actions"><button class="primary" id="wf-manage-authority" ${owner?'disabled':''}>Manage authority</button></div>`;
  }

  function taskAssigneeIds(t){
    const a=Array.isArray(t.assignments)?t.assignments:[];
    return a.flatMap(x=>[x.assignee_participant_id,x.assigneeParticipantId].filter(Boolean)).map(String);
  }
  function renderTasks(p){
    if(!p)return '';
    const id=String(personId(p)),tasks=state.tasks.filter(t=>taskAssigneeIds(t).includes(id));
    return `<div class="section-intro"><div><p class="eyebrow">Execution</p><h2>Assigned Tasks</h2></div><button class="primary" id="wf-new-task">Assign task</button></div><div class="timeline-card">${tasks.length?tasks.map(t=>`<div class="timeline-row"><span class="timeline-dot ${t.state==='DONE'?'done':''}"></span><div><strong>${esc(t.title||t.task_id||t.taskId)}</strong><p>${esc(t.domain||'')} · ${esc(t.required_capability||t.requiredCapability||'')}</p></div><time>${esc(t.state||'OPEN')}</time></div>`).join(''):'<div class="employees-empty">No tasks assigned.</div>'}</div>`;
  }

  function render(){
    const root=$('workforce-root');if(!root)return;
    if(state.loading){root.innerHTML='<div class="card">Loading workforce authority…</div>';return;}
    const p=selectedPerson();
    root.innerHTML=`${state.error?`<div class="result-box err">${esc(state.error)}</div>`:''}<div class="wf-toolbar"><div><p class="eyebrow">Governed workforce</p><h2>Authority Matrix</h2><p>Domain → Function → Capability → Assignment / Task</p></div><div class="roster-actions"><button class="secondary" id="wf-add-team">New team</button><button class="primary" id="wf-invite">Invite employee</button></div></div><div class="wf-layout"><aside class="wf-roster"><input id="workforce-search" class="wf-input" placeholder="Search employees…"><div id="wf-people">${renderPeople()}</div></aside><section class="wf-detail">${renderMatrix(p)}</section></div><div class="wf-task-section">${renderTasks(p)}</div>`;
    bind();
  }

  function bind(){
    document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.person;render();});
    $('workforce-search')?.addEventListener('input',()=>{$('wf-people').innerHTML=renderPeople();document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.person;render();});});
    $('wf-manage-authority')?.addEventListener('click',()=>{window.location.href='/employee';});
    $('wf-invite')?.addEventListener('click',()=>{window.location.href='/employee';});
    $('wf-add-team')?.addEventListener('click',createTeam);
    $('wf-new-task')?.addEventListener('click',assignTask);
  }

  async function createTeam(){
    const name=prompt('Team name');if(!name)return;
    const keys=Object.keys(state.domains);const domain=prompt(`Domain (${keys.join(', ')})`,keys[0]||'');if(!domain)return;
    try{await api('/api/workforce-teams',{method:'POST',body:JSON.stringify({name,domain,members:[]})});await load();}catch(e){alert(`Team creation failed: ${e.message}`);}
  }

  async function assignTask(){
    const p=selectedPerson();if(!p)return;
    const title=prompt('Task title');if(!title)return;
    const known=Object.keys(state.capabilities);const requiredCapability=prompt(`Required capability${known.length?` (for example ${known[0]})`:''}`);if(!requiredCapability)return;
    try{await api('/api/workforce-tasks',{method:'POST',body:JSON.stringify({title,assigneeParticipantId:personId(p),requiredCapability})});await load();}catch(e){alert(`Task assignment failed: ${e.message}`);}
  }

  window.addEventListener('foodclub:auth-state',e=>{if(e.detail?.superUserAccessAvailable===true)load();});
  window.refreshWorkforce=load;
})();