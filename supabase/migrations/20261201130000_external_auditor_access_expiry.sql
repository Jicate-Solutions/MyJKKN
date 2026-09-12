-- ============================================================================
-- An external auditor's access has never expired — the column it depends on
-- was never created
-- Created: 2026-09-12
--
-- THE DEFECT, IN THREE STACKED LAYERS
--   1. NO COLUMN. `public.user_institution_access` has no `expires_at`. The
--      only mention anywhere in supabase/migrations is a descriptive COMMENT
--      in 20260422_audit_workflow_seeds_and_triggers.sql line 92, which
--      advertises "time-boxed expiry via user_institution_access.expires_at"
--      for a column no migration ever added. The live table is: id, user_id,
--      institution_id, access_type, granted_by, granted_at, is_active,
--      created_at, updated_at.
--
--   2. THE FEATURE KNEW, AND SHIPPED ANYWAY.
--      lib/services/audit/audit-external-auditor-service.ts said so in its own
--      header: "This service reads/writes expires_at as if it exists — a
--      follow-up migration ALTER TABLE user_institution_access ADD COLUMN
--      expires_at TIMESTAMPTZ must land before this feature can be deployed."
--      It was deployed. The admin screen carries a live "+7 days" button.
--
--   3. THE WRITE WOULD NOT HAVE WORKED EITHER. The PATCH handler read and
--      updated user_institution_access through the CALLER'S RLS client. As
--      20261201120000 established from the live catalogue, that table has no
--      UPDATE/DELETE policy for `authenticated` and no SELECT policy for other
--      people's rows — so the read returned nothing (404), and had any policy
--      let it through, the update would have matched zero rows while the
--      handler incremented `updated += 1` unconditionally and reported success.
--      That is the same zero-row-success defect class 20261201120000 closed on
--      the DELETE handler one hour earlier.
--
-- THE CONSEQUENCE
--   An external auditor's cross-institution read access never expires, and no
--   screen says so. computeStatus(is_active, expires_at) derives
--   'active' | 'expired' | 'revoked'; with expires_at permanently absent, no
--   auditor can ever read 'expired'. The Status column was decorative.
--
-- THE FIX: EXPIRY MUST DELETE THE ROW, NOT SET A FLAG
--   This is the crux, and it is 20261201120000's conclusion applied to the
--   other verb. 38 RLS policies across 31 tables read this table WITHOUT
--   consulting is_active; the shape is always
--       institution_id IN (SELECT institution_id FROM user_institution_access
--                          WHERE user_id = auth.uid())
--   Those 38 policies will equally not consult expires_at. Making expiry mean
--   "a timestamp has passed" would therefore be a SECOND flag nobody reads —
--   the identical bug with a new column name. Enforcement is a DELETE, so
--   there is nothing left for a policy to miss, and NO policy has to change.
--
--   `expires_at` is consequently a SCHEDULE, not a predicate. Nothing reads it
--   to decide access; one maintenance function reads it to decide deletion.
--
-- THE AUDIT TRAIL IS FREE
--   trg_log_institution_access_change already fires AFTER INSERT OR UPDATE OR
--   DELETE on this table, and log_institution_access_change() has a full
--   TG_OP='DELETE' branch writing 'institution_access_revoked' to
--   role_audit_log with the old access_type and institution name. Every
--   expiry therefore lands in role_audit_log without another line of code.
--   user_institution_access also has ZERO inbound foreign keys (established in
--   20261201120000 from pg_constraint), so a delete dangles nothing.
--
-- THE FIRST SWEEP DELETES EXACTLY NOTHING, BY CONSTRUCTION
--   The column is created here and every pre-existing row therefore holds
--   NULL. fn_expire_institution_access() requires `expires_at IS NOT NULL`, so
--   its first run — and every run until something sets an expiry — removes 0
--   rows. No existing grant is at risk from applying this file.
--
-- HOW A NEW AUDITOR GETS AN INITIAL EXPIRY — and why no overload
--   app/api/audit/external-auditors/route.ts POST ALREADY writes expires_at in
--   its insert (with a fallback that strips the column when it is missing —
--   which is the branch production has always taken). Once this column exists,
--   that insert simply starts working and the initial expiry is set at grant
--   time. So neither an overload of grant_user_institution_access() nor a
--   post-grant call to fn_extend_institution_access() is needed.
--   Adding an overload would have been the worse choice regardless:
--   20251009_fix_grant_institution_access_overload.sql exists precisely because
--   an ambiguous overload of that function has already bitten this table once.
--
-- is_active IS NOT TOUCHED HERE. 20261201120000 deleted the one row that sat
--   at false and established that the flag should never be false again. The
--   extend function therefore does NOT set is_active = true the way the old
--   route handler did: that would be re-teaching the codebase the soft-delete
--   semantics the previous migration removed.
-- ============================================================================

