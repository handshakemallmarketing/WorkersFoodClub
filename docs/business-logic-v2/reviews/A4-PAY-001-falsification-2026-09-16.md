# A4-PAY-001 Falsification Gate — 2026-09-16

Gate state: PENDING EXACT-HEAD CI

Implementation head will be accepted only if build/conformance and the A2/A4/A11 payment-boundary suites pass on the exact branch head.

Required proof:
1. old caller `{amountMinor, reference}` assertion cannot settle an invoice;
2. verified=false cannot settle;
3. persisted=false cannot settle;
4. empty evidence identity/provider reference cannot settle;
5. participant mismatch cannot settle;
6. obligation mismatch cannot settle;
7. verified amount below annual fee cannot settle;
8. exact verified annual payment settles and restores standing;
9. verified overpayment creates only excess SHIPPING credit;
10. replay cannot create a second settlement allocation or second shipping-credit lot.

A4-PAY-001 must remain open until exact-head CI provides this proof.
