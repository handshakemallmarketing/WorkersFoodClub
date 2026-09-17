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
  const PREVIEW_ROLE_LABELS = {
    none: 'Guest',
    member: 'Member',
    fulfillment: 'Operator · Fulfillment',
    finance: 'Operator · Finance',
    admin: 'SuperUser · Admin',
  };

  let token = null;
  let config = null;
  let verifiedIdentity = null;
  let operatorAccess = false;
  let superUserAccess = false;
  let previewMemberToken = null;
  let previewOperatorTokensByTier = { fulfillment: null, finance: null, admin: null };
  let previewRole = 'none';

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

  function panel() {
    return document.getElementById('auth-panel');
  }

  function setPanel(message, className = 'badge neutral') {
    const root = panel();
    if (!root) return;
    root.innerHTML = '';
    const span = document.createElement('span');
    span.className = className;
    span.textContent = message;
    root.appendChild(span);
  }

  function productionMemberAccessAvailable() {
    return config?.environment === 'production'
      && config?.productionApplicationAccessEnabled === true
      && Boolean(verifiedIdentity)
      && Boolean(token);
  }

  /**
   * Four nav-visible access levels, unified across Preview (role picked via the
   * demo panel) and Production (role resolved from the verified identity binding):
   * none < member < operator < superUser, each a superset of the one before it.
   */
  function computeAccessLevels() {
    const production = config?.environment === 'production';
    const memberAccess = production ? productionMemberAccessAvailable() : previewRole !== 'none';
    const operatorLevelAccess = production ? operatorAccess : OPERATOR_TIER_ROLES.has(previewRole);
    const superUserLevelAccess = production ? superUserAccess : previewRole === 'admin';
    return { production, memberAccess, operatorLevelAccess, superUserLevelAccess };
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

  function emitAuthState() {
    applyAccessUi();
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

  function renderPreviewPanel() {
    const root = panel();
    if (!root) return;
    root.innerHTML = '';

    const status = document.createElement('span');
    status.className = 'badge neutral';
    status.textContent = `Preview · ${PREVIEW_ROLE_LABELS[previewRole]}`;
    root.appendChild(status);

    Object.entries(PREVIEW_ROLE_LABELS).forEach(([role, label]) => {
      if (role === previewRole) return;
      const button = document.createElement('button');
      button.className = 'secondary small';
      button.type = 'button';
      button.textContent = role === 'none' ? 'Sign out' : `Sign in as ${label}`;
      button.addEventListener('click', () => setPreviewRole(role));
      root.appendChild(button);
    });
  }

  function setPreviewRole(role) {
    previewRole = OPERATOR_TIER_ROLES.has(role) || role === 'member' ? role : 'none';
    renderPreviewPanel();
    emitAuthState();
    refreshProtectedViews();
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
    renderGoogleButton();
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
    if (typeof credential !== 'string' || credential.split('.').length !== 3) {
      setPanel('Identity response invalid', 'badge danger');
      return;
    }

    setPanel('Verifying Google identity…');
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
      const root = panel();
      if (root) {
        root.innerHTML = '';
        const status = document.createElement('span');
        status.className = config?.productionApplicationAccessEnabled === true
          ? 'badge neutral'
          : 'badge warning';
        status.textContent = config?.productionApplicationAccessEnabled === true
          ? 'Google identity verified'
          : 'Google identity verified · member access not activated';
        const subject = document.createElement('code');
        subject.textContent = identity.subject;
        subject.title = 'Verified Google subject';
        const button = document.createElement('button');
        button.className = 'secondary small';
        button.type = 'button';
        button.textContent = 'Sign out';
        button.addEventListener('click', signOut);
        root.append(status, subject, button);
      }
      emitAuthState();
      refreshProtectedViews();
    } catch {
      token = null;
      verifiedIdentity = null;
      operatorAccess = false;
      superUserAccess = false;
      setPanel('Google identity verification failed', 'badge danger');
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

  function renderGoogleButton() {
    const root = panel();
    if (!root || !config?.clientId || !window.google?.accounts?.id) return;
    root.innerHTML = '';
    const target = document.createElement('div');
    root.appendChild(target);
    window.google.accounts.id.initialize({
      client_id: config.clientId,
      callback: (response) => authenticated(response?.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(target, {
      type: 'standard',
      theme: 'outline',
      size: 'medium',
      text: 'signin_with',
    });
  }

  async function initialize() {
    bindCatalogUi();
    applyAccessUi();
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
        renderPreviewPanel();
        emitAuthState();
        refreshProtectedViews();
        return;
      }
      if (body.provider !== 'google' || body.configured !== true || !body.clientId) {
        setPanel('Production sign-in not configured', 'badge warning');
        return;
      }
      if (body.productionApplicationAccessEnabled !== true) {
        setPanel('Production identity configured · member access disabled', 'badge warning');
      } else {
        setPanel('Loading Google sign-in…');
      }
      await loadGoogleScript();
      renderGoogleButton();
      emitAuthState();
    } catch {
      setPanel('Identity configuration unavailable', 'badge danger');
      emitAuthState();
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
