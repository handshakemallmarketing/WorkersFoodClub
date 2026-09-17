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

  let token = null;
  let config = null;
  let verifiedIdentity = null;
  let operatorAccess = false;
  let superUserAccess = false;
  let previewMemberToken = null;
  let previewOperatorTokensByTier = { fulfillment: null, finance: null, admin: null };
  let previewRole = 'none';
  let chipStatusOverride = null;

  function requestPath(input) {
    try {
      if (typeof input === 'string') return new URL(input, window.location.origin).pathname;
      if (input instanceof Request) return new URL(input.url, window.location.origin).pathname;
      return '';
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

  function onModalKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  function openModal() {
    const root = modal();
    if (!root) return;
    root.hidden = false;
    renderModalContent();
    document.addEventListener('keydown', onModalKeydown);
  }

  function closeModal() {
    const root = modal();
    if (!root) return;
    root.hidden = true;
    document.removeEventListener('keydown', onModalKeydown);
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
      && Boolean(token);
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
    if (!verifiedIdentity || !token) {
      label.textContent = 'Sign in';
      button.className = 'auth-chip';
      return;
    }
    const { memberAccess } = computeAccessLevels();
    if (!memberAccess) {
      label.textContent = 'Signed in · access pending';
      button.className = 'auth-chip needs-attention';
      return;
    }
    label.textContent = currentRoleLabel();
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
    subtitle.textContent = 'This is a sandboxed preview — nothing here touches live funds. Pick a role to explore its access.';
    subtitle.style.color = '';

    if (previewRole !== 'none') {
      body.appendChild(identitySummaryNode({
        iconText: PREVIEW_ROLE_ICONS[previewRole],
        name: `Signed in as ${PREVIEW_ROLE_LABELS[previewRole]}`,
        meta: PREVIEW_ROLE_DESCRIPTIONS[previewRole],
      }));
    }

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

  async function renderProductionModal(body, title, subtitle) {
    subtitle.style.color = '';

    if (config.provider !== 'google' || config.configured !== true || !config.clientId) {
      title.textContent = 'Sign-in unavailable';
      subtitle.textContent = 'Production sign-in is not configured yet.';
      return;
    }

    if (verifiedIdentity && token) {
      title.textContent = 'Signed in';
      subtitle.textContent = config.productionApplicationAccessEnabled === true
        ? 'Your Google identity is verified against the governed application binding.'
        : 'Your Google identity is verified, but member access is not yet activated.';
      const label = currentRoleLabel() || 'Member';
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

    const target = document.createElement('div');
    body.appendChild(target);
    try {
      await loadGoogleScript();
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
    } catch {
      subtitle.textContent = 'Google sign-in failed to load.';
      subtitle.style.color = 'var(--red)';
    }
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

  async function discoverOperatorAccess(credential) {
    try {
      const response = await originalFetch('/api/operator-orders', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credential}`,
        },
        cache: 'no-store',
      });
      if (!response.ok) return { operator: false, superUser: false };
      const body = await response.json().catch(() => null);
      return { operator: true, superUser: body?.isSuperUser === true };
    } catch {
      return { operator: false, superUser: false };
    }
  }

  function signOut() {
    token = null;
    verifiedIdentity = null;
    operatorAccess = false;
    superUserAccess = false;
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

    if (subtitle) { subtitle.textContent = 'Verifying Google identity…'; subtitle.style.color = ''; }
    try {
      const identity = await discoverIdentity(credential);
      token = credential;
      verifiedIdentity = identity;
      if (config?.productionApplicationAccessEnabled === true) {
        const access = await discoverOperatorAccess(credential);
        operatorAccess = access.operator;
        superUserAccess = access.superUser;
      } else {
        operatorAccess = false;
        superUserAccess = false;
      }
      emitAuthState();
      refreshProtectedViews();
      closeModal();
    } catch {
      token = null;
      verifiedIdentity = null;
      operatorAccess = false;
      superUserAccess = false;
      if (subtitle) { subtitle.textContent = 'Google identity verification failed.'; subtitle.style.color = 'var(--red)'; }
      emitAuthState();
    }
  }

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const existing = document.querySelector('script[data-foodclub-google-identity]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.foodclubGoogleIdentity = 'true';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
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
