-- ============================================================================
-- Improvement Board · make triage somebody's job — a named assignee per idea
-- Created: 2026-09-06
-- ----------------------------------------------------------------------------
-- THE PROBLEM THIS ANSWERS
--   Measured on production 2026-09-06: 55 ideas, 34 still in 'logged', the
--   oldest filed 4 Aug. 27 distinct people are entitled to move them and
--   nothing routes any single idea to any single one of them, so triage is
--   initiative rather than duty. On 2 Sep one executive made 18 of the 22
--   status moves ever recorded and it stopped again the same afternoon.
--
-- WHY A COLUMN AND NOT A ROLE ROW  (the landmine, avoided structurally)
--   Department-level ownership already exists and rides
--   hr_additional_roles.role_type = 'department_owner'
--   (lib/services/improvement/department-owner-service.ts:67). That mechanism
--   has a live failure mode recorded in its own header, lines 37-43:
--   fn_mba_dept_role_assignments_sync — the organogram approve path — end-dates
--   EVERY current role on a board whose role_type is not one of the titles in
--   the approved organogram, and 'department_owner' is not an organogram title
--   anywhere. Approving a department's organogram therefore silently un-assigns
--   the owner that the nightly untriaged sweep depends on.
--
--   This migration does NOT extend that mechanism. Per-idea accountability is a
--   column on improvement_ideas — a row fn_mba_dept_role_assignments_sync does
--   not read and cannot end-date. Nothing anywhere clears
--   improvement_ideas.assignee_id except fn_improvement_assign_idea below and
--   the FK's ON DELETE SET NULL (the assignee's profile being deleted).
--   Reviewer receipt: searching the repo for assignee_id returns only this
--   migration, the assignment service, and its test.
--
-- WHY MANUAL, NOT AUTO-ROUTED
--   Deliberate, and NOT a technical limit. Auto-routing by
--   improvement_areas.key -> the current department owner is the obvious
--   follow-up and is left unbuilt pending a Director decision, because today it
--   would route only 4 of the 10 areas actually in use: 10 distinct area_ids
--   carry the 55 ideas, and hr_additional_roles holds exactly 4 current
--   department_owner rows (Admissions, Events, Fees & Finance, HR). Shipping
--   auto-routing now would leave 6 of 10 areas silently unrouted while looking
--   like the problem was solved.
--
-- WHY THE ASSIGNEE IS TOLD, IN BOTH TABLES
--   An assignment nobody hears about is the same non-event as no assignment.
--   The board already has one notification writer and it reaches nobody:
--   fn_improvement_untriaged_notify inserts into public.notifications ONLY.
--   Verified on production 2026-09-06 —
--     notifications      WHERE category='improvement:triage'                = 10
--     user_notifications joined to those                                    =  0
--   The bell and inbox read the JUNCTION table, stated in the notification
--   service's own comment (lib/services/notification/notification-service.ts
--   :571-577), and there is no fan-out trigger on public.notifications (only
--   safety_log_delete and set_timestamp_notifications). So the sweep believed it
--   announced 10 neglected ideas to 4 department owners and delivered nothing.
--   This RPC writes BOTH tables, which is the load-bearing half of the canonical
--   writer fn_cr_notify (20260725000000_project_change_requests_rpcs.sql:64).
--
--   It does not CALL fn_cr_notify: that function hardcodes
--   category='projects:change_request' and its kind/priority, and filing an
--   improvement notice under the projects category would mislead every consumer
--   that filters by category. Widening fn_cr_notify's signature would rewrite
--   another module's live write path from this PR, which is out of scope. The
--   duplication is twelve lines and is named here so the next person lifts a
--   shared helper deliberately rather than discovering the copy.
--
-- WHY THE ACTIVITY VERBS 'assigned' / 'unassigned'
--   20260816050000 lines 48-53 argues for reusing the documented vocabulary
--   (created|edited|status_change|commented|escalated|scored|value_verified)
--   because an unknown verb "would render as an unknown action in every timeline
--   that switches on the documented set". Checked, and that risk does not hold
--   here: the ONLY renderer is formatAction() at
--   app/(routes)/improvement-board/_components/idea-detail-dialog.tsx:510-520,
--   it already special-cases 'resolution_recorded' — itself outside the
--   documented set, written by 20260727030000:402 — and its final line is a
--   generic fallback, a.action?.replace(/_/g, ' '). 'assigned' renders as
--   "assigned". No existing verb means "this is now this person's job";
--   'edited' would actively lie about what happened.
--
-- Additive and non-destructive. No status is changed, no existing row rewritten.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Columns. Cloned from the sibling board's owner_id
--    (mba_data_gaps.owner_id, 20260804060000_mba_data_gap_v2_foundations.sql:34)
--    plus the by/at stamp pair that improvement_ideas already uses for every
--    other actor (reviewed_by/at, approved_by/at, applied_by/at, verified_by/at)
--    — an actor column with no stamp would be the only one on the table, and the
--    owner-aware follow-up sweep needs "assigned N days ago, still logged"
--    without a second schema change.
-- ----------------------------------------------------------------------------
ALTER TABLE public.improvement_ideas
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_improvement_ideas_assignee
  ON public.improvement_ideas(assignee_id);

