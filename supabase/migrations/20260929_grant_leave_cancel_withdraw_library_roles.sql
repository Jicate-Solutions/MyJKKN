-- Leave cancel/withdraw for the two library roles that lacked them.
-- 2026-09-29 (applied via MCP as `grant_leave_cancel_withdraw_library_roles`)
--
-- Follow-up to 20260929_grant_self_service_keys_library_roles.sql. `librarian`
-- already holds both; without them assistant_librarian / library_admin can apply
-- for leave but never cancel (pre-approval) or withdraw (post-approval) it.
-- Own-application actions only; RLS self-scopes on fn_my_staff_ids().

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'hr.leave.cancel',   true,
         'hr.leave.withdraw', true
       )
 WHERE role_key IN ('assistant_librarian', 'library_admin');
