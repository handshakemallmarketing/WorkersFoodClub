import { randomUUID } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';

const SETTINGS_SCOPE = 'workforce:settings.manage';

export default async function handler(req, res, options = {}) {
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  const env = options.env || process.env;
  const principal = options.actor || await requireApplicationAuth(req, res, SETTINGS_SCOPE, undefined, { env, sql: options.sql, binding: options.binding, production: options.production });
  if (!principal) return;
  const cs = options.databaseUrl || env.DATABASE_URL;
  if (!cs && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });
  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(cs, { fetchOptions: { signal: AbortSignal.timeout(5000) } }); }

    if (req.method === 'GET') {
      const rows = await sql`SELECT config_id, amount_minor, currency, created_by, created_at FROM membership_fee_configuration WHERE currency='GHS' AND active=true LIMIT 1`;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, configured: rows.length === 1, fee: rows[0] ? { amountMinor: Number(rows[0].amount_minor), currency: String(rows[0].currency), setBy: String(rows[0].created_by), setAt: rows[0].created_at } : null });
    }

    if (!principal.isSystemOwner) return res.status(403).json({ ok: false, error: 'MEMBERSHIP_FEE_OWNER_AUTHORITY_REQUIRED' });
    const amountMinor = Number(req.body?.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return res.status(400).json({ ok: false, error: 'AMOUNT_MINOR_INVALID' });
    const actor = String(principal.actorId || principal.participantId || '').trim();
    if (!actor) return res.status(403).json({ ok: false, error: 'MEMBERSHIP_FEE_ACTOR_REQUIRED' });
    const configId = `membership-fee:${randomUUID()}`;
    const rows = await sql`SELECT * FROM set_membership_fee_configuration(${configId}, ${amountMinor}, 'GHS', ${actor})`;
    if (rows.length !== 1) return res.status(503).json({ ok: false, error: 'MEMBERSHIP_FEE_UPDATE_FAILED' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, fee: { amountMinor: Number(rows[0].amount_minor), currency: String(rows[0].currency), setBy: actor, setAt: rows[0].created_at } });
  } catch (error) {
    console.error('Membership fee settings failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'MEMBERSHIP_FEE_SETTINGS_FAILED' });
  }
}
