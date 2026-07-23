-- P1.1 — Physical-room eligibility rules (fail-closed).
-- A rule reserves rooms (block + optional floor + optional explicit room set)
-- for learners matching an academic predicate (institution required;
-- degree/department/program/semester nullable = "any"). A room covered by >=1
-- rule admits ONLY matching learners; uncovered rooms stay open.
--
-- This is the physical-room counterpart to the existing program-eligibility
-- (program -> room category) feature; surfaced as a 3rd "Physical Rooms" tab on
-- the same settings page. The fn_learner_eligible_for_room() matcher is enforced
-- by the auto-allocation engine (P2) and the self-selection picker (P3).

CREATE TABLE IF NOT EXISTS public.hostel_room_eligibility_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  block_id       uuid NOT NULL REFERENCES hostel_blocks(id) ON DELETE CASCADE,
  floor          int  NULL,            -- NULL + no explicit rooms = whole block
  degree_id      uuid NULL REFERENCES degrees(id) ON DELETE CASCADE,
  department_id  uuid NULL REFERENCES departments(id) ON DELETE CASCADE,
  program_id     uuid NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_id    uuid NULL REFERENCES semesters(id) ON DELETE CASCADE,
  rule_name      text NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES profiles(id),
  updated_by     uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_room_elig_rules_block
  ON public.hostel_room_eligibility_rules (block_id, is_active);

-- Explicit room targeting (optional). No rows here = whole block (floor NULL)
-- or whole floor (floor set).
CREATE TABLE IF NOT EXISTS public.hostel_room_eligibility_rule_rooms (
  rule_id uuid NOT NULL REFERENCES public.hostel_room_eligibility_rules(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, room_id)
);
CREATE INDEX IF NOT EXISTS idx_room_elig_rule_rooms_room
  ON public.hostel_room_eligibility_rule_rooms (room_id);

DROP TRIGGER IF EXISTS trg_room_elig_rules_updated_at ON public.hostel_room_eligibility_rules;
CREATE TRIGGER trg_room_elig_rules_updated_at
  BEFORE UPDATE ON public.hostel_room_eligibility_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Matcher: is a learner eligible for a room? (fail-closed) ──
CREATE OR REPLACE FUNCTION public.fn_learner_eligible_for_room(
  p_learner_id uuid,
  p_room_id    uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block uuid;
  v_floor int;
  v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid;
  v_has_covering boolean;
  v_matches boolean;
BEGIN
  SELECT block_id, floor INTO v_block, v_floor FROM hostel_rooms WHERE id = p_room_id;
  IF v_block IS NULL THEN RETURN false; END IF;

  SELECT institution_id, degree_id, department_id, program_id, semester_id
    INTO v_inst, v_degree, v_dept, v_program, v_semester
    FROM learners_profiles WHERE id = p_learner_id;

  WITH covering AS (
    SELECT r.*
    FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id = r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = r.id AND rr.room_id = p_room_id)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT EXISTS (SELECT 1 FROM covering),
         EXISTS (
           SELECT 1 FROM covering c
           WHERE c.institution_id = v_inst
             AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
             AND (c.department_id IS NULL OR c.department_id = v_dept)
             AND (c.program_id    IS NULL OR c.program_id    = v_program)
             AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)
         )
    INTO v_has_covering, v_matches;

  IF NOT v_has_covering THEN
    RETURN true;    -- uncovered room → open to all
  END IF;
  RETURN v_matches; -- covered → only matching learners
END;
$$;

-- ── RLS (read: authenticated; write: admin/super-admin via canonical helpers) ──
ALTER TABLE public.hostel_room_eligibility_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_room_eligibility_rule_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY hostel_room_elig_rules_select ON public.hostel_room_eligibility_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY hostel_room_elig_rules_insert ON public.hostel_room_eligibility_rules
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR is_admin());
CREATE POLICY hostel_room_elig_rules_update ON public.hostel_room_eligibility_rules
  FOR UPDATE TO authenticated USING (is_super_admin() OR is_admin());
CREATE POLICY hostel_room_elig_rules_delete ON public.hostel_room_eligibility_rules
  FOR DELETE TO authenticated USING (is_super_admin() OR is_admin());

CREATE POLICY hostel_room_elig_rule_rooms_select ON public.hostel_room_eligibility_rule_rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY hostel_room_elig_rule_rooms_insert ON public.hostel_room_eligibility_rule_rooms
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR is_admin());
CREATE POLICY hostel_room_elig_rule_rooms_delete ON public.hostel_room_eligibility_rule_rooms
  FOR DELETE TO authenticated USING (is_super_admin() OR is_admin());
