# SW1-02 data boundary

The member catalog view intentionally contains no employment-verification evidence, external authentication subject, payment credential, phone number, home address or operator grant details.

It exposes only product/offer terms and optional governed benchmark context required for the member purchasing decision. Evidence identifiers are retained for benchmark lineage at the service boundary; a later public API may replace raw identifiers with an appropriate transparency summary while preserving server-side audit lineage.
