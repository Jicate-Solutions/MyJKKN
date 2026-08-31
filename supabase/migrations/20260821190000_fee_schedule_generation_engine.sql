-- =============================================================================
-- 20260821190000_fee_schedule_generation_engine.sql
--
-- PHASE 2 of "Fee Structure — per-item due dates, split thresholds & status
-- rules" (docs/plans/2026-08-21-fee-structure-dynamic-schedules-plan.md).
-- Phase 1 (20260821180000) declared the schema; this file makes bill
-- generation honour it.
--
-- STILL A NO-OP UNTIL SOMEBODY CONFIGURES A SCHEDULE. Every default resolves to
-- `generation date + 30 days`, one bill per fee item — byte for byte what the
-- two hardcoded `now() + 30 days` expressions produced before. What changes is
-- that the number is now readable from config instead of frozen in two
-- unrelated code paths.
--
-- FIVE CHANGES
-- ------------
-- §1 admission_fee_structure_items.promotes_to_status_code
--    An UNSPLIT fee needs a status rule too. Phase 1 put the rule only on split
--    lines, which made "Application Fee paid in full -> Reserved" inexpressible
--    without inventing a fake 2-instalment split. Since a cross-item AND
--    condition is spelled by putting the SAME target on a line of each item
--    (decision D1), an item that cannot carry a rule cannot participate in one.
--
-- §2 billing_enforce_once_per_learner learns about instalment groups.
--    THE BLOCKER. once_per_learner = true on exactly the fees this feature
--    exists to split: 1 Year Tuition Fee (192 structure items), Application Fee
--    (227), University Fee (225), Uniform Fee (3). The trigger rejected
--    instalment 2 of 3 mid-batch with BL001. It now treats bills sharing an
--    instalment_group_id as ONE logical bill. A second INDEPENDENT bill — no
--    group, or a different group — is still rejected, so the guard that stops
--    the duplicate-tuition-bill class (842 duplicates per academic year, found
--    once already) keeps working exactly as before.
--
-- §3 admission_match_fee_structure_for_learner — the 8-dimension match, lifted
--    verbatim out of admission_resolve_fee_items_for_lead into one function.
--    Two callers now need it (fee resolution AND the split engine's fallback
--    for pre-existing fee_items snapshots that carry no item id), and two
--    copies of a matrix match that must agree is how a structure silently
--    resolves one way for fees and another way for due dates.
--
-- §4 billing_instalment_split_for_learner gains a fee-structure-item source.
--    Precedence: item schedule wins, legacy programme-grain plan is the
--    fallback (decision D2 — kept, not retired), neither = zero rows.
--    ⚠️ SIGNATURE AND RETURN TYPE BOTH CHANGE, so this is DROP + CREATE, not
--    CREATE OR REPLACE. DROP FUNCTION discards grants and Supabase's default
--    privileges hand EXECUTE back to PUBLIC, so §8 re-asserts every grant.
--
--    NEW CONTRACT — the caller loop is now uniform:
--      0 rows  -> no fee-structure item resolvable (a legacy snapshot):
--                 caller emits one bill on its own legacy default. Unchanged.
--      1 row   -> unsplit item, but with a RESOLVED due date. One bill, no
--                 instalment group (chk_bsb_instalment_triplet forbids a group
--                 of one).
--      N rows  -> split. N bills sharing one instalment_group_id.
--
-- §5/§6/§7 the wrapper, the fee resolver, and the account-transition RPC are
--    rebuilt to carry fee_structure_item_id end to end — without it a paid bill
--    cannot be walked back to the schedule line that names a status, which is
--    what phase 4 does.
--
-- ALSO FIXED HERE (pre-existing defect, found while reading the RPC):
-- admission_account_transition_with_bills never wrote academic_year_id on the
-- bills it inserts, though the TypeScript path always did. Migration
-- 20260821040000 added the `due_to_date_current_year` threshold basis, which
-- joins academic_years ON b.academic_year_id — so every bill this RPC created
-- silently fell out of that basis. Left alone, spreading due dates across a
-- year would have made the omission matter far more than it did.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

