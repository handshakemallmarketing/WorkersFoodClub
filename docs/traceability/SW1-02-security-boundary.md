# SW1-02 security boundary

Authentication or an operator/admin UI role is not sufficient to configure a sales window. The caller must resolve to a canonical Participant and present a grant that the AuthorityEvaluator accepts for `sales-window.configure` and the target window.

Member-facing catalog reads are not consequential authority. They expose only already-governed records and do not grant checkout, payment, allocation, refund, transfer or settlement permission.

A later API layer must derive actor identity from the authenticated identity binding introduced in SW1-01; it must not accept `configuredBy` as a trustworthy browser-supplied identity field.
