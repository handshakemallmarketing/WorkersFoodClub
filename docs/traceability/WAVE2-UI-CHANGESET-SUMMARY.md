# Changeset summary

This branch is a policy-convergence and UX-truthfulness remediation based on the September 20 screenshot review. It changes no live-money authority.

Primary security change: `/api/employee-session` rejects implicit member-login elevation unless the request originates from the explicit Employee Access step-up journey.

Primary UX change: the member shell is reduced to guest/member functions, with employee access separated and privileged preview personas removed from the rendered sign-in journey.

Known runtime projection failures remain fail-closed and are separately documented for diagnosis rather than concealed with demo fallback data.
