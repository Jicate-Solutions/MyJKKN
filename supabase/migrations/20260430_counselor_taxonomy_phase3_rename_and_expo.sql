-- =====================================================================
-- Counselor Taxonomy Phase 3 — rename `counselor` -> `admission_counselor`
--                              + seed `expo_counselor` (perm clone)
-- Spec:  specs/counselor-taxonomy-spec.md (Phase 3)
-- Phase 1 (already merged 2026-04-27) seeded learner_counselor + staff_counselor.
-- This migration completes the 4-persona taxonomy by:
--   (1) renaming the existing `counselor` row in custom_roles
--   (2) syncing the legacy profiles.role column
--   (3) inserting `expo_counselor` whose permissions are an EXACT clone
--       of admission_counselor (per Boobalan, 2026-04-30 — same access)
--   (4) updating 5 SECURITY DEFINER functions and 1 RLS policy that hard-coded
--       the literal role_key 'counselor'
--
-- Idempotency:
--   - Step 1's UPDATE is a no-op once role_key='admission_counselor' exists
--   - Step 2's UPDATE is a no-op once profiles.role has been migrated
--   - Step 3 uses ON CONFLICT (role_key) DO NOTHING
--   - Steps 4-9 are CREATE OR REPLACE / DROP+CREATE on policies
-- Safe to re-run.
--
-- BLAST RADIUS:
--   - 44 user_roles rows on the renamed row (id is preserved — no orphans)
--   - 36 profiles.role rows updated from 'counselor' to 'admission_counselor'
--   - expo_counselor starts with 0 users; admins assign it via Role Management
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rename the existing counselor row.
--    The id column is unchanged, so all 44 user_roles assignments remain intact.
-- ---------------------------------------------------------------------
UPDATE custom_roles
   SET role_key   = 'admission_counselor',
       role_name  = 'Admission Counsellor',
       description = COALESCE(
         description,
         'Admission counsellor responsible for lead follow-up, communication, and conversion tracking within the Admission CRM module.'
       ),
       updated_at = NOW()
 WHERE role_key = 'counselor';

-- ---------------------------------------------------------------------
-- 2. Sync the legacy profiles.role column.
--    A trigger keeps it in lockstep with user_roles.is_primary, but since
--    we changed role_key (not role_id), the trigger does not fire. We
--    update the legacy text column explicitly in the same transaction so
--    no row is left pointing at a non-existent role_key.
-- ---------------------------------------------------------------------
UPDATE profiles
   SET role       = 'admission_counselor',
       updated_at = NOW()
 WHERE role = 'counselor';

-- ---------------------------------------------------------------------
-- 3. Seed `expo_counselor` — clones admission_counselor exactly.
--    Same scope=`all`, same permissions JSONB, same module_scopes.
--    Distinct only by role_key/role_name/description so admins can
--    assign field/expo staff without inheriting admission_counselor's
--    broader CRM identity.
-- ---------------------------------------------------------------------
INSERT INTO custom_roles (
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  is_active,
  permissions,
  module_scopes
)
SELECT
  'expo_counselor',
  'Expo Counsellor',
  'Counsellor working education expos and field events. Captures and follows up prospect leads from booth/field channels. Permissions mirror Admission Counsellor (same access surface). Scope: cross-institution.',
  true,
  cr.institution_scope,
  true,
  cr.permissions,
  cr.module_scopes
  FROM custom_roles cr
 WHERE cr.role_key = 'admission_counselor'
