# SW1-09 Review Checklist

- AuthorityEvaluator gates every consequential admin mutation.
- UI/admin role alone cannot authorize mutation.
- Every accepted/rejected/replayed attempt is auditable.
- Same request + same payload replays without duplicate effect.
- Same request + different payload fails closed.
- Failed/uncertain mutation cannot be blindly retried.
- Recovery requires separate authority and original-request lineage.
- Stale recovery fails closed.
- Audit view is read-only, non-authoritative, source-linked and freshness-aware.
- No production authorization is implied.
