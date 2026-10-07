-- Grant the HR Self Service keys to the three library roles that were missing some.
-- 2026-09-29 (applied via MCP as `grant_self_service_keys_library_roles`)
--
-- WHY. Found while chasing JAYAMMAL R (NOTAHS006, librarian) seeing every day as
-- AEYP on My Attendance. The 13 keys behind the sidebar's "Self Service" row were
-- checked against all 106 custom_roles; only these three roles WITH ACTIVE STAFF
-- lacked any of them:
--
--     librarian            5 staff  missing hr.leave.balance.view, hr.leave.encashment.view
--     assistant_librarian  3 staff  missing 9 of 12 (had leave apply/balance + view_self)
--     library_admin        1 staff  missing all 12 (no My Attendance, no Self Service)
--
-- SCOPE. The 12 own-record keys used by the Self Service row, and nothing else.
-- Every one exposes only the CALLER'S OWN records (RLS self-scopes on
-- fn_my_staff_ids() / profile), the same grant 20260801002700 gave the other roles.
--
-- DELIBERATELY NOT GRANTED:
--     hr.attendance.regularize_self  regularization became admin-only 2026-09-06
--     hr.leave.view / approve / *.approve   org-wide read + approver keys
--
-- GUARD. Additive `||` on jsonb, tested by role_key; leaves every other key alone.
-- Re-runnable.

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'hr.attendance.view_self',          true,
         'hr.leave.apply',                   true,
         'hr.leave.balance.view',            true,
         'hr.leave.encashment.view',         true,
         'hr.performance_reviews.view_own',  true,
         'hr.training.view_own',             true,
         'hr.fdp.view_own',                  true,
         'hr.promotion.apply_own',           true,
         'hr.documents.view_own',            true,
         'hr.assets.view_own',               true,
         'hr.memos.view_own',                true,
         'hr.forms.submit_own',              true
       )
 WHERE role_key IN ('librarian', 'assistant_librarian', 'library_admin');
