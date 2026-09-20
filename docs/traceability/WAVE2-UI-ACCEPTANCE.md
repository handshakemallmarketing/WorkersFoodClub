# Wave 2 UI acceptance gates

- Guest can browse public/non-member content without authentication.
- Guest cannot see member-only, employee, operator, or governance navigation.
- Member sign-in never offers an operator/admin role picker in the rendered journey.
- Successful member authentication does not mint an employee session.
- Employee Access requires a separate fresh authentication event and active authority.
- Member shell never exposes raw Neon, staging, RC, or production-control constants.
- Member projection outage is shown as an application-service outage, not contradicted by a database badge.
- Authenticated members receive contextual Membership, Household and Employee Access destinations.
- Privileged operator/governance implementation is not treated as a member-area feature.
