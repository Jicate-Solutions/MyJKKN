-- ============================================================================
-- Store Kit Entitlements — PR-K1 (schema + engine)
-- Created: 2026-07-12 · Spec: specs/store-kit-entitlements-spec-2026-07-12.md
-- 24 Director decisions (12 interview + 8 edge + 4 thrash), all referenced
-- inline as (D<n>). Ships DARK: no role holds ims.kits.* until rollout.
--
-- Substrate: IMS (ims_items / ims_stores / ims_stock_summary / ims_sales).
-- Sizes = separate ims_items variant rows (D13) — no schema here.
-- Core mechanism: entitled-vs-collected diff on a MATERIALIZED ledger
-- (D10 forces materialization: "admin chooses top-up vs future-only"
-- is impossible with live rule computation).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ims_kit_rules — group-targeting rules (mirrors hostel_room_eligibility_rules)
--    D1: ingredients = course+year / whole-college / hostel-status / hand-picked
--    D22: authored by central store team + super admins ONLY (permission-gated)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name         varchar(200) NOT NULL,
  audience          varchar(10)  NOT NULL CHECK (audience IN ('learner','staff')),  -- D12
  rule_kind         varchar(12)  NOT NULL DEFAULT 'criteria'
                    CHECK (rule_kind IN ('criteria','handpicked')),
  -- criteria ingredients (NULL = "any"); handpicked rules ignore these
  institution_id    uuid REFERENCES public.institutions(id),
  program_id        uuid REFERENCES public.programs(id),          -- learners only
  year_level        int  CHECK (coalesce(year_level, 1) BETWEEN 1 AND 6),
  department_id     uuid REFERENCES public.departments(id),       -- staff only
  hostel_status     varchar(12) NOT NULL DEFAULT 'any'
                    CHECK (hostel_status IN ('any','hosteler','day_scholar')),
  is_active         boolean NOT NULL DEFAULT true,
  notes             text,
  created_by        uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. ims_kit_rule_members — hand-picked person lists (D1 4th ingredient)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_rule_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     uuid NOT NULL REFERENCES public.ims_kit_rules(id) ON DELETE CASCADE,
  learner_id  uuid REFERENCES public.learners_profiles(id),
  staff_id    uuid REFERENCES public.staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(learner_id, staff_id) = 1),
  UNIQUE (rule_id, learner_id),
  UNIQUE (rule_id, staff_id)
);

-- ----------------------------------------------------------------------------
-- 3. ims_kit_rule_items — what the group gets (D3: cadence is PER ITEM)
--    cadence is an ENUM-style CHECK by design (Q1 gate): each cadence value is
--    wired to expiry/anchor code below — adding one requires code regardless.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_rule_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     uuid NOT NULL REFERENCES public.ims_kit_rules(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.ims_items(id),
  quantity    int  NOT NULL CHECK (quantity > 0),
  cadence     varchar(8) NOT NULL CHECK (cadence IN ('yearly','once')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, item_id)
);

-- ----------------------------------------------------------------------------
-- 4. ims_kit_entitlements — the materialized ledger (THE core mechanism)
--    Anchors (D14/D24):
--      learner + yearly item  -> anchor_year_level (ONE per year-level, EVER)
--      learner + once item    -> no anchor ("employment" key = once per course)
--      staff   + yearly item  -> anchor_academic_year_id (their college's AY)
--      staff   + once item    -> no anchor (once per employment)
--    D21: unit_cost_snapshot = ims_items.cost_price at grant time.
--    D15/D17: expiry flags billing; reopen cancels the flag.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_entitlements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id                uuid REFERENCES public.learners_profiles(id),
  staff_id                  uuid REFERENCES public.staff(id),
  institution_id            uuid NOT NULL REFERENCES public.institutions(id),
  item_id                   uuid NOT NULL REFERENCES public.ims_items(id),
  source_rule_id            uuid REFERENCES public.ims_kit_rules(id),
  anchor_year_level         int,
  anchor_academic_year_id   uuid REFERENCES public.academic_years(id),
  qty_entitled              int NOT NULL CHECK (qty_entitled > 0),
  qty_collected             int NOT NULL DEFAULT 0 CHECK (qty_collected >= 0),
  unit_cost_snapshot        numeric(12,2) NOT NULL DEFAULT 0,
  status                    varchar(10) NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','expired','reopened','closed')),
  billing_flagged_at        timestamptz,
  billing_flag_cancelled_at timestamptz,
  -- uniqueness keys (generated so ON CONFLICT works across NULL anchors)
  person_key  text GENERATED ALWAYS AS (coalesce(learner_id::text, staff_id::text)) STORED,
  anchor_key  text GENERATED ALWAYS AS
              (coalesce(anchor_year_level::text, anchor_academic_year_id::text, 'employment')) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(learner_id, staff_id) = 1),
  -- collected can never exceed entitled (coalesce not needed: both NOT NULL)
  CHECK (qty_collected <= qty_entitled),
  UNIQUE (person_key, item_id, anchor_key)
);

