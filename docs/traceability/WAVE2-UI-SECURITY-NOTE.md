# Security note — member vs employee authentication

The previous browser flow called `/api/employee-session` automatically after successful member identity verification. Although the employee session was separately signed and authority-backed, this collapsed the user journey into one apparent authentication event.

The server now requires `x-employee-step-up-intent: employee-access`. Only the dedicated Employee Access page adds this intent marker, and it still requires a fresh verified production identity plus an active authority grant. Therefore an ordinary member sign-in cannot mint an employee session even if legacy browser code attempts the call.

The marker is not treated as authentication or authorization by itself; it is only a mandatory journey discriminator layered on top of fresh OIDC verification and server-side authority checks.
