# Schema decision

No new schema column is required for invoice Member Number duplication. `membership_subscription_invoice.membership_id -> application_membership.public_member_id` is the canonical relationship. This avoids divergent identifiers.
