(() => {
  'use strict';

  const protectedPaths = new Set([
    '/api/member-orders', '/api/member-notifications', '/api/operator-orders',
    '/api/commit-sandbox', '/api/pay-sandbox', '/api/accept-fulfillment',
    '/api/fulfillment-ready', '/api/authorize-refund', '/api/complete-refund',
  ]);
  const originalFetch = window.fetch.bind(window);
  let identityVerified = false;
  let memberAccess = false;
  let accessState = null;
  let route = null;
  let invoice = null;

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

  function ensureRestrictedSurface() {
    let surface = document.getElementById('non-member-landing');
    if (surface) return surface;
    surface = document.createElement('section');
    surface.id = 'non-member-landing';
    surface.hidden = true;
    surface.setAttribute('aria-live', 'polite');
    document.querySelector('main')?.appendChild(surface);
    return surface;
  }

  function restrictedCopy() {
    if (route === 'APPLICATION_STATUS') return {
      eyebrow: 'Application received',
      title: 'Your WorkersFoodClub application is pending review.',
      copy: 'Your identity is verified. Membership and member commerce access are not active while the application is under review.',
      action: '<a class="secondary" href="mailto:support@workersfoodclub.com">Contact support</a>',
    };
    if (route === 'SUBSCRIPTION_DUE') {
      const due = invoice?.dueAt ? ` The current subscription invoice is due ${new Date(invoice.dueAt).toLocaleDateString()}.` : '';
      return {
        eyebrow: accessState === 'INACTIVE_INITIAL_FEE_DUE' ? 'Membership approved' : 'Membership renewal required',
        title: accessState === 'INACTIVE_INITIAL_FEE_DUE'
          ? 'Complete your annual subscription to activate member access.'
          : 'Your member commerce access is currently restricted.',
        copy: `Your identity remains verified, but ordinary member commerce authority is unavailable until subscription standing is current.${due}`,
        action: '<a class="secondary" href="mailto:support@workersfoodclub.com">Contact support</a>',
      };
    }
    if (route === 'RESTRICTED') return {
      eyebrow: 'Membership restricted',
      title: 'Member access is not currently available for this account.',
      copy: 'Your identity is verified, but the current membership state does not authorize member commerce.',
      action: '<a class="secondary" href="mailto:support@workersfoodclub.com">Contact support</a>',
    };
    return {
      eyebrow: 'Membership required',
      title: "We couldn't find an active WorkersFoodClub membership for this account.",
      copy: 'Signing in verifies your identity, but it does not create membership or application access.',
      action: '<a class="primary" href="/join.html">Apply for membership</a> <a class="secondary" href="mailto:support@workersfoodclub.com">Contact support</a>',
    };
  }

  function showRestrictedLanding(show) {
    const surface = ensureRestrictedSurface();
    surface.hidden = !show;
    if (show) {
      const state = restrictedCopy();
      surface.innerHTML = `<div class="hero-card"><div><p class="eyebrow">${state.eyebrow}</p><h2>${state.title}</h2><p>${state.copy}</p><div class="hero-actions">${state.action}</div></div></div>`;
    }
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
    root.querySelectorAll?.('[data-commit-offer], [data-public-cta="true"]').forEach((button) => {
      if (memberAccess) {
        if (button.dataset.publicCta === 'true') {
          button.dataset.commitOffer = '';
          button.textContent = 'Commit in sandbox';
          delete button.dataset.publicCta;
        }
        return;
      }
      button.removeAttribute('data-commit-offer');
      button.dataset.publicCta = 'true';
      button.textContent = identityVerified ? 'Membership required' : 'Sign in to order';
      if (button.dataset.publicCtaBound !== 'true') {
        button.dataset.publicCtaBound = 'true';
        button.addEventListener('click', () => document.getElementById('auth-chip')?.click());
      }
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
    accessState = event.detail?.accessState || null;
    route = event.detail?.route || null;
    invoice = event.detail?.invoice || null;
    showRestrictedLanding(identityVerified && !memberAccess && Boolean(route));
    convertPublicOfferActions();
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureRestrictedSurface();
    convertPublicOfferActions();
    observer.observe(document.getElementById('offer-grid') || document.body, { childList: true, subtree: true });
  });
})();
