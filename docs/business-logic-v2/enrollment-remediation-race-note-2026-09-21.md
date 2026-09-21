# Race note

Member Number uniqueness is enforced by the existing database uniqueness constraint. A collision must fail the atomic enrollment rather than silently selecting another identifier after a partial write. Future retry policy may regenerate the entire transaction, not mutate a committed membership identity.
