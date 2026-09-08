# SW1-02 architecture

The pilot sales surface is a composition layer over SW0 sources of truth.

`CatalogListing` provides merchandising identity; `Specification` provides canonical product identity; `MemberOffer` provides bounded member commercial terms; `GovernedBenchmarkMethod`/`BenchmarkValuation` provide counterfactual economic context; `SalesWindow` adds pilot ordering-cycle policy.

A read may be shown only when these records agree on specification, quantity/place context where applicable, and time validity. No sales read creates demand, obligation, payment, allocation, title transfer or discharge.

The only new write in this slice is sales-window configuration. It is authority-gated because changing an ordering cycle changes which member offers are operationally exposed. Later SW1 checkout must still independently validate the offer/window at command execution time; this read model is not authorization for purchase.
