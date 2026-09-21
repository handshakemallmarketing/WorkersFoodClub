# Atomicity note

The AUTO path keeps application creation, participant creation, numbered membership creation, invoice creation, and resulting-membership linkage in one PostgreSQL CTE statement. If invoice creation cannot complete, the numbered membership must not be partially committed by this path.
