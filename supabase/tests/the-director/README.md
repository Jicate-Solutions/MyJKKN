# the Director list — how the migration was verified

`supabase/migrations/20270520090000_the_director_list.sql` adds
`fn_is_the_director()`, a guard trigger (who may change the list; the list can
never be empty; ids must be real profiles), an audit trigger, RESTRICTIVE read
policies on `platform_policies` and `hr_policy_audit_log`, a seed from the one
confirmed `auth.users` account, and an in-place patch of the generic policy
readers. CI has no database, so it is rehearsed on a throwaway local
PostgreSQL 16 cluster:

```bash
PGPORT_T=54421 bash supabase/tests/the-director/run.sh
# and against Draft #4111's fn_get_policy body (merges first):
FN_GET_POLICY_ALT=<file with #4111 section 3> PGPORT_T=54422 bash supabase/tests/the-director/run.sh
```

`run.sh` starts its own cluster in a new temp directory (never a real
database). It loads, **verbatim** by line range from the repo:
`is_super_admin()` / `is_admin()`, the `platform_policies` table and its
policies, main's newest `fn_get_policy`, the `_int/_text/_bool/_json` readers
(and the newest `_bool` with its observer), `hr_policy_audit_log` with its
policies, and `fn_internship_evaluate_policy`. Every object, and the migration
itself (applied twice, then again inside the run), is created by `supa_owner`:
a normal owner, **not a superuser and without BYPASSRLS**.

Every check is made as the role a PostgREST request would use
(`SET ROLE authenticated` / `anon` / `service_role` plus
`request.jwt.claims`), or as `supa_owner` with no claims for "the SQL console /
a migration". People: the Director, a developer super admin, the shared test
super admin, a principal, an HOD, the Joint MD, a signed-in user with no
profile, a signed-in user with no role, and someone who edited their own
`profiles.email` to director@jkkn.ac.in.

`stub-schema.sql` holds only what the repo does not: the platform roles and
the owner role, Supabase's own `auth.uid()` / `auth.role()`, a minimal
`auth.users`, Supabase's default grants (which are why the explicit
`REVOKE ... FROM anon` matters), and minimal `profiles`, `custom_roles`,
`user_roles` and internship-override tables.

Not loaded: the `platform_policies_update` policy from 20260727060000 (it
calls `user_has_permission()`, whose real body pulls in the whole role
system). Its non-exam branch is `is_super_admin() OR is_admin()`, which the
substrate policy already loaded here grants, so the rehearsal's write paths
are at least as open as production's.
