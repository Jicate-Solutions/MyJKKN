# Migration ledger drift — seven versions that are live but unrecorded

**Verified on production 2026-08-12. Director decision 2026-08-13: leave the drift in place and document it. Do NOT backfill the ledger.**

---

## The one-sentence version

Seven accreditation migrations are running on production right now, but the
table Supabase uses to remember what it has applied — `supabase_migrations.schema_migrations`
— has no row for any of them, so a blanket `supabase db push` would try to
apply all seven a second time.

## Why that happens at all

`supabase db push` is the only thing that writes `supabase_migrations.schema_migrations`.
These seven were applied **by hand** through the Management API, at a Director-approved
session gate, one file at a time. Hand-applied SQL changes the database and never
touches the ledger. Nothing is broken and nothing was skipped — the database and its
record of itself simply disagree.

This is not unique to these seven. Several other entries in `supabase/SQL_FILE_INDEX.md`
carry the same warning in their own words, for example
`20260809102300_committee_roster_access.sql` and `20260809102500_member_notes_survive_leaver.sql`:

> ⚠️ The migration ledger has NO row for it — hand-applied SQL never writes the ledger
> — so verify by CATALOG, never by the ledger.

**So treat the list below as seven *verified* cases, not as a complete census of the
drift.** Anything applied by hand is a candidate. The only reliable way to ask "is this
live?" on this database is to read the catalog (`pg_proc`, `pg_policies`,
`information_schema.columns`), never the ledger.

## The seven versions

| Version | What it did |
|---|---|
| `20260809100000` | IQAC foundations — programme scope and snapshot |
| `20260809100100` | Widened accreditation access to the accountable roles |
| `20260809100200` | NIRF evidence mappings |
| `20260809100400` | `fn_accreditation_freeze_reported_figures` |
| `20260809100600` | Acknowledge own ownership |
| `20260809100700` | `quality_evidence_source_registry` fix routes |
| `20260809100900` | Owner can read their own assignment |

## How we know each one is actually live

Read from production on 2026-08-12. Every check below is a **catalog** read, which is
the only evidence that counts here — the ledger cannot answer this question by
definition, since its silence is exactly the thing being investigated.

- **PR #2772's 31 `(role, key)` permission pairs all read `true`.** That is the
  observable effect of `20260809100100`. If it had not been applied, those pairs
  would be absent, not false.
- **PR #2785's four NIRF codes are live, with 11,396 rows carrying
  `first_mapped = 2026-08-02`.** That is `20260809100200`. A date on the rows is
  stronger evidence than the presence of the mapping alone: it shows the emit ran.
- **Four functions exist in `pg_proc`:** `fn_accreditation_freeze_reported_figures`,
  `fn_accreditation_evidence_scope`, `fn_accreditation_reported_vs_actual`,
  `fn_accreditation_acknowledge_ownership`. Those cover `20260809100400`,
  `20260809100600` and their companions.
- **Policy `accred_metric_owners_select` exists in `pg_policies`.** That is
  `20260809100900`.
- **21 of the 24 `quality_evidence_source_registry` rows carry a `fix_route`.**
  That is `20260809100700`, and the count is its own migration's assertion floor.

## What this actually costs us

**A blanket `supabase db push` would attempt all seven again.**

That is the whole consequence, and it is worth being precise about how bad it is.
These seven are individually idempotent by construction — `CREATE OR REPLACE`,
`ADD COLUMN IF NOT EXISTS`, `WHERE NOT EXISTS`, and `UPDATE`s that rewrite the same
values. A second application of any one of them, **in isolation**, should be a no-op.

The risk is not that any single file misbehaves. It is that:

1. **A blanket push is not seven isolated applies.** It is every pending migration in
   the repo, in version order, against a database whose real state does not match the
   replay assumption. This repo has thousands of pending versions. That is a different
   and much larger operation than re-running seven idempotent files, and it must never
   be reached for as a way to "fix" this drift.
2. **Replay order and wall-clock order disagree on this database.** A file that sorts
   earlier than something already live can still be applied *after* it, and
   `ALTER POLICY` / `CREATE OR REPLACE` replace an object wholesale rather than merging
   into it. That is how a correct-looking replay silently reverts a later change. The
   `⚠️ ORDERING` notes in `supabase/SQL_FILE_INDEX.md` mark the specific places where
   this is known to bite.

## Why we did NOT backfill the ledger

Writing these seven versions into `supabase_migrations.schema_migrations` would make
the drift disappear from view, and it is tempting for exactly that reason. It was
rejected, deliberately.

**It is a one-way door.** Once a version is marked applied, every future tool — and
every future person — will believe it ran completely. There is no way to distinguish
"applied in full" from "marked applied" after the fact, because the ledger stores a
version string and nothing else. It records no proof.

**And these were applied by hand, one statement path at a time.** A hand-applied file
that failed halfway, or that was applied against a slightly different object than the
file assumes, would look *identical* in the ledger to one that ran cleanly. Backfilling
would permanently hide a partially-applied change, and the hiding would be
indistinguishable from success — which is the failure mode this repo has already been
bitten by more than once.

Leaving the drift visible keeps the honest signal: **the ledger does not know, so go
and look.**

## What to do instead

- **Never run a blanket `supabase db push` against production.** Not to fix this, not
  for a single PR. Apply one file at a time, rehearsed in `BEGIN .. ROLLBACK` first.
- **Verify by catalog, not by ledger.** `pg_proc`, `pg_policies`,
  `information_schema.columns`. If you want to know whether a function exists, ask
  Postgres for the function.
- **Before applying anything in the `20260809*` range, check whether its effects are
  already live.** They probably are.
- **When a migration is applied by hand, record it in `supabase/SQL_FILE_INDEX.md`**
  with an apply receipt naming the date, the rehearsal method, and the catalog read
  that confirmed it. That index is currently a more truthful record of this database
  than the ledger is.

## Related

- `supabase/SQL_FILE_INDEX.md` — apply receipts and the `⚠️ ORDERING` notes
- `supabase/migrations/20260809100700_evidence_source_registry_fix_routes.sql` — one of the seven; its header carries its own apply receipt
- `supabase/migrations/20260828010000_register_emitting_evidence_sources.sql` — builds on `20260809100700`, and its section 0 refuses to run if that file's columns are absent rather than assuming the ledger is right
