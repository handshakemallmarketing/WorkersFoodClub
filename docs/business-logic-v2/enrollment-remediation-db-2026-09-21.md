# Database invariant

`application_membership.public_member_id` remains the authoritative Member Number field. Its existing unique database constraint protects uniqueness. This remediation does not add a competing member-number table or generator.
