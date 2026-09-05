# Programme-wise settings — design

**Date:** 2026-08-05 · **Mode:** read-only · **Production ref:** `kvizhngldtiuufknvehv`
**Status:** Design proposal. No migration written, no migration applied, zero production writes.

> **Provenance, stated honestly.** The lane assigned to this item produced nothing and was stopped after failing to deliver or respond twice. This document was written afterwards from a fresh discovery pass. It is **shorter than the item deserves** and it settles one question — precedence — while leaving the UI and migration detail open. Section 7 lists exactly what it does not cover.

---

## 1. The question

JKKN needs settings that vary **by programme** — B.Com's attendance-eligibility threshold differing from B.Sc Nursing's. The platform has no programme scope today.

## 2. Production-code sweep

Non-negotiable in this repo; raw output first.

```
$ git ls-tree jicate/main -r --name-only | grep -iE "(platform_polic|program.?setting|program.?eligibility|fn_get_policy|scope_type)"
```
29 files. The substantive ones:

| Path | What |
|---|---|
| `supabase/migrations/20260429000002_platform_policies_substrate.sql` | the substrate |
| `supabase/migrations/20260515000001_fn_get_policy_json.sql` | typed resolver |
| `supabase/migrations/20260731180000_platform_policies_cohort_scope.sql` | cohort scope, added 5 days ago |
| `app/(routes)/campus-living/settings/program-eligibility/**` (13 files) | bespoke per-programme UI |
| `lib/services/campus-living/program-eligibility-service.ts` | its service |
| `docs/superpowers/specs/2026-06-06-campus-living-fee-aware-program-eligibility-design.md` | its design doc |

## 3. What already exists

**The CHECK constraint, read live:**
```
CHECK (scope_type = ANY (ARRAY['global','institution','role','user','cohort']))
```
No `program`. Confirmed.

**Row distribution:**

| scope_type | rows | distinct keys |
|---|---:|---:|
| `global` | 467 | 467 |
| `institution` | 92 | 53 |
| `cohort` | 18 | 18 |
| `role` | **0** | 0 |
| `user` | **0** | 0 |

Two of the five permitted scopes have never been used in production. Worth knowing before adding a sixth.

**Five resolvers share one shape:**

| Function | Signature |
|---|---|
| `fn_get_policy` | `(p_key text, p_scope_id uuid)` |
| `fn_get_policy_bool` | `(p_key text, p_default boolean, p_scope_id uuid)` |
| `fn_get_policy_int` | `(p_key text, p_default integer, p_scope_id uuid)` |
| `fn_get_policy_json` | `(p_key text, p_default jsonb, p_scope_id uuid)` |
| `fn_get_policy_text` | `(p_key text, p_default text, p_scope_id uuid)` |

(`fn_get_policy_clinical_reasoning(p_key, p_default)` takes no scope at all — a special case, out of scope here.)

**The existing precedence chain**, read from `fn_get_policy`'s body:

| Rank | Scope |
|---:|---|
| 1 | `user` |
| 2 | `cohort` with a specific `scope_id` |
| 3 | `institution` |
| 4 | `role` |
| 5 | `cohort` default (`scope_id IS NULL`) |
| 6 | `global` |

**And the double duty is real:** the single `p_scope_id` is tested against *both* `scope_type='institution'` and `scope_type='cohort'`. A caller holding an institution id cannot also express a cohort, and vice versa.

> **A note on the resolver's own comment.** The line `-- ...falling back to the programme-wide cohort default` refers to the **cohort-kind default** (`scope_id IS NULL`), not a programme link. `cohorts` has no `program_id`. Do not read it as existing programme support.

## 4. There are already TWO bespoke per-programme tables, not one

The brief warned that a second bespoke per-programme UI would be the failure mode. That has already happened:

| Table | Columns | `program_id` | Owner |
|---|---:|---|---|
| `hostel_program_eligibility` | 16 | ✅ | Campus Living |
| `admission_package_program_eligibility` | 5 | ✅ | Admission |

Plus four `_bak_hostel_program_eligibility_*` snapshots.

So the choice is not "avoid a second bespoke mechanism" — it is **"stop at two, or accept a third."** That materially strengthens the case for putting programme scope in the shared substrate.

## 5. The blast radius — counted, and the brief's assumption is wrong

```
$ git grep -n "fn_get_policy" jicate/main -- 'lib/**' 'app/**' 'hooks/**' | wc -l
228
$ git grep -l "fn_get_policy" jicate/main | wc -l
242
```

**228 call sites across 242 files.**

The brief asserted that adding a second parameter "changes every caller of all five resolver functions." **That is not true in PostgreSQL.** A parameter with a `DEFAULT` is optional at the call site:

