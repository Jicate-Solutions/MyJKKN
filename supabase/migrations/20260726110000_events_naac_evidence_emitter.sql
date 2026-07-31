-- ============================================================================
-- Accreditation — Events module wired into the quality evidence spine (Wave 1)
-- File: 20260726110000_events_naac_evidence_emitter.sql
-- Date: 2026-07-26
--
-- WHY
--   The events table has carried pre-designed evidence hooks since Phase 1A
--   (20260417000001): naac_criteria TEXT[] (GIN-indexed), iqac_evidence_status,
--   event_category_id. They were NEVER wired to an emitter — 5 live events
--   carry NAAC codes today and quality_evidence_mappings holds ZERO
--   source_table='events' rows. This migration turns every completed,
--   NAAC-tagged event into evidence rows on the CANONICAL spine junction.
--
-- SURVEY (verified live 2026-07-26 on prod kvizhngldtiuufknvehv):
--   - events.naac_criteria = text[] NOT NULL DEFAULT '{}' — bare NAAC codes
--     ('5.4','8.4','8.2','5.3','7.1','9.1' on the 5 retro events). No app/lib
--     code reads or writes it (only the Phase-1A seed migration); office/UI
--     writes come later — this emitter simply works when values appear.
--   - events.status CHECK: draft|planning|preparation|execution|live|
--     post_event|archived|cancelled. Live distribution: draft 16, live 8,
--     archived 5. status_lifecycle_stage is NULL on all rows (unused).
--   - events.iqac_evidence_status CHECK: draft|pending_validation|validated|
--     submitted_to_naac|rejected.
--   - Catalog codes are mostly three-part (5.4.1, 8.4.1, 8.2.1, 7.1.1, 5.3.1)
--     while event tags are two-part — resolution below tries exact match
--     first, then raw||'.1' (catalog convention); unknown codes are SKIPPED,
--     never an error. All 6 live raw codes resolve.
--   - quality_evidence_mappings natural key: UNIQUE (source_table, source_id,
--     body_code, metric_code). mapped_by FK → profiles(id).
--   - Feedback wealth for aggregates: event_session_feedback 10.3k rows,
--     event_day_feedback 2.0k, event_program_feedback 173,
--     event_registrations 2.4k + events_registrations 1.6k (both have
--     event_id + status; live statuses registered|checked_in).
--
-- WHAT THIS ADDS
--   1. Catalog: seed NAAC 6.2 (cultural clubs & festivals) and 6.6
--      (community-focused activities) — verified ABSENT live; category
--      'Attribute 6: Extended Curricular' matches the existing 6.x rows.
--      Seeded WHERE NOT EXISTS (never ON CONFLICT).
--   2. Registry row: source_kind 'event' / source_table 'events' in
--      quality_evidence_source_registry — CONFIG row, WHERE NOT EXISTS.
--      (Sibling PR #2407 adds 'institution_collaboration' + 'ss_grant';
--      no collision.)
--   3. Emitter — the CANONICAL trigger fan-out for human-entered records
--      (same pattern as grievance/anti-ragging fan-outs and PR #2407):
--      an event QUALIFIES when status IN ('post_event','archived') AND
--      naac_criteria is non-empty AND iqac_evidence_status <> 'rejected'.
--      One mapping row per RESOLVED catalog code; period from
--      fn_accreditation_ay_label(end_date, falling back to start_date);
--      metadata carries the event descriptor + K-ANONYMOUS AGGREGATES ONLY
--      (registration count, feedback counts + average ratings — NEVER
--      participant identities). Refresh-on-edit; state regression / code
--      removal / IQAC rejection withdraws auto rows; AFTER DELETE cleanup;
--      manual is_auto=false rows are NEVER clobbered.
--   4. One-shot idempotent backfill of currently-qualifying events (the 5
--      archived retro events, 2 resolvable codes each → 10 mapping rows
--      expected at apply time).
--
-- SECURITY (CLAUDE.md mandatory RPC lockdown, 2026-06-06)
--   All functions here are SECURITY DEFINER SET search_path = public and
--   REVOKE EXECUTE FROM anon, authenticated, PUBLIC — trigger functions and
--   internal helpers need no direct EXECUTE (trigger fire-time does not
--   require caller EXECUTE; helpers are only called inside the SECDEF
--   emitter and by this migration's backfill). Same as PR #2407.
--   fn_accreditation_ay_label is called INSIDE the SECDEF fns: the inner
--   privilege check runs against the definer (migration owner), which owns
--   that helper — consistent 'AY 2026-27' period labels with the rollup.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catalog seeds — NAAC 6.2 + 6.6 (verified absent live 2026-07-26).
--    WHERE NOT EXISTS, matching the metric_name/notes style of live 6.x rows.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT 'NAAC', '6.2',
       'Cultural clubs & festivals — institutional cultural activities, celebrations and festivals',
       'Attribute 6: Extended Curricular', true, true,
       'Evidence auto-emitted from the Events module (events.naac_criteria tags) by emit_event_naac_evidence — one row per completed event tagged 6.2, refreshed on edit. Seeded 2026-07-26 (Wave 1 events → evidence emitter).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '6.2'
);

INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT 'NAAC', '6.6',
       'Community-focused activities — extension and outreach events serving the community',
       'Attribute 6: Extended Curricular', true, true,
       'Evidence auto-emitted from the Events module (events.naac_criteria tags) by emit_event_naac_evidence — one row per completed event tagged 6.6, refreshed on edit. Seeded 2026-07-26 (Wave 1 events → evidence emitter).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '6.6'
);