CREATE INDEX IF NOT EXISTS idx_kit_ent_learner ON public.ims_kit_entitlements(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kit_ent_staff   ON public.ims_kit_entitlements(staff_id)   WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kit_ent_inst    ON public.ims_kit_entitlements(institution_id);
CREATE INDEX IF NOT EXISTS idx_kit_ent_billing ON public.ims_kit_entitlements(institution_id)
  WHERE billing_flagged_at IS NOT NULL AND billing_flag_cancelled_at IS NULL;

-- ----------------------------------------------------------------------------
-- 5. ims_kit_collections — handover events (append-mostly; void, never delete)
--    D4/D19: proof tiers · D8: proxy identity · D23: same-day void
--    D7: free replacement override · D18: defect swap · D20: late approval
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_collections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id        uuid NOT NULL REFERENCES public.ims_kit_entitlements(id),
  qty                   int NOT NULL CHECK (qty > 0),
  kind                  varchar(20) NOT NULL DEFAULT 'normal'
                        CHECK (kind IN ('normal','free_replacement','defect_swap')),
  store_id              uuid NOT NULL REFERENCES public.ims_stores(id),
  proof_type            varchar(15) NOT NULL CHECK (proof_type IN ('qr','staff_verified')),
  collector_name        varchar(200) NOT NULL,   -- D8: proxy identity always recorded
  collector_register_no varchar(100),
  recorded_by           uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  collected_at          timestamptz NOT NULL DEFAULT now(),
  is_late_approved      boolean NOT NULL DEFAULT false,          -- D20
  override_approved_by  uuid REFERENCES public.profiles(id),     -- D7/D18 approver
  returned_defective    boolean NOT NULL DEFAULT false,          -- D18 swap took old unit back
  voided_at             timestamptz,                             -- D23
  voided_by             uuid REFERENCES public.profiles(id),
  void_reason           text,
  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_kit_coll_ent ON public.ims_kit_collections(entitlement_id);
CREATE INDEX IF NOT EXISTS idx_kit_coll_day ON public.ims_kit_collections(recorded_by, collected_at);

-- ----------------------------------------------------------------------------
-- 6. ims_kit_collection_windows — distribution waves (D20)
--    rule_id NULL = a global wave covering every rule.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ims_kit_collection_windows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      varchar(200) NOT NULL,
  rule_id    uuid REFERENCES public.ims_kit_rules(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- ----------------------------------------------------------------------------
-- Provenance immutability (SoD rule: pin ALL provenance cols in BEFORE UPDATE,
-- not just INSERT-stamp — approval/edit UIs PATCH directly)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_pin_provenance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'ims_kit_rules' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  ELSIF TG_TABLE_NAME = 'ims_kit_collections' THEN
    -- only void fields + notes may change after insert
    NEW.entitlement_id        := OLD.entitlement_id;
    NEW.qty                   := OLD.qty;
    NEW.kind                  := OLD.kind;
    NEW.store_id              := OLD.store_id;
    NEW.proof_type            := OLD.proof_type;
    NEW.collector_name        := OLD.collector_name;
    NEW.collector_register_no := OLD.collector_register_no;
    NEW.recorded_by           := OLD.recorded_by;
    NEW.collected_at          := OLD.collected_at;
    NEW.is_late_approved      := OLD.is_late_approved;
    NEW.override_approved_by  := OLD.override_approved_by;
    NEW.returned_defective    := OLD.returned_defective;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_kit_rules_provenance ON public.ims_kit_rules;
CREATE TRIGGER trg_kit_rules_provenance BEFORE UPDATE ON public.ims_kit_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_pin_provenance();

DROP TRIGGER IF EXISTS trg_kit_collections_provenance ON public.ims_kit_collections;
CREATE TRIGGER trg_kit_collections_provenance BEFORE UPDATE ON public.ims_kit_collections
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_pin_provenance();

-- ----------------------------------------------------------------------------
-- RLS — reads permission-scoped + self; writes forced through the RPCs below
-- (direct table writes: admins only). Standard platform pattern.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ims_kit_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_kit_rule_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_kit_rule_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_kit_entitlements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_kit_collections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_kit_collection_windows ENABLE ROW LEVEL SECURITY;

-- rules + children + windows: view/manage keys (D22 — manage stays central)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ims_kit_rules','ims_kit_rule_members','ims_kit_rule_items','ims_kit_collection_windows'] LOOP
    EXECUTE format($p$
      DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s;
      CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR user_has_permission('ims.kits.view')
        OR user_has_permission('ims.kits.manage')
        OR user_has_permission('ims.kits.handover')
      );
      DROP POLICY IF EXISTS "%1$s_write" ON public.%1$s;
      CREATE POLICY "%1$s_write" ON public.%1$s FOR ALL USING (
        is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')
      ) WITH CHECK (
        is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')
      );
    $p$, t);
  END LOOP;
END $$;

-- entitlements: staff-scoped read + SELF read (My Kit); direct writes admin-only
DROP POLICY IF EXISTS "ims_kit_entitlements_select" ON public.ims_kit_entitlements;
CREATE POLICY "ims_kit_entitlements_select" ON public.ims_kit_entitlements FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('ims.kits.view')     AND role_has_institution_access(institution_id))
  OR (user_has_permission('ims.kits.handover') AND role_has_institution_access(institution_id))
  OR learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  OR staff_id   IN (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid())
);
DROP POLICY IF EXISTS "ims_kit_entitlements_write" ON public.ims_kit_entitlements;
CREATE POLICY "ims_kit_entitlements_write" ON public.ims_kit_entitlements FOR ALL USING (
  is_super_admin() OR is_admin()
) WITH CHECK (is_super_admin() OR is_admin());

