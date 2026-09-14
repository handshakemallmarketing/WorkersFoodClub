-- SW1-RC3 post-merge remediation: version the previously out-of-band preview runtime schema.
-- Definitions were reconciled against the bounded Production Neon schema on 2026-09-14.
-- IF NOT EXISTS preserves safe application to environments where the legacy tables already exist;
-- clean-database CI proves the checked-in definitions can build the runtime schema from scratch.

CREATE TABLE IF NOT EXISTS preview_member_offer (
  offer_id text CONSTRAINT preview_member_offer_offer_id_not_null NOT NULL,
  name text CONSTRAINT preview_member_offer_name_not_null NOT NULL,
  description text CONSTRAINT preview_member_offer_description_not_null NOT NULL,
  unit_quantity numeric CONSTRAINT preview_member_offer_unit_quantity_not_null NOT NULL,
  unit text CONSTRAINT preview_member_offer_unit_not_null NOT NULL,
  price_minor bigint,
  currency text,
  fulfillment_method text CONSTRAINT preview_member_offer_fulfillment_method_not_null NOT NULL,
  status text CONSTRAINT preview_member_offer_status_not_null NOT NULL,
  sort_order integer DEFAULT 0 CONSTRAINT preview_member_offer_sort_order_not_null NOT NULL,
  updated_at timestamptz DEFAULT now() CONSTRAINT preview_member_offer_updated_at_not_null NOT NULL,
  CONSTRAINT preview_member_offer_pkey PRIMARY KEY (offer_id),
  CONSTRAINT preview_member_offer_unit_quantity_check CHECK (unit_quantity > 0),
  CONSTRAINT preview_member_offer_unit_check CHECK (length(trim(unit)) > 0),
  CONSTRAINT preview_member_offer_price_minor_check CHECK (price_minor IS NULL OR price_minor >= 0),
  CONSTRAINT preview_member_offer_currency_check CHECK (currency IS NULL OR currency = 'GHS'),
  CONSTRAINT preview_member_offer_fulfillment_method_check CHECK (fulfillment_method = ANY (ARRAY['PICKUP'::text,'DELIVERY'::text])),
  CONSTRAINT preview_member_offer_status_check CHECK (status = ANY (ARRAY['OPEN'::text,'COMING_SOON'::text,'CLOSED'::text]))
);

