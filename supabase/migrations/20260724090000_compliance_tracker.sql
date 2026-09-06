-- Migration: 20260724090000_compliance_tracker.sql
-- Purpose: A lightweight, open compliance tracker that lives at the unlisted
--   /tracker page. Any logged-in MyJKKN user can VIEW; staff & faculty (any
--   authenticated non-student) can WRITE — add items, comment, update compliance
--   status, and assign owners. Distinct from the formal accreditation audit
--   module (audit_* tables); a tracked item can later be linked to audit evidence.
--
-- Director decisions 2026-07-24: open-to-all view, not on nav (unlisted URL);
--   staff+faculty write, students view-only; sections/items are data so a skill
--   can scaffold new trackers; comments + assignees per item.
--
-- Shape: tracker_sections → tracker_items → (tracker_comments, tracker_item_assignees).
-- Built-in live sections (curriculum readiness, audit rollup) are seeded rows the
-- page renders via dedicated read-only aggregate RPCs; custom sections render generically.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Write-gate helper. "Staff & faculty" = any authenticated non-student.
--    Centralised so it can later be swapped for a user_has_permission() check
--    without touching every policy/RPC.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tracker_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND ( is_super_admin() OR is_admin()
           OR COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_tracker_can_write() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_tracker_can_write() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracker_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key  text UNIQUE NOT NULL,
  title        text NOT NULL,
  description  text,
  kind         text NOT NULL DEFAULT 'custom'
                 CHECK (kind IN ('custom','builtin_curriculum','builtin_audit')),
  icon         text,
  sort_order   int  NOT NULL DEFAULT 100,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tracker_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id    uuid NOT NULL REFERENCES public.tracker_sections(id) ON DELETE CASCADE,
  institution_id uuid,                        -- optional per-college scope; NULL = org-wide
  title         text NOT NULL,
  description   text,
  compliance_status text NOT NULL DEFAULT 'not_started'
                 CHECK (compliance_status IN ('not_started','in_progress','compliant','at_risk','blocked','na')),
  due_date      date,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- free-form detail (skill-populated)
  sort_order    int  NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracker_items_section ON public.tracker_items(section_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.tracker_item_assignees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES public.tracker_items(id) ON DELETE CASCADE,
  assignee_id  uuid NOT NULL
                 CONSTRAINT tracker_item_assignees_assignee_id_fkey
                 REFERENCES public.profiles(id) ON DELETE CASCADE,   -- named so PostgREST can embed profiles
  assigned_by  uuid,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, assignee_id)
);
CREATE INDEX IF NOT EXISTS idx_tracker_assignees_item ON public.tracker_item_assignees(item_id);