-- §0 GUARD
DO $guard$
BEGIN
  IF to_regclass('public.admission_fee_structure_item_schedules') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: phase 1 (20260821180000) has not been applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='billing_student_bills' AND column_name='instalment_group_id') THEN
    RAISE EXCEPTION 'REFUSING: billing_student_bills.instalment_group_id missing — phase 1 incomplete.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='admission_fee_structure_items' AND column_name='promotes_to_status_code') THEN
    RAISE EXCEPTION 'REFUSING: this migration already ran.';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 A status rule on an UNSPLIT fee item
-- =============================================================================

ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN promotes_to_status_code text;

COMMENT ON COLUMN public.admission_fee_structure_items.promotes_to_status_code IS
  'Lifecycle status the learner reaches once THIS item''s bill is settled, for an unsplit (schedule_mode = single) item. Ignored when the item is split — the lines carry their own targets. Same validation and same gates_login = false restriction as the schedule lines.';

-- Reuse phase 1's validator: it reads only NEW.promotes_to_status_code, so it
-- is table-agnostic and needs no edit.
DROP TRIGGER IF EXISTS trg_afsi_validate_status ON public.admission_fee_structure_items;
CREATE TRIGGER trg_afsi_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.admission_fee_structure_items
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

-- =============================================================================
-- §2 THE BLOCKER: once-per-learner becomes instalment-group aware
-- =============================================================================
-- Body is the live definition verbatim except for the three added lines in the
-- duplicate probe, marked below.

CREATE OR REPLACE FUNCTION public.billing_enforce_once_per_learner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled       boolean;
  v_category_name text;
  v_existing_id   uuid;
BEGIN
  IF NEW.item_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled', 'superseded') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.student_id       IS NOT DISTINCT FROM OLD.student_id
     AND NEW.item_category_id IS NOT DISTINCT FROM OLD.item_category_id
     AND OLD.status NOT IN ('cancelled', 'superseded')
  THEN
    RETURN NEW;
  END IF;

  SELECT bc.once_per_learner, bc.category_name
    INTO v_enabled, v_category_name
  FROM public.billing_categories bc
  WHERE bc.id = NEW.item_category_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.student_id::text || ':' || NEW.item_category_id::text)
  );

  SELECT b.id INTO v_existing_id
  FROM public.billing_student_bills b
  WHERE b.student_id       = NEW.student_id
    AND b.item_category_id = NEW.item_category_id
    AND b.status NOT IN ('cancelled', 'superseded')
    AND b.id IS DISTINCT FROM NEW.id
    -- ADDED 2026-08-21: instalments of ONE fee are one logical bill.
    -- A bill with no group, or a bill from a DIFFERENT group, still counts as
    -- a duplicate and is still rejected — which is the whole point of the
    -- guard. Only siblings of the same split are exempt.
    AND (NEW.instalment_group_id IS NULL
         OR b.instalment_group_id IS DISTINCT FROM NEW.instalment_group_id)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Billing category "%" allows only one bill per learner, and this learner already has one (bill %).',
      COALESCE(v_category_name, '?'), v_existing_id
      USING ERRCODE = 'BL001',
            HINT    = 'Cancel the existing bill first, or turn off "Once per learner" on this billing category.';
  END IF;

  RETURN NEW;
END;
$function$;

-- =============================================================================
-- §3 The 8-dimension structure match, extracted
-- =============================================================================
-- Lifted verbatim from admission_resolve_fee_items_for_lead (including the
-- accommodation-specific > gender-specific > most-recently-updated tiebreak).
-- Returns NULL when no active structure matches.

