-- Campus Living — withdraw the hostel vacate-request feature from the learner
-- surface (2026-08-10). The workflow will be rebuilt later; until then no
-- learner or parent may open, submit, or see a vacate request.
--
-- ── WHY BOTH HALVES ARE NEEDED ──────────────────────────────────────────────
--
-- 1. THE PERMISSION KEY GATED NOTHING.
--    RLS policy hvr_insert_permission on hostel_vacate_requests requires
--    `campus_living.vacate_requests.submit` — but 67 of 89 roles held it,
--    including student, parent, driver, mess_caterer, gate_security and
--    housekeeping_staff. A key that nearly every role holds is not a gate.
--    This revokes the three learner-facing keys from `student` and `parent`
--    ONLY. warden / chief_warden / hostel_office keep theirs, so the staff
--    console at /campus-living/vacate-requests keeps working unchanged.
--
-- 2. THE ROUTE HAD NO PAGE GUARD.
--    /campus-living/my-hostel/vacate-request is declared in MENU_PERMISSIONS
--    (lib/sidebarMenuLink.ts) but had no layout.tsx, so revoking the key alone
--    would only hide the nav link — a typed URL still rendered the form. The
--    companion commit adds that layout wrapping RoutePermissionGuard.
--
--    Those two facts are load-bearing together: for this path isPageAccessible()
--    falls through to `!!permissions['campus_living.vacate_requests.submit']`
--    (the student-portal carve-out matches only /learners/my-*, and neither
--    student nor parent is in ADMIN_BYPASS_ROLES). So the guard denies *because*
--    of the revoke below. Restoring the key re-opens the page — they are one
--    change in two layers, per the "nav visibility must mirror the route guard"
--    rule.
--
-- ── WHAT IS DELETED ─────────────────────────────────────────────────────────
--    hostel_vacate_requests holds exactly ONE row: a `draft` created 2026-08-05
--    (reason `graduation`) that was never submitted, plus its single document.
--    Removed so the module starts from empty when it is rebuilt.
--    hostel_vacate_documents.vacate_request_id is ON DELETE CASCADE, so the
--    document row goes with it; it is snapshotted first regardless.
--
-- ── WHAT IS DELIBERATELY *NOT* TOUCHED ──────────────────────────────────────
--    hostel_allocations. The 167 rows with status='vacated' are NOT vacate
--    requests and were never produced by this workflow:
--      * all 167 of those learners hold a CURRENT active allocation,
--      * on a DIFFERENT bed (same-bed matches: 0),
--      * with an allocation_date same-or-newer than the vacated row,
--      * and all 167 have vacate_reason IS NULL — the vacate workflow always
--        stamps a reason, so none came through it.
--    They are the superseded previous-bed rows left behind by room changes and
--    transfers (see my-hostel/_components/room-change-card.tsx: "your current
--    room is vacated, the new room is assigned to you"). Flipping them back to
--    'active' would give 167 learners two active allocations each and destroy
--    the room-change audit trail. The Allocations UI is relabelled instead.

BEGIN;

-- ── Rollback snapshots ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.bak_hostel_vacate_requests_20260810;
DROP TABLE IF EXISTS public.bak_hostel_vacate_documents_20260810;
DROP TABLE IF EXISTS public.bak_vacate_role_grants_20260810;

CREATE TABLE public.bak_hostel_vacate_requests_20260810 AS
SELECT *, now() AS captured_at FROM public.hostel_vacate_requests;

CREATE TABLE public.bak_hostel_vacate_documents_20260810 AS
SELECT *, now() AS captured_at FROM public.hostel_vacate_documents;

-- Snapshot the FULL permissions JSONB of the two roles, so the revoke is
-- reversible key-by-key without guessing what else they held.
CREATE TABLE public.bak_vacate_role_grants_20260810 AS
SELECT id, role_key, permissions, now() AS captured_at
  FROM public.custom_roles
 WHERE role_key IN ('student', 'parent');

DO $$
DECLARE
  v_roles int;
  v_n     int;
BEGIN
  SELECT count(*) INTO v_roles FROM public.bak_vacate_role_grants_20260810;
  IF v_roles <> 2 THEN
    RAISE EXCEPTION 'Expected role_keys student + parent (2 rows), found %. Aborting.', v_roles;
  END IF;

  -- ── Stage 1: revoke the three learner-facing vacate keys ──────────────────
  -- `-` on jsonb with a text[] drops each key if present and is a no-op if not,
  -- so this is idempotent. submit  = create a request (the RLS INSERT gate),
  -- view_own = see your own request, submit_on_behalf = raise one for someone
  -- else. The approval keys (approve_warden / approve_chief / finalize / …) are
  -- untouched — no learner role holds them in a way that matters here, and the
  -- staff console depends on them.
  UPDATE public.custom_roles
     SET permissions = permissions - ARRAY[
           'campus_living.vacate_requests.submit',
           'campus_living.vacate_requests.view_own',
           'campus_living.vacate_requests.submit_on_behalf'
         ],
         updated_at  = now()
   WHERE role_key IN ('student', 'parent');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Stage 1 updated % roles, expected 2. Aborting.', v_n;
  END IF;

  -- Assert the keys are actually gone — a silent no-op here would leave the
  -- route guard open while the UI pretends the feature is withdrawn.
  SELECT count(*) INTO v_n
    FROM public.custom_roles
   WHERE role_key IN ('student', 'parent')
     AND permissions ?| ARRAY[
           'campus_living.vacate_requests.submit',
           'campus_living.vacate_requests.view_own',
           'campus_living.vacate_requests.submit_on_behalf'
         ];
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Stage 1 left % learner roles still holding a vacate key. Aborting.', v_n;
  END IF;

  -- ── Stage 2: clear the request backlog ────────────────────────────────────
  -- Documents cascade; deleted explicitly first so the count is asserted rather
  -- than assumed.
  DELETE FROM public.hostel_vacate_documents;
  DELETE FROM public.hostel_vacate_requests;

  SELECT count(*) INTO v_n FROM public.hostel_vacate_requests;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Stage 2 left % vacate requests. Aborting.', v_n;
  END IF;

  -- ── Guard: the allocation history must be untouched ───────────────────────
  SELECT count(*) INTO v_n FROM public.hostel_allocations WHERE status = 'vacated';
  IF v_n <> 167 THEN
    RAISE EXCEPTION 'hostel_allocations vacated count changed to % (expected 167). Aborting.', v_n;
  END IF;

  RAISE NOTICE 'OK: vacate keys revoked from student + parent, request backlog cleared, 167 allocation history rows intact.';
END $$;

COMMIT;

-- Rollback (manual, if ever needed):
--   UPDATE custom_roles c SET permissions = b.permissions
--     FROM bak_vacate_role_grants_20260810 b WHERE c.id = b.id;
--   -- Row restore: the snapshots carry one extra trailing column (captured_at),
--   -- so name the real columns explicitly rather than SELECT *. Only 1 request
--   -- and 1 document exist, so this is a two-statement copy, requests first
--   -- (documents FK back to it).
--   …then delete app/(routes)/campus-living/my-hostel/vacate-request/layout.tsx
--   and restore the Request Vacate CTA in my-hostel/_components/requests-tab.tsx.
