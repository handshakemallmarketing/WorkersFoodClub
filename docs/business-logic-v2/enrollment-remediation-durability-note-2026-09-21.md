# Durability proof

Hosted certification should verify the returned Member Number is retrievable from the persisted `application_membership` row and that its invoice is linked through the same `membership_id`. A 201 response alone is not sufficient durability proof.
