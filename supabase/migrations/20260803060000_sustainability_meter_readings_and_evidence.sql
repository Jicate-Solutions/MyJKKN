-- ============================================================================
-- Accreditation — Green substrate: monthly campus meter readings + green audits
-- File: 20260803060000_sustainability_meter_readings_and_evidence.sql
-- Date: 2026-07-26
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework, Attribute 10
--            (Sustainability & Green Initiatives, 75 marks).
--
-- WHY
--   Attribute 10 is the ONLY NAAC attribute with ZERO substrate on prod.
--   Verified live 2026-07-26:
--     SELECT metric_code, count(*) FROM quality_evidence_mappings
--      WHERE body_code='NAAC' AND metric_code LIKE '10.%' GROUP BY 1;  →  []
--   The metric catalog rows already exist and are active (10.1, 10.1.1, 10.2
--   "Water & waste management", 10.3 "Progressing towards net zero", 10.4
--   "Green audits & initiatives" — seeded by PR #1903), but nothing in the
--   platform can produce a single evidence row for any of them. A code sweep
--   for sustainab|green|energy|electricit|water|waste|carbon|solar|meter over
--   jicate/main returns no utility-metering and no green-audit code: the only
--   hits are mess FOOD waste (mess_waste_log, 0 rows), a personal hydration
--   tracker, and startup FINANCIAL runway.
--
--   The assessment rewards "PROGRESSING towards net zero", so the evidence unit
--   has to be a TREND, not a snapshot: each campus compared against its own
--   prior months. That means a monthly reading register, which nothing has.
--
-- WHAT THIS ADDS
--   1. sustainability_meter_readings — the monthly register. One row per
--      institution × calendar month × utility stream (long/tall, so adding a
--      stream later needs no migration). Entered at
--      /accreditation/manage/utility-readings. Explicit SELECT / INSERT /
--      UPDATE / DELETE RLS (a FOR-ALL-only or missing-UPDATE policy makes
--      every UPDATE silently affect 0 rows — known incident, PR #2380).
--   2. sustainability_naac_evidence — snapshot table, one row per institution
--      × academic year, carrying the AY totals, the month-over-month direction
--      and the monthly series. Writes are RPC-only (no INSERT/UPDATE/DELETE
--      policies) — same posture as hr_naac_evidence /
--      obe_course_attainment_rollup.
--   3. fn_sustainability_refresh_naac_evidence() — SECDEF refresh: upserts
--      snapshots, then upserts quality_evidence_mappings on the junction's
--      natural key for NAAC 10.2 (water & waste) and 10.3 (net-zero
--      progress).
--   4. fn_sync_audit_cycle_evidence(uuid) EXTENDED (not replaced in contract):
--      a closed audit_cycles row with module_key='sustainability' now ALSO
--      emits NAAC 10.4. The existing 4.4.2 emission is byte-for-byte
--      unchanged. No parallel audit engine, no new framework value, no new
--      catalog parameters — see the DISCRIMINATOR note below.
--   5. quality_evidence_source_registry row 'sustainability_snapshot'
--      (WHERE NOT EXISTS — never ON CONFLICT).
--   6. platform_policies row sustainability.min_months_for_trend = 2
--      (WHERE NOT EXISTS — uq_platform_policies_key_scope is an EXPRESSION
--      index, so ON CONFLICT fails 42P10). Read via fn_get_policy_int; the
--      honest-gating threshold is a config row, never an inline constant.
--   7. ai_routine_schedules seed 'sustainability-naac-evidence' (05:05 IST,
--      minute_of_day 305 — verified free: no rows between 295 and 320).
--
-- HONEST GATING (the point of the lane — never a fabricated zero)
--   - No readings for an institution in the AY  → NO snapshot row at all →
--     NO evidence row. Absence is absence, not zero.
--   - 10.2 emits only when water and/or waste has been reported for at least
--     min_months_for_trend distinct months AND a total exists.
--   - 10.3 emits only when electricity has at least min_months_for_trend
--     months AND a DIRECTION is computable (first vs latest reported month in
--     the AY, or the prior AY total). No baseline → no row: "progressing"
--     cannot be claimed without something to progress from.
--   - 10.4 emits only when a green audit cycle actually reached phase='closed'
--     inside the AY.
--   The gate outcomes are materialised as emit_10_2 / emit_10_3 booleans on
--   the snapshot so the emit condition lives in exactly ONE place (the insert
--   WHERE, the withdraw WHERE and the UI all read the same column).
--
-- DISCRIMINATOR NOTE — why module_key and NOT a framework value or new
-- catalog parameters. lib/services/audit/framework-filter.ts
-- (parameterMatchesFrameworks) matches audit_parameter_catalog.framework_mapping
-- on the KEY only and ignores the value. Seeding green parameters as
-- {"naac":"10.4"} would silently freeze them into the parameter_catalog_snapshot
-- of EVERY future NAAC cycle, inflating the academic audits; and
-- audit_parameter_catalog.parameter_group is CHECK-limited to 1..5 with no
-- environmental group. audit_cycles.module_key is free text with no CHECK, no
-- FK and no enum — 'academic', 'campus-living' and 'learners-council' are
-- already live values — so this discriminator needs ZERO vocabulary widening
-- and cannot leak into another framework's cycle.
--
-- SECURITY (CLAUDE.md mandatory RPC lockdown, 2026-06-06)
--   fn_sustainability_refresh_naac_evidence is VOLATILE SECURITY DEFINER
--   SET search_path=public, REVOKEd from anon, authenticated AND PUBLIC,
--   GRANTed to service_role ONLY (cron-only — same gate as
--   fn_hr_refresh_naac_evidence).
--   fn_sync_audit_cycle_evidence is re-granted to exactly the ACL read LIVE
--   today (anon=false, authenticated=false, service_role=true) because the
--   secdef-anon-revoke gate treats CREATE OR REPLACE as a new function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Pre-flight — the three metric catalog rows this migration emits against
--    are already live (verified 2026-07-26). Fail LOUDLY at apply rather than
--    letting the nightly cron point at a non-existent metric_code forever.
--    No metric seeding here: 10.2 / 10.3 / 10.4 already exist and are active.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(m.code, ', ') INTO v_missing
  FROM (VALUES ('10.2'), ('10.3'), ('10.4')) AS m(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics s
    WHERE s.metric_type = 'NAAC' AND s.metric_code = m.code AND s.is_active
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing/inactive NAAC metric catalog rows: %. Seed them before applying this migration.', v_missing;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. sustainability_meter_readings — the monthly register.
--    "Campus" == institution_id: quality_evidence_mappings.institution_id is
--    NOT NULL, no campuses/buildings/premises table exists, and institutions
--    (14 rows) is the only entity carrying a physical address and the thing
--    role_has_institution_access() scopes on.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sustainability_meter_readings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  -- Always the 1st of the month (the reading covers that whole month).
  period_month   date NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  stream         text NOT NULL CHECK (stream IN
                   ('electricity_kwh', 'water_kl', 'waste_kg', 'solar_kwh_generated')),
  reading_value  numeric NOT NULL CHECK (reading_value >= 0),
  is_estimated   boolean NOT NULL DEFAULT false,
  notes          text,
  recorded_by    uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Plain-column UNIQUE (no expression) → a safe ON CONFLICT target for the
  -- entry surface's save-the-whole-month upsert.
  UNIQUE (institution_id, period_month, stream)
);

COMMENT ON TABLE public.sustainability_meter_readings IS
  'Monthly utility meter readings per institution ("campus") × calendar month × stream (electricity kWh, water kL, waste kg, solar kWh generated). Entered by a named person per campus at /accreditation/manage/utility-readings. fn_sustainability_refresh_naac_evidence aggregates these into sustainability_naac_evidence and emits NAAC 10.2 / 10.3 — an institution with no readings gets NO evidence row, never a fabricated zero. Added 2026-07-26 (Attribute 10 green substrate).';

COMMENT ON COLUMN public.sustainability_meter_readings.is_estimated IS
  'True when the figure was estimated rather than read off the meter/bill. Carried into the evidence metadata so a peer team can see which months are estimates.';

CREATE INDEX IF NOT EXISTS idx_sustainability_readings_inst_month
  ON public.sustainability_meter_readings (institution_id, period_month DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.sustainability_meter_readings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sustainability_meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sustainability_meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sustainability_readings_select" ON public.sustainability_meter_readings;
CREATE POLICY "sustainability_readings_select" ON public.sustainability_meter_readings
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.sustainability_readings.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sustainability_readings_insert" ON public.sustainability_meter_readings;
CREATE POLICY "sustainability_readings_insert" ON public.sustainability_meter_readings
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.sustainability_readings.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sustainability_readings_update" ON public.sustainability_meter_readings;
CREATE POLICY "sustainability_readings_update" ON public.sustainability_meter_readings
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.sustainability_readings.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.sustainability_readings.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sustainability_readings_delete" ON public.sustainability_meter_readings;
CREATE POLICY "sustainability_readings_delete" ON public.sustainability_meter_readings
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.sustainability_readings.manage')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 2. sustainability_naac_evidence — the snapshot. One row per institution ×
--    academic year, and ONLY for institutions that reported at least one
--    reading in that AY. Writes RPC-only.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sustainability_naac_evidence (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  academic_year           text NOT NULL,        -- 'AY 2026-27' (fn_accreditation_ay_label)

  months_reported         integer NOT NULL,     -- distinct months with any reading
  latest_month            date,

  -- AY totals per stream (NULL = that stream was never reported)
  electricity_kwh_total   numeric,
  water_kl_total          numeric,
  waste_kg_total          numeric,
  solar_kwh_total         numeric,

  -- per-stream month counts — what the honest gates are computed from
  electricity_months      integer NOT NULL DEFAULT 0,
  water_waste_months      integer NOT NULL DEFAULT 0,

  -- 10.3 direction: first vs latest reported electricity month inside the AY
  electricity_first_month date,
  electricity_first_value numeric,
  electricity_last_value  numeric,
  electricity_trend_pct   numeric,              -- negative = consumption falling
  net_zero_direction      text CHECK (net_zero_direction IN ('improving', 'worsening', 'flat')),

  -- prior academic year, for the year-on-year comparison when it exists
  prior_electricity_kwh_total numeric,
  prior_water_kl_total        numeric,
  prior_waste_kg_total        numeric,

  monthly_series          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Materialised gate outcomes — the single source of truth for "does this
  -- institution have enough real data to emit?" Read by the insert WHERE, the
  -- withdraw WHERE and the entry surface alike.
  emit_10_2               boolean NOT NULL DEFAULT false,
  emit_10_3               boolean NOT NULL DEFAULT false,

  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year)
);

COMMENT ON TABLE public.sustainability_naac_evidence IS
  'Sustainability → NAAC evidence snapshots (Attribute 10): one row per institution × academic year with utility totals, month-over-month net-zero direction and the monthly series, computed from sustainability_meter_readings by fn_sustainability_refresh_naac_evidence (service_role cron sustainability-naac-evidence). A row exists ONLY where readings exist — an unreported campus produces no snapshot and no evidence. Writes are RPC-only. NAAC 10.4 (green audits) is NOT emitted from here: it comes from closed audit_cycles rows with module_key=''sustainability'' via fn_sync_audit_cycle_evidence.';

ALTER TABLE public.sustainability_naac_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sustainability_naac_evidence_select" ON public.sustainability_naac_evidence;
CREATE POLICY "sustainability_naac_evidence_select" ON public.sustainability_naac_evidence
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.view')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 3. Evidence source registry row — CONFIG, WHERE NOT EXISTS (never
--    ON CONFLICT). 'sustainability_snapshot' is non-colliding with the 22 live
--    source kinds (verified 2026-07-26).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'sustainability_snapshot', 'sustainability_naac_evidence',
       'Sustainability Evidence Snapshots',
       'Per-institution per-AY utility snapshots from the monthly meter register: water & waste management (NAAC 10.2) and progress towards net zero (10.3). Refreshed by fn_sustainability_refresh_naac_evidence via cron sustainability-naac-evidence. Green audits (10.4) are emitted separately from closed audit_cycles rows with module_key=''sustainability''.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'sustainability_snapshot'
     OR source_table = 'sustainability_naac_evidence'
);

