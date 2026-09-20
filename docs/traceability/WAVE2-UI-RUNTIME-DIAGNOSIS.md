# Runtime projection failure isolated by UX rescan

The supplied preview screenshots show database-health success at the same time that Offers, Orders, Notifications and Operator queue projections fail. Database reachability therefore must not be treated as application-projection health.

Required follow-up diagnosis:
1. Capture status/error codes for `/api/member-offers`, `/api/member-orders`, `/api/member-notifications`, and `/api/operator-orders` on the exact preview deployment.
2. Separate 401/403 authorization failures from 5xx schema/query/runtime failures.
3. Verify preview-session bearer propagation and governed employee-session propagation independently.
4. Verify the preview database has all Wave 2 migrations expected by those projections.
5. Do not replace fail-closed behavior with demo data or silent fallback.

This branch improves the UX truthfulness but deliberately does not claim the runtime projection defect is repaired without deployment evidence.
