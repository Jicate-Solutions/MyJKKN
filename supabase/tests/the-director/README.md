# the Director list — how the migration was verified

`supabase/migrations/20270520090000_the_director_list.sql` adds
`fn_is_the_director()`, a guard trigger and two RESTRICTIVE select policies on
`platform_policies`. CI has no database, so it is rehearsed on a throwaway
local PostgreSQL 16 cluster:

```bash
PGPORT_T=54421 bash supabase/tests/the-director/run.sh
```

`run.sh` starts its own cluster in a new temp directory (never a real
database), loads `is_super_admin()` / `is_admin()` and the `platform_policies`
table and policies **verbatim** from the repo by line range, applies the
migration twice, then runs `assert.sql`. Every check is made as the role a
PostgREST request would use (`SET ROLE authenticated` / `anon` /
`service_role` plus `request.jwt.claims`), never as the table owner, because
the owner skips RLS.

`stub-schema.sql` holds only what the repo does not: the platform roles,
Supabase's own `auth.uid()` / `auth.role()`, Supabase's default grants (which
are why the explicit `REVOKE ... FROM anon` matters), and a minimal
`profiles` table with the people used in the checks.

Not loaded: the `platform_policies_update` policy from 20260727060000 (it
calls `user_has_permission()`, whose real body pulls in the whole role
system). Its non-exam branch is `is_super_admin() OR is_admin()`, which the
substrate policy already loaded here grants, so the rehearsal's write paths
are at least as open as production's.
