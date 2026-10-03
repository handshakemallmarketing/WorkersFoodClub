import { randomUUID } from 'node:crypto';
import { requireApplicationAuth } from '../lib/application-auth.js';
import { BROADCAST_CAPABLE_OPERATORS } from '../lib/operator-tiers.js';

/**
 * Sends a system-wide notice (downtime, ToS changes, etc.) to every
 * non-ended membership via the existing communication_outbox table
 * (migration 005) -- that table and its IN_APP read side
 * (api/member-notifications.js) already existed; this is the first writer.
 * IN_APP only: it stores the notice as already-delivered (status='SENT'),
 * matching CommunicationDispatcher.run()'s own semantics for that channel.
 * No PROMOTIONAL class or opt-in/suppression check applies -- a downtime or
 * ToS notice is a transactional service communication, not marketing.
 */
const EVENT_TYPES = ['DOWNTIME_NOTICE', 'TOS_CHANGE', 'SECURITY_NOTICE', 'GENERAL_ANNOUNCEMENT'];
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 4000;

export default async function handler(req, res, options = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const principal = await requireApplicationAuth(req, res, 'operator:broadcast.manage', BROADCAST_CAPABLE_OPERATORS, options);
  if (!principal) return;

  const env = options.env || process.env;
  const connectionString = options.databaseUrl || env.DATABASE_URL;
  if (!connectionString && !options.sql) return res.status(503).json({ ok: false, error: 'DATABASE_URL_MISSING' });

  try {
    let sql = options.sql;
    if (!sql) { const { neon } = await import('@neondatabase/serverless'); sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(9000) } }); }

    if (req.method === 'GET') {
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
    }

    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const eventType = EVENT_TYPES.includes(req.body?.eventType) ? req.body.eventType : null;
    if (!subject || subject.length > MAX_SUBJECT_LENGTH) return res.status(400).json({ ok: false, error: 'SUBJECT_INVALID' });
    if (!body || body.length > MAX_BODY_LENGTH) return res.status(400).json({ ok: false, error: 'BODY_INVALID' });
    if (!eventType) return res.status(400).json({ ok: false, error: 'EVENT_TYPE_INVALID' });

    const broadcastId = options.broadcastId || `broadcast:${randomUUID()}`;

    const rows = await sql`
      WITH recipients AS (
        SELECT DISTINCT participant_id FROM application_membership WHERE state <> 'ENDED'
      ), inserted AS (
        INSERT INTO communication_outbox(
          id, dedupe_key, event_id, member_id, subject_id, event_type, communication_class,
          template_id, template_version, channel, rendered_subject, rendered_body,
          status, queued_at, available_at, sent_at, provider_message_id, retry_count
        )
        SELECT
          'comm:' || md5(${broadcastId} || '|' || participant_id),
          ${broadcastId} || '|' || participant_id || '|admin-broadcast-v1|1|IN_APP',
          ${broadcastId} || ':' || participant_id,
          participant_id,
          ${broadcastId},
          ${eventType},
          'TRANSACTIONAL',
          'admin-broadcast-v1',
          1,
          'IN_APP',
          ${subject},
          ${body},
          'SENT',
          now(), now(), now(),
          'in-app:' || participant_id,
          0
        FROM recipients
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING member_id
      )
      SELECT member_id FROM inserted`;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, broadcastId, eventType, recipientCount: rows.length });
  } catch (error) {
    console.error('Admin broadcast failed', { name: error?.name, code: error?.code, message: error?.message });
    return res.status(503).json({ ok: false, error: 'ADMIN_BROADCAST_FAILED' });
  }
}
