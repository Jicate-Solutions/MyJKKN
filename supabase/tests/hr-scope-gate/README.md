# hr_scope_gate — how the migration was verified

`supabase/migrations/20261121164500_hr_scope_gate_institution_access.sql` adds
three RESTRICTIVE SELECT policies. RLS is not exercised by CI (no database in
the workflow), and it is the class of change where "the tests pass" is worth
very little — a policy that grants everything passes every test that only checks
for rows coming back. So it was verified against a throwaway PostgreSQL 16
cluster, with the assertion falsified before it was trusted.

## Run it

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL=C LANG=C                 # else: "postmaster became multithreaded"
initdb -D /tmp/pgt/data -U postgres --auth=trust
pg_ctl -D /tmp/pgt/data -o "-p 54399 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/pgt/log start
psql -h 127.0.0.1 -p 54399 -U postgres -f stub-schema.sql
psql -h 127.0.0.1 -p 54399 -U postgres -f ../../migrations/20261121164500_hr_scope_gate_institution_access.sql
psql -h 127.0.0.1 -p 54399 -U app_user -d postgres -f assert.sql
```

Queries run as `app_user`, deliberately **not** the owner: PostgreSQL exempts
superusers and table owners from RLS, so running the assertions as `postgres`
would pass no matter what the policies say.

## Result (2026-09-08)

Two institutions seeded, one row each per table.

| Reader | packages | bank accounts | attendance periods |
|---|---|---|---|
| `own`-scoped, HR access = institution A only | **1 of 2** | **1 of 2** | **1 of 2** |
| all-institution role (`hr_head` — COO, CAO) | 2 of 2 | 2 of 2 | 2 of 2 |
| super admin | 2 of 2 | 2 of 2 | 2 of 2 |

## The falsification

With the three `hr_scope_gate` policies dropped, the first reader sees **2 of 2
on every table** — the production behaviour this migration fixes. The assertion
therefore fails against unmutated-but-ungated source, which is what makes the
passing run mean something.

## Second result (2026-09-12) — interviews and scorecards folded in

Sections 4-6 added `fn_hr_candidate_institution_in_scope()` and the same
RESTRICTIVE gate on `hr_recruitment_interviews` and `hr_recruitment_scorecards`.
Neither table has an institution column; both inherit it from the candidate.

Reconcile finding that set the scope: `hr_attendance_audit_log` — listed
alongside these two as an open gap — **already carries a reader-scope check** on
production, so it needed nothing. Two tables remained, not three.

| Reader | interviews | scorecards |
|---|---|---|
| `own`-scoped, HR access = institution A only | **1 of 2** | **1 of 2** |
| the same reader, but on institution B's panel / author of B's scorecard | 2 of 2 | 2 of 2 |
| all-institution role (`hr_head`) | 2 of 2 | 2 of 2 |
| super admin | 2 of 2 | 2 of 2 |

Row two is the one worth keeping: a RESTRICTIVE policy AND-s with the permissive
ones, so an identity path that carries no institution would be silently gated
too. A panel member must not lose sight of the interview they are sitting on
because it belongs to another institution. Each self path in the permissive
policy is therefore repeated in the gate.

The anon grant is asserted directly (`has_function_privilege`), because a REVOKE
that silently failed looks identical to one that worked.

### The falsification

With ONLY the two new `hr_scope_gate` policies dropped, the confined reader sees
**2 of 2 interviews and 2 of 2 scorecards** and `assert.sql` exits 3:

```
ERROR: confined reader saw 2/1 interviews, 2/1 scorecards — the gate is not confining
```

The stub now also creates `anon`, `authenticated` and `service_role`: the
migration grants to them by name, and on a bare cluster it would abort on the
GRANT rather than prove anything. `app_user` inherits `authenticated`, so the
production grant itself is what is exercised — not a direct grant written for
the test.
