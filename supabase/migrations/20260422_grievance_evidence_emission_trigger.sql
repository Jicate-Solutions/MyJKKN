-- PR-A6a: Evidence emission trigger
-- When a grievance_ticket transitions to status='resolved', fan-out evidence
-- rows to quality_evidence_mappings for NAAC 7.7.1 (Grievance redressal
-- timeliness) + UGC grievance. These are the two bodies that score this
-- directly — per intent-vs-schema rule in Compliance Unification spec, other
-- bodies do NOT get emitted (NIRF/NBA etc. don't track grievance the same way).
--
-- Idempotent via ON CONFLICT DO NOTHING on the unique
-- (source_table, source_id, body_code, metric_code) index — safe to re-run,
-- safe if a ticket bounces resolved → reopened → resolved.

CREATE OR REPLACE FUNCTION emit_grievance_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period TEXT;
BEGIN
  IF (NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved')) THEN
    -- Academic year label (July–June) — e.g. resolved Aug 2026 → '2026-27'
    v_period := CASE
      WHEN EXTRACT(MONTH FROM COALESCE(NEW.resolved_at, NOW())) >= 7
        THEN EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT
             || '-' || RIGHT((EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))+1)::TEXT, 2)
      ELSE (EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))-1)::TEXT
             || '-' || RIGHT(EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT, 2)
    END;

    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'NAAC', '7.7.1', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;

    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'UGC', 'grievance', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emit_grievance_evidence_on_resolve ON grievance_tickets;
CREATE TRIGGER emit_grievance_evidence_on_resolve
AFTER UPDATE OF status ON grievance_tickets
FOR EACH ROW
WHEN (NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved'))
EXECUTE FUNCTION emit_grievance_evidence();

COMMENT ON FUNCTION emit_grievance_evidence() IS
  'PR-A6a: Emits quality_evidence_mappings rows for NAAC 7.7.1 + UGC grievance when a grievance_ticket transitions to resolved. Idempotent via unique constraint. Part of Compliance Unification Program.';
