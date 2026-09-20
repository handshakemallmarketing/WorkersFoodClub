(() => {
  const nav = () => document.querySelector('[data-view="notifications"]');
  const list = () => document.getElementById('notifications-list');
  const source = () => document.getElementById('notifications-source');

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function render(notifications) {
    const root = list();
    const badge = source();
    if (!root || !badge) return;
    badge.textContent = `${notifications.length} notification${notifications.length === 1 ? '' : 's'}`;
    badge.className = 'badge neutral';
    if (!notifications.length) {
      root.innerHTML = '<div class="timeline-row"><span class="timeline-dot"></span><div><strong>No notifications yet</strong><p>Governed in-app communications for your membership will appear here.</p></div><time>Current</time></div>';
      return;
    }
    root.innerHTML = notifications.map((item) => `<div class="timeline-row"><span class="timeline-dot done"></span><div><strong>${escapeHtml(item.subject)}</strong><p>${escapeHtml(item.body)}</p><p class="order-evidence">${escapeHtml(item.eventType)} · ${escapeHtml(item.status)} · event ${escapeHtml(item.eventId)}</p></div><time>${new Date(item.deliveredAt || item.sentAt || item.queuedAt).toLocaleString()}</time></div>`).join('');
  }

  async function refresh() {
    const badge = source();
    if (!badge) return;
    try {
      const response = await fetch('/api/member-notifications', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body?.ok !== true || !Array.isArray(body.notifications)) throw new Error('unavailable');
      render(body.notifications);
    } catch {
      badge.textContent = 'Notifications unavailable';
      badge.className = 'badge danger';
      const root = list();
      if (root) root.innerHTML = '<div class="timeline-row"><span class="timeline-dot"></span><div><strong>Notifications unavailable</strong><p>The member-bound communication projection could not be read.</p></div><time>Retry</time></div>';
    }
  }

  function accessAvailable(detail = {}) {
    return detail.memberAccessAvailable === true;
  }

  function applyAccess(detail = {}) {
    const button = nav();
    if (!button) return;
    const visible = accessAvailable(detail);
    button.hidden = !visible;
    if (!visible && document.getElementById('notifications')?.classList.contains('active') && typeof window.activate === 'function') window.activate('dashboard');
  }

  window.addEventListener('foodclub:auth-state', (event) => {
    const detail = event.detail || {};
    applyAccess(detail);
    if (accessAvailable(detail)) refresh();
  });
  nav()?.addEventListener('click', refresh);
  window.refreshMemberNotifications = refresh;
})();
