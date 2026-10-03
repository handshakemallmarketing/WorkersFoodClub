(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EVENT_LABELS = { DOWNTIME_NOTICE: 'Downtime notice', TOS_CHANGE: 'Terms of Service change', SECURITY_NOTICE: 'Security notice', GENERAL_ANNOUNCEMENT: 'General announcement' };

  async function api(path, init = {}) {
    const r = await fetch(path, { cache: 'no-store', ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
    const b = await r.json().catch(() => ({}));
    if (!r.ok || b.ok === false) throw new Error(b.error || `HTTP_${r.status}`);
    return b;
  }

  function renderList(broadcasts) {
    const list = $('broadcast-list'), source = $('broadcast-source');
    if (!list || !source) return;
    source.textContent = `${broadcasts.length} sent`;
    source.className = 'badge neutral';
    list.innerHTML = broadcasts.length
      ? broadcasts.map((b) => `<div class="timeline-row"><span class="timeline-dot done"></span><div><strong>${esc(b.subject)}</strong><p>${esc(b.body)}</p><p class="order-evidence">${esc(EVENT_LABELS[b.eventType] || b.eventType)} · ${esc(b.recipientCount)} recipient${b.recipientCount === 1 ? '' : 's'}</p></div><time>${new Date(b.queuedAt).toLocaleString()}</time></div>`).join('')
      : '<div class="timeline-row"><span class="timeline-dot"></span><div><strong>No notices sent yet</strong></div></div>';
  }

  async function load() {
    if (!window.FoodClubAuth?.superUserAccessAvailable) return;
    try {
      const data = await api('/api/admin-broadcast');
      renderList(data.broadcasts || []);
    } catch {
      const source = $('broadcast-source');
      if (source) { source.textContent = 'Unavailable'; source.className = 'badge danger'; }
    }
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.target, result = $('broadcast-result');
    const subject = form.subject.value.trim(), body = form.body.value.trim(), eventType = form.eventType.value;
    if (!subject || !body) return;
    if (!confirm(`Send "${subject}" to every member now? This can't be undone.`)) return;
    const button = form.querySelector('button[type="submit"]'), original = button.textContent;
    button.disabled = true; button.textContent = 'Sending…';
    try {
      const data = await api('/api/admin-broadcast', { method: 'POST', body: JSON.stringify({ subject, body, eventType }) });
      result.hidden = false; result.className = 'result-box';
      result.textContent = `Sent to ${data.recipientCount} member${data.recipientCount === 1 ? '' : 's'}.`;
      form.reset();
      await load();
    } catch (error) {
      result.hidden = false; result.className = 'result-box err';
      result.textContent = `Send failed: ${error.message}`;
    } finally {
      button.disabled = false; button.textContent = original;
    }
  }

  function applyAccess(allowed) {
    document.querySelectorAll('[data-view="broadcast"]').forEach((el) => { el.hidden = !allowed; });
    if (allowed) load();
  }

  $('broadcast-form')?.addEventListener('submit', submit);
  window.addEventListener('foodclub:auth-state', (e) => applyAccess(e.detail?.superUserAccessAvailable === true));
  applyAccess(window.FoodClubAuth?.superUserAccessAvailable === true);
})();
