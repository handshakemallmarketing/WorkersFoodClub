# Production Access v2 review request

Review the exact branch head for security, governance, and fail-closed behavior.

Required falsification targets:

1. No short-lived human Google ID token is required to deploy or recover Production application access.
2. Request-time Production OIDC/JWKS verification is not bypassed or weakened.
3. Durable `PRODUCTION_APPLICATION_ACCESS_ENABLED` state cannot be silently reset by an ordinary Production deployment.
4. Recovery cannot widen authority beyond Production application access.
5. Paystack live mode, live funds, live credentials, payment mutation, and fulfillment mutation remain unauthorized.
6. Any failure after Production deployment forces durable switch false and re-proves canonical 503.
7. Containment is independently invokable and does not require member/operator credentials.
8. Runtime identity proof is bound to the exact deployed Git SHA.
9. Deterministic cryptographic fixtures reject forged signatures, wrong issuer/audience, expiry, unsupported algorithms, and unknown key IDs.
10. Identify any P0/P1 path where a deployment can leave Production access in an uncertain or widened state.

Do not authorize Paystack live, live funds, or Production economic mutations during this review.
