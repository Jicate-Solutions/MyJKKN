-- ============================================================================
-- MBA Teaching-Enterprise · PR-1 · Improvement Board
-- Created: 2026-07-23  (spec: specs/mba-improvement-board-design-2026-07-23.md)
-- 3 tables + 2 enums + RLS + propose-only SECDEF status RPC + seeded areas.
-- Propose-only is STRUCTURAL: no RLS UPDATE path lets a learner set status to
-- 'applied'/'verified' — only fn_improvement_set_status (role-checked) can.
-- ============================================================================

-- 0) Enums (state machine — Q15 justified enum, not a value list) ------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='improvement_idea_status') THEN
    CREATE TYPE public.improvement_idea_status AS ENUM
      ('logged','under_review','approved','applied','verified','closed','rejected','withdrawn','not_pursued');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='improvement_idea_visibility') THEN
    CREATE TYPE public.improvement_idea_visibility AS ENUM ('open','sensitive');
  END IF;
END $$;

-- 1) improvement_areas — CRUDable master (institution_id NULL = global/system)
CREATE TABLE IF NOT EXISTS public.improvement_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  UNIQUE (institution_id, key)
);

-- 2) improvement_ideas — the core business-case record
CREATE TABLE IF NOT EXISTS public.improvement_ideas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),
  area_id             uuid REFERENCES public.improvement_areas(id),
  target_department_id uuid REFERENCES public.departments(id),
  author_id           uuid NOT NULL,                    -- the Management Associate (profiles.id)
  contributors        jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{learner_id, note}] named helpers
  -- the mini business case (Q2: full case required)
  title               text NOT NULL,
  problem             text NOT NULL,
  proposed_fix        text NOT NULL,
  expected_impact     text,
  evidence            text,                              -- "which data/view shows it"
  attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- lifecycle + policy
  status              public.improvement_idea_status NOT NULL DEFAULT 'logged',
  visibility          public.improvement_idea_visibility NOT NULL DEFAULT 'open',
  is_urgent           boolean NOT NULL DEFAULT false,    -- fast-track path
  score               numeric,                           -- combined grade+leaderboard score (set at review)
  -- value pipeline (feeds stipend later; nullable now)
  estimated_value_inr numeric,
  verified_value_inr  numeric,
  value_verified_at   timestamptz,
  value_holds         boolean,
  -- workflow stamps (applied_by = STAFF, never the author — propose-only)
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  applied_by  uuid, applied_at  timestamptz,
  verified_by uuid, verified_at timestamptz,
  rejection_reason text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_improvement_ideas_inst   ON public.improvement_ideas(institution_id);
CREATE INDEX IF NOT EXISTS idx_improvement_ideas_author ON public.improvement_ideas(author_id);
CREATE INDEX IF NOT EXISTS idx_improvement_ideas_status ON public.improvement_ideas(status);
CREATE INDEX IF NOT EXISTS idx_improvement_ideas_area   ON public.improvement_ideas(area_id);

-- 3) improvement_idea_activity — audit + status history + escalation trail
CREATE TABLE IF NOT EXISTS public.improvement_idea_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     uuid NOT NULL REFERENCES public.improvement_ideas(id) ON DELETE CASCADE,
  actor_id    uuid,
  action      text NOT NULL,                             -- created|edited|status_change|commented|escalated|scored|value_verified
  from_status public.improvement_idea_status,
  to_status   public.improvement_idea_status,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_improvement_activity_idea ON public.improvement_idea_activity(idea_id);

-- updated_at trigger (module-scoped, no external dependency)
CREATE OR REPLACE FUNCTION public.improvement_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_improvement_ideas_touch ON public.improvement_ideas;
CREATE TRIGGER trg_improvement_ideas_touch BEFORE UPDATE ON public.improvement_ideas
  FOR EACH ROW EXECUTE FUNCTION public.improvement_touch_updated_at();
DROP TRIGGER IF EXISTS trg_improvement_areas_touch ON public.improvement_areas;
CREATE TRIGGER trg_improvement_areas_touch BEFORE UPDATE ON public.improvement_areas
  FOR EACH ROW EXECUTE FUNCTION public.improvement_touch_updated_at();

-- 4) RLS ---------------------------------------------------------------------
ALTER TABLE public.improvement_areas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_ideas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_idea_activity  ENABLE ROW LEVEL SECURITY;

-- areas: everyone with view can read active; board managers manage
DROP POLICY IF EXISTS improvement_areas_select ON public.improvement_areas;
CREATE POLICY improvement_areas_select ON public.improvement_areas FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (is_active AND user_has_permission('improvement.ideas.view'))
);
DROP POLICY IF EXISTS improvement_areas_manage ON public.improvement_areas;
CREATE POLICY improvement_areas_manage ON public.improvement_areas FOR ALL USING (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
) WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
);