CREATE TABLE IF NOT EXISTS preview_member_commitment (
  obligation_id text NOT NULL,
  participant_id text NOT NULL,
  membership_id text NOT NULL,
  offer_id text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  committed_price_minor bigint NOT NULL,
  currency text NOT NULL,
  fulfillment_method text NOT NULL,
  state text NOT NULL,
  policy_version text NOT NULL,
  request_id text NOT NULL,
  authorized_command_id text NOT NULL,
  authorized_event_id text NOT NULL,
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_member_commitment_pkey PRIMARY KEY (obligation_id),
  CONSTRAINT preview_member_commitment_request_id_key UNIQUE (request_id),
  CONSTRAINT preview_member_commitment_authorized_command_id_key UNIQUE (authorized_command_id),
  CONSTRAINT preview_member_commitment_authorized_event_id_key UNIQUE (authorized_event_id),
  CONSTRAINT preview_member_commitment_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES preview_member_offer(offer_id) ON DELETE RESTRICT,
  CONSTRAINT preview_member_commitment_participant_id_check CHECK (participant_id = 'preview:member:001'),
  CONSTRAINT preview_member_commitment_membership_id_check CHECK (membership_id = 'preview:membership:001'),
  CONSTRAINT preview_member_commitment_quantity_check CHECK (quantity > 0),
  CONSTRAINT preview_member_commitment_unit_check CHECK (length(trim(unit)) > 0),
  CONSTRAINT preview_member_commitment_committed_price_minor_check CHECK (committed_price_minor >= 0),
  CONSTRAINT preview_member_commitment_currency_check CHECK (currency = 'GHS'),
  CONSTRAINT preview_member_commitment_fulfillment_method_check CHECK (fulfillment_method = ANY (ARRAY['PICKUP'::text,'DELIVERY'::text])),
  CONSTRAINT preview_member_commitment_state_check CHECK (state = ANY (ARRAY['OPEN'::text,'CANCELLED'::text,'FULFILLED'::text]))
);
CREATE INDEX IF NOT EXISTS preview_member_commitment_participant_created_idx
  ON preview_member_commitment(participant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preview_fulfillment (
  fulfillment_id text NOT NULL,
  obligation_id text NOT NULL,
  ready_request_id text NOT NULL,
  ready_event_id text NOT NULL,
  operator_id text NOT NULL,
  ready_quantity numeric NOT NULL,
  unit text NOT NULL,
  pickup_place text NOT NULL,
  state text NOT NULL,
  ready_at timestamptz NOT NULL,
  acceptance_request_id text,
  acceptance_id text,
  acceptance_event_id text,
  participant_id text,
  accepted_quantity numeric,
  shortfall_quantity numeric,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_fulfillment_pkey PRIMARY KEY (fulfillment_id),
  CONSTRAINT preview_fulfillment_obligation_id_key UNIQUE (obligation_id),
  CONSTRAINT preview_fulfillment_ready_request_id_key UNIQUE (ready_request_id),
  CONSTRAINT preview_fulfillment_ready_event_id_key UNIQUE (ready_event_id),
  CONSTRAINT preview_fulfillment_acceptance_request_id_key UNIQUE (acceptance_request_id),
  CONSTRAINT preview_fulfillment_acceptance_id_key UNIQUE (acceptance_id),
  CONSTRAINT preview_fulfillment_acceptance_event_id_key UNIQUE (acceptance_event_id),
  CONSTRAINT preview_fulfillment_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  CONSTRAINT preview_fulfillment_ready_quantity_check CHECK (ready_quantity > 0),
  CONSTRAINT preview_fulfillment_unit_check CHECK (length(trim(unit)) > 0),
  CONSTRAINT preview_fulfillment_pickup_place_check CHECK (length(trim(pickup_place)) > 0),
  CONSTRAINT preview_fulfillment_accepted_quantity_check CHECK (accepted_quantity >= 0),
  CONSTRAINT preview_fulfillment_shortfall_quantity_check CHECK (shortfall_quantity >= 0),
  CONSTRAINT preview_fulfillment_state_check CHECK (state = ANY (ARRAY['READY'::text,'ACCEPTED'::text,'PARTIALLY_ACCEPTED'::text,'REJECTED'::text])),
  CONSTRAINT preview_fulfillment_check CHECK (
    (state='READY' AND acceptance_request_id IS NULL AND acceptance_id IS NULL AND acceptance_event_id IS NULL AND participant_id IS NULL AND accepted_quantity IS NULL AND shortfall_quantity IS NULL AND accepted_at IS NULL)
    OR
    (state<>'READY' AND acceptance_request_id IS NOT NULL AND acceptance_id IS NOT NULL AND acceptance_event_id IS NOT NULL AND participant_id IS NOT NULL AND accepted_quantity IS NOT NULL AND shortfall_quantity IS NOT NULL AND accepted_at IS NOT NULL AND accepted_quantity + shortfall_quantity = ready_quantity)
  ),
  CONSTRAINT preview_fulfillment_check1 CHECK (
    (state='ACCEPTED' AND shortfall_quantity=0 AND accepted_quantity=ready_quantity)
    OR (state='PARTIALLY_ACCEPTED' AND accepted_quantity>0 AND shortfall_quantity>0)
    OR (state='REJECTED' AND accepted_quantity=0 AND shortfall_quantity=ready_quantity)
    OR state='READY'
  )
);
CREATE INDEX IF NOT EXISTS preview_fulfillment_state_ready_idx
  ON preview_fulfillment(state, ready_at DESC);

CREATE TABLE IF NOT EXISTS preview_fulfillment_exception (
  exception_id text NOT NULL,
  obligation_id text NOT NULL,
  fulfillment_id text NOT NULL,
  acceptance_id text NOT NULL,
  kind text NOT NULL,
  affected_quantity numeric NOT NULL,
  unit text NOT NULL,
  canonical_event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_fulfillment_exception_pkey PRIMARY KEY (exception_id),
  CONSTRAINT preview_fulfillment_exception_canonical_event_id_key UNIQUE (canonical_event_id),
  CONSTRAINT preview_fulfillment_exception_fulfillment_id_acceptance_id__key UNIQUE (fulfillment_id,acceptance_id,kind),
  CONSTRAINT preview_fulfillment_exception_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  CONSTRAINT preview_fulfillment_exception_fulfillment_id_fkey FOREIGN KEY (fulfillment_id) REFERENCES preview_fulfillment(fulfillment_id) ON DELETE RESTRICT,
  CONSTRAINT preview_fulfillment_exception_kind_check CHECK (kind = ANY (ARRAY['SHORTFALL'::text,'REJECTION'::text])),
  CONSTRAINT preview_fulfillment_exception_affected_quantity_check CHECK (affected_quantity > 0),
  CONSTRAINT preview_fulfillment_exception_unit_check CHECK (length(trim(unit)) > 0),
  CONSTRAINT preview_fulfillment_exception_check CHECK (kind <> 'SHORTFALL' OR affected_quantity > 0)
);
CREATE INDEX IF NOT EXISTS preview_fulfillment_exception_obligation_idx
  ON preview_fulfillment_exception(obligation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS preview_sandbox_payment (
  payment_id text NOT NULL,
  obligation_id text NOT NULL,
  request_id text NOT NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  status text NOT NULL,
  provider_raw_status text NOT NULL,
  provider_status_mapping_version text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  observed_at timestamptz NOT NULL,
  evidence_id text NOT NULL,
  economic_treatment text NOT NULL,
  canonical_event_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_sandbox_payment_pkey PRIMARY KEY (payment_id),
  CONSTRAINT preview_sandbox_payment_obligation_id_key UNIQUE (obligation_id),
  CONSTRAINT preview_sandbox_payment_request_id_key UNIQUE (request_id),
  CONSTRAINT preview_sandbox_payment_provider_reference_key UNIQUE (provider_reference),
  CONSTRAINT preview_sandbox_payment_evidence_id_key UNIQUE (evidence_id),
  CONSTRAINT preview_sandbox_payment_canonical_event_id_key UNIQUE (canonical_event_id),
  CONSTRAINT preview_sandbox_payment_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  CONSTRAINT preview_sandbox_payment_provider_check CHECK (provider='SANDBOX_MOMO'),
  CONSTRAINT preview_sandbox_payment_status_check CHECK (status = ANY (ARRAY['CONFIRMED'::text,'FAILED'::text])),
  CONSTRAINT preview_sandbox_payment_amount_minor_check CHECK (amount_minor >= 0),
  CONSTRAINT preview_sandbox_payment_currency_check CHECK (currency='GHS'),
  CONSTRAINT preview_sandbox_payment_economic_treatment_check CHECK (economic_treatment = ANY (ARRAY['RESTRICTED_MEMBER_PREPAYMENT'::text,'NO_ECONOMIC_EFFECT'::text]))
);
CREATE INDEX IF NOT EXISTS preview_sandbox_payment_obligation_created_idx
  ON preview_sandbox_payment(obligation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preview_refund_remedy (
  remedy_id text NOT NULL,
  obligation_id text NOT NULL,
  source_exception_id text NOT NULL,
  participant_id text NOT NULL,
  kind text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  authorize_request_id text NOT NULL,
  authorize_command_id text NOT NULL,
  authorize_event_id text NOT NULL,
  authorized_at timestamptz NOT NULL,
  complete_request_id text,
  complete_command_id text,
  completion_event_id text,
  provider text,
  provider_reference text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preview_refund_remedy_pkey PRIMARY KEY (remedy_id),
  CONSTRAINT preview_refund_remedy_source_exception_id_key UNIQUE (source_exception_id),
  CONSTRAINT preview_refund_remedy_authorize_request_id_key UNIQUE (authorize_request_id),
  CONSTRAINT preview_refund_remedy_authorize_command_id_key UNIQUE (authorize_command_id),
  CONSTRAINT preview_refund_remedy_authorize_event_id_key UNIQUE (authorize_event_id),
  CONSTRAINT preview_refund_remedy_complete_request_id_key UNIQUE (complete_request_id),
  CONSTRAINT preview_refund_remedy_complete_command_id_key UNIQUE (complete_command_id),
  CONSTRAINT preview_refund_remedy_completion_event_id_key UNIQUE (completion_event_id),
  CONSTRAINT preview_refund_remedy_provider_reference_key UNIQUE (provider_reference),
  CONSTRAINT preview_refund_remedy_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES preview_member_commitment(obligation_id) ON DELETE RESTRICT,
  CONSTRAINT preview_refund_remedy_source_exception_id_fkey FOREIGN KEY (source_exception_id) REFERENCES preview_fulfillment_exception(exception_id) ON DELETE RESTRICT,
  CONSTRAINT preview_refund_remedy_kind_check CHECK (kind='REFUND'),
  CONSTRAINT preview_refund_remedy_quantity_check CHECK (quantity > 0),
  CONSTRAINT preview_refund_remedy_unit_check CHECK (length(trim(unit)) > 0),
  CONSTRAINT preview_refund_remedy_amount_minor_check CHECK (amount_minor >= 0),
  CONSTRAINT preview_refund_remedy_currency_check CHECK (currency='GHS'),
  CONSTRAINT preview_refund_remedy_status_check CHECK (status = ANY (ARRAY['AUTHORIZED'::text,'COMPLETED'::text])),
  CONSTRAINT preview_refund_remedy_check CHECK (
    (status='AUTHORIZED' AND complete_request_id IS NULL AND complete_command_id IS NULL AND completion_event_id IS NULL AND provider IS NULL AND provider_reference IS NULL AND completed_at IS NULL)
    OR
    (status='COMPLETED' AND complete_request_id IS NOT NULL AND complete_command_id IS NOT NULL AND completion_event_id IS NOT NULL AND provider='SANDBOX_MOMO' AND provider_reference IS NOT NULL AND completed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS preview_refund_remedy_obligation_status_idx
  ON preview_refund_remedy(obligation_id, status, authorized_at DESC);

CREATE TABLE IF NOT EXISTS preview_health (
  status text,
  database_name text,
  schema_name text,
  governed_table_count integer
);
