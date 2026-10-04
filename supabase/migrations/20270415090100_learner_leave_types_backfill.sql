-- ============================================================================
-- Learner Leave types: migrate hostel types + OD sub-categories, seed default
-- flows, backfill applications, re-seed stranded pending applications.
-- Depends on 20270415090000_learner_leave_types_and_role_flows.sql.
-- ============================================================================

-- 1. Hostel leave types → learner_leave_types, SAME ids (hostel_gate_passes
--    .leave_type_id is repointed below and its rows must stay valid).
INSERT INTO public.learner_leave_types
  (id, code, name, description, color_code, category, residency,
   max_duration_days, advance_notice_hours, requires_attachment,
   affects_attendance, is_active, sort_order, created_by)
SELECT h.id, h.leave_type_code, h.leave_type_name, h.description,
       coalesce(h.color_code, '#6366f1'),
       CASE WHEN h.leave_type_code IN
              ('industrial_visit', 'training', 'sports_cultural', 'internship', 'clinical_rotation')
            THEN 'onduty' ELSE 'leave' END::public.leave_onduty_category,
       'hostel',
       h.default_max_duration_days, coalesce(h.advance_notice_hours, 0),
       coalesce(h.requires_attachment, false),
       h.leave_type_code NOT IN ('weekend', 'night_out'),
       h.is_active, coalesce(h.sort_order, 0), h.created_by
FROM public.hostel_leave_types h
ON CONFLICT (code) DO NOTHING;

-- 2. OD / leave sub-categories (157 rows = the same ~15 codes per institution)
--    → one global type each. A code that also exists as a hostel type
--    ('medical') is the same concept for everyone: widen it to 'both'.
UPDATE public.learner_leave_types t
   SET residency = 'both'
 WHERE EXISTS (SELECT 1 FROM public.leave_onduty_sub_categories s
               WHERE s.code = t.code AND s.category = t.category);

INSERT INTO public.learner_leave_types
  (code, name, category, residency, requires_sponsor_approval, sponsor_role_hint,
   is_active, sort_order)
SELECT s.code, min(s.name), s.category, 'both',
       bool_or(s.requires_sponsor_approval), min(s.sponsor_role_hint),
       bool_or(s.is_active),
       100 + row_number() OVER (ORDER BY s.category, s.code)
FROM public.leave_onduty_sub_categories s
WHERE NOT EXISTS (SELECT 1 FROM public.learner_leave_types t WHERE t.code = s.code)
GROUP BY s.category, s.code;

-- 3. Default (group-wide) flows — editable in /learners/leave-onduty/settings.
--      day_scholar / both : HOD (own department) → Principal (own institution)
--      hostel             : Warden (hostel block) → Principal (own institution)
INSERT INTO public.learner_leave_flows (leave_type_id, institution_id)
SELECT t.id, NULL FROM public.learner_leave_types t
ON CONFLICT ON CONSTRAINT learner_leave_flows_type_inst_key DO NOTHING;

INSERT INTO public.learner_leave_flow_steps (flow_id, step_order, role_id, scope)
SELECT f.id, v.step_order, cr.id, v.scope::public.learner_leave_step_scope
FROM public.learner_leave_flows f
JOIN public.learner_leave_types t ON t.id = f.leave_type_id
CROSS JOIN LATERAL (VALUES
  (1, CASE WHEN t.residency = 'hostel' THEN 'warden' ELSE 'hod' END,
      CASE WHEN t.residency = 'hostel' THEN 'hostel_block' ELSE 'own_department' END),
  (2, 'principal', 'own_institution')
) AS v(step_order, role_key, scope)
JOIN public.custom_roles cr ON cr.role_key = v.role_key
WHERE f.institution_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.learner_leave_flow_steps st WHERE st.flow_id = f.id)
ON CONFLICT ON CONSTRAINT learner_leave_flow_steps_flow_order_key DO NOTHING;

-- 4. Backfill leave_type_id on every existing application (sub_category = code).
UPDATE public.leave_onduty_applications a
   SET leave_type_id = t.id
  FROM public.learner_leave_types t
 WHERE a.leave_type_id IS NULL
   AND t.code = a.sub_category
   AND t.category = a.category;

-- 5. Re-seed pending applications that have NO approver rows (they were
--    invisible to every approver). Sponsor-gated ones (current_step 0) wait for
--    the sponsor, whose RPC now seeds the chain.
DO $$
DECLARE
  r record;
  v_ok integer := 0;
  v_fail integer := 0;
BEGIN
  FOR r IN
    SELECT a.id FROM public.leave_onduty_applications a
    WHERE a.status = 'pending'
      AND coalesce(a.current_step, 0) >= 1
      AND a.leave_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.leave_onduty_approvals ap WHERE ap.application_id = a.id)
  LOOP
    BEGIN
      PERFORM public._fn_lo_seed_steps(r.id);
      UPDATE public.leave_onduty_applications SET current_step = 1 WHERE id = r.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      RAISE NOTICE 'reseed % failed: %', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Re-seeded % stranded applications (% failed)', v_ok, v_fail;
END $$;

-- 6. Gate passes pick their type from the learner list now (ids preserved).
ALTER TABLE public.hostel_gate_passes DROP CONSTRAINT IF EXISTS hostel_gate_passes_leave_type_id_fkey;
ALTER TABLE public.hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_leave_type_id_fkey
  FOREIGN KEY (leave_type_id) REFERENCES public.learner_leave_types(id) ON DELETE RESTRICT;