COMMENT ON COLUMN public.improvement_ideas.assignee_id IS
  'The one named person accountable for moving this idea. NULL = nobody, the shared-board default. Written ONLY by fn_improvement_assign_idea. Deliberately a column on the idea, not an hr_additional_roles row, so the organogram approve path (fn_mba_dept_role_assignments_sync) cannot silently end-date it the way it end-dates department_owner.';
COMMENT ON COLUMN public.improvement_ideas.assigned_by IS
  'The board manager who made the assignment. Cleared alongside assignee_id when the assignment is lifted.';
COMMENT ON COLUMN public.improvement_ideas.assigned_at IS
  'When the current assignment was made. Cleared alongside assignee_id. A follow-up owner-aware sweep reads this to find ideas assigned long ago and still unmoved.';

-- ----------------------------------------------------------------------------
-- 2. fn_improvement_assign_idea — the ONLY write path for the three columns.
--
--    SECURITY DEFINER is required, not decorative: improvement_idea_activity has
--    no INSERT policy at all (20260727030000:431), so the timeline row cannot be
--    written by an ordinary session, and public.user_notifications is likewise
--    not client-writable. The manager guard is therefore enforced HERE and is
--    the whole of the authorization for this operation.
--
--    NOTE for the reviewer, stated rather than hidden: the base
--    improvement_ideas_update policy (20260723090000:135-144) already grants a
--    board.manage holder USING/WITH CHECK true with no column restriction, so a
--    manager could PATCH assignee_id straight through PostgREST. This RPC is not
--    justified by the column being unreachable. It is justified by the stamps,
--    the activity row and the notification — all three of which a raw PATCH
--    would skip, leaving an assignment that no timeline records and no assignee
--    ever hears about.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_assign_idea(
  p_idea_id     uuid,
  p_assignee_id uuid  -- NULL clears the assignment (back to the shared board)
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_prev   uuid;
  v_title  text;
  v_status public.improvement_idea_status;
  v_name   text;
  v_nid    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('improvement.board.manage'), false)) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can assign an improvement idea.';
  END IF;

  -- Validate the FK target explicitly so a bad id fails with a sentence a human
  -- can act on, not a raw constraint-violation code.
  IF p_assignee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assignee_id) THEN
    RAISE EXCEPTION 'That person is not a valid profile.';
  END IF;

  SELECT i.assignee_id, i.title, i.status
    INTO v_prev, v_title, v_status
  FROM public.improvement_ideas i
  WHERE i.id = p_idea_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Improvement idea not found.';
  END IF;

  -- Re-assigning to the same person is not an event. Returning early keeps a
  -- double-clicked button from writing a second timeline row and a second bell
  -- notification, and is why this RPC carries no idempotency_key: every insert
  -- below is already gated on the assignee genuinely changing.
  IF v_prev IS NOT DISTINCT FROM p_assignee_id THEN
    RETURN;
  END IF;

  UPDATE public.improvement_ideas
     SET assignee_id = p_assignee_id,
         assigned_by = CASE WHEN p_assignee_id IS NULL THEN NULL ELSE v_uid END,
         assigned_at = CASE WHEN p_assignee_id IS NULL THEN NULL ELSE now() END
   WHERE id = p_idea_id;

  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_assignee_id;

  -- The timeline row. improvement_idea_activity.note is nullable, but a NULL
  -- anywhere in a || chain makes the WHOLE string NULL, so every interpolated
  -- value below is either NOT NULL in the live schema (title) or COALESCEd.
  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
  VALUES (
    p_idea_id,
    v_uid,
    CASE WHEN p_assignee_id IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN p_assignee_id IS NULL
         THEN 'Assignment cleared — this idea is back on the shared board.'
         ELSE 'Assigned to ' || COALESCE(NULLIF(btrim(v_name), ''), 'a colleague')
              || ' — they are now the named person accountable for moving it.'
    END
  );

  -- Tell the new assignee. Skipped when a manager assigns an idea to themselves
  -- (they already know) and when the assignment is being lifted rather than made.
  IF p_assignee_id IS NOT NULL AND p_assignee_id <> v_uid THEN
    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority, created_by, metadata)
    VALUES (
      'An improvement idea is now yours to move',
      '"' || v_title || '" has been assigned to you. It is currently in '
        || replace(v_status::text, '_', ' ')
        || '. You are the named person accountable for its next move — moving it '
        || 'forward, or rejecting it with a reason, both count as an answer. '
        || 'Leaving it where it is does not.',
      'improvement:assignment',
      -- work_item, matching the board's other operational notice: kind is what
      -- keeps this out of the human-authored broadcast outbox, which filters on
      -- exactly this value (lib/services/notification/sent-service.ts).
      'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[p_assignee_id])),
      '/improvement-board',
      'normal',
      v_uid,
      jsonb_build_object(
        'source',      'improvement.assignment',
        'idea_id',     p_idea_id,
        'assigned_by', v_uid
      )
    )
    RETURNING id INTO v_nid;

    -- THE HALF THE UNTRIAGED SWEEP MISSES. Without this row the notification
    -- exists and no bell ever shows it. See the header for the production
    -- measurement: 10 notifications, 0 deliveries.
    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (v_nid, p_assignee_id)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_improvement_assign_idea(uuid, uuid) IS
  'THE only write path for improvement_ideas.assignee_id / assigned_by / assigned_at. A board manager names one accountable person for one idea; NULL clears it. Writes the timeline row and notifies the assignee in BOTH notifications and user_notifications, so the notice actually reaches a bell. Changes no idea status and does not auto-route by department — assignment is a deliberate manual act.';

-- ----------------------------------------------------------------------------
-- 3. ACLs. User-called RPC: the manager guard lives inside the function, so
--    authenticated may call it and anon may not. Supabase's default
--    ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
--    SEPARATELY from PUBLIC, so revoking PUBLIC alone is not enough
--    (CLAUDE.md, 2026-06-06).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_improvement_assign_idea(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_assign_idea(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Apply-time asserts. The module's house style (20260816050000:327-357):
--    fail loudly here rather than let the thing quietly not exist.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'improvement_ideas'
    AND column_name IN ('assignee_id', 'assigned_by', 'assigned_at');
  IF v_cols <> 3 THEN
    RAISE EXCEPTION 'improvement_ideas is missing one of assignee_id/assigned_by/assigned_at (found %)', v_cols;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'improvement_ideas'
       AND indexname = 'idx_improvement_ideas_assignee'
  ) THEN
    RAISE EXCEPTION 'idx_improvement_ideas_assignee was not created';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_assign_idea(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE fn_improvement_assign_idea — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_assign_idea(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE fn_improvement_assign_idea — no manager could ever assign';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_improvement_assign_idea' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'fn_improvement_assign_idea is not SECURITY DEFINER — it could not write the activity row';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
