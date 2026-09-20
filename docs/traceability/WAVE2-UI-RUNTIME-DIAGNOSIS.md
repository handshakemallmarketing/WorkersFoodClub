# Runtime projection diagnosis and repair

The projection outage was not a generic database-connectivity failure. Vercel runtime observability isolated 372 `/api/member-offers` failures in the prior 24 hours with `NeonDbError: column "min_order_quantity" does not exist`.

Root cause: the connected Food Club Neon database had not received durability migration `021_j16_j17_j20_launch_journeys.sql`, while `/api/member-offers` already selected `min_order_quantity`, `max_order_quantity`, and `campaign_capacity`.

Repair executed 2026-09-20:
- added the three missing `preview_member_offer` columns;
- added the migration's positive/range/capacity checks;
- created the additive `fulfillment_release_code` table and indexes from migration 021;
- verified the three columns are queryable after migration.

The member document now uses `member-shell.js`; operator/refund/fulfillment rendering is no longer loaded into the member shell. Sandbox operator tokens remain available to automated preview rehearsal infrastructure, but privileged personas are not exposed through the rendered member sign-in journey and cannot mint a production employee session.

Residual verification gate: exact-head CI and Vercel deployment must remain green. Member Orders and Notifications remain authorization-bound projections and must be tested with an admitted member credential; absence of an unauthenticated 5xx is not treated as proof of authenticated business correctness.

No Production activation, live Paystack mode, live credentials, or live-money authority is granted by this repair.