-- ideas SELECT: own always; open→program; sensitive→board managers only
DROP POLICY IF EXISTS improvement_ideas_select ON public.improvement_ideas;
CREATE POLICY improvement_ideas_select ON public.improvement_ideas FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR author_id = auth.uid()
  OR (user_has_permission('improvement.board.manage') AND role_has_institution_access(institution_id))
  OR (visibility = 'open' AND user_has_permission('improvement.ideas.view')
      AND role_has_institution_access(institution_id))
);
-- ideas INSERT: author files own idea (propose-only entry)
DROP POLICY IF EXISTS improvement_ideas_insert ON public.improvement_ideas;
CREATE POLICY improvement_ideas_insert ON public.improvement_ideas FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND user_has_permission('improvement.ideas.create')
  AND role_has_institution_access(institution_id)
);
-- ideas UPDATE: author edits own WHILE 'logged' (content only); board managers edit.
-- Status transitions do NOT happen here — they go through fn_improvement_set_status.
DROP POLICY IF EXISTS improvement_ideas_update ON public.improvement_ideas;
CREATE POLICY improvement_ideas_update ON public.improvement_ideas FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (author_id = auth.uid() AND status = 'logged')
  OR user_has_permission('improvement.board.manage')
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (author_id = auth.uid() AND status = 'logged')
  OR user_has_permission('improvement.board.manage')
);

-- activity: readable to anyone who can see the idea; insert via RPC/board managers
DROP POLICY IF EXISTS improvement_activity_select ON public.improvement_idea_activity;
CREATE POLICY improvement_activity_select ON public.improvement_idea_activity FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM public.improvement_ideas i WHERE i.id = idea_id AND (
       i.author_id = auth.uid()
       OR user_has_permission('improvement.board.manage')
       OR (i.visibility='open' AND user_has_permission('improvement.ideas.view'))))
);

-- 5) Propose-only status engine (SECDEF) -------------------------------------
-- Learners may only withdraw their own idea pre-approval. Everything else
-- (under_review/approved/applied/verified/closed/rejected/not_pursued) requires
-- improvement.board.manage. Valid transitions enforced; every change audited.
CREATE OR REPLACE FUNCTION public.fn_improvement_set_status(
  p_idea_id uuid,
  p_to_status public.improvement_idea_status,
  p_note text DEFAULT NULL
) RETURNS public.improvement_ideas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_idea public.improvement_ideas;
  v_is_manager boolean := (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage'));
  v_is_author  boolean;
BEGIN
  SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'idea not found'; END IF;
  v_is_author := (v_idea.author_id = auth.uid());

  -- learner path: withdraw own idea only, and only pre-approval
  IF NOT v_is_manager THEN
    IF NOT (v_is_author AND p_to_status = 'withdrawn'
            AND v_idea.status IN ('logged','under_review')) THEN
      RAISE EXCEPTION 'not permitted: only board managers change status (authors may withdraw pre-approval)';
    END IF;
  END IF;

  -- valid transition guard
  IF NOT (
    (v_idea.status='logged'       AND p_to_status IN ('under_review','withdrawn','rejected')) OR
    (v_idea.status='under_review' AND p_to_status IN ('approved','rejected','withdrawn','not_pursued')) OR
    (v_idea.status='approved'     AND p_to_status IN ('applied','not_pursued')) OR
    (v_idea.status='applied'      AND p_to_status IN ('verified','closed')) OR
    (v_idea.status='verified'     AND p_to_status IN ('closed')) OR
    (v_idea.status = p_to_status)
  ) THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_idea.status, p_to_status;
  END IF;

  UPDATE public.improvement_ideas SET
    status      = p_to_status,
    reviewed_by = CASE WHEN p_to_status='under_review' THEN auth.uid() ELSE reviewed_by END,
    reviewed_at = CASE WHEN p_to_status='under_review' THEN now()      ELSE reviewed_at END,
    approved_by = CASE WHEN p_to_status='approved'     THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN p_to_status='approved'     THEN now()      ELSE approved_at END,
    applied_by  = CASE WHEN p_to_status='applied'      THEN auth.uid() ELSE applied_by  END,
    applied_at  = CASE WHEN p_to_status='applied'      THEN now()      ELSE applied_at  END,
    verified_by = CASE WHEN p_to_status='verified'     THEN auth.uid() ELSE verified_by END,
    verified_at = CASE WHEN p_to_status='verified'     THEN now()      ELSE verified_at END,
    rejection_reason = CASE WHEN p_to_status='rejected' THEN COALESCE(p_note, rejection_reason) ELSE rejection_reason END
  WHERE id = p_idea_id RETURNING * INTO v_idea;

  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, from_status, to_status, note)
  VALUES (p_idea_id, auth.uid(), 'status_change', v_idea.status, p_to_status, p_note);

  RETURN v_idea;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) TO authenticated;

-- 6) Seed the global (system) areas from the posting menu --------------------
INSERT INTO public.improvement_areas (institution_id, key, label, is_system, display_order) VALUES
  (NULL,'admissions','Admissions',true,10),
  (NULL,'finance','Fees & Finance',true,20),
  (NULL,'events','Events',true,30),
  (NULL,'mess_hostel','Mess & Hostel',true,40),
  (NULL,'hr','HR',true,50),
  (NULL,'transport','Transport',true,60),
  (NULL,'coe_academic','COE / Academic',true,70),
  (NULL,'cdc_placement','CDC / Placement',true,80),
  (NULL,'iqac','IQAC / Accreditation',true,90),
  (NULL,'library','Library',true,100),
  (NULL,'feedback','Feedback / SCF',true,110),
  (NULL,'pharmacy','Pharmacy',true,120),
  (NULL,'dental','Dental Hospital',true,130),
  (NULL,'procurement','Procurement',true,140)
ON CONFLICT (institution_id, key) DO NOTHING;
