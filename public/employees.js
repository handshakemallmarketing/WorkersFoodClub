(() => {
  const ROLE_PRESETS = {
    admin: {
      label: 'Hierarchy Admin',
      actions: ['authority:admin'],
      description: 'Can invite and revoke Operator and Admin authority. Only an Owner can grant this — never shown to an Admin inviter.',
      ownerOnly: true,
    },
    operationsAdmin: {
      label: 'Operations SuperUser',
      actions: [
        'operator:fulfillment.manage',
        'operator:refund.authorize',
        'operator:refund.complete',
        'operator:orders.read',
        'operator:support.manage',
        'operator:release.manage',
      ],
      description: 'Full Operator Console access, including Release Controls visibility.',
    },
    fulfillment: {
      label: 'Fulfillment operator',
      actions: ['operator:fulfillment.manage', 'operator:orders.read'],
      description: 'Mark member orders ready for pickup.',
    },
    finance: {
      label: 'Finance operator',
      actions: ['operator:refund.authorize', 'operator:refund.complete', 'operator:orders.read'],
      description: 'Authorize and complete member refunds.',
    },
  };

  const ERROR_EXPLANATIONS = {
    AUTHORITY_DIRECTORY_REQUIRES_OWNER_OR_ADMIN: "You're signed in, but this Google account doesn't hold Owner or Admin authority.",
    AUTHORITY_INVITE_STEP_UP_NOT_FRESH: 'Your Google sign-in was a few seconds too old by the time the request reached the server. Click "Sign in with Google" again immediately.',
    AUTHORITY_REVOKE_STEP_UP_NOT_FRESH: 'Your Google sign-in was a few seconds too old by the time the request reached the server. Click "Sign in with Google" again immediately.',
    AUTHORITY_INVITE_CANCEL_STEP_UP_NOT_FRESH: 'Your Google sign-in was a few seconds too old by the time the request reached the server. Click "Sign in with Google" again immediately.',
    EMPLOYEE_STEP_UP_NOT_FRESH: 'Your Google sign-in was a few seconds too old. Click "Sign in with Google" again immediately.',
    APPLICATION_IDENTITY_NOT_BOUND: 'This Google account has no application identity bound to it yet.',
    APPLICATION_PRINCIPAL_DISABLED: 'This identity has been disabled. Contact whoever manages this deployment.',
    NO_ACTIVE_EMPLOYEE_GRANT: "This Google account doesn't hold any active authority grant.",
    PRODUCTION_APPLICATION_ACCESS_DISABLED: 'Production application access is currently switched off.',
    SELF_GRANT_FORBIDDEN: "You can't invite yourself.",
    ONLY_OWNER_MAY_GRANT_ADMIN: 'Only an Owner can grant Admin authority.',
    OPERATOR_GRANT_REQUIRES_ADMIN_OR_OWNER: 'Your own authority no longer qualifies you to grant this.',
    ONLY_OWNER_MAY_REVOKE_OWNER: 'Only an Owner can revoke an Owner grant.',
    ONLY_OWNER_MAY_REVOKE_ADMIN: 'Only an Owner can revoke an Admin grant.',
    OPERATOR_REVOCATION_REQUIRES_ADMIN_OR_OWNER: 'Your own authority no longer qualifies you to revoke this.',
    OWNER_SELF_REVOCATION_REQUIRES_SUCCESSION: 'An Owner cannot revoke their own Owner grant directly — that requires a separate succession process.',
    LAST_OWNER_PROTECTED: 'This is the last active Owner grant in the system and cannot be revoked.',
    ONLY_INVITER_OR_OWNER_MAY_CANCEL: 'Only the person who sent this invitation, or an Owner, can cancel it.',
    INVITATION_NOT_CANCELLABLE: 'This invitation has already been accepted, expired, or cancelled.',
  };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
  function shortId(value) { const s = String(value); return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-10)}` : s; }

  class ApiError extends Error {}

  let config = null;
  let googleReady = false;
  let pendingAction = { type: 'verify' };
  let directory = null;
  let selectedRoleKey = null;

  function setGateStatus(text, tone) {
    const node = el('employees-gate-status');
    if (!node) return;
    node.textContent = text || '';
    node.style.color = tone === 'err' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : '';
  }

  function showInviteResult(ok, html) {
    const node = el('employees-invite-result');
    if (!node) return;
    node.hidden = false;
    node.className = `result-box ${ok ? 'ok' : 'err'}`;
    node.innerHTML = html;
  }

  function friendlyError(error) {
    const code = error instanceof ApiError ? error.message : 'REQUEST_FAILED';
    const explanation = ERROR_EXPLANATIONS[code];
    return explanation ? `${explanation} (${code})` : `Something went wrong: ${code}`;
  }

  function renderRoleGrid(tier) {
    const grid = el('employees-role-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const availablePresets = Object.entries(ROLE_PRESETS).filter(([, preset]) => tier === 'OWNER' || !preset.ownerOnly);
    availablePresets.forEach(([key, preset]) => {
      const label = document.createElement('label');
      label.className = `role-card${key === selectedRoleKey ? ' picked' : ''}`;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'employees-role';
      input.value = key;
      input.checked = key === selectedRoleKey;
      input.addEventListener('change', () => {
        selectedRoleKey = key;
        grid.querySelectorAll('.role-card').forEach((card) => card.classList.remove('picked'));
        label.classList.add('picked');
      });
      const icon = document.createElement('span');
      icon.className = 'role-icon';
      icon.textContent = preset.label.charAt(0);
      const copy = document.createElement('span');
      copy.className = 'role-copy';
      const strong = document.createElement('strong');
      strong.textContent = preset.label;
      const span = document.createElement('span');
      span.textContent = preset.description;
      copy.append(strong, span);
      label.append(input, icon, copy);
      grid.appendChild(label);
    });
  }

  function renderSelfSummary(self) {
    const node = el('employees-self');
    if (!node) return;
    node.innerHTML = '';
    const icon = document.createElement('div');
    icon.className = 'role-icon';
    icon.textContent = self.tier.charAt(0);
    const copy = document.createElement('div');
    copy.className = 'role-copy';
    const strong = document.createElement('strong');
    strong.textContent = `Signed in as ${self.tier === 'OWNER' ? 'Owner' : 'Admin'}`;
    const code = document.createElement('code');
    code.textContent = self.participantId;
    copy.append(strong, code);
    node.append(icon, copy);
  }

  function grantRow(grant, self) {
    const isSelf = grant.actorId === self.participantId;
    const isActive = !grant.revokedAt && (!grant.validUntil || Date.parse(grant.validUntil) > Date.now());
    const canAttemptRevoke = isActive && !isSelf && (self.tier === 'OWNER' || grant.tier === 'OPERATOR');
    const statusText = grant.revokedAt ? `revoked ${new Date(grant.revokedAt).toLocaleString()}` : isActive ? 'active' : 'expired';
    const actionsLabel = escapeHtml(grant.actions.join(', '));
    return `<div class="timeline-row">
      <span class="timeline-dot${isActive ? ' done' : ''}"></span>
      <div>
        <strong>${escapeHtml(grant.tier)} · ${escapeHtml(shortId(grant.actorId))}${isSelf ? ' (you)' : ''}</strong>
        <p>${actionsLabel}</p>
        <p class="order-evidence">Granted by ${escapeHtml(shortId(grant.grantorId))} · ${statusText}</p>
        ${canAttemptRevoke ? `<div class="roster-actions"><button type="button" class="secondary small danger-btn" data-revoke-grant="${escapeHtml(grant.grantId)}">Revoke</button></div>` : ''}
      </div>
      <time>${new Date(grant.validFrom).toLocaleDateString()}</time>
    </div>`;
  }

  function invitationRow(invitation, self) {
    const canCancel = invitation.state === 'INVITED' && (invitation.inviterId === self.participantId || self.tier === 'OWNER');
    return `<div class="timeline-row">
      <span class="timeline-dot${invitation.state === 'INVITED' ? '' : ' done'}"></span>
      <div>
        <strong>${escapeHtml(invitation.actions.join(', '))} · ${escapeHtml(invitation.state)}</strong>
        <p>Invited by ${escapeHtml(shortId(invitation.inviterId))} · expires ${new Date(invitation.expiresAt).toLocaleString()}</p>
        ${canCancel ? `<div class="roster-actions"><button type="button" class="secondary small danger-btn" data-cancel-invitation="${escapeHtml(invitation.invitationId)}">Cancel</button></div>` : ''}
      </div>
      <time>${new Date(invitation.invitedAt).toLocaleDateString()}</time>
    </div>`;
  }

  function renderGrants(grants, self) {
    const node = el('employees-grants');
    if (!node) return;
    node.innerHTML = grants.length
      ? grants.map((g) => grantRow(g, self)).join('')
      : '<p class="employees-empty">No authority grants yet.</p>';
  }

  function renderInvitations(invitations, self) {
    const node = el('employees-invitations');
    if (!node) return;
    node.innerHTML = invitations.length
      ? invitations.map((i) => invitationRow(i, self)).join('')
      : '<p class="employees-empty">No invitations yet.</p>';
  }

  async function parseJsonResponse(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.ok !== true) {
      throw new ApiError(body?.error || `HTTP_${response.status}`);
    }
    return body;
  }

  async function mintEmployeeSession(credential) {
    const response = await fetch('/api/employee-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
    });
    const body = await parseJsonResponse(response);
    return body.employeeSessionToken;
  }

  async function loadDirectory(credential, sessionToken) {
    const response = await fetch('/api/authority-directory', {
      headers: { Authorization: `Bearer ${credential}`, 'x-employee-session': sessionToken, Accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await parseJsonResponse(response);
    directory = body;
    renderSelfSummary(body.self);
    renderRoleGrid(body.self.tier);
    renderGrants(body.grants, body.self);
    renderInvitations(body.invitations, body.self);
    el('employees-panel').hidden = false;
    el('employees-source').textContent = `Verified · ${body.self.tier}`;
    el('employees-source').className = 'badge neutral';
    setGateStatus('Verified. Click "Sign in with Google" again anytime to refresh, or before any action below.', 'ok');
  }

  async function submitInvite(credential, sessionToken, actions) {
    const response = await fetch('/api/authority-invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'x-employee-session': sessionToken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ actions }),
    });
    const body = await parseJsonResponse(response);
    const link = `${window.location.origin}/redeem-invite.html#${encodeURIComponent(body.token)}`;
    showInviteResult(true, `<strong>Invitation created.</strong> Share this link — it is shown only once and is never stored:<div class="token-reveal"><input type="text" readonly value="${escapeHtml(link)}" onclick="this.select()"></div><p style="margin-top:8px">Expires ${escapeHtml(new Date(body.expiresAt).toLocaleString())}.</p>`);
    await loadDirectory(credential, sessionToken);
  }

  async function submitRevoke(credential, sessionToken, grantId) {
    const response = await fetch('/api/authority-revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'x-employee-session': sessionToken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ grantId }),
    });
    await parseJsonResponse(response);
    setGateStatus('Grant revoked.', 'ok');
    await loadDirectory(credential, sessionToken);
  }

  async function submitCancel(credential, sessionToken, invitationId) {
    const response = await fetch('/api/authority-invite-cancel', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'x-employee-session': sessionToken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ invitationId }),
    });
    await parseJsonResponse(response);
    setGateStatus('Invitation cancelled.', 'ok');
    await loadDirectory(credential, sessionToken);
  }

  async function onCredential(response) {
    const credential = response && response.credential;
    if (typeof credential !== 'string' || credential.split('.').length !== 3) {
      setGateStatus('Sign-in response was invalid.', 'err');
      return;
    }
    const action = pendingAction || { type: 'verify' };
    pendingAction = { type: 'verify' };
    setGateStatus('Verifying…');
    try {
      const sessionToken = await mintEmployeeSession(credential);
      if (action.type === 'invite') await submitInvite(credential, sessionToken, action.actions);
      else if (action.type === 'revoke') await submitRevoke(credential, sessionToken, action.grantId);
      else if (action.type === 'cancel') await submitCancel(credential, sessionToken, action.invitationId);
      else await loadDirectory(credential, sessionToken);
    } catch (error) {
      setGateStatus(friendlyError(error), 'err');
    }
  }

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('GOOGLE_SCRIPT_LOAD_FAILED'));
      document.head.appendChild(script);
    });
  }

  async function ensureGoogleButton() {
    if (googleReady) return;
    try {
      await loadGoogleScript();
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: onCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(el('employees-gsi-target'), {
        type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', width: 300,
      });
      googleReady = true;
    } catch {
      setGateStatus('Google Sign-In failed to load. Reload the page to retry.', 'err');
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch('/api/auth-client-config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      config = await response.json();
    } catch {
      config = null;
    }
  }

  async function init() {
    if (!config) await loadConfig();

    if (!config || config.environment !== 'production') {
      el('employees-preview-notice').hidden = false;
      el('employees-gate').hidden = true;
      return;
    }
    if (config.provider !== 'google' || config.configured !== true || !config.clientId) {
      setGateStatus('Google sign-in is not configured on this deployment yet.', 'err');
      return;
    }
    await ensureGoogleButton();
  }

  document.getElementById('employees-invite-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedRoleKey) { showInviteResult(false, 'Pick a role above first.'); return; }
    const preset = ROLE_PRESETS[selectedRoleKey];
    pendingAction = { type: 'invite', actions: preset.actions };
    setGateStatus(`Click "Sign in with Google" above to confirm and send the ${preset.label} invitation.`);
  });

  document.getElementById('employees-grants')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-revoke-grant]');
    if (!button) return;
    pendingAction = { type: 'revoke', grantId: button.dataset.revokeGrant };
    setGateStatus('Click "Sign in with Google" above to confirm this revocation.');
  });

  document.getElementById('employees-invitations')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cancel-invitation]');
    if (!button) return;
    pendingAction = { type: 'cancel', invitationId: button.dataset.cancelInvitation };
    setGateStatus('Click "Sign in with Google" above to confirm cancelling this invitation.');
  });

  window.initEmployeesView = init;
})();
