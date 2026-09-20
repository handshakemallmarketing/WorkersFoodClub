-- Guest enrollment is identity-provider agnostic. Google/OIDC is a member login option only,
-- after an eligible/active member explicitly binds their membership to that login identity.
ALTER TABLE membership_application ALTER COLUMN issuer DROP NOT NULL;
ALTER TABLE membership_application ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS applicant_reference text;

ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_guest_contact_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_guest_contact_check
  CHECK (issuer IS NOT NULL OR subject IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);

DROP INDEX IF EXISTS membership_application_pending_identity_uq;
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_pending_email_uq
  ON membership_application(lower(email)) WHERE state='SUBMITTED' AND email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_pending_phone_uq
  ON membership_application(phone) WHERE state='SUBMITTED' AND phone IS NOT NULL;

COMMENT ON TABLE membership_application IS
  'Guest/non-member enrollment. Submission requires no Google/OIDC authentication and confers no membership rights.';
COMMENT ON COLUMN membership_application.issuer IS
  'Legacy/pre-binding identity-provider field; NULL for normal guest enrollment. Do not require for application submission.';
COMMENT ON COLUMN membership_application.subject IS
  'Legacy/pre-binding identity-provider field; NULL for normal guest enrollment. Member login identity is bound separately after membership eligibility/activation.';
