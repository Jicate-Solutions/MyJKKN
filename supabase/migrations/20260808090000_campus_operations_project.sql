-- Updated: 2026-07-30 - Standing "Campus Operations" project for EAO follow-ups
--
-- WHY
-- The meetings accountability engine now raises real project tasks (not only
-- bell notifications) when a college needs an operational follow-up: an off-day
-- to add to a leave calendar, a principal who still has not connected Google
-- Calendar, a leave entry stuck awaiting approval.
--
-- Director decision 2026-07-30: ONE standing project, not one per college, with
-- RACI on each task — the Executive Admin Officer is Accountable, the college's
-- Principal is Consulted. No new structure was needed:
-- project_task_assignees.role already accepts
-- owner/collaborator/responsible/accountable/consulted/informed.
--
-- meeting-trigger-service.ts looks this project up BY CODE and fails soft when
-- it is absent (logs a warning, still sends the bell). This migration is what
-- makes the task half work outside production.
--
-- Idempotent: the row already exists on production, created 2026-07-30.

INSERT INTO public.projects (code, title, description, owner_staff_id, scope_model, visibility)
SELECT 'CAMPUS-OPS',
       'Campus Operations',
       'Standing project for cross-college operational follow-ups raised automatically by '
       || 'the meetings accountability engine — off-days to add to a college leave calendar, '
       || 'principals who still need to connect Google Calendar, and leave entries stuck '
       || 'awaiting approval. The Executive Admin Officer is Accountable on each task; the '
       || 'college Principal is Consulted.',
       (SELECT s.id FROM public.staff s
         JOIN public.profiles p ON p.id = s.profile_id
        WHERE p.role = 'executive_admin_officer' AND COALESCE(s.is_active, false)
        ORDER BY s.created_at LIMIT 1),
       'cross_institution',
       'institution'
WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE code = 'CAMPUS-OPS');

-- The EAO owns it, so it appears on their own project list.
INSERT INTO public.project_members (project_id, staff_id, role)
SELECT pr.id, pr.owner_staff_id, 'owner'
  FROM public.projects pr
 WHERE pr.code = 'CAMPUS-OPS'
   AND pr.owner_staff_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.project_members m
      WHERE m.project_id = pr.id AND m.staff_id = pr.owner_staff_id);
