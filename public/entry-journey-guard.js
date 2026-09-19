(() => {
  'use strict';

  // J1/J2 launch boundary: public browsing is allowed, but protected member
  // reads/mutations must not leave the browser until membership is established.
  const protectedPaths = new Set([
    '/api/member-orders', '/api/member-notifications', '/api/operator-orders',
    '/api/commit-sandbox', '/api/pay-sandbox', '/api/accept-fulfillment',
    '/api/fulfillment-ready', '/api/authorize-refund', '/api/complete-refund',
  ]);
  const originalFetch = window.fetch.bind(window);
  let identityVerified = false;
  let memberAccess = false;

  function pathOf(input) {
    try {
      const url = typeof input === 'string' ? new URL(input, location.origin)
        : input instanceof Request ? new URL(input.url, location.origin) : null;
      return url && url.origin === location.origin ? url.pathname : '';
    } catch { return ''; }
  }

  window.fetch = (input, init = {}) => {
    const path = pathOf(input);
    if (protectedPaths.has(path) && !memberAccess) {
      return Promise.resolve(new Response(JSON.stringify({
        ok: false,
        error: identityVerified ? 'MEMBERSHIP_REQUIRED' : 'AUTHENTICATION_REQUIRED',
      }), {
        status: identityVerified ? 403 : 401,
        headers: { 'Content-Type': 'application/json', 'X-WFC-Local-Guard': 'entry-journey' },
      }));
    }
    return originalFetch(input, init);
  };

  function ensureNonMemberSurface() {
    let surface = document.getElementById('non-member-landing');
    if (surface) return surface;
    surface = document.createElement('section');
    surface.id = 'non-member-landing';
    surface.hidden = true;
    surface.setAttribute('aria-live', 'polite');
    surface.innerHTML = `
      <div class="hero-card">
        <div>
          <p class="eyebrow">Membership required</p>
          <h2>We couldn't find an active WorkersFoodClub membership for this account.</h2>
          <p>Signing in verifies your identity, but it does not create membership or application access.</p>
          <div class="hero-actions">
            <a class="primary" href="/apply">Apply for membership</a>
            <a class="secondary" href="mailto:support@workersfoodclub.com">Contact support</a>
          </div>
        </div>
      </div>`;
    document.querySelector('main')?.appendChild(surface);
    return surface;
  }

  function showNonMemberLanding(show) {
    const surface = ensureNonMemberSurface();
    surface.hidden = !show;
    document.querySelectorAll('main > .view, main > header').forEach((el) => {
      if (show) {
        if (!el.dataset.journeyPrevHidden) el.dataset.journeyPrevHidden = el.hidden ? '1' : '0';
        el.hidden = true;
      } else if (el.dataset.journeyPrevHidden) {
        el.hidden = el.dataset.journeyPrevHidden === '1';
        delete el.dataset.journeyPrevHidden;
      }
    });
    document.querySelector('.sidebar')?.toggleAttribute('hidden', show);
  }

  function convertPublicOfferActions(root = document) {
    root.querySelectorAll?.('[data-commit-offer]').forEach((button) => {
      if (memberAccess) {
        if (button.dataset.publicCta === 'true') {
          button.textContent = 'Commit in sandbox';
          delete button.dataset.publicCta;
        }
        return;
      }
      button.removeAttribute('data-commit-offer');
      button.dataset.publicCta = 'true';
      button.textContent = identityVerified ? 'Membership required' : 'Sign in to order';
      button.addEventListener('click', () => document.getElementById('auth-chip')?.click(), { once: true });
    });
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) convertPublicOfferActions(node);
    }
  });

  window.addEventListener('foodclub:auth-state', (event) => {
    identityVerified = event.detail?.identityVerified === true;
    memberAccess = event.detail?.memberAccessAvailable === true;
    // J2: an authenticated identity without membership never mounts the normal shell.
    showNonMemberLanding(identityVerified && !memberAccess);
    convertPublicOfferActions();
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureNonMemberSurface();
    convertPublicOfferActions();
    observer.observe(document.getElementById('offer-grid') || document.body, { childList: true, subtree: true });
  });
})();
