# SW1-RC3 Paystack Operator Reconciliation Procedure — 2026-09-14

## Scope

This procedure governs operator reconciliation of Paystack payment and refund outcomes for WorkersFoodClub. It is provider-evidence handling only; provider responses do not self-authorize canonical economic effects.

Current authorization envelope:

- Paystack environment: TEST only
- Credential class: `sk_test_*` only
- Live funds authorized: false
- Paystack live mode authorized: false
- Production application access: remains separately governed and fail-closed outside an explicitly bounded rehearsal

## Transaction reconciliation

1. Start from the canonical WorkersFoodClub payment reference. Never substitute an operator-supplied alternate reference after initiation.
2. Query Paystack `GET /transaction/verify/:reference` using the exact canonical provider reference.
3. Record the observed provider status, amount, currency, provider reference, and provider timestamp as evidence.
4. Require reference, amount, and currency to match the expected canonical payment facts before treating a provider success as usable confirmation evidence.
5. If the provider response is pending, unknown, timed out, or unavailable, leave the canonical payment state nonterminal and re-query. Do not infer success from initiation, redirect state, client UI, or timeout.
6. Repeated verification of the same reference must be idempotent with respect to canonical effects. A confirmed provider response is evidence for the existing payment, not authority to create a second payment.
7. Any reference mismatch, amount mismatch, currency mismatch, invalid signature, or unauthenticated provider traffic is escalated and must not produce economic truth.

## Refund reconciliation

1. Start refunds from an already governed transaction reference.
2. Create the refund through Paystack `POST /refund` and record the returned Paystack refund ID.
3. Query Paystack `GET /refund/:id` using that exact refund ID.
4. While Paystack reports `pending`, preserve a nonterminal refund state and retry the status query; do not mark the refund complete merely because refund creation succeeded.
5. Treat a terminal provider refund state as evidence for the existing refund workflow only after transaction/reference/amount/currency binding checks pass.
6. Retries and redeliveries must be idempotent. They may update evidence for the same refund but must not create duplicate canonical refund effects.
7. Provider failures or prolonged pending states require operator review; canonical history is not rewritten to hide the intermediate state.

## Webhook handling

Paystack webhooks are authenticated with `x-paystack-signature`, verified as HMAC-SHA512 over the exact raw request body using the environment-appropriate Paystack secret. Invalid signatures, tampered bodies, unsupported authenticated events, and unauthenticated traffic fail closed.

Webhook receipt is provider evidence only. Canonical economic effects remain subject to the application authority, idempotency, reference-binding, durability, and replay controls already required by SW1.

## Current runtime evidence

GitHub Actions run `34808988687` against Preview deployment `https://workers-food-club-5wpwd4iyr-food-club.vercel.app` and exact commit `ee2179d0cc45c24dc678af8900164dd45322d8f2` proved:

- real Paystack TEST initiation for GHS 1.00;
- provider verification to `CONFIRMED`;
- delayed re-query remaining `CONFIRMED`;
- real Paystack refund creation;
- six provider refund-status re-queries, all successful and still `PENDING` during the bounded observation window;
- authenticated Vercel Preview transport;
- no live credential use and no live-funds authorization.

The bounded run does not claim that a live merchant webhook was delivered. Live webhook delivery authenticity remains withheld until a separately authorized live-provider envelope exists.

## Live activation boundary

Before any future live-funds authorization, all of the following remain mandatory:

- approved `sk_live_*` provisioning through the designated secret-management path;
- exact production Paystack merchant/account identification;
- live webhook delivery authenticity from that exact merchant integration;
- explicit live-mode enablement and kill switch;
- minimal-value controlled live transaction only after explicit authorization;
- rollback verification.

Until then, `liveFundsAuthorized=false` and Paystack live mode remains unauthorized.