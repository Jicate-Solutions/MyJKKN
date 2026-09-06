-- 2026-08-02 — The HOD and the principal can read improvement ideas.
--
-- WHY
-- A recorded gemba visit that finds "differs" raises a row in
-- public.improvement_ideas. Director ruling (2026-08-01): the people who
-- should be able to read that row are the teaching-cohort members AND the
-- respective HOD and principal.
--
-- The cohort half already works: improvement_ideas_select already carries a
-- branch for visibility='open' AND user_has_permission('improvement.ideas.view')
-- AND role_has_institution_access(institution_id), and every active
-- mba_associate holds improvement.ideas.view.
--
-- The gap is only the oversight pair. Verified live 2026-08-01:
--   hod       — improvement.ideas.view stored as false  (89 active holders)
--   principal — improvement.ideas.view absent entirely  (10 active holders)
-- Either way user_has_permission() returns false, so both read nothing.
--
-- SCOPE OF "RESPECTIVE" — READ THIS BEFORE APPROVING
-- "Respective HOD and principal" is implemented here as INSTITUTION-scoped: a
-- HOD reads open ideas raised inside their own institution. It is NOT narrowed
-- to the HOD's own department, because no data link exists to narrow it with:
--   * improvement_ideas.target_department_id is never populated by the gemba
--     path — fn_gemba_observation_record inserts (institution_id, area_id,
--     author_id, title, problem, proposed_fix, evidence, status) and never sets
--     it. A branch keyed on that column would select ZERO gemba-raised ideas.
--   * improvement_areas has no department_id, and neither does
--     mba_dept_artifacts. The 14 areas are OPERATIONAL units (HR, Library,
--     Transport, Procurement, Mess and Hostel, ...), not the 89 academic
--     departments. There is no area-to-department mapping to join on.
--   * hr_additional_roles holds 0 rows, so scoping through it could never fire.
-- If per-area respectiveness is wanted, it needs a new mapping table that does
-- not exist today. That is a separate decision, not something to infer here.
--
-- WHAT CHANGES
--   1. improvement_ideas_select gains ONE branch for the new key. Every
--      existing branch is preserved as read from pg_get_expr immediately
--      before writing this file, including the (SELECT ...) initplan wrappers
--      that the RLS initplan sweep added for performance.
--   2. hod and principal are granted improvement.ideas.view_scoped.
--
-- The two admin guards are wrapped in COALESCE(..., false). In an OR chain a
-- NULL already fails closed, so this is behaviour-neutral here; it is written
-- that way because this repo has been bitten by non-NULL-safe super-admin
-- guards elsewhere and the pattern should not be copied forward.
--
-- No explicit BEGIN/COMMIT: the migration runner already wraps this file in one
-- transaction, and an inner COMMIT would silently turn a BEGIN..ROLLBACK
-- dry-run of this file into a live apply against production.

-- ---------------------------------------------------------------------------
-- 1. Read branch for the oversight pair.
-- ---------------------------------------------------------------------------
-- ALTER (not DROP + CREATE) so the table is never momentarily unprotected and
-- so this fails loudly if the policy is not where we expect it.
ALTER POLICY improvement_ideas_select ON public.improvement_ideas
USING (
  (SELECT COALESCE(public.is_super_admin(), false))
  OR (SELECT COALESCE(public.is_admin(), false))
  OR (author_id = (SELECT auth.uid()))
  OR (
    (SELECT public.user_has_permission('improvement.board.manage'::text))
    AND public.role_has_institution_access(institution_id)
  )
  OR (
    visibility = 'open'::public.improvement_idea_visibility
    AND (SELECT public.user_has_permission('improvement.ideas.view'::text))
    AND public.role_has_institution_access(institution_id)
  )
  -- NEW: the respective HOD / principal. Institution-scoped by
  -- role_has_institution_access, which keeps a HOD inside their own college
  -- rather than across all 14. 'sensitive' ideas stay out of reach — this
  -- branch requires visibility='open', exactly like the cohort branch above.
  OR (
    visibility = 'open'::public.improvement_idea_visibility
    AND (SELECT public.user_has_permission('improvement.ideas.view_scoped'::text))
    AND public.role_has_institution_access(institution_id)
  )
);

-- ---------------------------------------------------------------------------
-- 2. Grant the new key to the two oversight roles.
-- ---------------------------------------------------------------------------
-- Flat top-level key ONLY, and that is deliberate rather than an oversight:
-- public.user_has_permission(text) resolves a permission with
-- (cr.permissions->>permission_name)::boolean = true. A nested shape such as
-- {"improvement":{"ideas":{"view_scoped":true}}} is invisible to that lookup
-- (->> on a nested object yields NULL), so writing one would grant nothing and
-- would leave a second, non-enforcing copy of the truth behind. Verified
-- 2026-08-01: neither hod nor principal carries a nested "improvement" object
-- today, so the flat write is complete for both.
--
-- `||` merges, so every other permission on these roles is preserved. For hod
-- this flips an existing false; for principal it adds an absent key.
--
-- COALESCE for the same reason the admin guards above carry one: custom_roles
-- .permissions is NULLABLE (is_nullable = YES, default '{}'::jsonb), and
-- NULL || jsonb is NULL, so on a NULL-permissions row this UPDATE would write
-- NULL back and the grant would silently no-op — the exact failure this
-- migration exists to fix. Behaviour-neutral today: verified 2026-08-01 that
-- zero custom_roles rows have NULL permissions and both target rows are
-- non-NULL. Written this way so the non-NULL-safe pattern is not copied forward.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || jsonb_build_object('improvement.ideas.view_scoped', true),
    updated_at  = now()
WHERE role_key IN ('hod', 'principal');
