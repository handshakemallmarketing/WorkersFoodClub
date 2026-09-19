(() => {
  const upstreamFetch = window.fetch.bind(window);
  const governedOperatorPaths = new Set([
    '/api/promotions',
    '/api/authority-directory',
    '/api/workforce-teams',
    '/api/workforce-tasks',
    '/api/workforce-domains',
  ]);
  let operatorAuthorization = null;
  let employeeSession = null;

  function sameOriginPath(input) {
    try {
      const url = typeof input === 'string' ? new URL(input, window.location.origin)
        : input instanceof Request ? new URL(input.url, window.location.origin)
        : null;
      return url?.origin === window.location.origin ? url.pathname : '';
    } catch {
      return '';
    }
  }

  function headerValue(init, name) {
    const headers = new Headers(init?.headers || (init instanceof Request ? init.headers : undefined) || {});
    return headers.get(name);
  }

  window.fetch = (input, init = {}) => {
    const path = sameOriginPath(input);
    const suppliedAuthorization = headerValue(init, 'Authorization');
    const suppliedEmployeeSession = headerValue(init, 'x-employee-session');

    // auth.js owns credential selection. This extension observes only the
    // same-origin governed operator probe and reuses that exact short-lived pair
    // for the newer operator routes. It never reads credentials from storage or
    // exposes them globally.
    if (path === '/api/operator-orders' && suppliedAuthorization) {
      operatorAuthorization = suppliedAuthorization;
      employeeSession = suppliedEmployeeSession;
    }

    if (governedOperatorPaths.has(path) && operatorAuthorization) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) headers.set('Authorization', operatorAuthorization);
      if (employeeSession && !headers.has('x-employee-session')) headers.set('x-employee-session', employeeSession);
      return upstreamFetch(input, { ...init, headers });
    }
    return upstreamFetch(input, init);
  };

  window.addEventListener('foodclub:auth-state', (event) => {
    if (event.detail?.operatorAccessAvailable !== true) {
      operatorAuthorization = null;
      employeeSession = null;
      return;
    }

    // Deterministically initialize the bridge at the authority transition.
    // Because auth.js wraps this fetch layer, its governed /api/operator-orders
    // request arrives here with the current bearer + employee session before any
    // Promotions/Workforce listener can issue a dependent request. The response
    // is intentionally ignored; discoverOperatorAccess already performed the
    // authoritative server-side access check.
    window.fetch('/api/operator-orders', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).catch(() => {});
  });
})();