-- ----------------------------------------------------------------------------
-- 4. Config row for the honest-gating threshold. uq_platform_policies_key_scope
--    is an EXPRESSION index → WHERE NOT EXISTS, never ON CONFLICT (42P10).
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, is_system, is_active, ui_category)
SELECT 'sustainability.min_months_for_trend', 'global', NULL, '2'::jsonb,
       'How many distinct months of readings a campus needs before NAAC Attribute 10 evidence is emitted for it. The assessment rewards a trend, so one month proves nothing — below this count the campus is skipped entirely rather than reported as a zero. Raise it to demand a longer series; never set it to 1.',
       'number', 'major', true, true, 'accreditation'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'sustainability.min_months_for_trend' AND scope_type = 'global'
);

-- ----------------------------------------------------------------------------
-- 5. fn_sustainability_refresh_naac_evidence — snapshot upsert + 10.2 / 10.3.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sustainability_refresh_naac_evidence()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ay          text;
  v_ay_start    date;
  v_ay_end      date;
  v_prior_start date;
  v_min_months  integer;
  v_snapshots   integer := 0;
  v_m102        integer := 0;
  v_m103        integer := 0;
  v_withdrawn   integer := 0;
BEGIN
  v_ay := public.fn_accreditation_ay_label(now());
  -- AY start (June 1, IST) — derived from the SAME June cutoff as the label so
  -- the aggregation window and the period_label can never drift at the boundary.
  v_ay_start := CASE
    WHEN extract(month FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 6
      THEN make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int, 6, 1)
    ELSE make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 1, 6, 1)
  END;
  v_ay_end      := (v_ay_start + interval '1 year')::date;
  v_prior_start := (v_ay_start - interval '1 year')::date;

  v_min_months := COALESCE(
    public.fn_get_policy_int('sustainability.min_months_for_trend', 2, NULL), 2);

  -- ── (a) Upsert snapshots — ONLY for institutions with readings in this AY.
  --        No readings → no row here → no evidence downstream.
  WITH cur AS (
    SELECT
      r.institution_id,
      count(DISTINCT r.period_month)::int                        AS months_reported,
      max(r.period_month)                                        AS latest_month,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream = 'electricity_kwh')::int          AS electricity_months,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream IN ('water_kl', 'waste_kg'))::int   AS water_waste_months,
      sum(r.reading_value) FILTER (WHERE r.stream = 'electricity_kwh')      AS electricity_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'water_kl')             AS water_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'waste_kg')             AS waste_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'solar_kwh_generated')  AS solar_total,
      count(*) FILTER (WHERE r.is_estimated)::int                 AS estimated_rows
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_ay_start AND r.period_month < v_ay_end
    GROUP BY r.institution_id
  ),
  -- Earliest / latest reported electricity month inside the AY — the two ends
  -- the 10.3 direction is measured across. (institution, month, stream) is
  -- UNIQUE, so DISTINCT ON yields exactly one row per institution.
  elec_first AS (
    SELECT DISTINCT ON (r.institution_id)
           r.institution_id, r.period_month AS m, r.reading_value AS v
    FROM public.sustainability_meter_readings r
    WHERE r.stream = 'electricity_kwh'
      AND r.period_month >= v_ay_start AND r.period_month < v_ay_end
    ORDER BY r.institution_id, r.period_month ASC
  ),
  elec_last AS (
    SELECT DISTINCT ON (r.institution_id)
           r.institution_id, r.period_month AS m, r.reading_value AS v
    FROM public.sustainability_meter_readings r
    WHERE r.stream = 'electricity_kwh'
      AND r.period_month >= v_ay_start AND r.period_month < v_ay_end
    ORDER BY r.institution_id, r.period_month DESC
  ),
  prior AS (
    SELECT
      r.institution_id,
      count(DISTINCT r.period_month)::int                                  AS months_reported,
      count(DISTINCT r.period_month)
        FILTER (WHERE r.stream = 'electricity_kwh')::int                   AS electricity_months,
      sum(r.reading_value) FILTER (WHERE r.stream = 'electricity_kwh')     AS electricity_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'water_kl')            AS water_total,
      sum(r.reading_value) FILTER (WHERE r.stream = 'waste_kg')            AS waste_total
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_prior_start AND r.period_month < v_ay_start
    GROUP BY r.institution_id
  ),
  series AS (
    SELECT r.institution_id,
           jsonb_agg(jsonb_build_object(
             'month',     to_char(r.period_month, 'YYYY-MM'),
             'stream',    r.stream,
             'value',     r.reading_value,
             'estimated', r.is_estimated
           ) ORDER BY r.period_month, r.stream) AS s
    FROM public.sustainability_meter_readings r
    WHERE r.period_month >= v_ay_start AND r.period_month < v_ay_end
    GROUP BY r.institution_id
  ),
  calc AS (
    SELECT
      c.*,
      ef.m AS elec_first_month, ef.v AS elec_first_value,
      el.m AS elec_last_month,  el.v AS elec_last_value,
      p.electricity_total AS prior_elec, p.water_total AS prior_water,
      p.waste_total AS prior_waste, p.months_reported AS prior_months,
      p.electricity_months AS prior_elec_months,
      s.s AS series,
      -- Direction preference: year-on-year when a prior AY exists (the honest
      -- comparison), else first-vs-latest month inside this AY.
      --
      -- YoY compares AVERAGE PER REPORTED MONTH, never raw totals. A current
      -- AY is almost always partial (in July it holds 2 months against the
      -- prior year's 12), so a totals comparison reports a fake +500% every
      -- June and a fake -85% every July. Caught by assertion A5 during
      -- BEGIN..ROLLBACK validation on prod, 2026-07-26.
      CASE
        WHEN COALESCE(p.electricity_months, 0) > 0
         AND COALESCE(p.electricity_total, 0) > 0
         AND c.electricity_months > 0
         AND c.electricity_total IS NOT NULL
          THEN round(
                 ( (c.electricity_total / c.electricity_months)
                 - (p.electricity_total / p.electricity_months) ) * 100
                 / (p.electricity_total / p.electricity_months), 1)
        WHEN ef.v IS NOT NULL AND el.m > ef.m AND ef.v > 0
          THEN round((el.v - ef.v) * 100 / ef.v, 1)
      END AS trend_pct,
      CASE
        WHEN COALESCE(p.electricity_months, 0) > 0
         AND COALESCE(p.electricity_total, 0) > 0
         AND c.electricity_months > 0
         AND c.electricity_total IS NOT NULL       THEN 'year_on_year_avg_per_month'
        WHEN ef.v IS NOT NULL AND el.m > ef.m AND ef.v > 0
                                                  THEN 'first_vs_latest_month'
        ELSE 'none'
      END AS trend_basis
    FROM cur c
    LEFT JOIN elec_first ef ON ef.institution_id = c.institution_id
    LEFT JOIN elec_last  el ON el.institution_id = c.institution_id
    LEFT JOIN prior      p  ON p.institution_id  = c.institution_id
    LEFT JOIN series     s  ON s.institution_id  = c.institution_id
  )
  INSERT INTO public.sustainability_naac_evidence AS t
    (institution_id, academic_year, months_reported, latest_month,
     electricity_kwh_total, water_kl_total, waste_kg_total, solar_kwh_total,
     electricity_months, water_waste_months,
     electricity_first_month, electricity_first_value, electricity_last_value,
     electricity_trend_pct, net_zero_direction,
     prior_electricity_kwh_total, prior_water_kl_total, prior_waste_kg_total,
     monthly_series, emit_10_2, emit_10_3, metadata, computed_at, updated_at)
  SELECT
    k.institution_id, v_ay, k.months_reported, k.latest_month,
    k.electricity_total, k.water_total, k.waste_total, k.solar_total,
    k.electricity_months, k.water_waste_months,
    k.elec_first_month, k.elec_first_value, k.elec_last_value,
    k.trend_pct,
    CASE
      WHEN k.trend_pct IS NULL   THEN NULL
      WHEN k.trend_pct <= -1     THEN 'improving'
      WHEN k.trend_pct >=  1     THEN 'worsening'
      ELSE 'flat'
    END,
    k.prior_elec, k.prior_water, k.prior_waste,
    COALESCE(k.series, '[]'::jsonb),
    -- 10.2 gate: water and/or waste reported for enough months, with a total.
    (k.water_waste_months >= v_min_months
      AND (k.water_total IS NOT NULL OR k.waste_total IS NOT NULL)),
    -- 10.3 gate: enough electricity months AND a computable direction.
    (k.electricity_months >= v_min_months AND k.trend_pct IS NOT NULL),
    jsonb_build_object(
      'ay_window',        jsonb_build_object('from', v_ay_start, 'to_exclusive', v_ay_end),
      'min_months_for_trend', v_min_months,
      'estimated_rows',   k.estimated_rows,
      'prior_ay_months',  COALESCE(k.prior_months, 0),
      'prior_ay_electricity_months', COALESCE(k.prior_elec_months, 0),
      'trend_basis',      k.trend_basis,
      'method', jsonb_build_object(
        'source',   'sustainability_meter_readings (institution × month × stream)',
        'campus',   'institution_id — no separate campus/premises entity exists',
        'excluded', 'mess_waste_log (food waste per meal) is NOT a source: 0 rows on prod and a different measure'
      )
    ),
    now(), now()
  FROM calc k
  ON CONFLICT (institution_id, academic_year) DO UPDATE
    SET months_reported             = EXCLUDED.months_reported,
        latest_month                = EXCLUDED.latest_month,
        electricity_kwh_total       = EXCLUDED.electricity_kwh_total,
        water_kl_total              = EXCLUDED.water_kl_total,
        waste_kg_total              = EXCLUDED.waste_kg_total,
        solar_kwh_total             = EXCLUDED.solar_kwh_total,
        electricity_months          = EXCLUDED.electricity_months,
        water_waste_months          = EXCLUDED.water_waste_months,
        electricity_first_month     = EXCLUDED.electricity_first_month,
        electricity_first_value     = EXCLUDED.electricity_first_value,
        electricity_last_value      = EXCLUDED.electricity_last_value,
        electricity_trend_pct       = EXCLUDED.electricity_trend_pct,
        net_zero_direction          = EXCLUDED.net_zero_direction,
        prior_electricity_kwh_total = EXCLUDED.prior_electricity_kwh_total,
        prior_water_kl_total        = EXCLUDED.prior_water_kl_total,
        prior_waste_kg_total        = EXCLUDED.prior_waste_kg_total,
        monthly_series              = EXCLUDED.monthly_series,
        emit_10_2                   = EXCLUDED.emit_10_2,
        emit_10_3                   = EXCLUDED.emit_10_3,
        metadata                    = EXCLUDED.metadata,
        computed_at                 = now(),
        updated_at                  = now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- ── (b) Withdraw this emitter's own stale AUTO rows when a gate stops
  --        holding (e.g. readings deleted → the metric disappears, it is NOT
  --        zeroed). Manual (is_auto=false) mappings are never touched, and the
  --        delete is keyed per metric so no foreign auto mapping can be caught.
  DELETE FROM public.quality_evidence_mappings qem
  USING public.sustainability_naac_evidence s
  WHERE qem.source_table = 'sustainability_naac_evidence'
    AND qem.source_id    = s.id
    AND qem.body_code    = 'NAAC'
    AND qem.is_auto
    AND s.academic_year  = v_ay
    AND (   (qem.metric_code = '10.2' AND NOT s.emit_10_2)
         OR (qem.metric_code = '10.3' AND NOT s.emit_10_3));
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;

  -- ── (c) 10.2 — water & waste management ───────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'sustainability_naac_evidence', s.id, s.institution_id, 'NAAC', '10.2',
    s.academic_year, NULL, true,
    jsonb_build_object(
      'measure',            'water_and_waste_management',
      'months_reported',    s.water_waste_months,
      'water_kl_total',     s.water_kl_total,
      'waste_kg_total',     s.waste_kg_total,
      'prior_water_kl',     s.prior_water_kl_total,
      'prior_waste_kg',     s.prior_waste_kg_total,
      'latest_month',       s.latest_month,
      'monthly_series',     s.monthly_series,
      'computed_at',        s.computed_at
    ),
    now()
  FROM public.sustainability_naac_evidence s
  WHERE s.academic_year = v_ay AND s.emit_10_2
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m102 = ROW_COUNT;

  -- ── (d) 10.3 — progressing towards net zero (direction, not a snapshot) ───
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'sustainability_naac_evidence', s.id, s.institution_id, 'NAAC', '10.3',
    s.academic_year, NULL, true,
    jsonb_build_object(
      'measure',              'net_zero_progress',
      'direction',            s.net_zero_direction,
      'trend_pct',            s.electricity_trend_pct,
      'trend_basis',          s.metadata->>'trend_basis',
      'electricity_months',   s.electricity_months,
      'electricity_kwh_total', s.electricity_kwh_total,
      'prior_electricity_kwh', s.prior_electricity_kwh_total,
      'solar_kwh_total',      s.solar_kwh_total,
      'solar_share_pct',      CASE
                                WHEN COALESCE(s.electricity_kwh_total, 0) > 0
                                 AND s.solar_kwh_total IS NOT NULL
                                THEN round(s.solar_kwh_total * 100
                                           / s.electricity_kwh_total, 1)
                              END,
      'latest_month',         s.latest_month,
      'monthly_series',       s.monthly_series,
      'computed_at',          s.computed_at
    ),
    now()
  FROM public.sustainability_naac_evidence s
  WHERE s.academic_year = v_ay AND s.emit_10_3
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m103 = ROW_COUNT;

  -- 'count' is on the dispatcher's summarize() allowlist.
  RETURN jsonb_build_object(
    'academic_year',      v_ay,
    'snapshots',          v_snapshots,
    'water_waste_10_2',   v_m102,
    'net_zero_10_3',      v_m103,
    'withdrawn',          v_withdrawn,
    'skipped_thin',       GREATEST(v_snapshots * 2 - v_m102 - v_m103, 0),
    'count',              v_m102 + v_m103
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sustainability_refresh_naac_evidence() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_sustainability_refresh_naac_evidence() TO service_role;

COMMENT ON FUNCTION public.fn_sustainability_refresh_naac_evidence() IS
  'Attribute 10 green substrate: upserts one sustainability_naac_evidence snapshot per institution THAT REPORTED READINGS in the current AY, then upserts quality_evidence_mappings rows for NAAC 10.2 (water & waste) and 10.3 (net-zero direction). Honest gating: an institution with no readings gets no snapshot and no evidence; 10.2/10.3 emit only when the reading series is long enough (sustainability.min_months_for_trend) and, for 10.3, a direction is computable. Idempotent on the junction natural key; never clobbers manual (is_auto=false) mappings; withdraws its own stale auto rows per metric. NAAC 10.4 is emitted separately by fn_sync_audit_cycle_evidence from closed module_key=''sustainability'' audit cycles. service_role only (cron sustainability-naac-evidence).';

-- ----------------------------------------------------------------------------
-- 6. EXTEND fn_sync_audit_cycle_evidence — green audits emit NAAC 10.4.
--    ADDITIVE ONLY: the 4.4.2 block below is byte-for-byte the live definition
--    read from prod on 2026-07-26. Withdrawals stay keyed per metric_code —
--    audit_cycles already carries a FOREIGN auto mapping (NAAC 7.3.d, mapped
--    2026-07-10) that a blanket "delete all auto for this source" would destroy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_audit_cycle_evidence(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.audit_cycles%ROWTYPE;
  v_inst uuid;
  v_period text;
BEGIN
  SELECT * INTO c FROM public.audit_cycles WHERE id = p_cycle_id;

  v_inst := CASE WHEN c.institution_ids IS NOT NULL AND array_length(c.institution_ids, 1) >= 1
                 THEN c.institution_ids[1] END;

  IF NOT FOUND
     OR c.phase <> 'closed'
     OR NOT ('NAAC' = ANY (c.frameworks))
     OR v_inst IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst) THEN
    -- Withdraw ONLY this emitter's keys. audit_cycles ALREADY has a foreign
    -- auto mapping live (→ NAAC 7.3.d, mapped 2026-07-10) — a blanket
    -- "delete all auto for this source" here would destroy it.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'audit_cycles' AND source_id = p_cycle_id AND is_auto
      AND body_code = 'NAAC' AND metric_code IN ('4.4.2', '10.4');
    RETURN;
  END IF;

  v_period := public.fn_accreditation_ay_label(
    COALESCE(c.closed_at, c.end_date::timestamptz, c.start_date::timestamptz)
  );

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'audit_cycles', c.id, v_inst,
    'NAAC', '4.4.2',
    v_period,
    NULL, true,
    jsonb_build_object(
      'name',               c.name,
      'phase',              c.phase,
      'audit_kind',         'internal',
      'frameworks',         to_jsonb(c.frameworks),
      'start_date',         c.start_date,
      'end_date',           c.end_date,
      'closed_at',          c.closed_at,
      'is_standing',        c.is_standing,
      'module_key',         c.module_key,
      'institutions_count', COALESCE(array_length(c.institution_ids, 1), 0),
      'source_trigger',     'fn_sync_audit_cycle_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  -- ── NAAC 10.4 — green audits & initiatives. Added 2026-07-26.
  -- A closed cycle discriminated by module_key='sustainability' IS the yearly
  -- green audit; the existing audit module (parameters → attestations →
  -- close) runs it, so there is no second audit engine. module_key is free
  -- text with no CHECK/FK/enum, so this needs no vocabulary widening and
  -- cannot leak into another framework's parameter snapshot.
  IF COALESCE(c.module_key, '') = 'sustainability' THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'audit_cycles', c.id, v_inst,
      'NAAC', '10.4',
      v_period,
      NULL, true,
      jsonb_build_object(
        'measure',            'green_audit_closed',
        'audit_kind',         'green',
        'name',               c.name,
        'phase',              c.phase,
        'frameworks',         to_jsonb(c.frameworks),
        'start_date',         c.start_date,
        'end_date',           c.end_date,
        'closed_at',          c.closed_at,
        'module_key',         c.module_key,
        'institutions_count', COALESCE(array_length(c.institution_ids, 1), 0),
        'source_trigger',     'fn_sync_audit_cycle_evidence'
      ),
      now()
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          period_label   = EXCLUDED.period_label,
          metadata       = EXCLUDED.metadata,
          is_auto        = true,
          mapped_at      = now()
      WHERE public.quality_evidence_mappings.is_auto;
  ELSE
    -- module_key edited away from 'sustainability' → withdraw 10.4 only.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'audit_cycles' AND source_id = c.id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '10.4';
  END IF;
END;
$function$;

-- Re-assert the ACL read LIVE from prod 2026-07-26 (anon=false,
-- authenticated=false, service_role=true). CREATE OR REPLACE is treated as a
-- NEW function by the secdef-anon-revoke gate, and Supabase's default
-- ALTER DEFAULT PRIVILEGES would otherwise hand anon a direct EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.fn_sync_audit_cycle_evidence(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_sync_audit_cycle_evidence(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_sync_audit_cycle_evidence(uuid) IS
  'Trigger-backed emitter for audit_cycles: a closed NAAC cycle emits NAAC 4.4.2 (internal audit conducted), and a closed cycle with module_key=''sustainability'' additionally emits NAAC 10.4 (green audits & initiatives). Withdrawals are keyed per metric_code so the foreign auto mapping on this source (NAAC 7.3.d) is never destroyed. Extended 2026-07-26 for Attribute 10; the 4.4.2 contract is unchanged.';

-- ----------------------------------------------------------------------------
-- 7. Dispatcher schedule seed — daily 05:05 IST (minute_of_day 305; verified
--    free, no rows between 295 and 320). Fired by the AI-routine dispatcher
--    which resolves the triggerPath from lib/ai-routines/misc-ai.ts; day/time
--    editable in /admin/ai-routines. NOT a raw vercel.json cron.
--    routine_id is a plain PK column (no expression) → ON CONFLICT is safe.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('sustainability-naac-evidence', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 305)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Post-apply asserts — fail LOUDLY here rather than silently nightly.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quality_evidence_source_registry
                 WHERE source_kind = 'sustainability_snapshot') THEN
    RAISE EXCEPTION 'sustainability_snapshot source registry row missing after apply';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_routine_schedules
                 WHERE routine_id = 'sustainability-naac-evidence') THEN
    RAISE EXCEPTION 'sustainability-naac-evidence schedule row missing after apply';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_policies
                 WHERE policy_key = 'sustainability.min_months_for_trend') THEN
    RAISE EXCEPTION 'sustainability.min_months_for_trend policy row missing after apply';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_sustainability_refresh_naac_evidence()', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_sync_audit_cycle_evidence(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE a SECDEF emitter — revoke failed';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fn_sync_audit_cycle_evidence(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost EXECUTE on fn_sync_audit_cycle_evidence — the audit trigger would break';
  END IF;
END $$;
