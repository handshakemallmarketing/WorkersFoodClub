(() => {
  const upstream = window.fetch.bind(window);
  const protectedPaths = new Set(['/api/member-orders', '/api/member-notifications', '/api/commit-sandbox', '/api/pay-sandbox', '/api/accept-fulfillment']);
  const remediationPaths = new Set(['/api/membership-status']);
  let token = null;
  let memberAccess = false;
  let status = null;
  const el = id => document.getElementById(id);
  function pathOf(input) { try { const u = typeof input === 'string' ? new URL(input, location.origin) : input instanceof Request ? new URL(input.url) : null; return u?.origin === location.origin ? u.pathname : ''; } catch { return ''; } }
  window.fetch = (input, init = {}) => {
    const path = pathOf(input);
    if (!(token && ((memberAccess && protectedPaths.has(path)) || remediationPaths.has(path)))) return upstream(input, init);
    const headers = new Headers(init.headers || {}); headers.set('Authorization', `Bearer ${token}`); return upstream(input, { ...init, headers });
  };
  function emit() {
    const authenticated = Boolean(token);
    document.body.dataset.authState = authenticated ? 'verified' : 'anonymous';
    document.body.dataset.memberAccess = memberAccess ? 'enabled' : 'disabled';
    window.dispatchEvent(new CustomEvent('foodclub:auth-state', { detail: { identityVerified: authenticated, memberAccessAvailable: memberAccess, operatorAccessAvailable: false, superUserAccessAvailable: false, accessState: status?.accessState || null, route: status?.route || null, invoice: status?.invoice || null, authenticationMethod: authenticated ? 'WFC_MEMBER_SESSION' : null } }));
    const label = el('auth-chip-label'), chip = el('auth-chip');
    if (label) label.textContent = memberAccess ? 'Member' : authenticated ? 'Membership payment required' : 'Member sign in';
    if (chip) chip.className = authenticated ? 'auth-chip signed-in' : 'auth-chip';
  }
  function close() { const modal = el('auth-modal'); if (modal) modal.hidden = true; document.querySelectorAll('.app-shell').forEach(node => { node.inert = false; }); }
  function open() { const modal = el('auth-modal'); if (!modal) return; modal.hidden = false; document.querySelectorAll('.app-shell').forEach(node => { node.inert = true; }); render(); }
  function signOut() { token = null; memberAccess = false; status = null; emit(); render(); }
  async function check() {
    const response = await upstream('/api/membership-status', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = await response.json().catch(() => null); if (!response.ok || body?.ok !== true) throw new Error(body?.error || 'MEMBERSHIP_STATUS_FAILED');
    status = body; memberAccess = body.memberAccessAvailable === true; emit(); if (memberAccess) close(); else render();
  }
  async function begin(memberId, body) {
    const response = await upstream('/api/member-auth-challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, channel: 'PHONE' }) });
    const challenge = await response.json().catch(() => null); if (!response.ok) throw new Error(challenge?.error || 'CHALLENGE_FAILED'); renderCode(challenge, body);
  }
  async function verify(challengeId, code) {
    const response = await upstream('/api/member-auth-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, code }) });
    const body = await response.json().catch(() => null); if (!response.ok || !body?.sessionToken) throw new Error(body?.error || 'VERIFY_FAILED'); token = body.sessionToken; await check();
  }
  function renderCode(challenge, body) {
    body.innerHTML = ''; const message = document.createElement('p'); message.textContent = 'Enter the 6-digit code sent to your registered phone.';
    const input = document.createElement('input'); input.inputMode = 'numeric'; input.autocomplete = 'one-time-code'; input.maxLength = 6; input.placeholder = '6-digit code';
    const button = document.createElement('button'); button.className = 'primary'; button.textContent = 'Verify and sign in';
    button.onclick = async () => { button.disabled = true; try { await verify(challenge.challengeId, input.value); } catch { message.textContent = 'Verification failed. Check the code and try again.'; } finally { button.disabled = false; } };
    body.append(message, input, button); if (challenge.previewCode) { const hint = document.createElement('code'); hint.textContent = `Preview code: ${challenge.previewCode}`; body.appendChild(hint); }
  }
  function recovery(body, subtitle) {
    body.innerHTML = ''; subtitle.textContent = 'Recover your permanent Member Number using the phone supplied with your membership.';
    const contact = document.createElement('input'); contact.placeholder = 'Registered phone number'; contact.autocomplete = 'tel';
    const send = document.createElement('button'); send.className = 'primary'; send.textContent = 'Send recovery code'; const message = document.createElement('p');
    send.onclick = async () => { send.disabled = true; try { const response = await upstream('/api/member-number-recovery-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: contact.value, channel: 'PHONE' }) }); const result = await response.json().catch(() => null); message.textContent = result?.message || 'If this phone is associated with a membership, a verification code will be sent.'; if (result?.challengeId) recoveryCode(body, subtitle, result); } catch { message.textContent = 'Recovery is temporarily unavailable.'; } finally { send.disabled = false; } };
    const back = document.createElement('button'); back.className = 'secondary'; back.textContent = 'Back to sign in'; back.onclick = render; body.append(contact, send, message, back);
  }
  function recoveryCode(body, subtitle, challenge) {
    body.innerHTML = ''; subtitle.textContent = 'Verify your phone to reveal your Member Number.';
    const input = document.createElement('input'); input.placeholder = '6-digit code'; input.inputMode = 'numeric'; input.maxLength = 6; input.autocomplete = 'one-time-code';
    const message = document.createElement('p'), button = document.createElement('button'); button.className = 'primary'; button.textContent = 'Verify and recover Member Number';
    button.onclick = async () => { button.disabled = true; try { const response = await upstream('/api/member-number-recovery-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: challenge.challengeId, code: input.value }) }); const result = await response.json().catch(() => null); if (!response.ok || !result?.publicMemberId) throw new Error(); body.innerHTML = ''; subtitle.textContent = 'Member Number recovered.'; const paragraph = document.createElement('p'); paragraph.textContent = `Your Member Number is ${result.publicMemberId}.`; const go = document.createElement('button'); go.className = 'primary'; go.textContent = 'Continue to sign in'; go.onclick = () => { const url = new URL(location.href); url.searchParams.set('memberId', result.publicMemberId); history.replaceState(null, '', url.pathname + url.search); render(); }; body.append(paragraph, go); } catch { message.textContent = 'Verification failed. Check the code and try again.'; } finally { button.disabled = false; } };
    body.append(input, button, message); if (challenge.previewCode) { const hint = document.createElement('code'); hint.textContent = `Preview code: ${challenge.previewCode}`; body.appendChild(hint); }
  }
  async function paySandbox(invoiceId, message, button) {
    button.disabled = true;
    try {
      const response = await upstream('/api/membership-subscription-pay-sandbox', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ invoiceId }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'SANDBOX_PAYMENT_FAILED');
      message.textContent = 'Sandbox payment simulated. Refreshing membership status…'; await check();
    } catch (error) { message.textContent = `Sandbox payment failed: ${error.message}`; button.disabled = false; }
  }
  function renderRestricted(body, title, subtitle) {
    title.textContent = 'Membership payment required'; subtitle.textContent = 'Your phone is verified, but member-area access remains disabled until the annual membership invoice is settled.';
    const invoiceId = status?.invoice?.invoiceId || null;
    const invoice = document.createElement('p'); invoice.textContent = `Annual membership invoice: ${invoiceId || 'pending invoice'}.`;
    const unavailable = document.createElement('p'); unavailable.textContent = 'Online subscription payment is not yet certified. No payment has been taken.';
    const out = document.createElement('button'); out.className = 'secondary'; out.textContent = 'Sign out'; out.onclick = signOut; body.append(invoice, unavailable);
    if (status?.sandboxPaymentAvailable === true && invoiceId) {
      const message = document.createElement('p');
      const pay = document.createElement('button'); pay.className = 'primary'; pay.textContent = 'Pay now (sandbox)';
      pay.onclick = () => paySandbox(invoiceId, message, pay);
      body.append(pay, message);
    }
    body.append(out);
  }
  function render() {
    const body = el('auth-modal-body'), title = el('auth-modal-title'), subtitle = el('auth-modal-subtitle'); if (!body || !title || !subtitle) return; body.innerHTML = '';
    if (token && !memberAccess) return renderRestricted(body, title, subtitle);
    title.textContent = 'Member sign in';
    if (memberAccess) { subtitle.textContent = 'You are signed in with your WorkersFoodClub member session.'; const out = document.createElement('button'); out.className = 'secondary'; out.textContent = 'Sign out'; out.onclick = signOut; body.appendChild(out); return; }
    subtitle.textContent = 'Use your WorkersFoodClub Member Number and registered phone. Google is not required.';
    const member = document.createElement('input'); member.placeholder = 'Member Number'; member.autocomplete = 'username'; const requested = new URLSearchParams(location.search).get('memberId'); if (requested) member.value = requested;
    const go = document.createElement('button'); go.className = 'primary'; go.textContent = 'Send phone verification code'; go.onclick = async () => { go.disabled = true; try { await begin(member.value, body); } catch { subtitle.textContent = 'We could not start phone verification. Check your Member Number and registered phone.'; } finally { go.disabled = false; } };
    const forgot = document.createElement('button'); forgot.className = 'secondary'; forgot.textContent = 'Forgot your Member Number?'; forgot.onclick = () => recovery(body, subtitle); body.append(member, go, forgot);
    const join = document.createElement('a'); join.href = '/join'; join.textContent = 'Not a member? Join Food Club'; body.appendChild(join);
  }
  function init() { el('auth-chip')?.addEventListener('click', open); el('auth-modal-close')?.addEventListener('click', close); el('auth-modal')?.addEventListener('click', event => { if (event.target === el('auth-modal')) close(); }); emit(); const query = new URLSearchParams(location.search); if (query.get('auth') === 'member') { open(); if (history.replaceState) { const clean = new URL(location.href); clean.searchParams.delete('auth'); history.replaceState(null, '', clean.pathname + clean.search + clean.hash); } } }
  window.FoodClubAuth = Object.freeze({ get hasToken() { return Boolean(token); }, get mode() { return 'WFC_MEMBER_SESSION'; }, get memberAccessAvailable() { return memberAccess; }, get operatorAccessAvailable() { return false; }, get superUserAccessAvailable() { return false; }, signOut });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