ON CONFLICT (role_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Function: assign_counselor_role(p_user_id, p_is_primary)
--    Looks up role_key='counselor' to grant the role. Update the lookup
--    to the new key. Function name is preserved so callers don't break.
--    (Caller: app/(routes)/admission/counselors/_components/add-counselor-dialog.tsx)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_counselor_role(
  p_user_id   uuid,
  p_is_primary boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role_id uuid;
    v_caller  uuid := auth.uid();
BEGIN
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.counselors.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to assign admission_counselor role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admission_counselors
        WHERE user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'No admission_counselors row exists for user_id %', p_user_id
            USING ERRCODE = '23503';
    END IF;

    SELECT id INTO v_role_id
      FROM custom_roles
     WHERE role_key = 'admission_counselor';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key admission_counselor'
            USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id AND role_id = v_role_id
    ) THEN
        RETURN;
    END IF;

    -- Demote any existing primary row first to satisfy the partial unique
    -- index idx_user_roles_primary_unique (user_id WHERE is_primary=true).
    IF COALESCE(p_is_primary, true) = true THEN
        UPDATE user_roles
           SET is_primary = false
         WHERE user_id = p_user_id
           AND is_primary = true;
    END IF;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_user_id, v_role_id, COALESCE(p_is_primary, true), v_caller);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_counselor_role(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Function: fn_check_role_demotion_impact(target_user_id, new_role)
--    Warns when an admin demotes a user away from a counselor role that
--    has open admission CRM workload (call logs, leads, callbacks).
--    Update to recognise BOTH new role_keys (admission_counselor + expo_counselor),
--    so demoting either still surfaces the impact warning.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_role_demotion_impact(
  target_user_id uuid,
  new_role       text
)
RETURNS TABLE(
  target_user_id_out      uuid,
  target_email            text,
  target_current_role     text,
  new_role_key            text,
  is_counselor_demotion   boolean,
  impact_call_logs        integer,
  impact_leads            integer,
  impact_pending_callbacks integer,
  has_impact              boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_target_email   text;
    v_current_role   text;
    v_is_demotion    boolean;
    v_call_logs      integer := 0;
    v_leads          integer := 0;
    v_callbacks      integer := 0;
    v_counselor_keys text[]  := ARRAY['admission_counselor', 'expo_counselor'];
BEGIN
    IF NOT (
        is_super_admin()
        OR is_admin()
        OR user_has_permission('users.permissions_audit.view')
        OR user_has_permission('admission.counselors.view')
        OR user_has_permission('admission.counselors.edit')
    ) THEN
        RAISE EXCEPTION 'permission denied: fn_check_role_demotion_impact'
            USING ERRCODE = '42501';
    END IF;

    SELECT p.email, p.role INTO v_target_email, v_current_role
      FROM profiles p
     WHERE p.id = target_user_id;

    -- Demotion = current role is a counselor key, new role is NOT a counselor key
    v_is_demotion := (v_current_role = ANY(v_counselor_keys))
                     AND NOT (COALESCE(new_role, '') = ANY(v_counselor_keys));

    SELECT COUNT(*) INTO v_call_logs
      FROM admission_call_logs
     WHERE counselor_id = target_user_id;

    SELECT COUNT(*) INTO v_leads
      FROM admission_leads
     WHERE assigned_counselor_id = target_user_id;

    SELECT COUNT(*) INTO v_callbacks
      FROM admission_callback_queue
     WHERE assigned_counselor_id = target_user_id
       AND status NOT IN ('resolved', 'closed');

    RETURN QUERY SELECT
        target_user_id,
        v_target_email,
        v_current_role,
        new_role,
        v_is_demotion,
        v_call_logs,
        v_leads,
        v_callbacks,
        (v_call_logs + v_leads + v_callbacks) > 0;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. Function: fn_rescue_broadcast_initiate(...)
--    Broadcasts a hot-lead rescue notification to admission staff. The
--    target_counselors CTE filters profiles by p.role IN (admission staff
--    keys) — extend the IN-list to include both new counselor keys.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rescue_broadcast_initiate(
  p_lead_id      uuid,
  p_scope        jsonb DEFAULT '{}'::jsonb,
  p_message      text  DEFAULT NULL::text,
  p_is_emergency boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := auth.uid();
  v_lead          admission_leads;
  v_broadcast_id  uuid;
  v_fanout_count  int := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_lead FROM admission_leads WHERE id = p_lead_id;
  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'lead_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM rescue_broadcasts
     WHERE lead_id = p_lead_id
       AND claimed_at IS NULL
       AND auto_returned_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'active_broadcast_exists');
  END IF;

  INSERT INTO rescue_broadcasts (lead_id, initiated_by, scope, message, is_emergency, institution_id)
  VALUES (p_lead_id, v_user, COALESCE(p_scope, '{}'::jsonb), p_message, p_is_emergency, v_lead.institution_id)
  RETURNING id INTO v_broadcast_id;

  UPDATE admission_leads
     SET rescue_broadcast_id = v_broadcast_id
   WHERE id = p_lead_id;

  WITH target_counselors AS (
    SELECT unnest(ARRAY(SELECT jsonb_array_elements_text(p_scope -> 'staff_ids')))::uuid AS user_id
     WHERE p_scope ? 'staff_ids'
    UNION
    SELECT p.id
      FROM profiles p
     WHERE p.is_active = TRUE
       AND (
         (p_scope ? 'institution_ids' AND p.institution_id::text IN (SELECT jsonb_array_elements_text(p_scope -> 'institution_ids')))
         OR (NOT (p_scope ? 'staff_ids') AND NOT (p_scope ? 'institution_ids') AND p.institution_id = v_lead.institution_id)
       )
       AND p.role IN ('admission', 'admission_staff', 'admission_counselor', 'expo_counselor')
  ),
  broadcast_notif AS (
    INSERT INTO notifications (
      title, body, category, kind, priority, requires_acknowledgment,
      acknowledgment_deadline_hours, action_type, action_config, targeting,
      created_by, metadata
    )
    VALUES (
      '🔥 Rescue broadcast — ' || COALESCE(v_lead.first_name || ' ' || COALESCE(v_lead.last_name, ''), 'hot lead'),
      COALESCE(p_message, 'Cold lead rescue broadcast. First counselor to claim wins. Score ' ||
        COALESCE(v_lead.score::text, '—') || ' · conversion ' ||
        ROUND(COALESCE(v_lead.conversion_probability, 0.5) * 100)::text || '%'),
      'dashboard:rescue',
      'work_item',
      CASE WHEN p_is_emergency THEN 'urgent' ELSE 'high' END,
      TRUE, 2, 'rescue.claim',
      jsonb_build_object('broadcast_id', v_broadcast_id, 'lead_id', p_lead_id,
        'score', v_lead.score, 'is_emergency', p_is_emergency),
      jsonb_build_object('broadcast_id', v_broadcast_id),
      v_user,
      jsonb_build_object('broadcast_initiated_by', v_user, 'broadcast_initiated_at', NOW())
    ) RETURNING id
  ),
  fanout AS (
    INSERT INTO user_notifications (notification_id, user_id, created_at)
    SELECT bn.id, tc.user_id, NOW()
      FROM broadcast_notif bn, target_counselors tc
     WHERE tc.user_id IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_fanout_count FROM fanout;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'broadcast_id', v_broadcast_id,
    'lead_id', p_lead_id,
    'fanout_count', v_fanout_count,
    'is_emergency', p_is_emergency
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 7. Function: get_counselor_profiles_for_institution(p_institution_id)
--    Used by counselor pickers; matches profiles by either profiles.role
--    or by user_roles -> custom_roles.role_key. Update both predicates to
--    accept the new keys.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_counselor_profiles_for_institution(
  p_institution_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  profile_id    uuid,
  full_name     text,
  email         text,
  phone_number  text,
  designation   text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    p.id          AS profile_id,
    p.full_name,
    p.email,
    p.phone_number,
    p.designation
    FROM profiles p
   WHERE
    (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    AND p.is_active = true
    AND (
      p.role IN ('admission_counselor', 'expo_counselor')
      OR p.id IN (
        SELECT ur.user_id
          FROM user_roles ur
          JOIN custom_roles cr ON ur.role_id = cr.id
         WHERE cr.role_key IN ('admission_counselor', 'expo_counselor')
      )
      -- Include any user explicitly added to admission_counselors (any role)
      OR p.id IN (
        SELECT ac.user_id
          FROM admission_counselors ac
         WHERE ac.is_active = true
           AND ac.user_id IS NOT NULL
           AND (p_institution_id IS NULL OR ac.institution_id = p_institution_id)
      )
    )
   ORDER BY p.full_name;
$function$;

-- ---------------------------------------------------------------------
-- 8. Trigger function: sync_primary_role_to_profile()
--    Fires on user_roles INSERT/UPDATE. Detects "demotion away from a
--    counselor role" and writes a warning to role_audit_log when the
--    affected user has open admission CRM workload. Update the literal
--    'counselor' check to recognise BOTH new keys.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_primary_role_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    primary_role_key  text;
    old_role_key      text;
    actor_uid         uuid;
    actor_name        text;
    actor_email       text;
    actor_role        text;
    target_email      text;
    impact_call_logs  integer := 0;
    impact_leads      integer := 0;
    impact_callbacks  integer := 0;
    counselor_keys    text[]  := ARRAY['admission_counselor', 'expo_counselor'];
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.is_primary = true THEN
            SELECT cr.role_key INTO primary_role_key
              FROM custom_roles cr
             WHERE cr.id = NEW.role_id;

            IF TG_OP = 'UPDATE' THEN
                SELECT cr.role_key INTO old_role_key
                  FROM user_roles ur
                  JOIN custom_roles cr ON cr.id = ur.role_id
                 WHERE ur.user_id = NEW.user_id
                   AND ur.is_primary = true
                   AND ur.id != NEW.id
                 LIMIT 1;
            ELSIF TG_OP = 'INSERT' THEN
                SELECT role INTO old_role_key
                  FROM profiles
                 WHERE id = NEW.user_id;
            END IF;

            -- Counselor demotion: was an admission/expo counselor, now isn't.
            IF old_role_key = ANY(counselor_keys)
               AND NOT (COALESCE(primary_role_key, '') = ANY(counselor_keys))
            THEN
                SELECT COUNT(*) INTO impact_call_logs
                  FROM admission_call_logs
                 WHERE counselor_id = NEW.user_id;

                SELECT COUNT(*) INTO impact_leads
                  FROM admission_leads
                 WHERE assigned_counselor_id = NEW.user_id;

                SELECT COUNT(*) INTO impact_callbacks
                  FROM admission_callback_queue
                 WHERE assigned_counselor_id = NEW.user_id
                   AND status NOT IN ('resolved', 'closed');

                IF (impact_call_logs + impact_leads + impact_callbacks) > 0 THEN
                    actor_uid := auth.uid();

                    IF actor_uid IS NOT NULL THEN
                        SELECT
                            COALESCE(p.full_name, p.email, 'Unknown user'),
                            p.email,
                            p.role
                          INTO actor_name, actor_email, actor_role
                          FROM profiles p
                         WHERE p.id = actor_uid;
                    ELSE
                        actor_name := 'System';
                    END IF;

                    SELECT email INTO target_email
                      FROM profiles
                     WHERE id = NEW.user_id;

                    INSERT INTO role_audit_log (
                        action_type,
                        actor_user_id,
                        actor_name,
                        actor_email,
                        actor_role,
                        target_user_id,
                        target_email,
                        target_role_id,
                        old_value,
                        new_value,
                        description,
                        metadata,
                        affected_user_count
                    ) VALUES (
                        'counselor_demotion_warned',
                        actor_uid,
                        actor_name,
                        actor_email,
                        actor_role,
                        NEW.user_id,
                        target_email,
                        NEW.role_id,
                        jsonb_build_object('role_key', old_role_key),
                        jsonb_build_object('role_key', primary_role_key),
                        format(
                            'WARN: counselor demotion (%s -> %s) for user with %s call logs / %s leads / %s pending callbacks',
                            old_role_key,
                            COALESCE(primary_role_key, 'NULL'),
                            impact_call_logs,
                            impact_leads,
                            impact_callbacks
                        ),
                        jsonb_build_object(
                            'impact_call_logs', impact_call_logs,
                            'impact_leads', impact_leads,
                            'impact_callbacks', impact_callbacks,
                            'trigger_op', TG_OP,
                            'user_role_id', NEW.id,
                            'source', 'sync_primary_role_to_profile'
                        ),
                        1
                    );
                END IF;
            END IF;

            UPDATE profiles
               SET role = primary_role_key,
                   updated_at = NOW()
             WHERE id = NEW.user_id;

            UPDATE user_roles
               SET is_primary = false
             WHERE user_id = NEW.user_id
               AND id != NEW.id
               AND is_primary = true;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 9. RLS policy: student_engagement_scores.student_engagement_select_admin
--    Hard-coded ARRAY[..., 'counselor', ...] in p.role check.
--    Replace with ARRAY[..., 'admission_counselor', 'expo_counselor', ...].
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS student_engagement_select_admin ON public.student_engagement_scores;

CREATE POLICY student_engagement_select_admin
  ON public.student_engagement_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM profiles p
       WHERE p.id = auth.uid()
         AND (
              p.is_super_admin = true
           OR (
                p.role = ANY (ARRAY[
                  'principal'::text,
                  'hod'::text,
                  'faculty'::text,
                  'admin'::text,
                  'admission_counselor'::text,
                  'expo_counselor'::text,
                  'accounts'::text
                ])
                AND p.institution_id = student_engagement_scores.institution_id
              )
         )
    )
  );

-- ---------------------------------------------------------------------
-- Verification queries (run manually post-deploy):
--   SELECT role_key, role_name, jsonb_object_keys(permissions) FROM custom_roles
--    WHERE role_key IN ('admission_counselor','expo_counselor')
--    ORDER BY role_key;
--
--   SELECT COUNT(*) FROM custom_roles WHERE role_key = 'counselor';   -- expect 0
--   SELECT COUNT(*) FROM profiles    WHERE role     = 'counselor';   -- expect 0
--
--   SELECT COUNT(*) AS expo_users
--     FROM user_roles ur
--     JOIN custom_roles cr ON cr.id = ur.role_id
--    WHERE cr.role_key = 'expo_counselor';                           -- expect 0 initially
-- ---------------------------------------------------------------------

COMMIT;
