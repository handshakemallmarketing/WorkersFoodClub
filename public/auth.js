(() => {
  const originalFetch = window.fetch.bind(window);
  const protectedReadPaths = new Set([
    '/api/member-orders',
    '/api/member-notifications',
    '/api/operator-orders',
  ]);

  let token = null;
  let config = null;
  let verifiedIdentity = null;

  function requestPath(input) {
    try {
      if (typeof input === 'string') return new URL(input, window.location.origin).pathname;
      if (input instanceof Request) return new URL(input.url, window.location.origin).pathname;
      return '';
    } catch {
      return '';
    }
  }

  function withBearer(init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  }

  window.fetch = (input, init = {}) => {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = requestPath(input);
    if (token && method === 'GET' && protectedReadPaths.has(path)) {
      return originalFetch(input, withBearer(init));
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

  function applyAccessUi() {
    const production = config?.environment === 'production';
    const memberAccess = productionMemberAccessAvailable();
    const protectedButtons = document.querySelectorAll(
      '[data-view="orders"], [data-view="operator"], [data-view="controls"], [data-go="orders"]',
    );

    protectedButtons.forEach((button) => {
      if (!production) {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
        return;
      }

      const isMemberOrders = button.dataset.view === 'orders' || button.dataset.go === 'orders';
      const allowed = isMemberOrders && memberAccess;
      button.disabled = !allowed;
      button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      if (!allowed) {
        button.title = verifiedIdentity
          ? 'Identity verified; Production member access is not activated yet.'
          : 'Sign in with Google to verify identity. Production member access remains disabled until activated.';
      } else {
        button.removeAttribute('title');
      }
    });

    document.body.dataset.authState = verifiedIdentity ? 'verified' : 'anonymous';
    document.body.dataset.memberAccess = memberAccess ? 'enabled' : 'disabled';
  }

  function emitAuthState() {
    applyAccessUi();
    window.dispatchEvent(new CustomEvent('foodclub:auth-state', {
      detail: {
        environment: config?.environment || 'unknown',
        identityVerified: Boolean(verifiedIdentity),
        subject: verifiedIdentity?.subject || null,
        productionApplicationAccessEnabled: config?.productionApplicationAccessEnabled === true,
        memberAccessAvailable: productionMemberAccessAvailable(),
      },
    }));
  }

  function refreshProtectedViews() {
    if (!productionMemberAccessAvailable()) return;
    if (typeof window.refreshOrders === 'function') window.refreshOrders();
  }

  function signOut() {
    token = null;
    verifiedIdentity = null;
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
        setPanel('Preview identity');
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
    get memberAccessAvailable() { return productionMemberAccessAvailable(); },
    signOut,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
