# A11 Payment Boundary Regression

Status: IMPLEMENTED — EXACT-HEAD CI PENDING

The A11 settlement regression has been migrated to the A4 verified-payment-evidence contract. The regression preserves two cross-agent proofs:
- verified annual membership settlement restores commerce eligibility;
- verified membership-fee overpayment remains shipping-only credit and cannot become merchandise credit.

This is a compatibility migration only. It does not broaden payment authority or activate live funds.