```sql
fn_get_policy(p_key text, p_scope_id uuid, p_program_id uuid DEFAULT NULL)
```

Every existing two-argument call resolves to it unchanged. Only the call sites that actually need programme scope pass the third argument.

**Corrected blast radius:**

| Option | Call sites changed | Function definitions changed | New scopes later |
|---|---:|---:|---|
| **(a) Defaulted third parameter** | **0** (only sites opting in) | 5 | needs another parameter |
| (b) Reuse `scope_id` for programme rows | 0 | 5 | free |
| (c) Generic scope-target table | 0 | 5 + new table | free, no CHECK edit |

**Option (b) must be rejected on semantics, not effort.** It worsens the double duty: a caller could pass an institution id **or** a programme id, never both — so precedence between institution and programme becomes unexpressible. A programme override could never be evaluated together with its institution's, which is the entire point of the feature.

**Recommendation: option (a).** One resolver, one substrate, zero forced call-site churn, and precedence stated explicitly in one place. Option (c) is more elegant and is the right answer if a *fourth* scope dimension is ever needed — but it adds a table and a join to a resolver on the hot path for a generality nobody has asked for yet. Take (a) now; (c) remains open later because (a) does not foreclose it.

**One real hazard with (a):** adding a parameter via `CREATE OR REPLACE` creates a **new overload** rather than replacing the function, and a two-argument call then becomes ambiguous. The migration must `DROP FUNCTION` the old signature and create the new one — and a `DROP` of a function 228 sites call will cascade to anything depending on it. Check `pg_depend` for views, RLS policies and generated columns referencing each of the five before dropping.

## 6. Precedence — the decision everything hangs on

**Proposed:**

| Rank | Scope |
|---:|---|
| 1 | `user` |
| 2 | `cohort` (specific) |
| 3 | **`program`** ← new |
| 4 | `institution` |
| 5 | `role` |
| 6 | `cohort` default |
| 7 | `global` |

**Programme must outrank institution.** A programme sits *inside* an institution, so it is the more specific statement. If institution outranked programme, any institution-level override would mask every programme override beneath it — which is precisely the behaviour "programme-wise settings" exists to prevent. The existing chain already follows this specific-beats-general rule (`user` beats `cohort` beats `institution` beats `global`); slotting programme between cohort and institution is the only placement consistent with it.

**Note the live consequence:** 92 institution rows across 53 keys exist today. Any of those 53 keys that later gains a programme override will change behaviour for that programme. That is intended, but it should be surfaced in the admin UI — a programme override silently outranking a visible institution setting is the kind of thing that generates a bug report.

## 7. What this document does NOT settle

- **The admin UI.** Where programme overrides are created and edited, and how the two existing bespoke tables fold in — migrate, wrap, or leave. Not designed here.
- **The migration.** No DDL written. It needs a unique version (`schema_migrations.version` is the PRIMARY KEY and collisions have already occurred here), and any new function needs explicit `REVOKE EXECUTE ... FROM anon, PUBLIC` plus `GRANT ... TO authenticated` — Supabase default privileges grant `anon` independently of PUBLIC.
- **The `pg_depend` audit** before dropping the five resolvers. Named as required; not performed.
- **Whether `role` and `user` scopes should be retired.** Both have zero rows after months. Not this item's call, but someone should ask.

## 8. Open questions for a human

1. **Does programme outrank institution?** §6 argues yes. This is the one answer that must come before any code.
2. **Do the two existing bespoke tables migrate into `platform_policies`, or stay and get wrapped?** Migrating is cleaner and riskier; Campus Living's has four backup snapshots suggesting it has been reworked repeatedly.
3. **Is a programme override allowed to contradict an institution override silently, or must the UI warn?**

---

## Appendix — queries

```sql
-- scope_type CHECK
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.platform_policies'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%scope_type%';

-- row distribution
SELECT scope_type, count(*) AS rows, count(DISTINCT policy_key) AS distinct_keys
FROM platform_policies GROUP BY 1 ORDER BY 2 DESC;

-- the five resolvers
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'fn_get_polic%' ORDER BY 1;

-- precedence chain
SELECT prosrc FROM pg_proc WHERE proname = 'fn_get_policy';

-- existing bespoke per-programme tables
SELECT table_name, count(*) AS cols
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name ILIKE '%program_eligibility%'
GROUP BY 1;
```

```bash
git grep -n "fn_get_policy" jicate/main -- 'lib/**' 'app/**' 'hooks/**' | wc -l   # 228
git grep -l "fn_get_policy" jicate/main | wc -l                                   # 242
```
