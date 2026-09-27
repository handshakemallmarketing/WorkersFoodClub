-- Self-service guest enrollment is identity-provider agnostic.
-- Google/OIDC is optional and never enrollment or membership authority.
ALTER TABLE membership_application ALTER COLUMN issuer DROP NOT NULL;
ALTER TABLE membership_application ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS government_employer text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS applicant_reference text;
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS review_mode text NOT NULL DEFAULT 'AUTO';
ALTER TABLE membership_application ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'NOT_REQUIRED';

ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_guest_contact_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_guest_contact_check
  CHECK (email IS NOT NULL OR phone IS NOT NULL);
ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_review_mode_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_review_mode_check
  CHECK (review_mode IN ('AUTO','MANUAL'));
ALTER TABLE membership_application DROP CONSTRAINT IF EXISTS membership_application_review_status_check;
ALTER TABLE membership_application ADD CONSTRAINT membership_application_review_status_check
  CHECK (review_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'));

-- Contact data is useful for retry detection but is not person identity. Do not enforce
-- unique email/phone: households, shared work contacts and recycled numbers are legitimate.
DROP INDEX IF EXISTS membership_application_pending_identity_uq;
DROP INDEX IF EXISTS membership_application_pending_email_uq;
DROP INDEX IF EXISTS membership_application_pending_phone_uq;
CREATE UNIQUE INDEX IF NOT EXISTS membership_application_applicant_reference_uq
  ON membership_application(applicant_reference) WHERE applicant_reference IS NOT NULL;

COMMENT ON TABLE membership_application IS
  'Self-service guest enrollment. Google/OIDC is optional and submission confers no member-area authority until membership activation.';
COMMENT ON COLUMN membership_application.issuer IS
  'LEGACY only; NULL for new self-service enrollment and never enrollment authority.';
COMMENT ON COLUMN membership_application.subject IS
  'LEGACY only; NULL for new self-service enrollment. Login identity binding is separate and optional.';
COMMENT ON COLUMN membership_application.review_mode IS
  'AUTO means administrative approval is not a prerequisite; MANUAL means review is required before provisioning.';
