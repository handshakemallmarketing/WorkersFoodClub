# Wave 2 UI defect closure register

| Defect | Disposition |
|---|---|
| Guest presented as Member Overview | Fixed |
| Privileged roles offered as alternate member sign-ins | Fixed: active member document now loads `member-auth.js`, which implements Member-only Preview and exposes no operator/admin role selection |
| Member authentication implicitly minted employee session | Fixed: member authentication controller contains no employee-session mint path; server also requires explicit Employee Access intent |
| Operations/governance mixed into member navigation | Fixed |
| Employee access dead-end | Fixed: dedicated second-authentication gateway |
| SuperUser terminology in member shell | Fixed |
| Infrastructure/Neon/staging/RC copy exposed to members | Fixed in active `member-shell.js` |
| Membership/Household destinations missing | Added contextually for authenticated members |
| Database health badge implied all projections healthy | Fixed: service reachability is represented separately from projection state |
| Runtime Offers projection failure | Fixed: Vercel error isolated missing migration 021 columns; connected Neon schema brought forward and verified |
| Employee governance terminology | Fixed in rendered employee area with System Owner / Admin / bounded Operator terminology |
| Legacy operator renderer embedded in app.js | Fixed at active-document boundary: member page no longer loads `app.js` or `workforce.js`; member commerce lives in `member-shell.js` |
| Legacy combined auth.js | Removed from active member document; retained only as non-loaded historical/test surface pending later repository deletion after dependent historical tests are retired |

Exact-head CI and deployment verification remain release gates; no live-money authority is implied.
