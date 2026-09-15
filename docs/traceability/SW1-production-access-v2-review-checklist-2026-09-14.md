# SW1 Production Access v2 — falsification checklist

- [ ] Existing constitutional/conformance workflow green on exact PR head.
- [ ] `node --test tests/node/sw1-production-access-v2.test.mjs` green.
- [ ] Existing Production OIDC tests remain green.
- [ ] Existing application principal-binding and authority tests remain green.
- [ ] Recovery workflow contains no `RC3_PRODUCTION_MEMBER_TOKEN` dependency.
- [ ] Recovery workflow contains no `RC3_PRODUCTION_OPERATOR_TOKEN` dependency.
- [ ] Recovery verifies standing bounded authorization before changing Production state.
- [ ] Recovery refuses to proceed without Vercel deployment credential.
- [ ] Durable access value is independently re-read as `true` before build/deploy.
- [ ] Recovery deploy has no per-deployment `PRODUCTION_APPLICATION_ACCESS_ENABLED=true` override.
- [ ] Canonical enabled boundary proves unauthenticated HTTP 401, not 503 or 200.
- [ ] Immutable and canonical runtime SHA match recovery candidate.
- [ ] Post-deploy proof failure forces durable OFF and re-proves canonical 503.
- [ ] Independent containment workflow can persist OFF and prove canonical 503.
- [ ] No Paystack-live credential is referenced.
- [ ] No live funds are authorized.
- [ ] No payment/fulfillment mutation authority is broadened.
- [ ] Subsequent ordinary Production deployment inherits durable ON state after recovery.
