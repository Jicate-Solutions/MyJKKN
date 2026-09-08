# hr_scope_gate — how the migration was verified

`supabase/migrations/20261121090000_hr_scope_gate_institution_access.sql` adds
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
psql -h 127.0.0.1 -p 54399 -U postgres -f ../../migrations/20261121090000_hr_scope_gate_institution_access.sql
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
