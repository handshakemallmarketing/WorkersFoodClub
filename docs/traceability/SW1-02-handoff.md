# SW1-02 → SW1-03 handoff

SW1-03 may consume an executable sales-window/listing/offer tuple as checkout input, but must revalidate it at command execution time. A rendered member catalog view is not purchase authority and must never be accepted as proof that an offer remains executable.

SW1-03 target: authenticated active member → revalidated governed offer/window → explicit purchase intent → authorized durable purchase obligation, with idempotent retry and stale/concurrent command attacks.
