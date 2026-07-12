-- ============================================================================
-- Store Kit Entitlements — PR-K3 (security hardening + edge-case decisions)
-- Created: 2026-07-12 · Spec: specs/store-kit-entitlements-spec-2026-07-12.md
-- Layers on 20260712190000_store_kit_entitlements.sql. Ships DARK.
--
-- Closes the #1999/#2000 review findings that merged UNDISPOSITIONED (all
-- verified real against live prod), AND encodes the round-3/round-4 edge-case
-- decisions (D25-D44). Decision numbers refer to the memory file
-- project_store_kit_entitlements_interview.md.
--
-- REVIEW FINDINGS FIXED:
--   HIGH (drain)  fn_kit_record_collection trusted caller p_store_id → item-bound
--                 store validation (central item⇒central store; college item⇒the
--                 entitlement institution's store). (D25/D32/D40)
--   HIGH (leak)   fn_kit_expire_academic_year re-flag never cleared
--                 billing_flag_cancelled_at → re-expired rows silently un-billed.
--   MED  (scope)  learner-branch expiry ignored p_academic_year_id → expired
--                 every year-anchored row in the institution. Now scoped by
--                 granted_academic_year_id.
--   MED  (yrlvl)  year_level from all digit runs ('Sem 3 (2024)'→32024) → first
--                 digit group, bounded 1..6, + a CHECK on anchor_year_level.
--   MED  (dup)    no idempotency → 30s (person,item,kind,qty,store) dup block (D27).
--   MED  (self)   free-replacement self-approval hole → free replacement REMOVED
--                 entirely (D41: lost/damaged is always paid). defect_swap kept.
--   LOW  (tz)     same-day void compared in UTC → Asia/Kolkata (D23).
--
-- EDGE-CASE DECISIONS ENCODED:
--   D30 void asks "was it returned?" — loss if not (stock not restored).
--   D33 bulk-revoke of not-yet-collected entitlements (fat-finger undo).
--   D34 item with no cost_price cannot be kitted (+ D32 unclassified source).
--   D36 withdrawn/left person cannot collect.
--   D42 owed balances (a partial exists) collect anytime, no window gate.
--   D43 a partially-collected expired kit reopens its un-received portion on
--       re-resolve (repeater), cancelling that portion's bill.
--   D35 dual identity: already correct (learner & staff are distinct persons).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Schema additions (all additive / nullable — safe, instant, no rows yet)
-- ----------------------------------------------------------------------------

-- D25/D32: every kit item is sourced from the central store OR the owning
-- college store. Set at item setup; the counter enforces it (drain fix).
ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS kit_source varchar(10)
  CHECK (kit_source IS NULL OR kit_source IN ('central','college'));
COMMENT ON COLUMN public.ims_items.kit_source IS
  'Store-kit source (D25): central = the flagged central supply store; college = the owning institution store. NULL = not a kit item. Required before an item may be added to a kit rule.';

-- MED (yrlvl): bound the derived year-level so parser garbage can never persist.
ALTER TABLE public.ims_kit_entitlements
  DROP CONSTRAINT IF EXISTS chk_kit_ent_year_level;
ALTER TABLE public.ims_kit_entitlements
  ADD CONSTRAINT chk_kit_ent_year_level
  CHECK (anchor_year_level IS NULL OR anchor_year_level BETWEEN 1 AND 6);

-- MED (scope): the AY a learner row was granted in, so expiry scopes precisely
-- to the ending year instead of every year-anchored row in the institution.
ALTER TABLE public.ims_kit_entitlements
  ADD COLUMN IF NOT EXISTS granted_academic_year_id uuid REFERENCES public.academic_years(id);

-- D30: on a void, did the physical item actually come back? NULL until voided.
ALTER TABLE public.ims_kit_collections
  ADD COLUMN IF NOT EXISTS void_item_returned boolean;
COMMENT ON COLUMN public.ims_kit_collections.void_item_returned IS
  'On void (D30): true = item returned, stock restored; false = not returned, booked as a loss (stock NOT restored).';

-- ----------------------------------------------------------------------------
-- D34 + D32 + D40: gate what can be put in a kit rule.
--   · item must have a cost_price (D34 — refund/billing value, D21)
--   · item must be classified central/college (D32)
--   · a 'college' item may only sit in a rule scoped to ONE institution (D40 —
--     otherwise out-of-college students show a permanent uncollectable "owed")
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_guard_rule_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_cost   numeric;
  v_source varchar(10);
  v_rule_inst uuid;
BEGIN
  SELECT cost_price, kit_source INTO v_cost, v_source
  FROM ims_items WHERE id = NEW.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', NEW.item_id;
  END IF;
  IF v_cost IS NULL THEN
    RAISE EXCEPTION 'item has no cost price — set a cost before adding it to a kit (D34)';
  END IF;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'item is not classified as central or college — set its kit source first (D32)';
  END IF;
  IF v_source = 'college' THEN
    SELECT institution_id INTO v_rule_inst FROM ims_kit_rules WHERE id = NEW.rule_id;
    IF v_rule_inst IS NULL THEN
      RAISE EXCEPTION 'a college-only item cannot be added to a rule that spans all colleges — scope the rule to one institution first (D40)';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_kit_rule_item_guard ON public.ims_kit_rule_items;
CREATE TRIGGER trg_kit_rule_item_guard
  BEFORE INSERT OR UPDATE ON public.ims_kit_rule_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_kit_guard_rule_item();

-- ----------------------------------------------------------------------------
-- RPC 1 (rewrite) — fn_kit_resolve_entitlements
--   Fixes: year_level = first digit group bounded 1..6; skip null-cost items
--   (D34 belt); stamp granted_academic_year_id; D43 reopen a partially-collected
--   expired row on re-resolve (drop the qty_collected=0 guard), cancelling its
--   remaining-value bill.
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
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized to resolve kit entitlements';
  END IF;

  SELECT * INTO v_rule FROM ims_kit_rules WHERE id = p_rule_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'kit rule % not found or inactive', p_rule_id; END IF;

  IF v_rule.audience = 'learner' THEN
    WITH targets AS (
      SELECT lp.id AS learner_id, lp.institution_id,
             -- year level from the FIRST digit group only, bounded 1..6.
             -- 'Semester 3'->3->yr2; 'Sem 3 (2024)'->3->yr2 (was ->32024).
             CASE WHEN s.semester_name ~ '\d'
                  THEN LEAST(GREATEST(
                         CEIL(substring(s.semester_name from '\d+')::numeric / 2.0)::int, 1), 6)
             END AS year_level,
             -- Scalar (not a join): `is_active` is NOT a "current year" flag —
             -- institutions carry many active AYs (up to 11 on prod), so a join
             -- would fan each learner into duplicate grant rows that collide in
             -- the upsert. Pick the genuinely-current AY by date: the one in
             -- progress today, else the most recently started (deterministic).
             (SELECT ay.id FROM academic_years ay
               WHERE ay.institution_id = lp.institution_id AND ay.is_active
               ORDER BY (ay.start_date IS NOT NULL AND current_date BETWEEN ay.start_date AND ay.end_date) DESC,
                        ay.start_date DESC NULLS LAST, ay.id
               LIMIT 1) AS current_ay_id
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
      SELECT t.learner_id, t.institution_id, t.current_ay_id, ri.item_id, ri.quantity,
             CASE WHEN ri.cadence = 'yearly' THEN t.year_level END AS anchor_year_level,
             i.cost_price
      FROM targets t
      CROSS JOIN ims_kit_rule_items ri
      JOIN ims_items i ON i.id = ri.item_id
      WHERE ri.rule_id = v_rule.id
        AND i.cost_price IS NOT NULL                              -- D34 belt (skip null-cost)
        AND NOT (ri.cadence = 'yearly' AND t.year_level IS NULL)
        -- A yearly item needs a current AY to stamp granted_academic_year_id;
        -- without it the row could never be reached by expire (review MED-4/LOW-3).
        AND NOT (ri.cadence = 'yearly' AND t.current_ay_id IS NULL)
        AND (v_rule.year_level IS NULL OR t.year_level = v_rule.year_level)
    ),
    upserted AS (
      INSERT INTO ims_kit_entitlements
        (learner_id, institution_id, item_id, source_rule_id,
         anchor_year_level, granted_academic_year_id, qty_entitled, unit_cost_snapshot)
      SELECT g.learner_id, g.institution_id, g.item_id, v_rule.id,
             g.anchor_year_level, g.current_ay_id, g.quantity, g.cost_price
      FROM grants g
      ON CONFLICT (person_key, item_id, anchor_key) DO UPDATE SET
        qty_entitled = CASE
          WHEN p_apply_to_existing
          THEN GREATEST(ims_kit_entitlements.qty_entitled, EXCLUDED.qty_entitled)  -- D9/D10
          ELSE ims_kit_entitlements.qty_entitled END,
        -- D43: an EXPIRED row (uncollected OR partially collected) reopens on
        -- re-resolve — a repeater re-targeted by the year rule gets the
        -- un-received portion back. 'closed' (fully collected) never reopens.
        status = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN 'reopened'
          ELSE ims_kit_entitlements.status END,
        -- Re-anchor the reopened row to the CURRENT grant year and clear the old
        -- flag entirely (review MED-1): otherwise it stays anchored to the prior
        -- year and a future expire(new_year) — scoped by granted_academic_year_id
        -- — never re-bills it (the leak this scope fix exists to prevent).
        granted_academic_year_id = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN EXCLUDED.granted_academic_year_id
          ELSE ims_kit_entitlements.granted_academic_year_id END,
        billing_flagged_at = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN NULL
          ELSE ims_kit_entitlements.billing_flagged_at END,
        billing_flag_cancelled_at = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN now()                 -- D43/D17
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
             -- scalar, same current-AY-by-date pick as the learner branch above
             (SELECT ay.id FROM academic_years ay
               WHERE ay.institution_id = st.institution_id AND ay.is_active
               ORDER BY (ay.start_date IS NOT NULL AND current_date BETWEEN ay.start_date AND ay.end_date) DESC,
                        ay.start_date DESC NULLS LAST, ay.id
               LIMIT 1) AS current_ay_id
      FROM staff st
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
             CASE WHEN ri.cadence = 'yearly' THEN t.current_ay_id END AS anchor_ay,
             t.current_ay_id, i.cost_price
      FROM targets t
      CROSS JOIN ims_kit_rule_items ri
      JOIN ims_items i ON i.id = ri.item_id
      WHERE ri.rule_id = v_rule.id
        AND i.cost_price IS NOT NULL
        AND NOT (ri.cadence = 'yearly' AND t.current_ay_id IS NULL)
    ),
    upserted AS (
      INSERT INTO ims_kit_entitlements
        (staff_id, institution_id, item_id, source_rule_id,
         anchor_academic_year_id, granted_academic_year_id, qty_entitled, unit_cost_snapshot)
      SELECT g.staff_id, g.institution_id, g.item_id, v_rule.id,
             g.anchor_ay, g.current_ay_id, g.quantity, g.cost_price
      FROM grants g
      ON CONFLICT (person_key, item_id, anchor_key) DO UPDATE SET
        qty_entitled = CASE
          WHEN p_apply_to_existing
          THEN GREATEST(ims_kit_entitlements.qty_entitled, EXCLUDED.qty_entitled)
          ELSE ims_kit_entitlements.qty_entitled END,
        status = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN 'reopened'
          ELSE ims_kit_entitlements.status END,
        -- Re-anchor to the current grant year + clear the old flag (review MED-1).
        granted_academic_year_id = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN EXCLUDED.granted_academic_year_id
          ELSE ims_kit_entitlements.granted_academic_year_id END,
        billing_flagged_at = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN NULL
          ELSE ims_kit_entitlements.billing_flagged_at END,
        billing_flag_cancelled_at = CASE
          WHEN ims_kit_entitlements.status = 'expired' THEN now()
          ELSE ims_kit_entitlements.billing_flag_cancelled_at END,
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
-- RPC 2 (rewrite) — fn_kit_record_collection
--   Fixes / decisions:
--   · HIGH drain: item-bound store validation (D25/D40).
--   · D36 block a withdrawn/left person.
--   · D27 30s duplicate-handover block.
--   · D41 free_replacement REMOVED (always paid); defect_swap kept (D18).
--   · D42 owed balance (a partial exists) skips the window/late-approval gate.
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
  v_item_source  varchar(10);
  v_store        ims_stores%ROWTYPE;
  v_learner_life text;
  v_staff_active boolean;
  v_windows_any  boolean;
  v_window_open  boolean;
  v_stock_rows   int;
  v_coll_id      uuid;
  v_last_normal  timestamptz;
  v_swapped      int;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('ims.kits.handover')
          OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized to record kit handovers';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;
  -- D41: no free-replacement path — a lost/damaged item is always a paid sale.
  IF p_kind = 'free_replacement' THEN
    RAISE EXCEPTION 'free replacements are not offered — a lost or damaged item is a paid replacement (D41/D7); ring it up as a paid store sale';
  END IF;
  IF coalesce(p_kind,'') NOT IN ('normal','defect_swap') THEN
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

  -- D36: the person must still be here.
  IF v_ent.learner_id IS NOT NULL THEN
    SELECT lifecycle_status INTO v_learner_life FROM learners_profiles WHERE id = v_ent.learner_id;
    IF v_learner_life IN ('graduated','inactive','exited','rejected') THEN
      RAISE EXCEPTION 'this learner has left the college (%) — collection blocked (D36)', v_learner_life;
    END IF;
  ELSIF v_ent.staff_id IS NOT NULL THEN
    SELECT is_active INTO v_staff_active FROM staff WHERE id = v_ent.staff_id;
    IF NOT coalesce(v_staff_active, false) THEN
      RAISE EXCEPTION 'this staff member is no longer active — collection blocked (D36)';
    END IF;
  END IF;

  -- HIGH drain fix (D25/D40): bind the handover store to the ITEM's source.
  SELECT kit_source INTO v_item_source FROM ims_items WHERE id = v_ent.item_id;
  IF v_item_source IS NULL THEN
    RAISE EXCEPTION 'this item is not classified as central or college — it cannot be handed over until its kit source is set (D32)';
  END IF;
  SELECT * INTO v_store FROM ims_stores WHERE id = p_store_id;
  IF NOT FOUND OR NOT coalesce(v_store.is_active, false) THEN
    RAISE EXCEPTION 'store not found or inactive';
  END IF;
  IF v_item_source = 'central' AND NOT coalesce(v_store.is_central_supply_store, false) THEN
    RAISE EXCEPTION 'a central-store item can only be handed over from the flagged central supply store (D25)';
  END IF;
  IF v_item_source = 'college'
     AND v_store.institution_id IS DISTINCT FROM v_ent.institution_id THEN
    RAISE EXCEPTION 'a college item can only be handed over from its own institution''s store, not another college''s (D25)';
  END IF;

  -- D27: block an accidental double-record (double click / double scan). A 10s
  -- window catches instant double-submits/retries without wrongly rejecting a
  -- deliberate second identical partial handover a few seconds later (review LOW-4).
  IF EXISTS (
    SELECT 1 FROM ims_kit_collections
    WHERE entitlement_id = v_ent.id AND kind = p_kind AND qty = p_qty
      AND store_id = p_store_id AND voided_at IS NULL
      AND collected_at > now() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION 'an identical handover was just recorded — duplicate blocked (D27). Wait a moment or void the first if it was a mistake.';
  END IF;

  IF p_kind = 'normal' THEN
    IF v_ent.qty_collected + p_qty > v_ent.qty_entitled THEN
      RAISE EXCEPTION 'over-collection: % collected + % requested > % entitled',
        v_ent.qty_collected, p_qty, v_ent.qty_entitled;
    END IF;
  ELSIF p_kind = 'defect_swap' THEN
    SELECT max(collected_at) INTO v_last_normal
    FROM ims_kit_collections
    WHERE entitlement_id = v_ent.id AND kind = 'normal' AND voided_at IS NULL;
    IF v_last_normal IS NULL OR v_last_normal < now() - interval '7 days' THEN
      RAISE EXCEPTION 'defect swap window closed — after 7 days a replacement is a paid store sale (D41)';
    END IF;
    -- Round-3 fix: cap swaps at one per collected unit. A swap exchanges a unit
    -- the person already holds, so total non-voided swapped qty can never exceed
    -- qty_collected (unbounded swaps were a stock-drain hole — each decremented
    -- stock with no ceiling).
    SELECT coalesce(sum(qty), 0) INTO v_swapped
    FROM ims_kit_collections
    WHERE entitlement_id = v_ent.id AND kind = 'defect_swap' AND voided_at IS NULL;
    IF v_swapped + p_qty > v_ent.qty_collected THEN
      RAISE EXCEPTION 'defect swap cap: % of % collected unit(s) already swapped — cannot swap % more (one swap per collected unit, D18)',
        v_swapped, v_ent.qty_collected, p_qty;
    END IF;
  END IF;

  -- D20 window gate, but D42: only the FIRST pickup (nothing collected yet) is
  -- window-gated. An owed balance from a prior partial collects anytime.
  IF p_kind = 'normal' AND v_ent.qty_collected = 0 THEN
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
     p_late_approved AND p_kind = 'normal' AND v_ent.qty_collected = 0,
     CASE WHEN p_kind = 'defect_swap' THEN auth.uid() END,
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
-- RPC 3 (drop+recreate — new signature) — fn_kit_void_collection
--   D30: caller states whether the physical item was returned; stock is only
--        restored when it was, otherwise the void is booked as a loss.
--   D23: same-day check now in Asia/Kolkata, not UTC.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_kit_void_collection(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_kit_void_collection(
  p_collection_id uuid,
  p_reason text,
  p_item_returned boolean DEFAULT true
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

  -- D23: non-privileged = own entry, same IST business day.
  IF NOT v_is_privileged THEN
    IF v_coll.recorded_by <> auth.uid()
       OR (v_coll.collected_at AT TIME ZONE 'Asia/Kolkata')::date
          <> (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'only your own same-day entries can be voided — ask an admin (D23)';
    END IF;
  END IF;

  UPDATE ims_kit_collections
     SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason),
         void_item_returned = coalesce(p_item_returned, true)
   WHERE id = v_coll.id;

  -- D30: restore stock ONLY if the item actually came back; otherwise it's a loss.
  IF coalesce(p_item_returned, true) THEN
    UPDATE ims_stock_summary
       SET current_quantity   = current_quantity   + v_coll.qty,
           available_quantity = available_quantity + v_coll.qty,
           updated_at         = now()
     WHERE item_id = (SELECT item_id FROM ims_kit_entitlements WHERE id = v_coll.entitlement_id)
       AND store_id = v_coll.store_id;
  END IF;

  -- Reverse the ledger credit for a normal collection regardless of return —
  -- this handover was a mistake; the goods (if not returned) are a tracked loss.
  -- Also reopen a terminal entitlement that is now under-collected (review
  -- MED-3): voiding a collection on a closed/expired row would otherwise leave
  -- the now-owed kit permanently uncollectable (record_collection needs open/reopened).
  IF v_coll.kind = 'normal' THEN
    UPDATE ims_kit_entitlements
       SET qty_collected = GREATEST(qty_collected - v_coll.qty, 0),
           status = CASE
             WHEN status IN ('closed','expired')
                  AND GREATEST(qty_collected - v_coll.qty, 0) < qty_entitled
             THEN 'reopened' ELSE status END,
           -- Round-3 fix: a row reopened by this void is collectable again, so it
           -- must not ALSO stay billed (was: billed AND collectable). Mirror the
           -- resolve-reopen path; only stamp cancelled_at when a flag existed.
           billing_flagged_at = CASE
             WHEN status IN ('closed','expired')
                  AND GREATEST(qty_collected - v_coll.qty, 0) < qty_entitled
             THEN NULL ELSE billing_flagged_at END,
           billing_flag_cancelled_at = CASE
             WHEN status IN ('closed','expired')
                  AND GREATEST(qty_collected - v_coll.qty, 0) < qty_entitled
                  AND billing_flagged_at IS NOT NULL
             THEN now() ELSE billing_flag_cancelled_at END,
           updated_at = now()
     WHERE id = v_coll.entitlement_id;
  END IF;

  RETURN jsonb_build_object(
    'voided', v_coll.id, 'item_returned', coalesce(p_item_returned, true),
    'qty_restored', CASE WHEN coalesce(p_item_returned, true) THEN v_coll.qty ELSE 0 END);
END; $$;

-- ----------------------------------------------------------------------------
-- RPC 4 (rewrite) — fn_kit_expire_academic_year
--   HIGH leak fix: re-flag also clears billing_flag_cancelled_at (a row that was
--     expired→reopened→re-expired was silently un-billed).
--   MED scope fix: learner rows scoped by granted_academic_year_id, not "every
--     year-anchored row in the institution".
--   Round-3 HIGH fix: staff branch ALSO scopes by granted_academic_year_id (the
--     reopen branch re-anchors granted, never anchor — anchor is part of the
--     conflict key). anchor IS NOT NULL stays as the yearly-vs-once marker so
--     once-per-employment rows are never expired (D24).
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
      AND ( (staff_id   IS NOT NULL AND anchor_academic_year_id IS NOT NULL               -- staff yearly
             AND granted_academic_year_id = p_academic_year_id)
         OR (learner_id IS NOT NULL AND anchor_year_level IS NOT NULL                     -- learner yearly
             AND granted_academic_year_id = p_academic_year_id) )
  ),
  ex AS (
    UPDATE ims_kit_entitlements e
       SET status = 'expired',
           billing_flagged_at = now(),
           billing_flag_cancelled_at = NULL,   -- HIGH leak fix: re-billing must un-cancel
           updated_at = now()
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
-- RPC 7 (new) — fn_kit_revoke_rule_entitlements (D33)
--   Fat-finger undo: pull back a rule's NOT-yet-collected entitlements.
--   Already-collected (even partially) rows are left untouched (no-return rules).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kit_revoke_rule_entitlements(
  p_rule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_revoked int;
  v_rule_inst uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('ims.kits.manage')) THEN
    RAISE EXCEPTION 'not authorized to revoke kit entitlements';
  END IF;

  -- LOW-1: tenant scope. A non-super manage holder may only revoke a rule scoped
  -- to an institution they can access. NULL-institution (all-college) rules are
  -- super/admin-only — role_has_institution_access(NULL) is TRUE (known trap), so
  -- it must NOT be the guard for the cross-college case.
  SELECT institution_id INTO v_rule_inst FROM ims_kit_rules WHERE id = p_rule_id;
  IF NOT (is_super_admin() OR is_admin()) THEN
    IF v_rule_inst IS NULL OR NOT role_has_institution_access(v_rule_inst) THEN
      RAISE EXCEPTION 'not authorized to revoke this rule''s entitlements';
    END IF;
  END IF;

  -- MED-2: only pull back FRESHLY-granted rows — never collected, never billed,
  -- with no collection history (a voided collection zeroes qty_collected but
  -- leaves audit rows; deleting the parent would trip the FK / destroy the
  -- audit trail, and expired+flagged rows carry outstanding charges).
  WITH del AS (
    DELETE FROM ims_kit_entitlements e
    WHERE e.source_rule_id = p_rule_id
      AND e.qty_collected = 0
      AND e.status = 'open'
      AND e.billing_flagged_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM ims_kit_collections c WHERE c.entitlement_id = e.id)
    RETURNING 1
  )
  SELECT count(*) INTO v_revoked FROM del;

  RETURN jsonb_build_object('rule_id', p_rule_id, 'revoked', v_revoked);
END; $$;

-- ----------------------------------------------------------------------------
-- Grants — explicit anon lockdown + authenticated grant for every SECURITY
-- DEFINER function this migration (re)defines. The CREATE OR REPLACE ones
-- already carry these grants from K1; re-asserting them keeps the lockdown
-- self-evident in this file (CLAUDE.md "Lock new RPCs from anon").
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_kit_resolve_entitlements(uuid, boolean)      FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_kit_resolve_entitlements(uuid, boolean)      TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kit_record_collection(uuid, int, text, text, uuid, text, text, boolean, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_kit_record_collection(uuid, int, text, text, uuid, text, text, boolean, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kit_expire_academic_year(uuid)              FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_kit_expire_academic_year(uuid)              TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kit_void_collection(uuid, text, boolean)     FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_kit_void_collection(uuid, text, boolean)     TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_kit_revoke_rule_entitlements(uuid)           FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_kit_revoke_rule_entitlements(uuid)           TO authenticated;
