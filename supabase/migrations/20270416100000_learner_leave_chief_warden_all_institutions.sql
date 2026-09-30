-- Chief Warden is common to every institution: the final hosteler step is
-- role-holder-wide (all_institutions), not tied to the learner's institution.
-- Also reloads the PostgREST schema cache so the new
-- learner_leave_flows.flow_residency column and fn_lo_save_flow(p_residency)
-- are visible to the Approval Flows settings tab.
UPDATE public.learner_leave_flow_steps s
SET scope = 'all_institutions'
FROM public.custom_roles r
WHERE r.id = s.role_id
  AND r.role_key = 'chief_warden'
  AND s.flow_id IN (SELECT id FROM public.learner_leave_flows WHERE flow_residency = 'hostel');

NOTIFY pgrst, 'reload schema';