-- ----------------------------------------------------------------------------
-- 2. Evidence source registry row — CONFIG, seeded WHERE NOT EXISTS
--    (never ON CONFLICT, per registry seeding rule).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'event', 'events', 'Events',
       'Completed events (status post_event/archived) tagged with NAAC codes in events.naac_criteria auto-emit one quality_evidence_mappings row per resolved catalog code via emit_event_naac_evidence — e.g. 5.4.1, 6.2 (cultural clubs & festivals), 6.6 (community-focused activities), 8.4.1, 9.1. Refreshed on edit; withdrawn on state regression, tag removal or IQAC rejection; cleaned on delete. Metadata carries k-anonymous aggregates only (registration/feedback counts + average ratings).',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'event'
     OR source_table = 'events'
);

-- ----------------------------------------------------------------------------
-- 3. Helper — resolve raw naac_criteria tags to cataloged NAAC metric codes.
--    Exact match wins; else raw||'.1' (two-part tag → three-part catalog
--    convention, e.g. '5.4' → '5.4.1'). Unknown codes resolve to NOTHING
--    (skipped — never an error). Two raw tags resolving to the same catalog
--    code collapse to one row (raw_codes keeps both for the audit trail).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_event_naac_resolve_codes(p_codes text[])
RETURNS TABLE (metric_code text, raw_codes jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rr.metric_code,
         jsonb_agg(rr.raw_code ORDER BY rr.raw_code) AS raw_codes
  FROM (
    SELECT DISTINCT ON (rc.raw_code) rc.raw_code, m.metric_code
    FROM unnest(COALESCE(p_codes, ARRAY[]::text[])) AS rc(raw_code)
    JOIN public.sh_accreditation_metrics m
      ON m.metric_type = 'NAAC'
     AND m.is_active
     AND m.metric_code IN (rc.raw_code, rc.raw_code || '.1')
    ORDER BY rc.raw_code, (m.metric_code = rc.raw_code) DESC
  ) rr
  GROUP BY rr.metric_code;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_naac_resolve_codes(text[]) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_event_naac_resolve_codes(text[]) IS
  'Wave 1 events→evidence: resolves raw events.naac_criteria tags to cataloged NAAC metric codes (exact match, else raw||''.1''); unknown tags are skipped. Internal helper for emit_event_naac_evidence + backfill — no direct EXECUTE.';

-- ----------------------------------------------------------------------------
-- 4. Helper — evidence metadata for one event row. K-ANONYMOUS AGGREGATES
--    ONLY: counts and average ratings; never participant identities
--    (fn_accreditation_ay_label / 20260709023000 metadata discipline).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_event_naac_evidence_metadata(p_event public.events)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'event_name',           (p_event).name,
    'event_type',           (p_event).event_type,
    'event_category',       (SELECT ec.name FROM public.event_categories ec
                             WHERE ec.id = (p_event).event_category_id),
    'event_status',         (p_event).status,
    'iqac_evidence_status', (p_event).iqac_evidence_status,
    'start_date',           (p_event).start_date,
    'end_date',             (p_event).end_date,
    'aggregates', jsonb_build_object(
      'registrations_count',
        (SELECT count(*) FROM public.event_registrations er
          WHERE er.event_id = (p_event).id AND er.status <> 'cancelled')
      + (SELECT count(*) FROM public.events_registrations es
          WHERE es.event_id = (p_event).id AND es.status <> 'cancelled'),
      'session_feedback_count',
        (SELECT count(*) FROM public.event_session_feedback f WHERE f.event_id = (p_event).id),
      'session_feedback_avg_rating',
        (SELECT round(avg(f.rating)::numeric, 2) FROM public.event_session_feedback f WHERE f.event_id = (p_event).id),
      'day_feedback_count',
        (SELECT count(*) FROM public.event_day_feedback f WHERE f.event_id = (p_event).id),
      'day_feedback_avg_rating',
        (SELECT round(avg(f.rating)::numeric, 2) FROM public.event_day_feedback f WHERE f.event_id = (p_event).id),
      'program_feedback_count',
        (SELECT count(*) FROM public.event_program_feedback f WHERE f.event_id = (p_event).id),
      'program_feedback_avg_rating',
        (SELECT round(avg(f.rating)::numeric, 2) FROM public.event_program_feedback f WHERE f.event_id = (p_event).id)
    ),
    'source_trigger', 'emit_event_naac_evidence'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_naac_evidence_metadata(public.events) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_event_naac_evidence_metadata(public.events) IS
  'Wave 1 events→evidence: builds the quality_evidence_mappings metadata payload for one event — descriptor + k-anonymous aggregates only (registration/feedback counts, average ratings; NEVER participant identities). Internal helper — no direct EXECUTE.';

-- ----------------------------------------------------------------------------
-- 5. Fan-out trigger — events → quality_evidence_mappings.
--    QUALIFYING = status IN ('post_event','archived') AND naac_criteria
--    non-empty AND iqac_evidence_status <> 'rejected'. Upsert refreshes
--    metadata/period on edit; withdraws stale AUTO rows (state regression,
--    tag removal, IQAC rejection, code re-resolution); never clobbers a
--    manually-curated is_auto=false mapping — same guard as PR #2407 and
--    fn_accreditation_rollup_loop_evidence.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_event_naac_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qualifies boolean;
BEGIN
  v_qualifies := NEW.status IN ('post_event', 'archived')
                 AND COALESCE(cardinality(NEW.naac_criteria), 0) > 0
                 AND NEW.iqac_evidence_status <> 'rejected';

  -- Withdraw AUTO evidence that no longer matches this event (state
  -- regression, tag removal, IQAC rejection, or a code that no longer
  -- resolves). Manual (is_auto=false) mappings are never touched.
  DELETE FROM public.quality_evidence_mappings q
  WHERE q.source_table = 'events'
    AND q.source_id = NEW.id
    AND q.is_auto
    AND (
      NOT v_qualifies
      OR q.body_code <> 'NAAC'
      OR q.metric_code NOT IN (
        SELECT r.metric_code FROM public.fn_event_naac_resolve_codes(NEW.naac_criteria) r
      )
    );

  IF NOT v_qualifies THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  )
  SELECT
    'events', NEW.id, NEW.institution_id,
    'NAAC', r.metric_code,
    public.fn_accreditation_ay_label(COALESCE(NEW.end_date, NEW.start_date)),
    -- mapped_by FKs profiles(id); events.created_by may predate profiles —
    -- resolve defensively, NULL when absent.
    (SELECT p.id FROM public.profiles p WHERE p.id = NEW.created_by),
    true,
    public.fn_event_naac_evidence_metadata(NEW)
      || jsonb_build_object('naac_criteria_raw', r.raw_codes),
    now()
  FROM public.fn_event_naac_resolve_codes(NEW.naac_criteria) r
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        mapped_by      = EXCLUDED.mapped_by,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_event_naac_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_event_naac_evidence() IS
  'Wave 1: fans completed NAAC-tagged events (status post_event/archived, naac_criteria non-empty, iqac_evidence_status <> rejected) into quality_evidence_mappings — one row per resolved catalog code. Refreshes on edit, withdraws stale auto rows, never clobbers manual (is_auto=false) mappings. Metadata is k-anonymous aggregates only.';

