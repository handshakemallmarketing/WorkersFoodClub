# Wave 2 UI defect closure register

| Defect | Disposition |
|---|---|
| Guest presented as Member Overview | Fixed |
| Privileged roles offered as alternate member sign-ins | Rendered journey fixed; legacy preview implementation retained as dead code pending source simplification |
| Member authentication implicitly minted employee session | Fixed at server boundary |
| Operations/governance mixed into member navigation | Fixed |
| Employee access dead-end | Reframed as explicit second-authentication gateway |
| SuperUser terminology in member shell | Fixed |
| Infrastructure/Neon/staging/RC copy exposed to members | Fixed in member shell/runtime normalization |
| Membership/Household destinations missing | Added contextually for authenticated members |
| Database health badge implied all projections healthy | Reworded to service-level status; projection failures remain independently visible |
| Runtime projection failures in screenshots | Open: requires API/runtime diagnosis, not hidden by UX |
| Legacy Operations SuperUser wording in employee.js | Open terminology cleanup |
| Legacy operator renderer embedded in app.js | Open extraction into dedicated bounded-domain operator shell |