CREATE OR REPLACE FUNCTION public.admission_match_fee_structure_for_learner(p_learner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead         record;
  v_structure_id uuid;
BEGIN
  SELECT institution_id, degree_id, department_id, program_id,
         quota_id, community_category_id, accommodation_type_id,
         admission_year_id, gender
    INTO v_lead
    FROM public.learners_profiles
   WHERE id = p_learner_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT afs.id INTO v_structure_id
    FROM public.admission_fee_structures afs
   WHERE afs.institution_id    = v_lead.institution_id
     AND afs.degree_id         = v_lead.degree_id
     AND afs.department_id     = v_lead.department_id
     AND afs.programme_id      = v_lead.program_id
     AND afs.quota_id          = v_lead.quota_id
     AND afs.admission_year_id = v_lead.admission_year_id
     AND afs.status = 'active'
     AND EXISTS (
           SELECT 1 FROM public.admission_fee_structure_communities j
            WHERE j.fee_structure_id      = afs.id
              AND j.community_category_id = v_lead.community_category_id
         )
     AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
     AND (afs.accommodation_type_id = v_lead.accommodation_type_id
          OR afs.accommodation_type_id IS NULL)
   ORDER BY afs.accommodation_type_id IS NOT NULL DESC,
            afs.gender IS NOT NULL DESC,
            afs.updated_at DESC
   LIMIT 1;

  RETURN v_structure_id;
END;
$function$;

COMMENT ON FUNCTION public.admission_match_fee_structure_for_learner(uuid) IS
  'The single 8-dimension fee-structure match for a learner. Used by admission_resolve_fee_items_for_lead and by the split engine''s fallback for fee_items snapshots written before fee_structure_item_id existed. One copy, so fees and due dates can never resolve to different structures.';

REVOKE ALL ON FUNCTION public.admission_match_fee_structure_for_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_match_fee_structure_for_learner(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §4 Split engine — item schedule first, legacy plan second
-- =============================================================================

DROP FUNCTION IF EXISTS public.billing_instalment_split_for_learner(uuid, uuid, numeric, date);

CREATE FUNCTION public.billing_instalment_split_for_learner(
  p_learner_id            uuid,
  p_category_id           uuid,
  p_amount                numeric,
  p_anchor_date           date DEFAULT CURRENT_DATE,
  p_fee_structure_item_id uuid DEFAULT NULL
)
RETURNS TABLE (
  instalment_no           integer,
  instalment_count        integer,
  instalment_amount       numeric,
  instalment_due_date     date,
  promotes_to_status_code text,
  matched_source          text,
  matched_ref_id          uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id        uuid;
  v_structure_id   uuid;
  v_mode           text;
  v_anchor         text;
  v_item_offset    integer;
  v_item_due       date;
  v_item_status    text;
  v_default_offset integer;
  v_anchor_base    date;
  v_plan_id        uuid;
  v_total          numeric;
  v_n              integer;
  v_idx            integer := 0;
  v_sum_prev       numeric := 0;
  v_amt            numeric;
  v_line           record;
  v_amounts        numeric[] := ARRAY[]::numeric[];
  v_dues           date[]    := ARRAY[]::date[];
  v_targets        text[]    := ARRAY[]::text[];
  v_ok             boolean;
BEGIN
  IF p_learner_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  v_total := round(p_amount, 2);

  -- ── Resolve which fee-structure item this amount came from ────────────────
  -- Callers that know it pass it. Callers replaying a fee_items snapshot
  -- written before phase 2 do not, so fall back to the shared matrix match.
  v_item_id := p_fee_structure_item_id;
  IF v_item_id IS NULL AND p_category_id IS NOT NULL THEN
    v_structure_id := public.admission_match_fee_structure_for_learner(p_learner_id);
    IF v_structure_id IS NOT NULL THEN
      SELECT fsi.id INTO v_item_id
        FROM public.admission_fee_structure_items fsi
       WHERE fsi.fee_structure_id    = v_structure_id
         AND fsi.billing_category_id = p_category_id
       LIMIT 1;
    END IF;
  END IF;

  -- ══ SOURCE 1: the fee-structure item schedule ═════════════════════════════
  IF v_item_id IS NOT NULL THEN
    SELECT fsi.schedule_mode, fsi.due_anchor, fsi.due_offset_days, fsi.due_date,
           fsi.promotes_to_status_code, fs.default_due_offset_days
      INTO v_mode, v_anchor, v_item_offset, v_item_due, v_item_status, v_default_offset
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = v_item_id;

    IF FOUND THEN
      -- What an offset counts from. academic_year_start falls back to the
      -- generation date when the learner has no academic year yet — a NULL
      -- anchor would otherwise produce a NULL due_date, and due_date is NOT
      -- NULL on billing_student_bills.
      v_anchor_base := p_anchor_date;
      IF v_anchor = 'academic_year_start' THEN
        SELECT COALESCE(ay.start_date, p_anchor_date) INTO v_anchor_base
          FROM public.learners_profiles lp
          LEFT JOIN public.academic_years ay ON ay.id = lp.academic_year_id
         WHERE lp.id = p_learner_id;
        v_anchor_base := COALESCE(v_anchor_base, p_anchor_date);
      END IF;

      IF v_mode = 'split' THEN
        SELECT count(*) INTO v_n
          FROM public.admission_fee_structure_item_schedules s
         WHERE s.fee_structure_item_id = v_item_id;

        IF v_n >= 2 THEN
          v_ok := true;
          FOR v_line IN
            SELECT s.sequence_no, s.share_percent, s.fixed_amount,
                   s.due_date, s.due_offset_days, s.promotes_to_status_code
              FROM public.admission_fee_structure_item_schedules s
             WHERE s.fee_structure_item_id = v_item_id
             ORDER BY s.sequence_no
          LOOP
            v_idx := v_idx + 1;
            -- Lines 1..n-1 take their own size; the LAST absorbs rounding, so
            -- the instalments sum EXACTLY to the item amount. Identical rule to
            -- the legacy plan branch below and to computeInstalmentAmounts() in
            -- instalment-plan-service.ts.
            IF v_idx < v_n THEN
              v_amt := COALESCE(v_line.fixed_amount,
                                round(v_total * v_line.share_percent / 100.0, 2));
            ELSE
              v_amt := v_total - v_sum_prev;
            END IF;

            IF v_amt IS NULL OR v_amt <= 0 THEN
              v_ok := false;   -- schedule does not fit this amount
              EXIT;
            END IF;

            v_sum_prev := v_sum_prev + v_amt;
            v_amounts  := v_amounts || v_amt;
            v_dues     := v_dues    || COALESCE(v_line.due_date,
                                                v_anchor_base + v_line.due_offset_days);
            v_targets  := v_targets || v_line.promotes_to_status_code;
          END LOOP;

          IF v_ok THEN
            FOR v_idx IN 1 .. v_n LOOP
              instalment_no           := v_idx;
              instalment_count        := v_n;
              instalment_amount       := v_amounts[v_idx];
              instalment_due_date     := v_dues[v_idx];
              promotes_to_status_code := v_targets[v_idx];
              matched_source          := 'item_schedule';
              matched_ref_id          := v_item_id;
              RETURN NEXT;
            END LOOP;
            RETURN;
          END IF;
          -- Malformed schedule: fall through to the single-bill row below
          -- rather than returning nothing, so the item at least keeps its
          -- configured due date instead of silently reverting to +30 days.
        END IF;
      END IF;

      -- Unsplit item (or a split that did not fit): ONE row carrying the
      -- resolved due date. instalment_count = 1 tells the caller "single bill,
      -- do not stamp an instalment group".
      instalment_no       := 1;
      instalment_count    := 1;
      instalment_amount   := v_total;
      instalment_due_date := CASE
        WHEN v_anchor = 'fixed_date' AND v_item_due IS NOT NULL THEN v_item_due
        ELSE v_anchor_base + COALESCE(v_item_offset, v_default_offset, 30)
      END;
      promotes_to_status_code := v_item_status;
      matched_source          := 'item_single';
      matched_ref_id          := v_item_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- ══ SOURCE 2: legacy programme-grain plan (decision D2 — kept, dormant) ═══
  IF p_category_id IS NULL THEN
    RETURN;
  END IF;

  -- The blanket once_per_learner refusal stays ONLY on this branch. The item
  -- schedule is an explicit per-item act of configuration whose bills are
  -- stamped with an instalment group that §2 now recognises; these programme-
  -- grain plans have no UI, no rows, and no such deliberate act behind them, so
  -- the stricter rule keeps winning there.
  IF EXISTS (
    SELECT 1 FROM public.billing_categories bc
    WHERE bc.id = p_category_id AND bc.once_per_learner = true
  ) THEN
    RETURN;
  END IF;

  SELECT bip.id INTO v_plan_id
  FROM public.billing_instalment_plans bip
  JOIN public.learners_profiles lp ON lp.id = p_learner_id
  WHERE bip.is_active = true
    AND bip.institution_id   = lp.institution_id
    AND bip.program_id       = lp.program_id
    AND bip.item_category_id = p_category_id
    AND bip.academic_year_id = lp.academic_year_id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.billing_instalment_plan_lines l
  WHERE l.plan_id = v_plan_id;

  IF v_n < 2 THEN
    RETURN;
  END IF;

  v_idx      := 0;
  v_sum_prev := 0;
  v_amounts  := ARRAY[]::numeric[];
  v_dues     := ARRAY[]::date[];

  FOR v_line IN
    SELECT l.sequence_no, l.share_percent, l.fixed_amount, l.due_date, l.due_offset_days
    FROM public.billing_instalment_plan_lines l
    WHERE l.plan_id = v_plan_id
    ORDER BY l.sequence_no
  LOOP
    v_idx := v_idx + 1;
    IF v_idx < v_n THEN
      v_amt := COALESCE(v_line.fixed_amount,
                        round(v_total * v_line.share_percent / 100.0, 2));
    ELSE
      v_amt := v_total - v_sum_prev;
    END IF;

    IF v_amt IS NULL OR v_amt <= 0 THEN
      RETURN;
    END IF;

    v_sum_prev := v_sum_prev + v_amt;
    v_amounts  := v_amounts || v_amt;
    v_dues     := v_dues || COALESCE(v_line.due_date,
                                     p_anchor_date + v_line.due_offset_days);
  END LOOP;

  FOR v_idx IN 1 .. v_n LOOP
    instalment_no           := v_idx;
    instalment_count        := v_n;
    instalment_amount       := v_amounts[v_idx];
    instalment_due_date     := v_dues[v_idx];
    promotes_to_status_code := NULL;
    matched_source          := 'plan';
    matched_ref_id          := v_plan_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date, uuid) IS
  'INTERNAL schedule engine — single source of truth for instalment arithmetic AND due-date resolution. Precedence: fee-structure item schedule, then legacy programme-grain instalment plan. Zero rows = nothing resolvable, caller uses its own default. One row = unsplit, but with a resolved due date (do NOT stamp an instalment group). N rows = split; stamp one instalment_group_id across them. Not callable by end users; reach it through billing_get_instalment_split.';

-- =============================================================================
-- §5 Guarded wrapper for the TypeScript path
-- =============================================================================

DROP FUNCTION IF EXISTS public.billing_get_instalment_split(uuid, uuid, numeric);

CREATE FUNCTION public.billing_get_instalment_split(
  p_learner_id            uuid,
  p_category_id           uuid,
  p_amount                numeric,
  p_fee_structure_item_id uuid DEFAULT NULL
)
RETURNS TABLE (
  instalment_no           integer,
  instalment_count        integer,
  instalment_amount       numeric,
  instalment_due_date     date,
  promotes_to_status_code text,
  matched_source          text,
  matched_ref_id          uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The TS path cannot read the schedule tables directly: an accounts operator
  -- without admission_fees.read would get RLS-silent zero rows and generate a
  -- DIFFERENT schedule than an admin. Gate on the ability to create bills —
  -- exactly the population whose generation must consult schedules.
  IF NOT (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('billing.schedule.create')
    OR public.user_has_permission('billing.bills.create')
  ) THEN
    RAISE EXCEPTION 'not_authorized: creating bills requires billing.schedule.create or billing.bills.create'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.instalment_no, s.instalment_count, s.instalment_amount,
         s.instalment_due_date, s.promotes_to_status_code,
         s.matched_source, s.matched_ref_id
  FROM public.billing_instalment_split_for_learner(
         p_learner_id, p_category_id, p_amount, CURRENT_DATE, p_fee_structure_item_id) s
  ORDER BY s.instalment_no;
END;
$$;

COMMENT ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric, uuid) IS
  'Guarded read of the schedule engine for the TypeScript bill-generation path. Zero rows = caller keeps its own default due date and emits one bill.';

-- =============================================================================
-- §6 Fee resolution carries the structure and item ids
-- =============================================================================
-- Purely additive to the fee_items JSONB: every existing reader keys on
-- category_id / category_name / amount / source. Without the item id, a bill
-- cannot be walked back to the schedule line that names a status (phase 4).
-- Body is the live definition with the matrix match replaced by the §3 helper
-- and two keys added to each element; nothing else changed.

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(public.fn_learner_year_of_study(p_learner_id), 1);
BEGIN
    SELECT legacy_fee_mode INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    v_structure_id := public.admission_match_fee_structure_for_learner(p_learner_id);

    IF v_structure_id IS NULL THEN
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',           fsi.billing_category_id,
                'category_name',         bc.category_name,
                'amount',                fsi.amount,
                'source',                'structure',
                -- ADDED 2026-08-21 — how bill generation finds this item's
                -- schedule, and how a settled bill is walked back to the rule.
                'fee_structure_id',      fsi.fee_structure_id,
                'fee_structure_item_id', fsi.id))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id
       AND (
             fsi.applies_to = 'every_year'
          OR (fsi.applies_to = 'first_year_only' AND v_year = 1)
          OR (fsi.applies_to = 'specific_year'  AND fsi.applies_year_of_study = v_year)
       );

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',           item->>'category_id',
               'category_name',         item->>'category_name',
               'amount',                GREATEST(0, (item->>'amount')::numeric
                                          + COALESCE(pc.delta_sum, 0)),
               'source',                item->>'source',
               'fee_structure_id',      item->>'fee_structure_id',
               'fee_structure_item_id', item->>'fee_structure_item_id'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',           NULL,
                'category_name',         'Global Adjustment',
                'amount',                v_global_deltas_sum,
                'source',                'adjustment_global',
                'fee_structure_id',      NULL,
                'fee_structure_item_id', NULL
            )
        );
    END IF;

    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$function$;

