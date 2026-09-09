# SW1-06 — Pick, Pack, Pickup, Acceptance & Exception

This slice composes the existing SW0 fulfillment, authority, inventory, demand, remedy and resolution primitives into the first governed pilot fulfillment workflow.

It proves that pick/pack/ready work is bound to a canonical allocation and authorized warehouse actor; pickup handover is distinct from member acceptance; only independently authorized member acceptance records performed quantity; partial acceptance remains partial; and a shortfall/rejection exception remains an unresolved claim boundary until SW1-07 authorizes and completes a remedy.

The slice intentionally does not claim legal title/risk transfer, production durability for the whole fulfillment composition, or automatic remedy authority. Those remain separate governed boundaries.
