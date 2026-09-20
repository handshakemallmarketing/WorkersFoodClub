# Source simplification backlog

These items are not allowed to regress the rendered/security boundary, but should be removed as the operator shell is completed:

1. Delete PREVIEW_ROLES privileged personas and `setPreviewRole` operator/admin branches from `public/auth.js`.
2. Delete automatic `elevateEmployeeSession()` invocation from member authentication; the server already rejects it without explicit employee intent.
3. Replace `superUserAccess` naming with explicit System Owner/Admin governance semantics.
4. Extract operator order/refund rendering from `public/app.js` into the dedicated employee/operator application.
5. Replace `Operations SuperUser` preset wording in `public/employee.js` with bounded operator-domain terminology.
6. Add end-to-end browser tests for Guest → Member → Employee Access and denial/revocation transitions.

This backlog exists because source deletion across the legacy 32KB auth module and operator renderer is materially riskier than first enforcing the policy at the server boundary and rendered journey. It must be completed before calling the UI architecture fully simplified.
