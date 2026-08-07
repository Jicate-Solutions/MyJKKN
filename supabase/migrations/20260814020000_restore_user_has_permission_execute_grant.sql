-- Restore EXECUTE on user_has_permission(uuid, text) to `authenticated`.
--
-- Symptom: an Admission user at JKKN Main Office clicked "Move to Counselor" on
-- /admission/leads/<id> and got a "Forbidden" toast, while her role
-- (custom_roles.role_key = 'admission') genuinely carries
-- admission.leads.convert_to_admitted = true. Same for every other caller of
-- this overload — the button was dead for everyone, not just for her.
--
-- Cause: the two overloads have DIFFERENT grants, and only one of them was
-- maintained.
--
--   user_has_permission(permission_name text)     -- reads auth.uid()
--       acl {postgres, authenticated, service_role}   <- fine
--   user_has_permission(user_id uuid, key text)   -- takes the id explicitly
--       acl {postgres, service_role}                  <- authenticated LOST
--
-- 20251210_fix_security_and_performance_issues.sql:687 granted the (uuid, text)
-- form to authenticated. The director-handover work later gave that overload a
-- new body (it now falls through to fn_handover_grants_key). Renaming or
-- retyping an argument cannot be done with CREATE OR REPLACE, so the change
-- went out as DROP + CREATE — and DROP takes the ACL with it. The replacement
-- was applied straight to production with no file under supabase/migrations
-- (there is still none for `user_has_permission_reads_handovers`), so nothing
-- in review ever showed the grant going missing.
--
-- Mechanism of the user-visible failure: /api/admission/bridge/convert (and 15
-- sibling routes) call this overload through the COOKIE-scoped client, which
-- executes as `authenticated`. PostgREST answered 42501 "permission denied for
-- function user_has_permission". The routes destructure `{ data }` only, so the
-- error vanished and `undefined` read as "no permission" -> 403 Forbidden. The
-- companion commit teaches the convert route to tell a failed CHECK apart from
-- a genuine DENIAL, so a lost grant can never again be reported to a user as
-- "you are not allowed".
--
-- Safety: this restores previously-granted state, is read-only (the function
-- only SELECTs from profiles / user_roles / custom_roles / handover tables),
-- and is reversible with REVOKE. It does widen who may ask "does user X hold
-- permission Y" from service_role to any signed-in user; that was the
-- pre-existing posture and the answer is not sensitive on its own.

GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;

-- fn_handover_grants_key is the last-resort branch INSIDE the function above.
-- It is intentionally NOT granted: SECURITY DEFINER means the branch runs as
-- the owner regardless of who called the wrapper, so `authenticated` never
-- needs EXECUTE on it directly.

NOTIFY pgrst, 'reload schema';
