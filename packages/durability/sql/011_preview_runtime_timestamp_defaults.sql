-- SW1 runtime vertical-slice remediation.
-- The preview mutation handlers intentionally derive event occurrence timestamps from
-- the persisted row. Give those persistence timestamps database-owned defaults so
-- clean-schema inserts cannot violate NOT NULL before canonical events are emitted.

ALTER TABLE preview_member_commitment
  ALTER COLUMN accepted_at SET DEFAULT now();

ALTER TABLE preview_sandbox_payment
  ALTER COLUMN recorded_at SET DEFAULT now();
