# Member Number immutability

Settlement replay with the same evidence is idempotent and returns the pre-issued Member Number. A later payment event cannot generate a replacement number. Database uniqueness on `public_member_id` remains authoritative against collisions.