CREATE TABLE IF NOT EXISTS public.tracker_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES public.tracker_items(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL,
  body          text NOT NULL,
  status_change text,                          -- e.g. 'in_progress→compliant' when a comment logs a status change
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracker_comments_item ON public.tracker_comments(item_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS — read open to all logged-in users; writes only via the SECDEF RPCs below
--    (no INSERT/UPDATE/DELETE policy → direct writes denied; RPCs bypass as owner).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tracker_sections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_item_assignees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_comments        ENABLE ROW LEVEL SECURITY;

CREATE POLICY tracker_sections_read ON public.tracker_sections
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY tracker_items_read ON public.tracker_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY tracker_assignees_read ON public.tracker_item_assignees
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY tracker_comments_read ON public.tracker_comments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Write RPCs — SECURITY DEFINER, gated by fn_tracker_can_write(). Each records
--    the acting user. Granted to authenticated; the gate rejects students inside.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tracker_add_section(
  p_section_key text, p_title text, p_description text DEFAULT NULL, p_icon text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  INSERT INTO tracker_sections(section_key, title, description, icon, kind, created_by)
  VALUES (p_section_key, p_title, p_description, p_icon, 'custom', auth.uid())
  ON CONFLICT (section_key) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_tracker_add_item(
  p_section_id uuid, p_title text, p_description text DEFAULT NULL,
  p_due_date date DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb, p_institution_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  INSERT INTO tracker_items(section_id, title, description, due_date, details, institution_id, created_by)
  VALUES (p_section_id, p_title, p_description, p_due_date, COALESCE(p_details,'{}'::jsonb), p_institution_id, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_tracker_set_status(
  p_item_id uuid, p_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text;
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('not_started','in_progress','compliant','at_risk','blocked','na') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE='22023';
  END IF;
  SELECT compliance_status INTO v_old FROM tracker_items WHERE id = p_item_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'item not found' USING ERRCODE='P0002'; END IF;
  UPDATE tracker_items SET compliance_status = p_status, updated_at = now() WHERE id = p_item_id;
  -- Log the change as a comment so the item's history reads plainly.
  INSERT INTO tracker_comments(item_id, author_id, body, status_change)
  VALUES (p_item_id, auth.uid(), COALESCE(NULLIF(p_note,''), 'Updated compliance status.'), v_old || '→' || p_status);
END $$;

CREATE OR REPLACE FUNCTION public.fn_tracker_add_comment(
  p_item_id uuid, p_body text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF COALESCE(btrim(p_body),'') = '' THEN RAISE EXCEPTION 'comment is empty' USING ERRCODE='22023'; END IF;
  INSERT INTO tracker_comments(item_id, author_id, body)
  VALUES (p_item_id, auth.uid(), p_body) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_tracker_assign(
  p_item_id uuid, p_assignee_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  INSERT INTO tracker_item_assignees(item_id, assignee_id, assigned_by)
  VALUES (p_item_id, p_assignee_id, auth.uid())
  ON CONFLICT (item_id, assignee_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.fn_tracker_unassign(
  p_item_id uuid, p_assignee_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fn_tracker_can_write() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  DELETE FROM tracker_item_assignees WHERE item_id = p_item_id AND assignee_id = p_assignee_id;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Read-only aggregate RPCs for the two BUILT-IN live sections. Aggregate/summary
--    only (no PII, no student rows). Open to all logged-in users.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a) Curriculum spine readiness — per-college pipeline counts.
CREATE OR REPLACE FUNCTION public.fn_open_curriculum_readiness()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH syl AS (
    SELECT institutions_id iid,
           count(*) FILTER (WHERE is_latest AND NOT is_archived
             AND course_learning_outcomes IS NOT NULL
             AND course_learning_outcomes::text NOT IN ('null','{}','[]')) syllabi_clos
    FROM bos_course_syllabi GROUP BY 1),
  reg AS (
    SELECT institutions_id iid,
           count(*) FILTER (WHERE taxonomy_type='finks')  fink_regs,
           count(*) FILTER (WHERE taxonomy_type='blooms') bloom_regs,
           count(*) FILTER (WHERE taxonomy_type IS NULL)  no_tax_regs
    FROM bos_regulation_taxonomies GROUP BY 1),
  co AS (
    SELECT institution_id iid,
           count(*) FILTER (WHERE taxonomy_level IS NOT NULL)     bloom_cos,
           count(*) FILTER (WHERE taxonomy_dimension IS NOT NULL) fink_cos
    FROM obe_course_outcomes GROUP BY 1),
  sp AS (
    SELECT institution_id iid, count(*) lessons, count(DISTINCT course_id) courses
    FROM curriculum_lesson GROUP BY 1)
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'syllabi_clos')::int DESC, row->>'college'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'college', i.name,
      'syllabi_clos', COALESCE(syl.syllabi_clos,0),
      'fink_regs', COALESCE(reg.fink_regs,0),
      'bloom_regs', COALESCE(reg.bloom_regs,0),
      'no_tax_regs', COALESCE(reg.no_tax_regs,0),
      'pos', (SELECT count(*) FROM bos_programme_outcomes b WHERE b.institutions_id=i.id),
      'psos', (SELECT count(*) FROM bos_programme_specific_outcomes b WHERE b.institutions_id=i.id),
      'bloom_cos', COALESCE(co.bloom_cos,0),
      'fink_cos', COALESCE(co.fink_cos,0),
      'spine_lessons', COALESCE(sp.lessons,0),
      'spine_courses', COALESCE(sp.courses,0)
    ) AS row
    FROM institutions i
    LEFT JOIN syl ON syl.iid=i.id LEFT JOIN reg ON reg.iid=i.id
    LEFT JOIN co  ON co.iid=i.id  LEFT JOIN sp  ON sp.iid=i.id
  ) s;
$$;

-- 4b) Audit rollup — the standing "Whole Institution" cycle's stored results,
--     SAFE columns only (verdict + finding counts + framework), never the PII sample.
CREATE OR REPLACE FUNCTION public.fn_open_audit_report_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle uuid; v_rows jsonb; v_roll jsonb;
BEGIN
  SELECT id INTO v_cycle FROM audit_cycles
   WHERE name ILIKE '%institution%' OR name ILIKE '%standing%'
   ORDER BY start_date DESC NULLS LAST LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'parameter', c.name,
           'framework', c.framework_mapping,
           'verdict', COALESCE(r.verdict,'unchecked'),
           'open_findings', COALESCE(r.open_finding_count,0),
           'attested', COALESCE(r.attested,false)
         ) ORDER BY c.code), '[]'::jsonb)
    INTO v_rows
    FROM audit_parameter_catalog c
    LEFT JOIN audit_parameter_results r
      ON r.parameter_code = c.code AND r.audit_cycle_id = v_cycle
   WHERE c.is_org_wide = true AND c.is_active = true;

  SELECT jsonb_build_object(
           'total', jsonb_array_length(v_rows),
           'pass',  (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'verdict'='pass'),
           'fail',  (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'verdict'='fail'),
           'unchecked', (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'verdict' NOT IN ('pass','fail'))
         ) INTO v_roll;

  RETURN jsonb_build_object('rollup', v_roll, 'parameters', v_rows);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Grants — every RPC locked from anon, open to authenticated (gates run inside).
-- ─────────────────────────────────────────────────────────────────────────────
DO $g$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fn_tracker_add_section(text,text,text,text)',
    'fn_tracker_add_item(uuid,text,text,date,jsonb,uuid)',
    'fn_tracker_set_status(uuid,text,text)',
    'fn_tracker_add_comment(uuid,text)',
    'fn_tracker_assign(uuid,uuid)',
    'fn_tracker_unassign(uuid,uuid)',
    'fn_open_curriculum_readiness()',
    'fn_open_audit_report_summary()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, PUBLIC;', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO authenticated;', fn);
  END LOOP;
END $g$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Seed the two built-in live sections (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tracker_sections(section_key, title, description, kind, sort_order)
VALUES
  ('curriculum_readiness','Lesson Spine Readiness','Per-college progress on the learning-pathway → taxonomy → outcomes → lesson-spine pipeline.','builtin_curriculum',10),
  ('audit_rollup','Whole-Institution Audit','Org-wide compliance parameters and their current verdicts from the standing institutional audit.','builtin_audit',20)
ON CONFLICT (section_key) DO NOTHING;