DROP TRIGGER IF EXISTS trg_events_naac_evidence_fanout ON public.events;
CREATE TRIGGER trg_events_naac_evidence_fanout
AFTER INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.emit_event_naac_evidence();

-- ----------------------------------------------------------------------------
-- 6. Delete hygiene — auto-emitted evidence must not dangle at a deleted
--    event. Manual mappings survive (an auditor may have pinned them).
--    (Own function — sibling PR #2407 ships a similar generic cleanup, but
--    this migration must not depend on an unmerged PR.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_event_evidence_cleanup_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = TG_TABLE_NAME
    AND source_id = OLD.id
    AND is_auto;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_evidence_cleanup_on_delete() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_event_evidence_cleanup_on_delete() IS
  'Wave 1: AFTER DELETE cleanup for the events evidence emitter — removes AUTO quality_evidence_mappings rows (source_table = TG_TABLE_NAME) so evidence never points at a deleted event. Manual (is_auto=false) mappings survive.';

DROP TRIGGER IF EXISTS trg_events_naac_evidence_cleanup ON public.events;
CREATE TRIGGER trg_events_naac_evidence_cleanup
AFTER DELETE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.fn_event_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 7. One-shot idempotent backfill of currently-qualifying events. Explicit
--    INSERT ... SELECT (NOT a synthetic UPDATE of events — that would fire
--    the approval/cancellation cascade triggers and mutate row timestamps).
--    Re-running is a no-op refresh via the same natural-key upsert.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_mappings (
  source_table, source_id, institution_id,
  body_code, metric_code, period_label,
  mapped_by, is_auto, metadata, mapped_at
)
SELECT
  'events', e.id, e.institution_id,
  'NAAC', r.metric_code,
  public.fn_accreditation_ay_label(COALESCE(e.end_date, e.start_date)),
  (SELECT p.id FROM public.profiles p WHERE p.id = e.created_by),
  true,
  public.fn_event_naac_evidence_metadata(e)
    || jsonb_build_object('naac_criteria_raw', r.raw_codes,
                          'backfilled_at', now()),
  now()
FROM public.events e
CROSS JOIN LATERAL public.fn_event_naac_resolve_codes(e.naac_criteria) r
WHERE e.status IN ('post_event', 'archived')
  AND COALESCE(cardinality(e.naac_criteria), 0) > 0
  AND e.iqac_evidence_status <> 'rejected'
ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
  SET institution_id = EXCLUDED.institution_id,
      period_label   = EXCLUDED.period_label,
      metadata       = EXCLUDED.metadata,
      mapped_by      = EXCLUDED.mapped_by,
      is_auto        = true,
      mapped_at      = now()
  WHERE public.quality_evidence_mappings.is_auto;

-- ----------------------------------------------------------------------------
-- 8. Apply-time asserts — fail loudly here rather than the trigger failing
--    silently forever (same discipline as 20260709023000 / PR #2407).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the fan-out upsert depends on it';
  END IF;

  IF to_regprocedure('public.fn_accreditation_ay_label(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'fn_accreditation_ay_label(timestamptz) missing — apply 20260709023000 first';
  END IF;

  IF (SELECT count(*) FROM public.sh_accreditation_metrics
      WHERE metric_type = 'NAAC' AND metric_code IN ('6.2', '6.6')) <> 2 THEN
    RAISE EXCEPTION 'NAAC metrics 6.2/6.6 missing from sh_accreditation_metrics after seed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_source_registry
    WHERE source_kind = 'event' AND source_table = 'events'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_source_registry row for events missing after seed';
  END IF;
END $assert$;
