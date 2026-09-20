(() => {
  const INTERNAL_COPY = new Map([
    ['Neon offers unavailable','Offers unavailable'],['Neon orders unavailable','Orders unavailable'],['Neon staging state could not be read.','The fulfillment queue could not be loaded.'],['The staging catalog could not be read from Neon.','Offers are temporarily unavailable. Try again shortly.'],['The staging order projection could not be read from Neon.','Your orders are temporarily unavailable. Try again shortly.'],['Neon connected · 7/7','Service available'],['Neon PostgreSQL · live','Service available'],['Loading Neon data…','Loading…'],['Checking Neon…','Checking service…'],['Bounded production access','Access controlled'],['Bounded pilot environment','Preview environment'],['Pilot cohort','Food Club Ghana'],['Current pilot offers','Available offers'],['Pilot operations','Employee operations'],['RC2 Control Status','Release governance'],['Current Control Status','Release governance'],['SuperUser Preview','Governance Preview'],['Operator Preview','Employee Preview'],['Public Preview','Guest'],['Guest Preview','Guest'],['Member Preview','Member']
  ]);
  let employeeJourneyEntered = false;
  let lastAuth = null;

  function normalizeText(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{const t=n.nodeValue?.trim();if(INTERNAL_COPY.has(t))n.nodeValue=n.nodeValue.replace(t,INTERNAL_COPY.get(t));});
    document.querySelectorAll('[id$="-source"],#db-status').forEach(el=>{
      el.textContent=el.textContent.replace(/^Neon live · /,'').replace(/^Neon /,'').replace(/staging/gi,'service');
    });
  }
  function ensureEmployeeEntry(show){
    const nav=document.querySelector('.sidebar nav');if(!nav)return;let link=document.getElementById('employee-access-link');
    if(!link){link=document.createElement('a');link.id='employee-access-link';link.href='/employee';link.className='nav-item';link.textContent='Employee Access';link.style.textDecoration='none';nav.appendChild(link);}
    link.hidden=!show;
  }
  function enforcePreviewModal(){
    const modal=document.getElementById('auth-modal');if(!modal||modal.hidden)return;
    const subtitle=document.getElementById('auth-modal-subtitle');
    if(lastAuth?.environment!=='production'){
      if(subtitle)subtitle.textContent='Preview member access only. Employee and governance authority use the separate Employee Access boundary.';
      document.querySelectorAll('#auth-modal .role-card').forEach(card=>{const text=card.textContent||'';if(!/Member/.test(text))card.remove();});
      const eyebrow=[...document.querySelectorAll('#auth-modal .eyebrow')].find(x=>x.textContent==='Explore demo roles');if(eyebrow)eyebrow.textContent='Preview member';
    }
  }
  function applyAuth(detail){
    lastAuth=detail||{};const member=detail?.memberAccessAvailable===true;ensureEmployeeEntry(member);
    const audience=document.getElementById('audience-label');if(audience)audience.textContent=member?'Member':'Guest';
    const title=document.getElementById('page-title');const active=document.querySelector('.view.active')?.id;
    if(title&&active==='dashboard')title.textContent=member?'Member Home':'Food Club Ghana';
    // Main member shell never exposes workforce authority. The dedicated employee
    // journey owns the second authentication boundary.
    document.querySelectorAll('[data-view="operator"],[data-view="workforce"],[data-view="controls"]').forEach(el=>{el.hidden=true;});
    document.body.dataset.employeeJourney=employeeJourneyEntered?'entered':'not-entered';normalizeText();
  }
  window.addEventListener('foodclub:auth-state',e=>applyAuth(e.detail));
  const observer=new MutationObserver(()=>{normalizeText();enforcePreviewModal();if(lastAuth)applyAuth(lastAuth);});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target?.closest('#employee-access-link'))employeeJourneyEntered=true;queueMicrotask(enforcePreviewModal);});
  normalizeText();
})();
