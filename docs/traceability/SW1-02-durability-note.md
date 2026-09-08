# SW1-02 durability caveat

`GovernedSalesWindowRegistry` is intentionally an in-memory reference in this slice. Before production, sales-window writes must be placed behind the durable consequential command/transaction boundary and persisted with idempotency/concurrency semantics. This slice proves product semantics and authority composition, not that persistence step.