-- collections: same visibility via parent entitlement; direct writes admin-only
DROP POLICY IF EXISTS "ims_kit_collections_select" ON public.ims_kit_collections;
CREATE POLICY "ims_kit_collections_select" ON public.ims_kit_collections FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.ims_kit_entitlements e
    WHERE e.id = entitlement_id
      AND (
        (user_has_permission('ims.kits.view')     AND role_has_institution_access(e.institution_id))
        OR (user_has_permission('ims.kits.handover') AND role_has_institution_access(e.institution_id))
        OR e.learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
        OR e.staff_id   IN (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid())
      )
  )
);
DROP POLICY IF EXISTS "ims_kit_collections_write" ON public.ims_kit_collections;
CREATE POLICY "ims_kit_collections_write" ON public.ims_kit_collections FOR ALL USING (
  is_super_admin() OR is_admin()
) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- RPC 1 — fn_kit_resolve_entitlements: THE grant/top-up engine
--   D5 late joiner (idempotent re-run grants newcomers) · D9 higher qty wins
--   D10 p_apply_to_existing: true = "top up already-collected", false = future-only
--   D14 year-level anchors · D17 reopen never-collected expired rows
--   D21 cost_price snapshot · D24 staff anchors
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_resolve_entitlements(
  p_rule_id uuid,
  p_apply_to_existing boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rule     ims_kit_rules%ROWTYPE;
  v_inserted int := 0;
  v_raised   int := 0;
  v_reopened int := 0;
BEGIN
  -- DEFINER duplicates the gate (RLS is bypassed in DEFINER context)
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized to resolve kit entitlements';
  END IF;

  SELECT * INTO v_rule FROM ims_kit_rules WHERE id = p_rule_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit rule % not found or inactive', p_rule_id; END IF;

  -- Target set + item fan-out, one upsert statement per audience.
  IF v_rule.audience = 'learner' THEN
    WITH targets AS (
      SELECT lp.id AS learner_id, lp.institution_id,
             -- year level from semester_name digits: "Semester 3" -> year 2.
             -- Unparseable/missing semester -> NULL year (excluded from
             -- year-scoped rules; visible in the skipped count).
             CASE WHEN s.semester_name ~ '\d'
                  THEN CEIL(NULLIF(regexp_replace(s.semester_name, '\D', '', 'g'), '')::numeric / 2.0)::int
             END AS year_level
      FROM learners_profiles lp
      LEFT JOIN semesters s ON s.id = lp.semester_id
      WHERE (v_rule.rule_kind = 'handpicked'
             AND EXISTS (SELECT 1 FROM ims_kit_rule_members m
                         WHERE m.rule_id = v_rule.id AND m.learner_id = lp.id))
         OR (v_rule.rule_kind = 'criteria'
             AND (v_rule.institution_id IS NULL OR lp.institution_id = v_rule.institution_id)
             AND (v_rule.program_id     IS NULL OR lp.program_id     = v_rule.program_id)
             AND (v_rule.hostel_status = 'any'
                  OR (v_rule.hostel_status = 'hosteler' AND EXISTS (
                        SELECT 1 FROM hostel_allocations ha
                        WHERE ha.learner_id = lp.id
                          AND ha.status::text IN ('active','pending_vacate')))
                  OR (v_rule.hostel_status = 'day_scholar' AND NOT EXISTS (
                        SELECT 1 FROM hostel_allocations ha
                        WHERE ha.learner_id = lp.id
                          AND ha.status::text IN ('active','pending_vacate')))))
    ),
    grants AS (
      SELECT t.learner_id, t.institution_id, ri.item_id, ri.quantity,
             CASE WHEN ri.cadence = 'yearly' THEN t.year_level END AS anchor_year_level,
             i.cost_price
      FROM targets t
      CROSS JOIN ims_kit_rule_items ri
      JOIN ims_items i ON i.id = ri.item_id
      WHERE ri.rule_id = v_rule.id
        -- year-scoped rule: person must have a derivable year for yearly items
        AND NOT (ri.cadence = 'yearly' AND t.year_level IS NULL)
        AND (v_rule.year_level IS NULL OR t.year_level = v_rule.year_level)
    ),
    upserted AS (
      INSERT INTO ims_kit_entitlements
        (learner_id, institution_id, item_id, source_rule_id,
         anchor_year_level, qty_entitled, unit_cost_snapshot)
      SELECT g.learner_id, g.institution_id, g.item_id, v_rule.id,
             g.anchor_year_level, g.quantity, coalesce(g.cost_price, 0)
      FROM grants g
      ON CONFLICT (person_key, item_id, anchor_key) DO UPDATE SET
        qty_entitled = CASE
          WHEN p_apply_to_existing
          THEN GREATEST(ims_kit_entitlements.qty_entitled, EXCLUDED.qty_entitled)  -- D9/D10
          ELSE ims_kit_entitlements.qty_entitled END,
        status = CASE
          WHEN ims_kit_entitlements.status = 'expired'
           AND ims_kit_entitlements.qty_collected = 0
          THEN 'reopened'                                                          -- D17
          ELSE ims_kit_entitlements.status END,
        billing_flag_cancelled_at = CASE
          WHEN ims_kit_entitlements.status = 'expired'
           AND ims_kit_entitlements.qty_collected = 0
          THEN now()                                                               -- D17
          ELSE ims_kit_entitlements.billing_flag_cancelled_at END,
        updated_at = now()
      RETURNING (xmax = 0) AS was_insert, status
    )
    SELECT count(*) FILTER (WHERE was_insert),
           count(*) FILTER (WHERE NOT was_insert),
           count(*) FILTER (WHERE NOT was_insert AND status = 'reopened')
      INTO v_inserted, v_raised, v_reopened
    FROM upserted;

  ELSE  -- staff audience (D12/D24)
    WITH targets AS (
      SELECT st.id AS staff_id, st.institution_id,
             ay.id AS current_ay_id
      FROM staff st
      LEFT JOIN academic_years ay
        ON ay.institution_id = st.institution_id AND ay.is_active
      WHERE st.is_active
        AND ((v_rule.rule_kind = 'handpicked'
              AND EXISTS (SELECT 1 FROM ims_kit_rule_members m
                          WHERE m.rule_id = v_rule.id AND m.staff_id = st.id))
          OR (v_rule.rule_kind = 'criteria'
              AND (v_rule.institution_id IS NULL OR st.institution_id = v_rule.institution_id)
              AND (v_rule.department_id  IS NULL OR st.department_id  = v_rule.department_id)))
    ),
    grants AS (
      SELECT t.staff_id, t.institution_id, ri.item_id, ri.quantity,
             CASE WHEN ri.cadence = 'yearly' THEN t.current_ay_id END AS anchor_ay,  -- D24
             i.cost_price
      FROM targets t
      CROSS JOIN ims_kit_rule_items ri
      JOIN ims_items i ON i.id = ri.item_id
      WHERE ri.rule_id = v_rule.id
        AND NOT (ri.cadence = 'yearly' AND t.current_ay_id IS NULL)
    ),
    upserted AS (
      INSERT INTO ims_kit_entitlements
        (staff_id, institution_id, item_id, source_rule_id,
         anchor_academic_year_id, qty_entitled, unit_cost_snapshot)
      SELECT g.staff_id, g.institution_id, g.item_id, v_rule.id,
             g.anchor_ay, g.quantity, coalesce(g.cost_price, 0)
      FROM grants g
      ON CONFLICT (person_key, item_id, anchor_key) DO UPDATE SET
        qty_entitled = CASE
          WHEN p_apply_to_existing
          THEN GREATEST(ims_kit_entitlements.qty_entitled, EXCLUDED.qty_entitled)
          ELSE ims_kit_entitlements.qty_entitled END,
        status = CASE
          WHEN ims_kit_entitlements.status = 'expired'
           AND ims_kit_entitlements.qty_collected = 0
          THEN 'reopened' ELSE ims_kit_entitlements.status END,
        billing_flag_cancelled_at = CASE
          WHEN ims_kit_entitlements.status = 'expired'
           AND ims_kit_entitlements.qty_collected = 0
          THEN now() ELSE ims_kit_entitlements.billing_flag_cancelled_at END,
        updated_at = now()
      RETURNING (xmax = 0) AS was_insert, status
    )
    SELECT count(*) FILTER (WHERE was_insert),
           count(*) FILTER (WHERE NOT was_insert),
           count(*) FILTER (WHERE NOT was_insert AND status = 'reopened')
      INTO v_inserted, v_raised, v_reopened
    FROM upserted;
  END IF;

  RETURN jsonb_build_object(
    'rule_id', p_rule_id, 'inserted', v_inserted,
    'existing_touched', v_raised, 'reopened', v_reopened,
    'apply_to_existing', p_apply_to_existing);
END; $$;

-- ----------------------------------------------------------------------------
-- RPC 2 — fn_kit_record_collection: the counter handover
--   D4 QR/name fallback (proof_type) · D6 partial + owed balance
--   D7 free replacement · D18 defect swap (7-day window; move the constant to
--   platform_policies in PR-K2) · D19 proof tiers · D20 window + late approval
--   Handover is deliberately NOT institution-scoped: ONE central counter
--   serves all colleges (single walkable campus). The permission itself is the
--   gate; reads elsewhere stay institution-scoped.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_record_collection(
  p_entitlement_id uuid,
  p_qty int,
  p_collector_name text,
  p_proof_type text,
  p_store_id uuid,
  p_collector_register_no text DEFAULT NULL,
  p_kind text DEFAULT 'normal',
  p_late_approved boolean DEFAULT false,
  p_returned_defective boolean DEFAULT false,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ent          ims_kit_entitlements%ROWTYPE;
  v_windows_any  boolean;
  v_window_open  boolean;
  v_stock_rows   int;
  v_coll_id      uuid;
  v_last_normal  timestamptz;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('ims.kits.handover')
          OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized to record kit handovers';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;
  IF coalesce(p_kind,'') NOT IN ('normal','free_replacement','defect_swap') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind; END IF;
  IF coalesce(p_proof_type,'') NOT IN ('qr','staff_verified') THEN
    RAISE EXCEPTION 'invalid proof type %', p_proof_type; END IF;
  IF coalesce(btrim(p_collector_name),'') = '' THEN
    RAISE EXCEPTION 'collector name is required (D8)'; END IF;

  SELECT * INTO v_ent FROM ims_kit_entitlements
  WHERE id = p_entitlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entitlement not found'; END IF;
  IF v_ent.status NOT IN ('open','reopened') THEN
    RAISE EXCEPTION 'entitlement is % — not collectable', v_ent.status; END IF;

  IF p_kind = 'normal' THEN
    IF v_ent.qty_collected + p_qty > v_ent.qty_entitled THEN
      RAISE EXCEPTION 'over-collection: % collected + % requested > % entitled',
        v_ent.qty_collected, p_qty, v_ent.qty_entitled;
    END IF;
  ELSIF p_kind = 'defect_swap' THEN
    -- D18: only within 7 days of the last non-voided normal collection
    SELECT max(collected_at) INTO v_last_normal
    FROM ims_kit_collections
    WHERE entitlement_id = v_ent.id AND kind = 'normal' AND voided_at IS NULL;
    IF v_last_normal IS NULL OR v_last_normal < now() - interval '7 days' THEN
      RAISE EXCEPTION 'defect swap window closed — use free_replacement (staff override, D7) or a paid IMS sale';
    END IF;
  END IF;

  -- D20: windows apply to normal collections only (replacements/swaps are
  -- follow-ups to an already-windowed collection)
  IF p_kind = 'normal' THEN
    SELECT EXISTS (
      SELECT 1 FROM ims_kit_collection_windows w
      WHERE w.is_active AND (w.rule_id IS NULL OR w.rule_id = v_ent.source_rule_id)
    ) INTO v_windows_any;
    IF v_windows_any THEN
      SELECT EXISTS (
        SELECT 1 FROM ims_kit_collection_windows w
        WHERE w.is_active AND (w.rule_id IS NULL OR w.rule_id = v_ent.source_rule_id)
          AND now() BETWEEN w.starts_at AND w.ends_at
      ) INTO v_window_open;
      IF NOT v_window_open AND NOT p_late_approved THEN
        RAISE EXCEPTION 'outside collection window — requires late approval (D20)';
      END IF;
    END IF;
  END IF;

  -- Stock decrement, atomic with guard (mirrors IMS stock_summary semantics)
  UPDATE ims_stock_summary
     SET current_quantity   = current_quantity   - p_qty,
         available_quantity = available_quantity - p_qty,
         updated_at         = now()
   WHERE item_id = v_ent.item_id AND store_id = p_store_id
     AND available_quantity >= p_qty;
  GET DIAGNOSTICS v_stock_rows = ROW_COUNT;
  IF v_stock_rows = 0 THEN
    RAISE EXCEPTION 'insufficient stock for this item at this store — record a smaller (partial) quantity; the owed balance is remembered (D6)';
  END IF;

  INSERT INTO ims_kit_collections
    (entitlement_id, qty, kind, store_id, proof_type, collector_name,
     collector_register_no, is_late_approved, override_approved_by,
     returned_defective, notes)
  VALUES
    (v_ent.id, p_qty, p_kind, p_store_id, p_proof_type, btrim(p_collector_name),
     nullif(btrim(coalesce(p_collector_register_no,'')),''),
     p_late_approved AND p_kind = 'normal',
     CASE WHEN p_kind IN ('free_replacement','defect_swap') THEN auth.uid() END,
     p_returned_defective AND p_kind = 'defect_swap', p_notes)
  RETURNING id INTO v_coll_id;

  IF p_kind = 'normal' THEN
    UPDATE ims_kit_entitlements
       SET qty_collected = qty_collected + p_qty, updated_at = now()
     WHERE id = v_ent.id;
  END IF;

  RETURN jsonb_build_object(
    'collection_id', v_coll_id, 'kind', p_kind, 'qty', p_qty,
    'remaining', CASE WHEN p_kind = 'normal'
                      THEN v_ent.qty_entitled - v_ent.qty_collected - p_qty
                      ELSE v_ent.qty_entitled - v_ent.qty_collected END);
END; $$;

-- ----------------------------------------------------------------------------
-- RPC 3 — fn_kit_void_collection (D23)
--   Recorder may void SAME-DAY with a reason; admins/manage anytime.
--   Restores stock; decrements qty_collected for normal collections.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_void_collection(
  p_collection_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_coll ims_kit_collections%ROWTYPE;
  v_is_privileged boolean;
BEGIN
  v_is_privileged := is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage');

  IF NOT (v_is_privileged OR user_has_permission('ims.kits.handover')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'a void reason is required (D23)'; END IF;

  SELECT * INTO v_coll FROM ims_kit_collections WHERE id = p_collection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'collection not found'; END IF;
  IF v_coll.voided_at IS NOT NULL THEN RAISE EXCEPTION 'already voided'; END IF;

  -- D23: non-privileged voids = own entry, same calendar day (IST business day
  -- approximated as UTC day; acceptable — window generosity, not security)
  IF NOT v_is_privileged THEN
    IF v_coll.recorded_by <> auth.uid()
       OR v_coll.collected_at::date <> now()::date THEN
      RAISE EXCEPTION 'only your own same-day entries can be voided — ask an admin (D23)';
    END IF;
  END IF;

  UPDATE ims_kit_collections
     SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   WHERE id = v_coll.id;

  -- restore stock
  UPDATE ims_stock_summary
     SET current_quantity   = current_quantity   + v_coll.qty,
         available_quantity = available_quantity + v_coll.qty,
         updated_at         = now()
   WHERE item_id = (SELECT item_id FROM ims_kit_entitlements WHERE id = v_coll.entitlement_id)
     AND store_id = v_coll.store_id;

  IF v_coll.kind = 'normal' THEN
    UPDATE ims_kit_entitlements
       SET qty_collected = GREATEST(qty_collected - v_coll.qty, 0), updated_at = now()
     WHERE id = v_coll.entitlement_id;
  END IF;

  RETURN jsonb_build_object('voided', v_coll.id, 'qty_restored', v_coll.qty);
END; $$;

-- ----------------------------------------------------------------------------
-- RPC 4 — fn_kit_expire_academic_year (D15)
--   Run at AY rollover for one institution's ending year:
--   · learner year-anchored + staff rows anchored to that AY, still owed items
--     -> status 'expired' + billing flag (value = remaining × cost snapshot)
--   · fully-collected rows -> 'closed' (clean lifecycle)
--   Learner/staff 'once' rows (employment/course anchors) are NOT touched.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_expire_academic_year(
  p_academic_year_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_expired int; v_closed int;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT institution_id INTO v_inst FROM academic_years WHERE id = p_academic_year_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'academic year not found'; END IF;

  WITH scoped AS (
    SELECT id, (qty_collected >= qty_entitled) AS complete
    FROM ims_kit_entitlements
    WHERE status IN ('open','reopened')
      AND ( anchor_academic_year_id = p_academic_year_id                -- staff yearly
         OR (learner_id IS NOT NULL AND anchor_year_level IS NOT NULL   -- learner yearly
             AND institution_id = v_inst) )
  ),
  ex AS (
    UPDATE ims_kit_entitlements e
       SET status = 'expired', billing_flagged_at = now(), updated_at = now()
      FROM scoped s WHERE e.id = s.id AND NOT s.complete
    RETURNING 1
  ),
  cl AS (
    UPDATE ims_kit_entitlements e
       SET status = 'closed', updated_at = now()
      FROM scoped s WHERE e.id = s.id AND s.complete
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ex), (SELECT count(*) FROM cl)
    INTO v_expired, v_closed;

  RETURN jsonb_build_object(
    'academic_year_id', p_academic_year_id, 'institution_id', v_inst,
    'expired_flagged', v_expired, 'closed_complete', v_closed);
END; $$;

-- ----------------------------------------------------------------------------
-- RPC 5 — fn_kit_my_kit: self-service view (learner via profiles.learner_id,
-- staff via staff.profile_id). Read-only; RLS-equivalent scope duplicated here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_my_kit()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'entitlement_id', e.id,
    'item_name', i.name,
    'item_code', i.code,
    'qty_entitled', e.qty_entitled,
    'qty_collected', e.qty_collected,
    'owed', e.qty_entitled - e.qty_collected,
    'status', e.status,
    'anchor_year_level', e.anchor_year_level,
    'collections', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'qty', c.qty, 'kind', c.kind, 'collected_at', c.collected_at,
        'collector_name', c.collector_name, 'proof_type', c.proof_type,
        'voided', c.voided_at IS NOT NULL) ORDER BY c.collected_at), '[]'::jsonb)
      FROM ims_kit_collections c
      WHERE c.entitlement_id = e.id)
  ) ORDER BY e.created_at), '[]'::jsonb)
  FROM ims_kit_entitlements e
  JOIN ims_items i ON i.id = e.item_id
  WHERE e.learner_id = (SELECT p.learner_id FROM profiles p WHERE p.id = auth.uid())
     OR e.staff_id IN (SELECT s.id FROM staff s WHERE s.profile_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- RPC 6 — fn_kit_billing_flags (D11/D15): accounts-facing value report
--   Active flags (expired-uncollected value) + collected value per person.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_billing_flags(
  p_institution_id uuid DEFAULT NULL,
  p_learner_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('ims.kits.billing_flags.view')
          OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_institution_id IS NOT NULL AND NOT role_has_institution_access(p_institution_id) THEN
    RAISE EXCEPTION 'no access to this institution';
  END IF;
  -- NULL-institution guard: require an explicit filter for non-admin callers
  IF p_institution_id IS NULL AND p_learner_id IS NULL
     AND NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'provide an institution or learner filter';
  END IF;
  -- learner filter must not bypass institution scoping (cross-college PII guard;
  -- role_has_institution_access(NULL)=TRUE trap — scope on the TARGET row)
  IF p_learner_id IS NOT NULL AND NOT (is_super_admin() OR is_admin()) THEN
    IF NOT role_has_institution_access(
         (SELECT lp.institution_id FROM learners_profiles lp WHERE lp.id = p_learner_id)) THEN
      RAISE EXCEPTION 'no access to this learner''s institution';
    END IF;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'entitlement_id', e.id,
      'learner_id', e.learner_id,
      'staff_id', e.staff_id,
      'institution_id', e.institution_id,
      'item_name', i.name,
      'status', e.status,
      'uncollected_value',
        CASE WHEN e.billing_flagged_at IS NOT NULL AND e.billing_flag_cancelled_at IS NULL
             THEN (e.qty_entitled - e.qty_collected) * e.unit_cost_snapshot ELSE 0 END,
      'collected_value', e.qty_collected * e.unit_cost_snapshot,
      'flagged_at', e.billing_flagged_at
    )), '[]'::jsonb)
    FROM ims_kit_entitlements e
    JOIN ims_items i ON i.id = e.item_id
    WHERE (p_institution_id IS NULL OR e.institution_id = p_institution_id)
      AND (p_learner_id IS NULL OR e.learner_id = p_learner_id)
      AND ( (e.billing_flagged_at IS NOT NULL AND e.billing_flag_cancelled_at IS NULL)
            OR e.qty_collected > 0 )
  );
END; $$;

-- ----------------------------------------------------------------------------
-- Grants — MANDATORY anon lockdown (Supabase default grants EXECUTE to anon)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_kit_resolve_entitlements(uuid, boolean)                                            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kit_record_collection(uuid, int, text, text, uuid, text, text, boolean, boolean, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kit_void_collection(uuid, text)                                                    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kit_expire_academic_year(uuid)                                                     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kit_my_kit()                                                                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kit_billing_flags(uuid, uuid)                                                      FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_kit_resolve_entitlements(uuid, boolean)                                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kit_record_collection(uuid, int, text, text, uuid, text, text, boolean, boolean, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kit_void_collection(uuid, text)                                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kit_expire_academic_year(uuid)                                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kit_my_kit()                                                                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kit_billing_flags(uuid, uuid)                                                       TO authenticated;
