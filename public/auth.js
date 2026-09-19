(() => {
  const originalFetch = window.fetch.bind(window);
  const protectedReadPaths = new Set([
    '/api/member-orders',
    '/api/member-notifications',
    '/api/operator-orders',
  ]);
  const previewMemberPaths = new Set([
    '/api/member-orders',
    '/api/member-notifications',
    '/api/commit-sandbox',
    '/api/pay-sandbox',
    '/api/accept-fulfillment',
  ]);
  const previewOperatorPaths = new Set([
    '/api/operator-orders',
    '/api/fulfillment-ready',
    '/api/authorize-refund',
    '/api/complete-refund',
  ]);
  const OPERATOR_TIER_ROLES = new Set(['fulfillment', 'finance', 'admin']);
  const PREVIEW_ROLES = ['member', 'fulfillment', 'finance', 'admin'];
  const PREVIEW_ROLE_LABELS = {
    none: 'Guest',
    member: 'Member',
    fulfillment: 'Operator · Fulfillment',
    finance: 'Operator · Finance',
    admin: 'SuperUser · Admin',
  };
  const PREVIEW_ROLE_ICONS = { member: 'M', fulfillment: 'F', finance: '$', admin: 'A' };
  const PREVIEW_ROLE_DESCRIPTIONS = {
    member: 'Browse offers, track orders, and view notifications as a pilot member.',
    fulfillment: 'Mark member orders ready for pickup and manage the fulfillment queue.',
    finance: 'Authorize and complete member refunds.',
    admin: 'Full operator authority across fulfillment and finance, plus Release Controls.',
  };
  const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let token = null;
  let config = null;
  let verifiedIdentity = null;
  let memberAccessConfirmed = false;
  let membershipRestricted = false;
  let denialInfo = null;
  let operatorAccess = false;
  let superUserAccess = false;
  let previewMemberToken = null;
  let previewOperatorTokensByTier = { fulfillment: null, finance: null, admin: null };
  let previewRole = 'none';
  let chipStatusOverride = null;
  let lastFocusedElement = null;
  let expiryTimer = null;
  let googleScriptState = 'unloaded';
  let googleScriptPromise = null;

  function requestPath(input) {
    try {
      const url = typeof input === 'string' ? new URL(input, window.location.origin)
        : input instanceof Request ? new URL(input.url, window.location.origin)
        : null;
      // Same-origin only: an absolute cross-origin URL that happens to share a
      // protected pathname must never receive this app's bearer credential.
      if (!url || url.origin !== window.location.origin) return '';
      return url.pathname;
    } catch {
      return '';
    }
  }

  function withBearer(init = {}, credential) {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${credential}`);
    return { ...init, headers };
  }

  function bearerFor(path) {
    if (!path) return null;
    if (config?.environment === 'production') {
      return token && protectedReadPaths.has(path) ? token : null;
    }
    if (previewRole === 'none') return null;
    if (previewMemberPaths.has(path)) return previewMemberToken;
    if (previewOperatorPaths.has(path)) {
      return OPERATOR_TIER_ROLES.has(previewRole) ? previewOperatorTokensByTier[previewRole] : null;
    }
    return null;
  }

  window.fetch = (input, init = {}) => {
    const path = requestPath(input);
    const bearer = bearerFor(path);
    if (bearer) {
      return originalFetch(input, withBearer(init, bearer));
    }
    return originalFetch(input, init);
  };

  function modal() { return document.getElementById('auth-modal'); }
  function modalBody() { return document.getElementById('auth-modal-body'); }
  function modalTitle() { return document.getElementById('auth-modal-title'); }
  function modalSubtitle() { return document.getElementById('auth-modal-subtitle'); }
  function chip() { return document.getElementById('auth-chip'); }
  function chipLabel() { return document.getElementById('auth-chip-label'); }

  function setBackgroundInert(value) {
    document.querySelectorAll('.app-shell').forEach((el) => { el.inert = value; });
  }

  function trapFocus(event) {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = modal();
    if (!root) return;
    const focusable = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openModal() {
    const root = modal();
    if (!root) return;
    lastFocusedElement = document.activeElement;
    root.hidden = false;
    renderModalContent();
    setBackgroundInert(true);
    document.addEventListener('keydown', trapFocus);
    requestAnimationFrame(() => {
      const target = root.querySelector(FOCUSABLE_SELECTOR);
      target?.focus();
    });
  }

  function closeModal() {
    const root = modal();
    if (!root) return;
    root.hidden = true;
    setBackgroundInert(false);
    document.removeEventListener('keydown', trapFocus);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  function bindAuthChipAndModal() {
    chip()?.addEventListener('click', openModal);
    document.getElementById('auth-modal-close')?.addEventListener('click', closeModal);
    modal()?.addEventListener('click', (event) => {
      if (event.target === modal()) closeModal();
    });
  }

  function productionMemberAccessAvailable() {
    return config?.environment === 'production'
      && config?.productionApplicationAccessEnabled === true
      && Boolean(verifiedIdentity)
      && Boolean(token)
      // Operator access already proves a real governed binding; a plain verified
      // Google identity additionally needs its own membership probe confirmed --
      // being signed in is not the same as being an approved, active member.
      && (memberAccessConfirmed || operatorAccess);
  }

  /**
   * Four nav-visible access levels, unified across Preview (role picked via the
   * sign-in modal) and Production (role resolved from the verified identity binding):
   * none < member < operator < superUser, each a superset of the one before it.
   */
  function computeAccessLevels() {
    const production = config?.environment === 'production';
    const memberAccess = production ? productionMemberAccessAvailable() : previewRole !== 'none';
    const operatorLevelAccess = production ? operatorAccess : OPERATOR_TIER_ROLES.has(previewRole);
    const superUserLevelAccess = production ? superUserAccess : previewRole === 'admin';
    return { production, memberAccess, operatorLevelAccess, superUserLevelAccess };
  }

  function currentRoleLabel() {
    const { production, memberAccess, operatorLevelAccess, superUserLevelAccess } = computeAccessLevels();
    if (!production) return PREVIEW_ROLE_LABELS[previewRole];
    if (!memberAccess) return null;
    if (superUserLevelAccess) return 'SuperUser · Admin';
    if (operatorLevelAccess) return 'Operator';
    return 'Member';
  }

  function setHidden(selector, hidden) {
    document.querySelectorAll(selector).forEach((element) => {
      element.hidden = hidden;
    });
  }

  function applyCatalogUi() {
    const memberAccess = productionMemberAccessAvailable();
    const label = memberAccess ? 'Member Offers' : 'Browse Offers';
    const catalogNav = document.querySelector('[data-view="catalog"]');
    const catalogHeading = document.querySelector('#catalog .section-intro h2');
    const catalogView = document.getElementById('catalog');
    const pageTitle = document.getElementById('page-title');

    if (catalogNav) catalogNav.textContent = label;
    if (catalogHeading) catalogHeading.textContent = label;
    if (catalogView?.classList.contains('active') && pageTitle) pageTitle.textContent = label;
  }

  function bindCatalogUi() {
    document.querySelectorAll('[data-view="catalog"], [data-go="catalog"]').forEach((button) => {
      if (button.dataset.catalogLabelBound === 'true') return;
      button.dataset.catalogLabelBound = 'true';
      button.addEventListener('click', applyCatalogUi);
    });
  }

  function applyAccessUi() {
    const { production, memberAccess, operatorLevelAccess, superUserLevelAccess } = computeAccessLevels();
    const audienceLabel = document.getElementById('audience-label');

    setHidden('[data-view="orders"], [data-view="notifications"], [data-go="orders"]', !memberAccess);
    setHidden('[data-view="operator"]', !operatorLevelAccess);
    setHidden('[data-view="controls"]', !superUserLevelAccess);

    if (audienceLabel) {
      audienceLabel.textContent = superUserLevelAccess ? 'SuperUser Preview'
        : operatorLevelAccess ? 'Operator Preview'
        : memberAccess ? 'Member Preview'
        : production ? 'Public Preview' : 'Guest Preview';
    }

    const activeProtectedView = document.querySelector(
      '.view.active#orders, .view.active#notifications, .view.active#operator, .view.active#controls',
    );
    if (activeProtectedView) {
      const stillAllowed = activeProtectedView.id === 'operator' ? operatorLevelAccess
        : activeProtectedView.id === 'controls' ? superUserLevelAccess
        : memberAccess;
      if (!stillAllowed && typeof window.activate === 'function') window.activate('dashboard');
    }

    applyCatalogUi();
    document.body.dataset.authState = memberAccess ? 'verified' : 'anonymous';
    document.body.dataset.memberAccess = memberAccess ? 'enabled' : 'disabled';
    document.body.dataset.operatorAccess = operatorLevelAccess ? 'enabled' : 'disabled';
    document.body.dataset.superUserAccess = superUserLevelAccess ? 'enabled' : 'disabled';
  }

  function updateChip() {
    const button = chip();
    const label = chipLabel();
    if (!button || !label) return;

    if (chipStatusOverride) {
      label.textContent = chipStatusOverride.message;
      button.className = `auth-chip ${chipStatusOverride.tone === 'neutral' ? '' : 'needs-attention'}`.trim();
      return;
    }

    if (!config) {
      label.textContent = 'Checking identity…';
      button.className = 'auth-chip';
      return;
    }

    if (config.environment !== 'production') {
      label.textContent = previewRole === 'none' ? 'Sign in' : currentRoleLabel();
      button.className = `auth-chip ${previewRole === 'none' ? '' : 'signed-in'}`.trim();
      return;
    }

    if (config.provider !== 'google' || config.configured !== true || !config.clientId) {
      label.textContent = 'Sign-in unavailable';
      button.className = 'auth-chip needs-attention';
      return;
    }
    if (denialInfo) {
      label.textContent = denialInfo.reason === 'pending' ? 'Application pending review' : 'No membership found';
      button.className = 'auth-chip needs-attention';
      return;
    }
    if (!verifiedIdentity || !token) {
      label.textContent = 'Sign in';
      button.className = 'auth-chip';
      return;
    }
    label.textContent = membershipRestricted ? `${currentRoleLabel()} · restricted` : currentRoleLabel();
    button.className = 'auth-chip signed-in';
  }

  function emitAuthState() {
    applyAccessUi();
    updateChip();
    const { memberAccess, operatorLevelAccess, superUserLevelAccess } = computeAccessLevels();
    window.dispatchEvent(new CustomEvent('foodclub:auth-state', {
      detail: {
        environment: config?.environment || 'unknown',
        identityVerified: Boolean(verifiedIdentity),
        subject: verifiedIdentity?.subject || null,
        productionApplicationAccessEnabled: config?.productionApplicationAccessEnabled === true,
        previewRole,
        memberAccessAvailable: memberAccess,
        operatorAccessAvailable: operatorLevelAccess,
        superUserAccessAvailable: superUserLevelAccess,
      },
    }));
  }

  function refreshProtectedViews() {
    const { memberAccess, operatorLevelAccess } = computeAccessLevels();
    if (!memberAccess) return;
    if (typeof window.refreshOrders === 'function') window.refreshOrders();
    if (operatorLevelAccess && typeof window.refreshOperatorOrders === 'function') window.refreshOperatorOrders();
    if (typeof window.refreshMemberNotifications === 'function') window.refreshMemberNotifications();
  }

  async function loadPreviewSession() {
    try {
      const response = await originalFetch('/api/preview-session', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || body?.ok !== true) throw new Error('PREVIEW_SESSION_UNAVAILABLE');
      previewMemberToken = body.memberToken;
      previewOperatorTokensByTier = {
        fulfillment: body.operatorTokens?.fulfillment || null,
        finance: body.operatorTokens?.finance || null,
        admin: body.operatorTokens?.admin || body.operatorToken || null,
      };
    } catch {
      previewMemberToken = null;
      previewOperatorTokensByTier = { fulfillment: null, finance: null, admin: null };
    }
  }

  function setPreviewRole(role) {
    previewRole = OPERATOR_TIER_ROLES.has(role) || role === 'member' ? role : 'none';
    emitAuthState();
    refreshProtectedViews();
  }

  function identitySummaryNode({ iconText, name, meta }) {
    const row = document.createElement('div');
    row.className = 'identity-summary';
    const icon = document.createElement('div');
    icon.className = 'role-icon';
    icon.textContent = iconText;
    const copy = document.createElement('div');
    copy.className = 'role-copy';
    const strong = document.createElement('strong');
    strong.textContent = name;
    copy.appendChild(strong);
    if (meta) {
      const metaEl = document.createElement('code');
      metaEl.textContent = meta;
      copy.appendChild(metaEl);
    }
    row.append(icon, copy);
    return row;
  }

  function renderPreviewModal(body, title, subtitle) {
    title.textContent = previewRole === 'none' ? 'Sign in' : 'Switch identity';
    subtitle.textContent = 'This is a sandboxed preview — nothing here touches live funds. Explore demo roles below; production sign-in never offers a role picker.';
    subtitle.style.color = '';

    if (previewRole !== 'none') {
      body.appendChild(identitySummaryNode({
        iconText: PREVIEW_ROLE_ICONS[previewRole],
        name: `Signed in as ${PREVIEW_ROLE_LABELS[previewRole]}`,
        meta: PREVIEW_ROLE_DESCRIPTIONS[previewRole],
      }));
    }

    const sectionLabel = document.createElement('p');
    sectionLabel.className = 'eyebrow';
    sectionLabel.style.margin = '0 0 8px';
    sectionLabel.textContent = 'Explore demo roles';
    body.appendChild(sectionLabel);

    const grid = document.createElement('div');
    grid.className = 'role-grid';
    PREVIEW_ROLES.forEach((role) => {
      if (role === previewRole) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'role-card';
      const icon = document.createElement('span');
      icon.className = 'role-icon';
      icon.textContent = PREVIEW_ROLE_ICONS[role];
      const copy = document.createElement('span');
      copy.className = 'role-copy';
      const strong = document.createElement('strong');
      strong.textContent = `Sign in as ${PREVIEW_ROLE_LABELS[role]}`;
      const span = document.createElement('span');
      span.textContent = PREVIEW_ROLE_DESCRIPTIONS[role];
      copy.append(strong, span);
      button.append(icon, copy);
      button.addEventListener('click', () => { setPreviewRole(role); closeModal(); });
      grid.appendChild(button);
    });
    body.appendChild(grid);

    if (previewRole !== 'none') {
      const hr = document.createElement('hr');
      hr.className = 'modal-divider';
      body.appendChild(hr);
      const footnote = document.createElement('p');
      footnote.className = 'modal-footnote';
      const guestButton = document.createElement('button');
      guestButton.type = 'button';
      guestButton.textContent = 'Continue as Guest';
      guestButton.addEventListener('click', () => { setPreviewRole('none'); closeModal(); });
      footnote.appendChild(guestButton);
      body.appendChild(footnote);
    }
  }

  function renderGoogleSignInButton(body, subtitle) {
    const target = document.createElement('div');
    body.appendChild(target);
    loadGoogleScript().then(() => {
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: (response) => authenticated(response?.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(target, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 300,
      });
    }).catch(() => {
      subtitle.textContent = 'Google sign-in failed to load.';
      subtitle.style.color = 'var(--red)';
      target.innerHTML = '';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'secondary small';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => renderModalContent());
      target.appendChild(retry);
    });
  }

  function renderProductionModal(body, title, subtitle) {
    subtitle.style.color = '';

    if (config.provider !== 'google' || config.configured !== true || !config.clientId) {
      title.textContent = 'Sign-in unavailable';
      subtitle.textContent = 'Production sign-in is not configured yet.';
      return;
    }

    if (denialInfo) {
      if (denialInfo.reason === 'pending') {
        title.textContent = 'Application pending review';
        subtitle.textContent = "You already have a WorkersFoodClub membership application awaiting review. There's nothing more to do right now — check back once it's been decided.";
      } else {
        title.textContent = 'No membership found';
        subtitle.textContent = "We couldn't find an active WorkersFoodClub membership for this account.";
        const applyLink = document.createElement('a');
        applyLink.href = '/join.html';
        applyLink.className = 'primary';
        applyLink.style.display = 'inline-block';
        applyLink.style.textDecoration = 'none';
        applyLink.style.marginTop = '4px';
        applyLink.textContent = 'Apply to join';
        body.appendChild(applyLink);
      }
      const tryAgainButton = document.createElement('button');
      tryAgainButton.type = 'button';
      tryAgainButton.className = 'secondary';
      tryAgainButton.style.marginTop = '10px';
      tryAgainButton.textContent = 'Try a different account';
      tryAgainButton.addEventListener('click', () => { denialInfo = null; renderModalContent(); });
      body.appendChild(tryAgainButton);
      return;
    }

    if (verifiedIdentity && token) {
      title.textContent = 'Signed in';
      subtitle.textContent = config.productionApplicationAccessEnabled === true
        ? 'Your Google identity is verified against the governed application binding.'
        : 'Your Google identity is verified, but member access is not yet activated.';
      const label = currentRoleLabel() || 'Signed in · access pending';
      body.appendChild(identitySummaryNode({
        iconText: label.charAt(0),
        name: label,
        meta: verifiedIdentity.subject,
      }));
      const signOutButton = document.createElement('button');
      signOutButton.type = 'button';
      signOutButton.className = 'secondary';
      signOutButton.textContent = 'Sign out';
      signOutButton.addEventListener('click', () => { signOut(); closeModal(); });
      body.appendChild(signOutButton);
      return;
    }

    title.textContent = 'Sign in';
    subtitle.textContent = config.productionApplicationAccessEnabled === true
      ? 'Verify your Google identity to access your governed member or operator scopes.'
      : 'Verify your Google identity. Member access remains disabled until explicitly activated.';
    renderGoogleSignInButton(body, subtitle);
  }

  function renderModalContent() {
    const body = modalBody();
    const title = modalTitle();
    const subtitle = modalSubtitle();
    if (!body || !title || !subtitle) return;
    body.innerHTML = '';

    if (!config) {
      title.textContent = 'Sign in';
      subtitle.textContent = 'Loading identity configuration…';
      return;
    }

    if (config.environment !== 'production') {
      renderPreviewModal(body, title, subtitle);
      return;
    }
    renderProductionModal(body, title, subtitle);
  }

  async function probeBearerAccess(path, credential) {
    try {
      const response = await originalFetch(path, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credential}`,
        },
        cache: 'no-store',
      });
      return response;
    } catch {
      return null;
    }
  }

  async function discoverMembershipStatus(credential) {
    const response = await probeBearerAccess('/api/membership-status', credential);
    if (!response?.ok) return { membershipState: null, hasPendingApplication: false };
    const body = await response.json().catch(() => null);
    return {
      membershipState: body?.membershipState ?? null,
      hasPendingApplication: body?.hasPendingApplication === true,
    };
  }

  async function discoverOperatorAccess(credential) {
    const response = await probeBearerAccess('/api/operator-orders', credential);
    if (!response?.ok) return { operator: false, superUser: false };
    const body = await response.json().catch(() => null);
    return { operator: true, superUser: body?.isSuperUser === true };
  }

  function clearExpiryTimer() {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function scheduleExpiry(expiresAtSeconds) {
    clearExpiryTimer();
    if (!Number.isFinite(expiresAtSeconds)) return;
    const delayMs = expiresAtSeconds * 1000 - Date.now();
    // Cap the timer so it always fires even across very long-lived tokens or a
    // sleeping/backgrounded tab whose timers were throttled; a stale session
    // still gets caught promptly on the next tick instead of drifting forever.
    const boundedDelay = Math.max(0, Math.min(delayMs, 24 * 60 * 60 * 1000));
    expiryTimer = setTimeout(() => {
      if (!verifiedIdentity) return;
      signOut();
      chipStatusOverride = { message: 'Session expired · sign in again', tone: 'warning' };
      updateChip();
    }, boundedDelay);
  }

  function signOut() {
    token = null;
    verifiedIdentity = null;
    memberAccessConfirmed = false;
    membershipRestricted = false;
    operatorAccess = false;
    superUserAccess = false;
    clearExpiryTimer();
    if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
    emitAuthState();
  }

  async function discoverIdentity(credential) {
    const response = await originalFetch('/api/identity-subject', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credential}`,
      },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true || body?.verified !== true || !body?.subject) {
      throw new Error(body?.error || 'IDENTITY_SUBJECT_DISCOVERY_FAILED');
    }
    return Object.freeze({
      issuer: body.issuer,
      subject: body.subject,
      expiresAt: body.expiresAt,
    });
  }

  async function authenticated(credential) {
    const subtitle = modalSubtitle();
    if (typeof credential !== 'string' || credential.split('.').length !== 3) {
      if (subtitle) { subtitle.textContent = 'Identity response invalid.'; subtitle.style.color = 'var(--red)'; }
      return;
    }

    chipStatusOverride = null;
    denialInfo = null;
    if (subtitle) { subtitle.textContent = 'Verifying Google identity…'; subtitle.style.color = ''; }
    try {
      const identity = await discoverIdentity(credential);

      if (config?.productionApplicationAccessEnabled === true) {
        // Membership is checked BEFORE this identity is treated as signed in at
        // all -- an authenticated Google identity with no qualifying
        // WorkersFoodClub membership must never be admitted into the app
        // shell, even in a "pending" limbo state.
        const [membershipResult, operatorResult] = await Promise.all([
          discoverMembershipStatus(credential),
          discoverOperatorAccess(credential),
        ]);
        const admitted = membershipResult.membershipState === 'ACTIVE' || membershipResult.membershipState === 'SUSPENDED';
        if (!admitted) {
          token = null;
          verifiedIdentity = null;
          memberAccessConfirmed = false;
          membershipRestricted = false;
          operatorAccess = false;
          superUserAccess = false;
          clearExpiryTimer();
          denialInfo = membershipResult.hasPendingApplication ? { reason: 'pending' } : { reason: 'no-membership' };
          emitAuthState();
          renderModalContent();
          return;
        }
        token = credential;
        verifiedIdentity = identity;
        scheduleExpiry(identity.expiresAt);
        memberAccessConfirmed = true;
        membershipRestricted = membershipResult.membershipState === 'SUSPENDED';
        operatorAccess = operatorResult.operator;
        superUserAccess = operatorResult.superUser;
      } else {
        token = credential;
        verifiedIdentity = identity;
        scheduleExpiry(identity.expiresAt);
        memberAccessConfirmed = false;
        membershipRestricted = false;
        operatorAccess = false;
        superUserAccess = false;
      }
      emitAuthState();
      refreshProtectedViews();
      closeModal();
    } catch {
      token = null;
      verifiedIdentity = null;
      memberAccessConfirmed = false;
      membershipRestricted = false;
      operatorAccess = false;
      superUserAccess = false;
      clearExpiryTimer();
      if (subtitle) { subtitle.textContent = 'Google identity verification failed.'; subtitle.style.color = 'var(--red)'; }
      emitAuthState();
    }
  }

  function loadGoogleScript() {
    if (googleScriptState === 'loaded' && window.google?.accounts?.id) return Promise.resolve();
    if (googleScriptState === 'loading' && googleScriptPromise) return googleScriptPromise;

    // A prior failed <script> tag never re-fires load/error for a listener
    // attached after the fact, so it must be removed before retrying.
    document.querySelectorAll('script[data-foodclub-google-identity]').forEach((el) => el.remove());

    googleScriptState = 'loading';
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.foodclubGoogleIdentity = 'true';
      script.onload = () => { googleScriptState = 'loaded'; resolve(); };
      script.onerror = () => { googleScriptState = 'failed'; script.remove(); reject(new Error('GOOGLE_SCRIPT_LOAD_FAILED')); };
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }

  async function initialize() {
    bindCatalogUi();
    bindAuthChipAndModal();
    applyAccessUi();
    updateChip();
    try {
      const response = await originalFetch('/api/auth-client-config', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || body?.ok !== true) throw new Error('AUTH_CLIENT_CONFIG_UNAVAILABLE');
      config = body;
      emitAuthState();

      if (body.environment !== 'production') {
        previewRole = 'none';
        await loadPreviewSession();
        emitAuthState();
        refreshProtectedViews();
      }
    } catch {
      chipStatusOverride = { message: 'Identity unavailable', tone: 'danger' };
      updateChip();
    }
  }

  window.FoodClubAuth = Object.freeze({
    get hasToken() { return Boolean(token); },
    get mode() { return config?.authenticationMode || 'UNKNOWN'; },
    get subject() { return verifiedIdentity?.subject || null; },
    get issuer() { return verifiedIdentity?.issuer || null; },
    get previewRole() { return previewRole; },
    get memberAccessAvailable() { return computeAccessLevels().memberAccess; },
    get operatorAccessAvailable() { return computeAccessLevels().operatorLevelAccess; },
    get superUserAccessAvailable() { return computeAccessLevels().superUserLevelAccess; },
    signOut,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
