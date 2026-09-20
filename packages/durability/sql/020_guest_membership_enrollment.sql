-- Guest enrollment is identity-provider agnostic. Google/OIDC is a member login option only,
-- after an active member explicitly binds authoritative member information to that login identity.
ALTER TABLE membership_application ALTER COLUMN issuer DROP NOT NULL;
ALTER TABLE membership_application ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS applicant_reference text;

-- Enrollment authority is contact/application data, never an identity-provider subject.
-- issuer/subject remain nullable only for backward compatibility with pre-v4 rows.
ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_guest_contact_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_guest_contact_check
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

DROP INDEX IF EXISTS membership_application_pending_identity_uq;
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_pending_email_uq
  ON membership_application(lower(email)) WHERE state='SUBMITTED' AND email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_pending_phone_uq
  ON membership_application(phone) WHERE state='SUBMITTED' AND phone IS NOT NULL;

COMMENT ON TABLE membership_application IS
  'Guest/non-member enrollment. Submission requires no Google/OIDC authentication and confers no membership rights.';
COMMENT ON COLUMN membership_application.issuer IS
  'Legacy field retained for migration compatibility; NULL for guest enrollment and never enrollment authority.';
COMMENT ON COLUMN membership_application.subject IS
  'Legacy field retained for migration compatibility; NULL for guest enrollment. Login identity binding is a separate post-activation ceremony.';
