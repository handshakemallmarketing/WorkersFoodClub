CREATE TABLE IF NOT EXISTS lineage_lot (
  lot_id text PRIMARY KEY,
  quantity numeric NOT NULL CHECK (quantity > 0),
  consumed_quantity numeric NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (consumed_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS lineage_transform (
  transform_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('SPLIT','MERGE','REPACK','PROCESS','RETURN','MEASURED_VARIANCE')),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  loss_quantity numeric NOT NULL CHECK (loss_quantity >= 0),
  occurred_at timestamptz NOT NULL,
  evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids)='array' AND jsonb_array_length(evidence_ids)>0)
);

CREATE TABLE IF NOT EXISTS lineage_transform_input (
  transform_id text NOT NULL REFERENCES lineage_transform(transform_id) ON DELETE RESTRICT,
  lot_id text NOT NULL REFERENCES lineage_lot(lot_id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (transform_id,lot_id)
);

CREATE TABLE IF NOT EXISTS lineage_transform_output (
  transform_id text NOT NULL REFERENCES lineage_transform(transform_id) ON DELETE RESTRICT,
  lot_id text PRIMARY KEY REFERENCES lineage_lot(lot_id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  UNIQUE (transform_id,lot_id)
);

CREATE OR REPLACE FUNCTION record_lineage_transform(
  p_transform_id text,
  p_kind text,
  p_unit text,
  p_loss_quantity numeric,
  p_occurred_at timestamptz,
  p_evidence_ids jsonb,
  p_inputs jsonb,
  p_outputs jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v record;
  total_in numeric;
  total_out numeric;
  cap numeric;
  used numeric;
BEGIN
  IF p_transform_id IS NULL OR length(trim(p_transform_id))=0 OR p_unit IS NULL OR length(trim(p_unit))=0 THEN RAISE EXCEPTION 'LINEAGE_IDENTITY_REQUIRED'; END IF;
  IF p_kind NOT IN ('SPLIT','MERGE','REPACK','PROCESS','RETURN','MEASURED_VARIANCE') THEN RAISE EXCEPTION 'LINEAGE_KIND_INVALID'; END IF;
  IF p_loss_quantity < 0 THEN RAISE EXCEPTION 'LINEAGE_LOSS_INVALID'; END IF;
  IF jsonb_typeof(p_evidence_ids)<>'array' OR jsonb_array_length(p_evidence_ids)=0 THEN RAISE EXCEPTION 'LINEAGE_EVIDENCE_REQUIRED'; END IF;
  IF jsonb_typeof(p_inputs)<>'array' OR jsonb_array_length(p_inputs)=0 OR jsonb_typeof(p_outputs)<>'array' OR jsonb_array_length(p_outputs)=0 THEN RAISE EXCEPTION 'LINEAGE_PORTS_REQUIRED'; END IF;

  SELECT sum((x->>'quantity')::numeric) INTO total_in FROM jsonb_array_elements(p_inputs) x;
  SELECT sum((x->>'quantity')::numeric) INTO total_out FROM jsonb_array_elements(p_outputs) x;
  IF total_in IS NULL OR total_out IS NULL OR total_in<=0 OR total_out<=0 OR abs(total_in-total_out-p_loss_quantity)>0.000000001 THEN RAISE EXCEPTION 'TRANSFORMATION_NOT_CONSERVED'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_inputs) x WHERE (x->>'quantity')::numeric<=0 OR coalesce(x->>'lotId','')='') OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_outputs) x WHERE (x->>'quantity')::numeric<=0 OR coalesce(x->>'lotId','')='') THEN RAISE EXCEPTION 'TRANSFORMATION_QUANTITY_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT x->>'lotId' id,count(*) c FROM jsonb_array_elements(p_inputs) x GROUP BY 1 HAVING count(*)>1) d) OR EXISTS (SELECT 1 FROM (SELECT x->>'lotId' id,count(*) c FROM jsonb_array_elements(p_outputs) x GROUP BY 1 HAVING count(*)>1) d) THEN RAISE EXCEPTION 'TRANSFORMATION_LOT_DUPLICATE'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_inputs) i JOIN jsonb_array_elements(p_outputs) o ON i->>'lotId'=o->>'lotId') THEN RAISE EXCEPTION 'TRANSFORMATION_LOT_DUPLICATE'; END IF;

  PERFORM 1 FROM lineage_lot l JOIN jsonb_array_elements(p_inputs) i ON l.lot_id=i->>'lotId' ORDER BY l.lot_id FOR UPDATE OF l;
  FOR v IN SELECT i->>'lotId' lot_id,(i->>'quantity')::numeric qty FROM jsonb_array_elements(p_inputs) i LOOP
    SELECT quantity,consumed_quantity INTO cap,used FROM lineage_lot WHERE lot_id=v.lot_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFORMATION_INPUT_LOT_UNKNOWN'; END IF;
    IF (SELECT unit FROM lineage_lot WHERE lot_id=v.lot_id)<>p_unit THEN RAISE EXCEPTION 'TRANSFORMATION_QUANTITY_INVALID'; END IF;
    IF used+v.qty>cap THEN RAISE EXCEPTION 'TRANSFORMATION_INPUT_OVERCONSUMED'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM lineage_lot l JOIN jsonb_array_elements(p_outputs) o ON l.lot_id=o->>'lotId') THEN RAISE EXCEPTION 'TRANSFORMATION_OUTPUT_LOT_DUPLICATE'; END IF;

  INSERT INTO lineage_transform(transform_id,kind,unit,loss_quantity,occurred_at,evidence_ids) VALUES(p_transform_id,p_kind,p_unit,p_loss_quantity,p_occurred_at,p_evidence_ids);
  FOR v IN SELECT i->>'lotId' lot_id,(i->>'quantity')::numeric qty FROM jsonb_array_elements(p_inputs) i LOOP
    INSERT INTO lineage_transform_input(transform_id,lot_id,quantity) VALUES(p_transform_id,v.lot_id,v.qty);
    UPDATE lineage_lot SET consumed_quantity=consumed_quantity+v.qty WHERE lot_id=v.lot_id;
  END LOOP;
  FOR v IN SELECT o->>'lotId' lot_id,(o->>'quantity')::numeric qty FROM jsonb_array_elements(p_outputs) o LOOP
    INSERT INTO lineage_lot(lot_id,quantity,consumed_quantity,unit) VALUES(v.lot_id,v.qty,0,p_unit);
    INSERT INTO lineage_transform_output(transform_id,lot_id,quantity) VALUES(p_transform_id,v.lot_id,v.qty);
  END LOOP;
END;
$$;
