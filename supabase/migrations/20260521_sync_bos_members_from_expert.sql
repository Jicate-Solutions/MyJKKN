-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260521_sync_bos_members_from_expert.sql
--
-- Purpose
--   Auto-propagate edits on bos_external_experts to the denormalized
--   display_* / address / contact_no / email fields on every mapped
--   bos_members row.
--
-- Background
--   bos_members carries denormalized snapshot columns (display_name,
--   display_designation, display_institution, display_department, address,
--   contact_no, email) by deliberate design — see schema comment in
--   20260306_create_bos_tables.sql L148: "denormalized to avoid joins in
--   listing views". These columns were populated once at member-add time
--   (add-member-dialog.tsx::handleSelectExpert) and then drifted whenever
--   the expert was edited via /api/bos/experts/[id] PUT, which only writes
--   to bos_external_experts and never touches dependent member rows.
--
--   An investigation of all 13 bos_members read sites found 7 already join
--   to bos_external_experts (so they're always live) and 6 read the
--   denormalized snapshot only — and those 6 are the hot paths
--   (meetings detail, attendance GET/POST, notify-members email loop, PDF
--   preview, composition report). Retrofitting a live join into all 6
--   penalises hot-path latency, so we keep the snapshot model and add a
--   trigger that pushes parent edits down.
--
-- Behaviour
--   AFTER UPDATE on bos_external_experts, IF any synced column changed,
--   propagate to every bos_members row WHERE expert_id = NEW.id.
--
--   The WHEN clause prevents no-op cascades (e.g., when only updated_at
--   on the expert row touches).
--
--   display_name is built as "{title} {name}" when title is set, else
--   just "{name}" — matching the inline convention used in
--   app/(routes)/bos/experts/_components/columns.tsx and applied
--   consistently across BoS render sites on 2026-05-21.
--
-- Security
--   SECURITY DEFINER lets the trigger update bos_members regardless of
--   the editor's RLS scope on that table. A user with bos.experts.edit
--   might not hold bos.members.edit on every dependent institution; without
--   DEFINER the trigger would silently no-op, defeating the sync.
--
--   search_path is pinned to (public, pg_temp) so a malicious user cannot
--   shadow built-ins via session-scoped schemas — the standard hardening
--   for DEFINER functions.
--
-- Follow-up (not in this migration)
--   - Mirror trigger on staff(*) for internal-member sync.
--   - Optional: gate sync on bos_ta_da_claims.claim_status != 'paid' if
--     accounting requires post-payment immutability of the snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Function ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_bos_members_from_expert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE bos_members
  SET
    display_name = CASE
      WHEN NEW.title IS NOT NULL AND NEW.title <> ''
        THEN NEW.title || ' ' || NEW.name
      ELSE NEW.name
    END,
    display_designation = NEW.designation,
    display_institution = NEW.institution_name,
    display_department  = NEW.department_name,
    address      = NEW.address,
    contact_no   = NEW.contact_no,
    email        = NEW.email,
    updated_at   = now()
  WHERE expert_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_bos_members_from_expert() IS
  'Propagates name/title/designation/institution/department/address/contact/email '
  'edits on bos_external_experts into all mapped bos_members display_* columns. '
  'Title is prefixed onto display_name (e.g., "Dr. Foo Bar"). DEFINER-mode so it '
  'bypasses RLS on bos_members for editors who lack member-level scope.';

-- ── 2. Trigger ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_bos_members_from_expert ON bos_external_experts;

CREATE TRIGGER trg_sync_bos_members_from_expert
  AFTER UPDATE ON bos_external_experts
  FOR EACH ROW
  WHEN (
    OLD.title             IS DISTINCT FROM NEW.title             OR
    OLD.name              IS DISTINCT FROM NEW.name              OR
    OLD.designation       IS DISTINCT FROM NEW.designation       OR
    OLD.institution_name  IS DISTINCT FROM NEW.institution_name  OR
    OLD.department_name   IS DISTINCT FROM NEW.department_name   OR
    OLD.address           IS DISTINCT FROM NEW.address           OR
    OLD.contact_no        IS DISTINCT FROM NEW.contact_no        OR
    OLD.email             IS DISTINCT FROM NEW.email
  )
  EXECUTE FUNCTION public.sync_bos_members_from_expert();

-- ── 3. One-time backfill ────────────────────────────────────────────────────
-- Reconcile every existing snapshot with the current bos_external_experts row.
-- Idempotent: only touches members whose snapshot actually differs, so
-- re-running this migration after the fact will be a no-op.
UPDATE bos_members AS m
SET
  display_name = CASE
    WHEN e.title IS NOT NULL AND e.title <> ''
      THEN e.title || ' ' || e.name
    ELSE e.name
  END,
  display_designation = e.designation,
  display_institution = e.institution_name,
  display_department  = e.department_name,
  address      = e.address,
  contact_no   = e.contact_no,
  email        = e.email,
  updated_at   = now()
FROM bos_external_experts AS e
WHERE m.expert_id = e.id
  AND (
    m.display_name IS DISTINCT FROM (
      CASE
        WHEN e.title IS NOT NULL AND e.title <> ''
          THEN e.title || ' ' || e.name
        ELSE e.name
      END
    )
    OR m.display_designation IS DISTINCT FROM e.designation
    OR m.display_institution IS DISTINCT FROM e.institution_name
    OR m.display_department  IS DISTINCT FROM e.department_name
    OR m.address       IS DISTINCT FROM e.address
    OR m.contact_no    IS DISTINCT FROM e.contact_no
    OR m.email         IS DISTINCT FROM e.email
  );
