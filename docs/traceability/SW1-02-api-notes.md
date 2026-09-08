# SW1-02 API notes

Future HTTP handlers should expose catalog reads as queries and sales-window configuration as a consequential command. The configuration handler must derive the operator Participant from SW1-01 identity binding, obtain grant ids from trusted server-side authority context, and route the consequential write through the durable transactional command boundary when production persistence is introduced.

Browser-supplied actor ids, authority decisions, benchmark values, price evidence, or window-open booleans are untrusted input.
