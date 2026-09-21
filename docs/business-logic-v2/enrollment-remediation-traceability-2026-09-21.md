# Traceability

User-confirmed business truth on 2026-09-21: take prospective member information, issue Member Number, issue invoice against that membership, collect payment, activate membership. Implementation: `api/membership-apply.js`; activation boundary: `api/membership-subscription-settle.js`; UI: `public/join.html`; canonical amendment: master truth matrix v1.5.