-- =============================================================================
-- §7 Account transition: resolved due dates, instalment groups, academic year
-- =============================================================================
-- Live definition with FOUR changes inside the bill-generation loop, and one
-- added column on the learner SELECT. Everything else — idempotency,
-- permission check, status allow-list, pending-fee-change block, fee
-- resolution, document validation and upsert, lifecycle update, result
-- assembly — is byte for byte the previous body.

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id uuid,
    p_required_documents jsonb,
    p_received_documents jsonb,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_fee_items         jsonb;
    v_required          text[];
    v_received_types    text[];
    v_missing           text[];
    v_doc               jsonb;
    v_bills_existing    integer;
    v_bills_inserted    integer := 0;
    v_bills_skipped     integer := 0;
    v_items_split       integer := 0;
    v_items_dated       integer := 0;
    v_split             record;
    v_split_rows        integer;
    v_item              jsonb;
    v_item_id           uuid;
    v_group_id          uuid;
    v_due_date          date;
    v_caller            uuid := auth.uid();
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing_result
          FROM public.admission_account_transition_log
         WHERE idempotency_key = p_idempotency_key;
        IF v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
    END IF;

    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- academic_year_id ADDED: see §7 note — the bills below never carried it.
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode,
           accommodation_type_id, academic_year_id
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.lifecycle_status NOT IN (
        'enquiry', 'enquiry_submitted',
        'admitted', 'pending', 'approved'
    ) THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=enquiry/enquiry_submitted/admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = p_learner_id
       AND status = 'pending_review'
     LIMIT 1;
    IF v_pending_event_id IS NOT NULL THEN
        RAISE EXCEPTION 'pending_fee_change_event: cannot transition while a fee-change event is pending review (event_id=%)',
            v_pending_event_id USING ERRCODE = 'P0001';
    END IF;

    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            UPDATE public.learners_profiles
               SET legacy_fee_mode = false,
                   updated_at      = now()
             WHERE id = p_learner_id;

            v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
            IF jsonb_array_length(v_fee_items) = 0 THEN
                RAISE EXCEPTION 'fee_items_empty: no legacy fees and no matching fee structure in the matrix';
            END IF;
        END IF;
    END IF;

    SELECT array_agg(value::text) INTO v_required
      FROM jsonb_array_elements_text(p_required_documents);

    SELECT array_agg(value->>'doc_type') INTO v_received_types
      FROM jsonb_array_elements(p_received_documents) AS value;

    SELECT array_agg(req) INTO v_missing
      FROM unnest(COALESCE(v_required, ARRAY[]::text[])) AS req
     WHERE req <> ALL (COALESCE(v_received_types, ARRAY[]::text[]));

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'required_documents_missing: %', array_to_string(v_missing, ',');
    END IF;

    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_received_documents)
    LOOP
        INSERT INTO public.learner_admission_documents
            (learner_id, doc_type, is_received, received_at, received_by, received_via, document_ref)
        VALUES
            (p_learner_id,
             v_doc->>'doc_type',
             true,
             now(),
             v_caller,
             v_doc->>'received_via',
             v_doc->>'document_ref')
        ON CONFLICT (learner_id, doc_type) DO UPDATE
            SET is_received  = true,
                received_at  = EXCLUDED.received_at,
                received_by  = EXCLUDED.received_by,
                received_via = EXCLUDED.received_via,
                document_ref = EXCLUDED.document_ref,
                updated_at   = now();
    END LOOP;

    UPDATE public.learners_profiles
       SET lifecycle_status               = 'account',
           updated_at                     = now(),
           updated_by                     = v_caller,
           account_verified_at            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN now()
                                              ELSE account_verified_at
                                            END,
           account_verified_by            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN v_caller
                                              ELSE account_verified_by
                                            END,
           account_verification_notes     = COALESCE(p_notes, account_verification_notes)
     WHERE id = p_learner_id;

    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
        -- Legacy fallback only: used when the engine resolves nothing for an
        -- item (a fee_items snapshot with no structure item behind it). An item
        -- the engine DOES resolve gets its date from config, not from here.
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            IF (v_item->>'amount')::numeric > 0 THEN
                IF EXISTS (
                    SELECT 1
                      FROM public.billing_categories bc
                     WHERE bc.id = NULLIF(v_item->>'category_id','')::uuid
                       AND bc.kind IN ('hostel', 'mess', 'transport')
                ) THEN
                    v_bills_skipped := v_bills_skipped + 1;
                    CONTINUE;
                END IF;

                v_item_id  := NULLIF(v_item->>'fee_structure_item_id','')::uuid;
                v_split_rows := 0;
                v_group_id := NULL;

                FOR v_split IN
                    SELECT s.instalment_no, s.instalment_count,
                           s.instalment_amount, s.instalment_due_date,
                           s.matched_source, s.matched_ref_id
                      FROM public.billing_instalment_split_for_learner(
                             p_learner_id,
                             NULLIF(v_item->>'category_id','')::uuid,
                             (v_item->>'amount')::numeric,
                             now()::date,
                             v_item_id) s
                     ORDER BY s.instalment_no
                LOOP
                    -- ONE group id per split item. Never for a single row:
                    -- chk_bsb_instalment_triplet requires count >= 2, and a
                    -- "group" of one would tell §2's duplicate probe to exempt
                    -- a bill that has no sibling to be exempt from.
                    IF v_split.instalment_count >= 2 AND v_group_id IS NULL THEN
                        v_group_id := gen_random_uuid();
                    END IF;

                    INSERT INTO public.billing_student_bills (
                        student_id, institution_id, academic_year_id, item_category_id,
                        bill_description, due_date, quantity,
                        unit_amount, total_amount, tax_amount, final_amount,
                        balance_amount, status, remarks, created_by,
                        fee_structure_item_id,
                        instalment_group_id, instalment_no, instalment_count
                    ) VALUES (
                        p_learner_id,
                        v_lead.institution_id,
                        v_lead.academic_year_id,
                        NULLIF(v_item->>'category_id','')::uuid,
                        CASE WHEN v_split.instalment_count >= 2
                             THEN COALESCE(v_item->>'category_name','Fee Item')
                                  || ' — Instalment ' || v_split.instalment_no
                                  || '/' || v_split.instalment_count
                             ELSE COALESCE(v_item->>'category_name','Fee Item')
                        END,
                        v_split.instalment_due_date,
                        1,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        0,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        'unpaid',
                        CASE WHEN v_split.instalment_count >= 2
                             THEN 'Onboarding bill — auto-generated via account transition RPC (instalment '
                                  || v_split.instalment_no || '/' || v_split.instalment_count
                                  || ' per fee structure schedule)'
                             ELSE 'Onboarding bill — auto-generated via account transition RPC'
                        END,
                        v_caller,
                        -- matched_ref_id is the ITEM id for the two item_*
                        -- sources but the PLAN id for the legacy 'plan' source.
                        -- Writing a plan id into fee_structure_item_id would
                        -- violate its FK, so discriminate rather than COALESCE.
                        CASE WHEN v_split.matched_source LIKE 'item%'
                             THEN v_split.matched_ref_id
                             ELSE v_item_id
                        END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_group_id END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_split.instalment_no::smallint END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_split.instalment_count::smallint END
                    );
                    v_bills_inserted := v_bills_inserted + 1;
                    v_split_rows := v_split_rows + 1;
                END LOOP;

                IF v_split_rows > 1 THEN
                    v_items_split := v_items_split + 1;
                    CONTINUE;
                ELSIF v_split_rows = 1 THEN
                    v_items_dated := v_items_dated + 1;
                    CONTINUE;
                END IF;

                -- Engine resolved nothing: the pre-phase-2 single bill, on the
                -- legacy +30 day default. Byte for byte the previous behaviour.
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, academic_year_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
                    v_lead.academic_year_id,
                    NULLIF(v_item->>'category_id','')::uuid,
                    COALESCE(v_item->>'category_name','Fee Item'),
                    v_due_date,
                    1,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    0,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    'unpaid',
                    'Onboarding bill — auto-generated via account transition RPC',
                    v_caller
                );
                v_bills_inserted := v_bills_inserted + 1;
            END IF;
        END LOOP;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'bills_skipped_foreign_module', v_bills_skipped,
        'bills_split_by_instalment_plan', v_items_split,
        'items_with_scheduled_due_date', v_items_dated,
        'fee_items_count', jsonb_array_length(v_fee_items),
        'verified', (p_idempotency_key IS NOT NULL)
    );

    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.admission_account_transition_log
            (idempotency_key, learner_id, result, created_by)
        VALUES
            (p_idempotency_key, p_learner_id, v_result, v_caller)
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$function$;

-- =============================================================================
-- §8 Grant hygiene
-- =============================================================================
-- §4 and §5 used DROP + CREATE (signature and return type both changed), which
-- discards the previous ACLs — and Supabase's default privileges then hand
-- EXECUTE to PUBLIC and anon on the freshly created functions. Re-assert.

REVOKE ALL ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  TO authenticated, service_role;
