# SW1 Production Access v2 — Ordinary Deployment Persistence Proof

Status: PENDING_RUNTIME_PROOF
Date: 2026-09-15
Parent main commit: `2b8b75627c0a2772570cc7ad97a410f810897d51`

## Purpose

Create one controlled, ordinary Git-integrated Production deployment after the governed Production Access v2 recovery, solely to falsify the persistence requirement that a normal Production deployment must inherit the durable project-level `PRODUCTION_APPLICATION_ACCESS_ENABLED=true` state rather than resetting application access to OFF.

## Authorization envelope

Authorized by the application owner on 2026-09-15 for this persistence experiment.

This experiment does **not** authorize:

- Paystack live mode;
- creation, reading, provisioning, replacement, or use of live Paystack credentials;
- live member funds;
- any payment or fulfillment mutation authority beyond the already-ratified non-live envelope;
- weakening the independent Production Access v2 containment path.

## Required post-deployment proof

After this evidence-only commit reaches `main` through the ordinary Git integration path, verify against the canonical Production alias:

1. `/api/build-info` identifies the new ordinary Git-integrated `main` commit.
2. `/api/member-orders` without authentication returns `401 AUTHENTICATION_REQUIRED`, not `503 PRODUCTION_APPLICATION_ACCESS_DISABLED`.
3. `/api/db-health` remains healthy and connected to the governed Production database.
4. Runtime error/fatal logs disclose no new deployment regression.
5. Live Paystack, live credentials, live funds, and unauthorized economic mutation authority remain withheld.

Any unexpected access-state result is a failed persistence proof and requires fail-closed containment rather than reinterpretation.
