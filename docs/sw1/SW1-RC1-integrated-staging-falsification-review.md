# SW1-RC1 — Integrated Staging Falsification Review

Status: EXECUTION_GATE
Baseline entering review: `SW1-09`
Production authorization: **NO**

## 1. Purpose

SW1-RC1 is the first cumulative attempt to falsify the SW1 pilot as one integrated system. It must prove that the vertical slices preserve their constitutional boundaries when composed. Passing isolated SW1-01..SW1-09 tests is necessary but not sufficient.

This review is explicitly adversarial. It is not a product demo and it is not satisfied by a happy-path checkout.

## 2. Mandatory canonical member journey

The executable review must begin with a participant that is not yet an active member and must run the same canonical object lineage through the complete pilot loop:

`AUTHENTICATE → BIND PARTICIPANT → VERIFY MEMBERSHIP → PUBLISH GOVERNED SPECIFICATION/LISTING/OFFER/BENCHMARK → OPEN CART → COMMIT 5 KG PREORDER → CREATE SANDBOX PAYMENT INTENT → RECONCILE VERIFIED PAYMENT → RECEIVE TRACEABLE LOT → QUALITY ACCEPT → ALLOCATE 5 KG → PICK/PACK/READY → HANDOVER → ACCEPT 4 KG → RECORD 1 KG SHORTFALL → CREATE SEPARATELY AUTHORIZED 1 KG REFUND REMEDY → COMPLETE REFUND → RECORD 4 KG FULFILLED ECONOMICS → CALCULATE SIGNED SAVINGS → REBUILD MATERIAL PROJECTION`

A test that begins from a pre-created commitment, pre-created membership, pre-created fulfillment state, or pre-created remedy is not RC1 evidence.

## 3. Required conservation assertions

At the end of the mandatory journey the review must prove all of the following:

1. The purchase obligation was exactly 5 kg and originated only from authorized checkout.
2. Payment evidence is linked to that obligation and provider replay cannot create a second economic effect.
3. Inventory allocation is exactly 5 kg from a quality-accepted traceable lot.
4. Performed/discharged goods quantity is exactly 4 kg.
5. The 1 kg shortfall remains a distinct exception and does not auto-create a remedy.
6. The 1 kg refund remedy is separately authorized and completed with evidence.
7. Remedy completion resolves the exception economically but does not rewrite 1 kg as performed goods.
8. Fulfilled economics uses 4 kg actual performed quantity and the canonical completed refund amount/evidence.
9. Savings are computed only from a governed comparable benchmark and canonical fulfilled economics; positive, zero, or negative results remain representable.
10. Any read model used for the final member/operator view is rebuildable/non-authoritative and retains freshness/source lineage.

## 4. Mandatory falsification injections

The cumulative test must attempt, and prove rejection of, at least these attacks in the integrated state:

- **Authority bypass:** role/UI-like access without a valid grant must not bind identity, publish an offer, mutate inventory, fulfill, remedy, or perform an administrative mutation.
- **Checkout proof substitution:** an authorization event for different cart/offer/quantity semantics must not create the member purchase obligation.
- **Payment replay/tamper:** forged signature, amount mismatch, same-event replay, and provider redelivery under a fresh event ID must not duplicate/corrupt payment effect.
- **Inventory double-use:** allocated quantity must not also remain transformable/allocatable as unrestricted availability.
- **Fulfillment overclaim:** acceptance/exception quantities cannot exceed the unresolved canonical obligation and pickup/handover cannot imply acceptance.
- **Remedy fabrication:** refund/replacement cannot exist without a recorded exception and bounded remedy authority.
- **Economics fabrication:** caller-provided outlay/refund/evidence/quantity that disagrees with canonical payment, remedy, or performed quantity must fail closed.
- **Projection authority inversion:** a stale or rebuilt read model cannot mutate or outrank canonical history.
- **Admin recovery fabrication:** recovery may reconcile/retry the same prior authorized failed operation only; it cannot invent a new economic or physical effect.

## 5. Evidence and traceability rules

RC1 evidence must identify:

- exact tested commit SHA;
- executable integrated test path(s);
- all affected canon invariant IDs;
- required source/service paths;
- CI workflow/run proving canon, traceability, typecheck, full tests, kernel tests, PostgreSQL durability, and adapter-race checks;
- review verdict and unresolved findings;
- explicit production-authorization value.

A release evidence file must not be indexed and the cumulative head must not advance to `SW1-RC1` until executable CI is green and the review has no unresolved P0/P1 defect.

## 6. Primary invariants under cumulative attack

At minimum: INV-001, INV-003, INV-004, INV-007, INV-008, INV-009, INV-010, INV-013, INV-019, INV-020, INV-021, INV-024, INV-027, INV-028, INV-029, INV-030.

All INV-001..INV-030 remain in force even where not named above.

## 7. Review verdicts

- `GO_RC1`: mandatory journey passes, required falsification injections fail closed, no unresolved P0/P1 finding, cumulative evidence is complete.
- `NO_GO_RC1`: any conservation assertion fails, any principal attack succeeds, evidence/traceability is incomplete, or any P0/P1 defect remains open.

`GO_RC1` authorizes entry to SW1-RC2 only. It does **not** authorize production launch or live member funds.

## 8. Exit criteria

SW1-RC1 exits only when:

1. the integrated executable replay begins from unverified identity and completes the mandatory shortfall/refund/savings journey;
2. the required falsification attacks are executable and fail closed;
3. cumulative CI is green on the final reviewed commit;
4. an RC1 review artifact records findings and final verdict;
5. release evidence is created only after the review passes;
6. `matrix.json` and `release-index.json` advance atomically to `SW1-RC1` and remain canon-synchronized.

Until all six conditions hold, the authoritative release head remains the prior accepted slice.