-- ── 1. The missing column ───────────────────────────────────────────────────
ALTER TABLE public.user_institution_access
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_institution_access.expires_at IS
  'When this cross-institution grant is scheduled to be DELETED. NULL means no expiry — the grant stands until someone revokes it. This column is a SCHEDULE, not a predicate: no RLS policy reads it, and none should. 38 policies across 31 tables read this table without consulting is_active and would equally not consult expires_at, so expiry is enforced by fn_expire_institution_access() deleting the row (the same reasoning that made revoke a DELETE in 20261201120000). Every such delete is logged to role_audit_log by trg_log_institution_access_change.';

-- Supports the sweep's only predicate. Partial, so it indexes just the rows
-- that carry a schedule rather than every grant in the table.
CREATE INDEX IF NOT EXISTS idx_user_institution_access_expires_at
  ON public.user_institution_access (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── 2. Enforcement: delete what has expired ─────────────────────────────────
-- service_role ONLY. This is a maintenance sweep that can delete many rows
-- across many people; `authenticated` must never hold a mass-delete, however
-- well permissioned the caller is. Callers: the cron route
-- app/api/cron/external-auditor-access-expiry (service-role client), or a
-- pg_cron schedule if one is preferred once the extension state is known.
--
-- IDEMPOTENT BY CONSTRUCTION: it only looks at rows whose schedule has already
-- passed and removes them, so a second run in the same minute deletes nothing
-- and answers 0. Missing a run delays an expiry; it never loses one.
CREATE OR REPLACE FUNCTION public.fn_expire_institution_access()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
    -- NULL expires_at is "no expiry" and must survive the sweep untouched.
    DELETE FROM user_institution_access
     WHERE expires_at IS NOT NULL
       AND expires_at <= now();

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$function$;

COMMENT ON FUNCTION public.fn_expire_institution_access() IS
  'Deletes every cross-institution grant whose expires_at has passed and returns how many were removed. Rows with a NULL expires_at never expire. Deletes rather than flagging because 31 tables'' RLS policies do not read is_active and would not read expires_at either; each delete is recorded in role_audit_log by trg_log_institution_access_change. service_role only — this is a mass-delete maintenance sweep.';

-- ── 3. Extend one person's access ───────────────────────────────────────────
-- Mirrors revoke_all_user_institution_access(uuid) from 20261201120000: same
-- shape, same gate style, returns a count so the caller can report a TRUTHFUL
-- number instead of inventing one.
--
-- The 1..90 day clamp is repeated here even though the route also clamps.
-- The route is not the only possible caller of a function granted to
-- `authenticated`, and a guard that lives only in the caller is not a guard.
-- NO DEFAULT on extend_days, deliberately. A default would make
-- fn_extend_institution_access(uuid) a second callable form of the same
-- function, which is the ambiguity class that produced
-- 20251009_fix_grant_institution_access_overload.sql on this very table. Both
-- arguments are always passed; a NULL is coalesced below.
CREATE OR REPLACE FUNCTION public.fn_extend_institution_access(
  target_user_id uuid,
  extend_days integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer;
  v_days    integer;
BEGIN
    -- SECURITY DEFINER bypasses RLS, so this gate is the only boundary.
    IF NOT (
      is_super_admin()
      OR is_admin()
      OR user_has_permission('audit.external_auditor.manage')
    ) THEN
        RAISE EXCEPTION 'fn_extend_institution_access: audit.external_auditor.manage required'
            USING ERRCODE = '42501';
    END IF;

    IF target_user_id IS NULL THEN
        RETURN 0;
    END IF;

    -- SCOPE GUARD: this function may only touch an EXTERNAL AUDITOR.
    --
    -- Without it, "extend" is a scheduled revoke for everybody else. A grant
    -- with a NULL expires_at is permanent; the UPDATE below would give it its
    -- first schedule, and fn_expire_institution_access() would then DELETE it.
    -- Pointed at, say, the CEO/COO/Registrar rows (14 institutions each), a
    -- single call would silently queue their whole cross-institution access
    -- for deletion N days later. Those rows are load-bearing: the 31 tables
    -- whose policies read this table directly do NOT consult role scope, so
    -- the row IS the access there, and losing it shows up as empty screens
    -- rather than an error.
    --
    -- The gate above is a PERMISSION check, not a TARGET check —
    -- audit.external_auditor.manage says you may manage auditors, not that
    -- every uuid you pass is one. The RPC is granted to `authenticated` and
    -- takes an arbitrary uuid, so the admin screen never offering the action
    -- is not a control.
    --
    -- Both role paths are checked, because MyJKKN resolves a role two ways
    -- (user_roles, and the legacy profiles.role fallback) exactly as
    -- role_has_institution_access() does. Checking only one path would refuse
    -- a legitimate auditor.
    IF NOT (
      EXISTS (
        SELECT 1
          FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
         WHERE ur.user_id = target_user_id
           AND cr.role_key = 'external_auditor_timeboxed'
      )
      OR EXISTS (
        SELECT 1 FROM profiles pr
         WHERE pr.id = target_user_id
           AND pr.role = 'external_auditor_timeboxed'
      )
    ) THEN
        RAISE EXCEPTION 'fn_extend_institution_access: % is not an external auditor; expiry may only be scheduled on external-auditor grants', target_user_id
            USING ERRCODE = '42501';
    END IF;

    v_days := LEAST(90, GREATEST(1, COALESCE(extend_days, 7)));

    -- GREATEST(..., now()) is what makes this an extension rather than a
    -- resurrection: an already-lapsed schedule extends from NOW, not from the
    -- stale timestamp, so "+7 days" always means seven days of access from
    -- this moment. COALESCE(expires_at, now()) gives a grant that carries no
    -- schedule one, which is the point of a time-boxed auditor.
    --
    -- is_active is deliberately not written — see the header.
    UPDATE user_institution_access
       SET expires_at = GREATEST(COALESCE(expires_at, now()), now())
                        + make_interval(days => v_days),
           updated_at = now()
     WHERE user_id = target_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;   -- so the caller can report a truthful count
END;
$function$;

COMMENT ON FUNCTION public.fn_extend_institution_access(uuid, integer) IS
  'Pushes the expiry of every cross-institution grant held by one EXTERNAL AUDITOR forward by N days (clamped 1..90) and returns how many rows were changed. Raises 42501 if the target is not an external auditor: a NULL expires_at means permanent, so scheduling one on a non-auditor would queue their access for deletion by fn_expire_institution_access(). Extends from now() when the existing schedule has already lapsed, and gives a NULL-expiry grant its first schedule. Used by the external-auditor admin screen. Routed through SECURITY DEFINER because user_institution_access has no UPDATE policy for `authenticated`, so the previous direct write matched zero rows and reported success anyway.';

-- Supabase's ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
-- TO anon gives `anon` its own EXECUTE grant on every new function, separate
-- from PUBLIC. Revoking PUBLIC alone therefore leaves both of these callable
-- with the anon key that ships in every browser bundle. Both revokes below are
-- load-bearing, not ceremony (CLAUDE.md non-negotiable; PR #1225).
REVOKE EXECUTE ON FUNCTION public.fn_expire_institution_access() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_expire_institution_access() TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_extend_institution_access(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_extend_institution_access(uuid, integer) TO authenticated, service_role;
