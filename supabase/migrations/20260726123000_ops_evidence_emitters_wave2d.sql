-- ============================================================================
-- Accreditation — Wave 2D: operations data emitting NAAC evidence
-- File: 20260726123000_ops_evidence_emitters_wave2d.sql
-- Date: 2026-07-26
--
-- WHY
--   Four operational registers already carry accreditation-grade facts but
--   emit ZERO rows into the quality evidence spine
--   (quality_evidence_source_registry → quality_evidence_mappings):
--     1. bos_meetings (34 live; 13 minutes_approved)   → stakeholder
--        participation in curriculum (deck metric 1.2 — seeded here)
--     2. cdc_drives (5 live, all draft) +
--        cdc_training_programmes (4 live, 695 enrollments) → career
--        development / employability activity (deck metric 7.6 — seeded here)
--     3. procurement_purchase_orders (4 live) — library-resource tagging
--        (new column) → NAAC 3.1.1
--     4. audit_cycles (9 live; 1 closed NAAC cycle)    → NAAC 4.4.2
--
-- HONEST METRIC PLACEMENT (live-catalog survey 2026-07-26; two deviations
-- from the planning brief, both explained):
--   - Brief said library POs → 3.2.1. Live 3.2.1 is 'Digital classroom
--     coverage' — a library purchase proves nothing about digital classrooms.
--     Live 3.1.1 is 'Classrooms + labs + library geo-tagged with photos +
--     purchase bills' — a library-tagged purchase order IS the purchase-bill
--     evidence that metric asks for. Wired to 3.1.1.
--   - Brief said audit cycles → 4.4.1 (+4.4.2 if honest). Live 4.4.1 is
--     'Budget utilization % over last 3 years' — a closed internal audit
--     cycle carries no budget data; wiring it would fabricate evidence.
--     Live 4.4.2 is 'Audit report — clean opinion for last 3 FY' and its
--     catalog notes already say 'Overlaps Process Excellence module' (this
--     module). A closed cycle produces the cycle audit report
--     (/api/audit/cycles/[id]/report). Wired to 4.4.2 ONLY, with metadata
--     labelling it an internal (not statutory) audit. 4.4.1 left unwired.
--
-- EXISTING-STATE SURVEY (parallel-mechanism prevention):
--   - bos_meetings.status lifecycle: draft → noticed → expert_invited →
--     … → minutes_drafted → minutes_approved (route: /api/bos/meetings/[id]/
--     status). 'Minuted' = status 'minutes_approved' (minutes_approved_at
--     set). Attendance lives in bos_meeting_attendees (present/absent/
--     leave_of_absence) — counts only are emitted, never member names.
--   - cdc_drives.status is enum cdc_drive_status: draft → announced →
--     willingness_open → eligibility_locked → attendance_day →
--     results_announced → closed | cancelled. A drive is employability
--     ACTIVITY once conducted: attendance_day / results_announced / closed.
--     cdc_drives has institutions uuid[] (no scalar institution_id) — the
--     junction anchors on institutions[1]; full count kept in metadata.
--   - cdc_training_programmes.status: DDL comment says planned |
--     in_progress | completed | cancelled but live rows carry 'ongoing'
--     (UI drift) — qualifying test is status NOT IN ('planned','cancelled')
--     so both spellings count. institution_id is NULLABLE and NULL on all
--     4 live rows — rows without an institution are SKIPPED until one is
--     set (same contract as the ss_grants wiring in PR #2407).
--   - procurement_purchase_orders lifecycle (purchase-order-service.ts):
--     draft → pending_approval → approved → sent → partially_received →
--     completed/closed; rejected; cancelled. Evidence requires the tag AND
--     a post-approval status.
--   - audit_cycles.phase: draft → in-progress → closed. frameworks text[]
--     includes CARRE-only cycles — those are NOT NAAC evidence; the emitter
--     requires 'NAAC' = ANY(frameworks). institution_ids uuid[] is NULL on
--     whole-institution cycles — skipped (junction institution_id NOT NULL).
--
-- MECHANISM — canonical trigger fan-out (PR #2407 style): natural-key upsert
-- on UNIQUE (source_table, source_id, body_code, metric_code), refresh-on-
-- edit, withdraw on state regression, AFTER DELETE cleanup, never clobber
-- is_auto=false. Each source gets a fn_sync_*_evidence(uuid) SECURITY
-- DEFINER helper the row trigger calls — the SAME code path serves the
-- idempotent backfill, so backfilled and trigger-emitted rows can never
-- drift. All fns revoked from anon, authenticated and PUBLIC (2026-06-06
-- lockdown template); trigger fire-time needs no caller EXECUTE.
-- Every emitter EXISTS-guards its institution id before inserting so a bad
-- array entry can never abort the source module's own write.
--
-- SHARED-SOURCE SAFETY (found during rolled-back validation 2026-07-26):
-- audit_cycles ALREADY carries an auto mapping from another mechanism
-- (source 164dabd1… → NAAC 7.3.d, mapped 2026-07-10). Each sync fn therefore
-- withdraws ONLY its own (body_code, metric_code) key — never "everything
-- auto for this source" — so co-existing emitters on the same source table
-- are never clobbered. The AFTER DELETE cleanup still removes ALL auto rows:
-- once the source row is gone, ANY auto evidence pointing at it dangles.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed catalog metrics 1.2 and 7.6 (WHERE NOT EXISTS — matching the live
--    NAAC row style: is_active + is_system true, category = attribute label).
--    3.1.1 and 4.4.2 already exist live (verified 2026-07-26).
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT 'NAAC', '1.2',
       'Stakeholder participation in curriculum design & review — minuted Board of Studies / board meetings with external, industry and alumni members',
       'Attribute 1: Curriculum', true, true,
       'Evidence auto-emitted from bos_meetings when a meeting reaches minutes_approved (fn_sync_bos_meeting_evidence): meeting date, board, attendee counts — no individual names. Seeded 2026-07-26 (Wave 2D ops evidence emitters).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '1.2'
);

INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT 'NAAC', '7.6',
       'Career development & employability — placement drives conducted and employability training programmes with learner participation',
       'Attribute 7: Governance', true, true,
       'Evidence auto-emitted from cdc_drives (conducted drives: attendance_day/results_announced/closed → fn_sync_cdc_drive_evidence) and cdc_training_programmes (past planned, institution set → fn_sync_cdc_training_evidence; enrollment counts refresh live from cdc_training_enrollments). Seeded 2026-07-26 (Wave 2D ops evidence emitters).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '7.6'
);

