# CB-00 ↔ Owner-Ratified Policy Reconciliation v1.0

Status: GOVERNANCE RECONCILIATION — NO LIVE-MONEY AUTHORITY
Date: 2026-09-19
Authority source: `docs/governance/POLICY_RATIFICATION_REGISTER_v1.md`
Executable canon source: `canon/invariants.json` (`CB-00-v0.1`)

## Purpose

This document reconciles the System Owner-ratified PR-01..PR-32 policy baseline against the 30 discoverable CB-00 executable invariants. It does not invent missing C0-C10 text and does not promote `constitution/baseline.json` from `PROPOSED_FOR_RATIFICATION`.

## Reconciliation result

No PR-01..PR-32 policy decision requires weakening or contradicting a CB-00 invariant. The policy register supplies domain-specific choices where CB-00 intentionally states a higher-order invariant or leaves a governed policy choice open.

| CB-00 invariant | Policy relationship | Disposition |
|---|---|---|
| INV-001 authority is not implied by UI/title/model | PR-04, PR-06..PR-09, PR-24, PR-30..31 | ALIGNED — explicit step-up, default deny, bounded grants and separated refund authority strengthen the invariant. |
| INV-002 evidence outranks projections | PR-18, PR-25..27 | ALIGNED — settlement/reversal/correction/recovery evidence remains authoritative. |
| INV-003 forecast/interest/history ≠ committed demand | PR-15..18 | ALIGNED — qualification requires commitment plus confirmed settlement threshold. |
| INV-004 no obligation without authorized relationship/event | PR-02..05, PR-15..18 | ALIGNED — authentication/payment initiation cannot manufacture membership or economic obligation. |
| INV-005 supply facets remain distinct | No conflicting owner policy | PRESERVED. |
| INV-006 sourcing compares equivalent obligations; ABSTAIN valid | No conflicting owner policy | PRESERVED. |
| INV-007 physical quantity change requires traceable event | PR-23, PR-25..26 | ALIGNED — quantity-aware acceptance and additive remedies/corrections preserve traceability. |
| INV-008 transformations preserve provenance | PR-23, PR-25..26 | PRESERVED/ALIGNED. |
| INV-009 unsafe/held quantity cannot become available by projection | PR-23 | PRESERVED — rejected/non-conforming quantity remains in governed disposition. |
| INV-010 ownership/possession/custody/control/allocation/encumbrance distinct | PR-21..23 | ALIGNED — handover establishes custody only; title/risk require canonical acceptance. |
| INV-011 reserve is governed | No conflicting owner policy | PRESERVED. |
| INV-012 purpose-specific cost basis | No conflicting owner policy | PRESERVED. |
| INV-013 savings require governed benchmark and may be ≤0 | No conflicting owner policy | PRESERVED. |
| INV-014 subsidy/promotion cannot masquerade as structural advantage | PR-05, PR-32 | ALIGNED — employee-sponsored membership is explicit entitlement, not fake payment/economic evidence. |
| INV-015 future price promises are bounded | PR-15 | ALIGNED — offer-specific qualification remains governed per offer. |
| INV-016 expected return cannot override liquidity/solvency constraints | PR-19..20 | ALIGNED — credit/payroll authority withheld rather than inferred. |
| INV-017 security interests remain visible | No conflicting owner policy | PRESERVED. |
| INV-018 no unauthorized double pledge | No conflicting owner policy | PRESERVED. |
| INV-019 possession/custody/title/risk/acceptance/settlement/discharge orthogonal | PR-21..23 | POLICY GAP CLOSED — Ghana pilot title and ordinary physical-loss risk transfer on canonical acceptance of applicable quantity; handover is custody only. Legal/governance evidence remains separately required. |
| INV-020 only conforming performed quantity is discharged | PR-23 | ALIGNED — partial acceptance transfers consequences only for accepted quantity. |
| INV-021 substitution preserves promise/equivalence/consent/economics | PR-23, PR-25 | PRESERVED — remedy remains additive and governed. |
| INV-022 returns require governed quality determination | No conflicting owner policy | PRESERVED. |
| INV-023 observation/assertion/inference/model output distinct | PR-29..30 | ALIGNED — lower implementation/model layers cannot create governing policy. |
| INV-024 corrections/reversals/restatements additive/versioned | PR-18, PR-25..26 | DIRECTLY ALIGNED. |
| INV-025 contradictory evidence preserved until governed resolution | PR-17..18, PR-25..26 | ALIGNED — overpayment/reversal/remedy create explicit governed records. |
| INV-026 material decisions preserve model/input/assumption/authority envelope | PR-27..30 | ALIGNED — policy and recovery decisions require durable evidence/authority. |
| INV-027 retries cannot duplicate economic/physical effect | PR-17..18, PR-25 | PRESERVED — no policy authorizes replay-created effects. |
| INV-028 stale concurrency cannot violate quantity/authority/exposure | PR-06..09, PR-15..18, PR-23..24 | PRESERVED/ALIGNED. |
| INV-029 projections cannot corrupt canon and must disclose lineage/freshness | PR-25..27, PR-29 | ALIGNED. |
| INV-030 implementation cannot silently amend canon | PR-28..30 | DIRECTLY ALIGNED — constitutional/policy hierarchy makes amendment explicit governance work. |

## Policy closures versus implementation closures

Owner ratification closes policy ambiguity only. It does not convert a journey to `PROVEN`.

The following previously open policy questions now have authoritative dispositions:

- Membership admission/authentication/workforce relationship: CLOSED-BY-POLICY via PR-01..PR-09 and PR-31..32.
- Membership grace/restoration: CLOSED-BY-POLICY via PR-10..11.
- Household entitlement and beneficiary behavior: CLOSED-BY-POLICY via PR-12..14.
- Minimum commitment qualification, below-threshold settlement, overpayment and reversal: CLOSED-BY-POLICY via PR-15..18.
- Initial member credit: WITHHELD-BY-POLICY via PR-19.
- Initial CAGD/payroll deduction: WITHHELD-BY-POLICY via PR-20.
- Ghana pilot title/risk semantics: CLOSED-BY-POLICY via PR-21..23; EXTERNAL-REVIEW/EVIDENCE remains where legally or operationally required.
- Refund authority separation and immutable corrections: CLOSED-BY-POLICY via PR-24..26.
- Recovery objectives: CLOSED-BY-POLICY via PR-27; IMPLEMENTATION/EVIDENCE remains required.

## Constitutional status

`CB-00-v0.1` is discoverable and executable. Its 30 invariants remain preserved.

The named C0-C10 corpus remains unresolved because its substantive source text is not presently discoverable in the repository. Therefore:

1. do not claim C0-C10 exact-text ratification;
2. do not fabricate reconstructed historical wording;
3. preserve CB-00 invariants as executable constitutional constraints;
4. use the owner-ratified policy register as the authoritative business-policy layer below a future formally ratified Constitution;
5. either recover C0-C10 source material or explicitly supersede the missing corpus through a separately reviewed Constitution v1.0 ratification event.

## Safety boundary

Nothing in this reconciliation authorizes Paystack live mode, live credentials, live funds, Production payment/refund/fulfillment mutation expansion, member credit, or CAGD/payroll deduction.
