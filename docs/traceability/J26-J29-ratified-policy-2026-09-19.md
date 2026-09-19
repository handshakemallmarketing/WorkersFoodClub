# J26/J27/J29 owner-ratified policy — 2026-09-19

## J26 item-level credit
- New credit is available only to ACTIVE/CURRENT members with ACTIVE CAGD deduction enrollment.
- A CAGD record on file never overrides inactive/suspended membership.
- Credit enablement, required deposit, maximum financed exposure and payroll-installment cadence are item/offer parameters.
- Credit is interest-free and non-transferable.
- Retirement, resignation, termination or other separation from covered employment accelerates the entire remaining receivable balance due.
- Existing receivables survive membership restriction; restriction blocks new credit rather than erasing debt.

## J27 electronic payment rails
- CAGD deduction enrollment is optional.
- Supported architecture is electronic-only: mobile money, bank transfer and CAGD payroll deduction. Cash is prohibited.
- A CAGD mandate is permission/evidence only; it is not payment.
- Only reconciled remittance/settlement evidence may reduce an authoritative obligation.
- This implementation does not activate or execute live CAGD deductions, live Paystack, or live funds.

## J29 Promotions, Rewards & Campaigns
- Referral rewards are one configurable promotion type, not hard-coded economics.
- Campaigns may be finite or indefinite and may vary by geography, eligibility, qualifying event, reward formula, caps, budget and redemption rules.
- Benefits may include percentage/fixed discounts, shopping credit, physical branded merchandise, free products/services, raffle entries and raffle prizes.
- Example supported configuration: nationwide indefinite referral campaign awarding 10% off the referrer's next eligible payment after the referred person becomes ACTIVE/CURRENT under the campaign's qualification contract.
- Physical merchandise uses a reward entitlement/inventory fulfillment path rather than shopping-credit semantics.
- Raffle entry and winner/prize fulfillment are distinct durable events. The eligible population is frozen/evidenced before a draw; duplicate entries from replay are prohibited.
- Campaign lifecycle: DRAFT -> APPROVED/SCHEDULED -> ACTIVE -> PAUSED/CLOSED. Creation does not imply activation.
- `operator:promotions.manage` is separate governed authority.
- Jurisdiction-specific raffle/legal review remains an activation gate where applicable; application code must not infer legality.

## Preserved journeys
J28 surveys and J30 support remain unchanged and are regression gates.
