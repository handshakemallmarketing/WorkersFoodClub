(() => {
  const upstream = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let path = '';
    try {
      const url = typeof input === 'string' ? new URL(input, location.origin) : input instanceof Request ? new URL(input.url) : null;
      if (url?.origin === location.origin) path = url.pathname;
    } catch {}
    if (path !== '/api/employee-session') return upstream(input, init);
    const headers = new Headers(init.headers || {});
    headers.set('x-employee-step-up-intent', 'employee-access');
    return upstream(input, { ...init, headers });
  };
})();
