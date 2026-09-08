# SW1-02 authority action

The new action string is `sales-window.configure`, targeted to `sales-window:<window-id>`. A grant may be prefix-scoped consistently with the SW0 authority model. Revocation, effective dates, delegation-chain validity and HOLD/STOP constraints remain the responsibility of `AuthorityEvaluator`; the sales module does not reimplement them.
