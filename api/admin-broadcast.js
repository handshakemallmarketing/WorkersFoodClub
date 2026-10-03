import { requireApplicationAuth } from '../lib/application-auth.js';
import { BROADCAST_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';

/**
 * Read-only access to previously sent administrative notices.
 *
 * The POST path is deliberately contained until the broadcast contract is
 * certified. The unresolved boundary includes durable request idempotency,
 * operator/audit lineage, Production Admin session authority, recipient
 * eligibility, and transactional-versus-promotional consent classification.
 */
export default async function handler(req, res, options = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const principal = await requireApplicationAuth(req, res, 'operator:broadcast.manage', BROADCAST_CAPABLE_OPERATORS, options);
  if (!principal) return;

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, error: 'ADMIN_BROADCAST_SENDING_NOT_CERTIFIED' });
  }

  const env = options.env || process.env;
  const connectionString = options.databaseUrl || env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(9000) } });
    }

    const rows = await sql`
      SELECT subject_id, min(rendered_subject) AS subject, min(rendered_body) AS body, min(event_type) AS event_type, min(queued_at) AS queued_at, count(*) AS recipient_count
      FROM communication_outbox
      WHERE channel = 'IN_APP' AND template_id = 'admin-broadcast-v1'
      GROUP BY subject_id
      ORDER BY min(queued_at) DESC
      LIMIT 20`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      broadcasts: rows.map((r) => ({
        broadcastId: String(r.subject_id),
        subject: String(r.subject),
        body: String(r.body),
        eventType: String(r.event_type),
        queuedAt: new Date(r.queued_at).toISOString(),
        recipientCount: Number(r.recipient_count),
      })),
    });
  } catch (error) {
    console.error('Admin broadcast fetch failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'ADMIN_BROADCAST_FAILED' });
  }
}