-- ----------------------------------------------------------------------------
-- 2. Library-resource tag on purchase orders. POs are generated from RFQs
--    (no free-form create), so the tag is set on the PO detail page
--    (updateDocumentFields patch path — wired in the same PR).
-- ----------------------------------------------------------------------------
ALTER TABLE public.procurement_purchase_orders
  ADD COLUMN IF NOT EXISTS is_library_resource boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.procurement_purchase_orders.is_library_resource IS
  'Wave 2D: tags this PO as a library-resource purchase. Tagged POs in a post-approval status (approved/sent/partially_received/completed/closed) auto-emit NAAC 3.1.1 purchase-bill evidence via fn_sync_procurement_po_evidence.';

-- ----------------------------------------------------------------------------
-- 3. Evidence source registry rows — CONFIG, seeded WHERE NOT EXISTS
--    (never ON CONFLICT, per registry seeding rule).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'bos_meeting', 'bos_meetings',
       'Board of Studies Meetings',
       'Minuted BoS meetings (status minutes_approved) emit NAAC 1.2 stakeholder-participation-in-curriculum evidence: meeting date, board, attendee counts — never individual member names. Trigger-emitted, refreshed on edit, withdrawn on status regression.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'bos_meeting' OR source_table = 'bos_meetings'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'cdc_drive', 'cdc_drives',
       'CDC Placement Drives',
       'Conducted placement drives (attendance_day / results_announced / closed) emit NAAC 7.6 employability-activity evidence. Anchored on the first institution in the drive''s institutions[] array; withdrawn on cancellation or regression to a pre-conduct state.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'cdc_drive' OR source_table = 'cdc_drives'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'cdc_training', 'cdc_training_programmes',
       'CDC Employability Training Programmes',
       'Training programmes past planned (and not cancelled) with an institution set emit NAAC 7.6 evidence with live enrollment counts from cdc_training_enrollments. Programmes without an institution are skipped until one is set.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'cdc_training' OR source_table = 'cdc_training_programmes'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'procurement_po', 'procurement_purchase_orders',
       'Procurement Purchase Orders (library-tagged)',
       'Purchase orders tagged is_library_resource in a post-approval status emit NAAC 3.1.1 library purchase-bill evidence (amounts in metadata). Untagged, draft, rejected and cancelled POs never emit; untagging withdraws.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'procurement_po' OR source_table = 'procurement_purchase_orders'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'audit_cycle', 'audit_cycles',
       'Internal Audit Cycles',
       'Closed internal audit cycles whose frameworks include NAAC emit NAAC 4.4.2 audit-report evidence (metadata labels it internal, not statutory). CARRE-only cycles and whole-institution cycles without institution_ids are skipped; reopening withdraws.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'audit_cycle' OR source_table = 'audit_cycles'
);

