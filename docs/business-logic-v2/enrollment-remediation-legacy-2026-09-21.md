# Legacy compatibility

If a legacy invoice references a PRIMARY membership that lacks `public_member_id`, settlement now fails closed with `MEMBER_NUMBER_NOT_ISSUED`. Such data must be reconciled through an explicit governed migration/backfill rather than silently minting identity during payment.