-- ----------------------------------------------------------------------------
-- 4. Generic AFTER DELETE cleanup — auto evidence must never dangle at a
--    deleted source row. Manual (is_auto=false) mappings survive.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ops_evidence_cleanup_on_delete()
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

REVOKE EXECUTE ON FUNCTION public.fn_ops_evidence_cleanup_on_delete() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_ops_evidence_cleanup_on_delete() IS
  'Wave 2D: AFTER DELETE cleanup for ops evidence sources (bos_meetings, cdc_drives, cdc_training_programmes, procurement_purchase_orders, audit_cycles) — removes AUTO quality_evidence_mappings rows so evidence never points at a deleted row. Manual (is_auto=false) mappings survive.';

-- ----------------------------------------------------------------------------
-- 5. BoS meetings → NAAC 1.2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_bos_meeting_evidence(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.bos_meetings%ROWTYPE;
  v_total   integer;
  v_present integer;
BEGIN
  SELECT * INTO m FROM public.bos_meetings WHERE id = p_meeting_id;

  IF NOT FOUND
     OR m.status <> 'minutes_approved'
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = m.institutions_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'bos_meetings' AND source_id = p_meeting_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '1.2';
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE attendance_status = 'present')
  INTO v_total, v_present
  FROM public.bos_meeting_attendees
  WHERE meeting_id = m.id;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'bos_meetings', m.id, m.institutions_id,
    'NAAC', '1.2',
    public.fn_accreditation_ay_label(
      COALESCE(m.actual_date::timestamptz, m.scheduled_date::timestamptz,
               m.minutes_approved_at, m.created_at)
    ),
    NULL, true,
    jsonb_build_object(
      'meeting_number',    m.meeting_number,
      'meeting_title',     m.meeting_title,
      'board_type',        m.board_type,
      'meeting_type',      m.meeting_type,
      'academic_year',     m.academic_year,
      'meeting_date',      COALESCE(m.actual_date, m.scheduled_date),
      'quorum_met',        m.quorum_met,
      'ratified_by_ac',    m.ratified_by_ac,
      'attendees_total',   v_total,
      'attendees_present', v_present,
      'source_trigger',    'fn_sync_bos_meeting_evidence'
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_bos_meeting_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_bos_meeting_evidence(uuid) IS
  'Wave 2D: syncs one bos_meetings row into quality_evidence_mappings — minuted meetings (status minutes_approved) emit NAAC 1.2 with attendee COUNTS only (k-anonymous, no member names). Non-qualifying/missing rows withdraw the auto mapping; manual (is_auto=false) mappings are never touched.';

CREATE OR REPLACE FUNCTION public.emit_bos_meeting_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_bos_meeting_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_bos_meeting_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_bos_meetings_evidence_fanout ON public.bos_meetings;
CREATE TRIGGER trg_bos_meetings_evidence_fanout
AFTER INSERT OR UPDATE ON public.bos_meetings
FOR EACH ROW
EXECUTE FUNCTION public.emit_bos_meeting_evidence();

DROP TRIGGER IF EXISTS trg_bos_meetings_evidence_cleanup ON public.bos_meetings;
CREATE TRIGGER trg_bos_meetings_evidence_cleanup
AFTER DELETE ON public.bos_meetings
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 6. CDC placement drives → NAAC 7.6
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_cdc_drive_evidence(p_drive_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.cdc_drives%ROWTYPE;
  v_inst uuid;
BEGIN
  SELECT * INTO d FROM public.cdc_drives WHERE id = p_drive_id;

  v_inst := CASE WHEN d.institutions IS NOT NULL AND array_length(d.institutions, 1) >= 1
                 THEN d.institutions[1] END;

  IF NOT FOUND
     OR d.status NOT IN ('attendance_day', 'results_announced', 'closed')
     OR v_inst IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'cdc_drives' AND source_id = p_drive_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '7.6';
    RETURN;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'cdc_drives', d.id, v_inst,
    'NAAC', '7.6',
    public.fn_accreditation_ay_label(COALESCE(d.drive_date::timestamptz, d.created_at)),
    NULL, true,
    jsonb_build_object(
      'title',                d.title,
      'status',               d.status::text,
      'drive_date',           d.drive_date,
      'drive_mode',           d.drive_mode,
      'job_role_title',       d.job_role_title,
      'job_location',         d.job_location,
      'expected_package_lpa', d.expected_package_lpa,
      'rounds_count',         d.rounds_count,
      'institutions_count',   COALESCE(array_length(d.institutions, 1), 0),
      'source_trigger',       'fn_sync_cdc_drive_evidence'
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_cdc_drive_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_cdc_drive_evidence(uuid) IS
  'Wave 2D: syncs one cdc_drives row into quality_evidence_mappings — conducted drives (attendance_day/results_announced/closed) emit NAAC 7.6 employability-activity evidence anchored on institutions[1]. Cancelled/regressed/institution-less drives withdraw the auto mapping; manual mappings untouched.';

CREATE OR REPLACE FUNCTION public.emit_cdc_drive_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_cdc_drive_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_cdc_drive_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_cdc_drives_evidence_fanout ON public.cdc_drives;
CREATE TRIGGER trg_cdc_drives_evidence_fanout
AFTER INSERT OR UPDATE ON public.cdc_drives
FOR EACH ROW
EXECUTE FUNCTION public.emit_cdc_drive_evidence();

DROP TRIGGER IF EXISTS trg_cdc_drives_evidence_cleanup ON public.cdc_drives;
CREATE TRIGGER trg_cdc_drives_evidence_cleanup
AFTER DELETE ON public.cdc_drives
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 7. CDC training programmes (+ live enrollment counts) → NAAC 7.6
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_cdc_training_evidence(p_programme_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.cdc_training_programmes%ROWTYPE;
  v_total     integer;
  v_completed integer;
BEGIN
  SELECT * INTO p FROM public.cdc_training_programmes WHERE id = p_programme_id;

  IF NOT FOUND
     OR p.status IN ('planned', 'cancelled')
     OR p.institution_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = p.institution_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'cdc_training_programmes' AND source_id = p_programme_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '7.6';
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.cdc_training_enrollments
  WHERE programme_id = p.id;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'cdc_training_programmes', p.id, p.institution_id,
    'NAAC', '7.6',
    public.fn_accreditation_ay_label(COALESCE(p.start_date::timestamptz, p.created_at)),
    NULL, true,
    jsonb_build_object(
      'name',                  p.name,
      'status',                p.status,
      'external_provider',     p.external_provider,
      'total_hours',           p.total_hours,
      'start_date',            p.start_date,
      'end_date',              p.end_date,
      'academic_year_label',   p.academic_year_label,
      'enrollments_total',     v_total,
      'enrollments_completed', v_completed,
      'source_trigger',        'fn_sync_cdc_training_evidence'
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_cdc_training_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_cdc_training_evidence(uuid) IS
  'Wave 2D: syncs one cdc_training_programmes row into quality_evidence_mappings — programmes past planned (not cancelled; live data also uses ''ongoing'') with an institution set emit NAAC 7.6 with live enrollment counts (learner COUNTS only, never names). Institution-less rows are skipped until one is set (ss_grants contract).';

CREATE OR REPLACE FUNCTION public.emit_cdc_training_programme_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_cdc_training_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_cdc_training_programme_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_cdc_training_programmes_evidence_fanout ON public.cdc_training_programmes;
CREATE TRIGGER trg_cdc_training_programmes_evidence_fanout
AFTER INSERT OR UPDATE ON public.cdc_training_programmes
FOR EACH ROW
EXECUTE FUNCTION public.emit_cdc_training_programme_evidence();

DROP TRIGGER IF EXISTS trg_cdc_training_programmes_evidence_cleanup ON public.cdc_training_programmes;
CREATE TRIGGER trg_cdc_training_programmes_evidence_cleanup
AFTER DELETE ON public.cdc_training_programmes
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- Enrollment churn refreshes the parent programme's evidence metadata so the
-- emitted enrollment counts never go stale.
CREATE OR REPLACE FUNCTION public.emit_cdc_training_enrollment_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_programme_id uuid;
BEGIN
  v_programme_id := COALESCE(NEW.programme_id, OLD.programme_id);
  IF v_programme_id IS NOT NULL THEN
    PERFORM public.fn_sync_cdc_training_evidence(v_programme_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_cdc_training_enrollment_refresh() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_cdc_training_enrollments_evidence_refresh ON public.cdc_training_enrollments;
CREATE TRIGGER trg_cdc_training_enrollments_evidence_refresh
AFTER INSERT OR UPDATE OR DELETE ON public.cdc_training_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.emit_cdc_training_enrollment_refresh();

-- ----------------------------------------------------------------------------
-- 8. Library-tagged purchase orders → NAAC 3.1.1
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_procurement_po_evidence(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po public.procurement_purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO po FROM public.procurement_purchase_orders WHERE id = p_po_id;

  IF NOT FOUND
     OR NOT po.is_library_resource
     OR po.status NOT IN ('approved', 'sent', 'partially_received', 'completed', 'closed')
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = po.institution_id) THEN
    -- Withdraw ONLY this emitter's key — other emitters may share the source.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'procurement_purchase_orders' AND source_id = p_po_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '3.1.1';
    RETURN;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'procurement_purchase_orders', po.id, po.institution_id,
    'NAAC', '3.1.1',
    public.fn_accreditation_ay_label(COALESCE(po.approved_at, po.created_at)),
    NULL, true,
    jsonb_build_object(
      'po_number',              po.po_number,
      'status',                 po.status,
      'domain',                 po.domain,
      'subtotal',               po.subtotal,
      'tax_amount',             po.tax_amount,
      'total_amount',           po.total_amount,
      'approved_at',            po.approved_at,
      'expected_delivery_date', po.expected_delivery_date,
      'resource_tag',           'library_resource',
      'source_trigger',         'fn_sync_procurement_po_evidence'
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_procurement_po_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_procurement_po_evidence(uuid) IS
  'Wave 2D: syncs one procurement_purchase_orders row into quality_evidence_mappings — library-tagged POs (is_library_resource) in a post-approval status emit NAAC 3.1.1 library purchase-bill evidence with amounts in metadata. Untagging or regression (draft/pending_approval/rejected/cancelled) withdraws the auto mapping. NOTE: wired to 3.1.1 (…library…purchase bills), NOT 3.2.1 (digital classroom coverage) — live-catalog honest fit, 2026-07-26.';

CREATE OR REPLACE FUNCTION public.emit_procurement_po_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_procurement_po_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_procurement_po_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_procurement_po_evidence_fanout ON public.procurement_purchase_orders;
CREATE TRIGGER trg_procurement_po_evidence_fanout
AFTER INSERT OR UPDATE ON public.procurement_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.emit_procurement_po_evidence();

DROP TRIGGER IF EXISTS trg_procurement_po_evidence_cleanup ON public.procurement_purchase_orders;
CREATE TRIGGER trg_procurement_po_evidence_cleanup
AFTER DELETE ON public.procurement_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 9. Closed internal audit cycles (NAAC framework) → NAAC 4.4.2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_audit_cycle_evidence(p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.audit_cycles%ROWTYPE;
  v_inst uuid;
BEGIN
  SELECT * INTO c FROM public.audit_cycles WHERE id = p_cycle_id;

  v_inst := CASE WHEN c.institution_ids IS NOT NULL AND array_length(c.institution_ids, 1) >= 1
                 THEN c.institution_ids[1] END;

  IF NOT FOUND
     OR c.phase <> 'closed'
     OR NOT ('NAAC' = ANY (c.frameworks))
     OR v_inst IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst) THEN
    -- Withdraw ONLY this emitter's key. audit_cycles ALREADY has a foreign
    -- auto mapping live (→ NAAC 7.3.d, mapped 2026-07-10) — a blanket
    -- "delete all auto for this source" here would destroy it.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'audit_cycles' AND source_id = p_cycle_id AND is_auto
      AND body_code = 'NAAC' AND metric_code = '4.4.2';
    RETURN;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'audit_cycles', c.id, v_inst,
    'NAAC', '4.4.2',
    public.fn_accreditation_ay_label(
      COALESCE(c.closed_at, c.end_date::timestamptz, c.start_date::timestamptz)
    ),
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_audit_cycle_evidence(uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_sync_audit_cycle_evidence(uuid) IS
  'Wave 2D: syncs one audit_cycles row into quality_evidence_mappings — CLOSED cycles whose frameworks include NAAC emit NAAC 4.4.2 audit-report evidence (metadata audit_kind=internal — this is the Process Excellence internal audit the 4.4.2 catalog notes reference, not the statutory financial audit). 4.4.1 (budget utilization) deliberately NOT wired: a cycle row carries no budget data. Reopening/CARRE-only/institution-less cycles withdraw the auto mapping.';

CREATE OR REPLACE FUNCTION public.emit_audit_cycle_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_audit_cycle_evidence(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_audit_cycle_evidence() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_cycles_evidence_fanout ON public.audit_cycles;
CREATE TRIGGER trg_audit_cycles_evidence_fanout
AFTER INSERT OR UPDATE ON public.audit_cycles
FOR EACH ROW
EXECUTE FUNCTION public.emit_audit_cycle_evidence();

DROP TRIGGER IF EXISTS trg_audit_cycles_evidence_cleanup ON public.audit_cycles;
CREATE TRIGGER trg_audit_cycles_evidence_cleanup
AFTER DELETE ON public.audit_cycles
FOR EACH ROW
EXECUTE FUNCTION public.fn_ops_evidence_cleanup_on_delete();

-- ----------------------------------------------------------------------------
-- 10. Idempotent backfill — runs the EXACT sync fns the triggers use, over
--     currently-qualifying rows only (tiny tables; re-running is a no-op
--     refresh). Expected at apply time (2026-07-26 live data): 13 BoS,
--     0 drives (all draft), 0 programmes (institution_id NULL on all),
--     0 POs (tag is new), 1 audit cycle (Pharmacy Chemistry, closed, NAAC).
-- ----------------------------------------------------------------------------
DO $backfill$
DECLARE
  r record;
  n_bos int := 0; n_drive int := 0; n_prog int := 0; n_po int := 0; n_audit int := 0;
BEGIN
  FOR r IN SELECT id FROM public.bos_meetings WHERE status = 'minutes_approved' LOOP
    PERFORM public.fn_sync_bos_meeting_evidence(r.id); n_bos := n_bos + 1;
  END LOOP;

  FOR r IN SELECT id FROM public.cdc_drives
           WHERE status IN ('attendance_day', 'results_announced', 'closed') LOOP
    PERFORM public.fn_sync_cdc_drive_evidence(r.id); n_drive := n_drive + 1;
  END LOOP;

  FOR r IN SELECT id FROM public.cdc_training_programmes
           WHERE institution_id IS NOT NULL AND status NOT IN ('planned', 'cancelled') LOOP
    PERFORM public.fn_sync_cdc_training_evidence(r.id); n_prog := n_prog + 1;
  END LOOP;

  FOR r IN SELECT id FROM public.procurement_purchase_orders
           WHERE is_library_resource
             AND status IN ('approved', 'sent', 'partially_received', 'completed', 'closed') LOOP
    PERFORM public.fn_sync_procurement_po_evidence(r.id); n_po := n_po + 1;
  END LOOP;

  FOR r IN SELECT id FROM public.audit_cycles
           WHERE phase = 'closed' AND 'NAAC' = ANY (frameworks) LOOP
    PERFORM public.fn_sync_audit_cycle_evidence(r.id); n_audit := n_audit + 1;
  END LOOP;

  RAISE NOTICE 'Wave 2D backfill synced: bos=% drives=% programmes=% pos=% audit_cycles=%',
    n_bos, n_drive, n_prog, n_po, n_audit;
END $backfill$;

-- ----------------------------------------------------------------------------
-- 11. Apply-time asserts — fail loudly here rather than the triggers failing
--     silently forever (same discipline as PR #2407).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the fan-out upserts depend on it';
  END IF;

  IF to_regprocedure('public.fn_accreditation_ay_label(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'fn_accreditation_ay_label(timestamptz) missing — period labels cannot be derived';
  END IF;

  IF (SELECT count(*) FROM public.sh_accreditation_metrics
      WHERE metric_type = 'NAAC'
        AND metric_code IN ('1.2', '7.6', '3.1.1', '4.4.2')) <> 4 THEN
    RAISE EXCEPTION 'Wave 2D target NAAC metrics incomplete — need 1.2, 7.6, 3.1.1, 4.4.2 in sh_accreditation_metrics';
  END IF;

  IF (SELECT count(*) FROM public.quality_evidence_source_registry
      WHERE source_kind IN ('bos_meeting', 'cdc_drive', 'cdc_training',
                            'procurement_po', 'audit_cycle')) <> 5 THEN
    RAISE EXCEPTION 'Wave 2D evidence source registry rows incomplete — expected all 5 kinds';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new column resolves immediately after
-- a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
