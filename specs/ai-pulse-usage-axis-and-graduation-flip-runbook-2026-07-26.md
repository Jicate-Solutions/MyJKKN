# AI Pulse — Prompt-build Usage Axis & Graduation Flip Runbook

**Created:** 2026-07-26
**Status:** Substrate SHIPPED + applied to prod, **DARK** (both flags `false`). Activation is the Director's call.
**Extends:** [`specs/ai-pulse-prompt-engineering-learning-loop-2026-07-22.md`](./ai-pulse-prompt-engineering-learning-loop-2026-07-22.md) (decision #20)
**Migration:** `supabase/migrations/20260726090000_ai_pulse_prompt_usage_axis.sql`

---

## 1. Why this exists (the fork it closes)

The build-from-parts loop lets a learner assemble a prompt and get an AI checklist grade. Decision #20 says the best builds should **graduate** into the shared library — the compounding half of the moat: staff seed the library, learners grow it, and the best-*used* prompts rise.

Graduation shipped in `20260723090000_ai_pulse_prompt_graduation.sql` (PR #2297) but **could only grade on the checklist score**, because a build carried no reuse signal. That migration's own header flagged the open decision, verbatim:

> "decision #20's bar is 'high usage + passed checklist', but a learner build has NO usage signal … v1 grades on the CHECKLIST SCORE only … The usage axis activates once builds gain a reuse signal; the Director sets the definition pre-go-live."

This spec + its migration give a build that reuse signal, and define exactly what "used" means and how to switch the usage axis on.

## 2. What counts as "used"

- **`used_count` = the number of DISTINCT peer learners who *copied* a graduated build.**
- A **peer** is a learner **in the same institution** who is **not the author** (a self-copy is not reuse).
- Two ledger actions are recorded, mirroring the library-starter ledger (`ai_pulse_domain_starter_events`): `view` and `copy`. **Only `copy` counts as "used"** — `view` is kept for funnel completeness.
- The graduate-by-usage bar is **`prompt_graduation_usage_min` distinct copiers (k, default 3)** — the same ≥3 relevance/privacy floor used throughout the Domain Starter loop.

This mirrors the leaderboard's existing convention, where `action='copy'` on a starter is the canonical "actually used it" signal — no parallel mechanism was invented.

## 3. The substrate (what the migration added)

| Object | Kind | Access | Purpose |
|---|---|---|---|
| `ai_pulse_prompt_build_uses` | table (RLS, deny-all-direct) | via RPCs only | Per-(build, peer, action) reuse ledger. `UNIQUE(build_id, profile_id, action)` dedups so `used_count` counts distinct peers. |
| `fn_ai_pulse_record_prompt_build_use(p_build_id, p_action)` | SECDEF RPC | `authenticated` (anon-locked) | Records a peer's `view`/`copy`. Self-scoped from `auth.uid()`; dark-gated on `prompt_graduation_enabled`; refuses self-copy / cross-institution / non-graduated targets. Returns the current distinct-copier count. |
| `fn_ai_pulse_topic_graduated_prompts(...)` | SECDEF RPC (extended) | `authenticated` (anon-locked) | Shared-library read, **now returns `used_count`** alongside `id, assembled_prompt, score, graduated_at`. Strict same-institution scope; anonymized. |
| `fn_ai_pulse_graduate_prompt_builds(p_cycle_id)` | SECDEF RPC (extended) | `service_role` (cron only) | Now ALSO graduates builds with ≥ k distinct copiers **when the usage axis is on**. Byte-identical to v1 when off. |
| `prompt_graduation_by_usage_enabled` | policy row (bool) | — | The usage-axis switch. Default `false`. |
| `prompt_graduation_usage_min` | policy row (int) | — | The k-threshold. Default `3`. |

The daily `aipulse-prompt-graduate` cron is **unchanged** — it calls `fn_ai_pulse_graduate_prompt_builds` with the same signature, so the dark usage path is exercised automatically once both flags are on.

## 4. Rollout — two stages, both the Director's call

Graduation is a **two-flag, two-stage** rollout. Nothing below is flipped by this PR.

```
Stage 1  prompt_graduation_enabled = true          (already exists, still FALSE today)
         → checklist graduation runs, graduated prompts surface to peers,
           and usage recording begins (peers can now copy them).

Stage 2  prompt_graduation_by_usage_enabled = true (NEW, default FALSE)
         → a build ALSO graduates once ≥ prompt_graduation_usage_min peers copy it.
```

Usage can only accrue **after** Stage 1 (there is nothing to reuse until prompts surface), so Stage 2 is meaningfully switched on only once real copy events exist. A sensible sequence: flip Stage 1 → let a cycle or two of copies accumulate → then flip Stage 2.

## 5. The exact flips (each is a single UPDATE) and rollback

All state lives in `ai_pulse_policies`. Apply via the Supabase management API `database/query` endpoint (non-default `User-Agent`) or the SQL editor.

**Stage 1 — turn graduation ON:**
```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'prompt_graduation_enabled';
```

**Stage 2 — turn the USAGE AXIS ON:**
```sql
UPDATE ai_pulse_policies SET value_jsonb = 'true'::jsonb
WHERE config_key = 'prompt_graduation_by_usage_enabled';
```

**Tune the k-threshold (optional):**
```sql
UPDATE ai_pulse_policies SET value_jsonb = '<n>'::jsonb
WHERE config_key = 'prompt_graduation_usage_min';
```

**Rollback (either flag) — instantly dark again:**
```sql
UPDATE ai_pulse_policies SET value_jsonb = 'false'::jsonb
WHERE config_key IN ('prompt_graduation_by_usage_enabled', 'prompt_graduation_enabled');
```

Rollback notes:
- Flipping a flag `false` is a **read-side kill** too: `fn_ai_pulse_record_prompt_build_use` returns `0` without inserting, and the graduate cron becomes a no-op. No redeploy is needed for any flip.
- `graduated_at` stamps are **durable promotions** — a rollback stops *new* graduations but does not un-graduate. To retract one build:
  ```sql
  UPDATE ai_pulse_prompt_builds SET graduated_at = NULL WHERE id = '<build_uuid>';
  ```

## 6. Verification (reproducible, non-persisting)

Run the migration + this harness inside one `BEGIN … ROLLBACK` on the management API. It proves the OFF-path is byte-identical and the ON-path graduates by usage. Result from the 2026-07-26 validation run:

| Assertion | Expected | Got |
|---|---|---|
| OFF-path: score-50 build graduates (usage flag false) | 0 | **0** |
| ON-path: same build graduates at 3 copiers ≥ k=3 | 1 | **1** |
| Read fn reports `used_count` for the build | 3 | **3** |
| Read fn returns the graduated build | 1 | **1** |
| Build shows graduated after ON-path | true | **true** |
| Record fn (peer copy) returns new count | 4 | **4** |
| Ledger distinct copiers | 4 | **4** |

The OFF-path assertion is the load-bearing safety proof: while `prompt_graduation_by_usage_enabled` is false, the graduate predicate reduces to `score >= min` — the graduated set is identical to checklist-only v1.

## 7. Safety properties

- **Anon-locked.** Every RPC is `SECURITY DEFINER` with `REVOKE EXECUTE FROM anon, PUBLIC`. Verified on prod: `anon=false` on all three; the cron-only graduate fn also has `authenticated=false` (only `service_role`).
- **Self-scoped, no confused deputy.** The record/read RPCs derive the caller from `auth.uid()` and never trust a caller-supplied profile id.
- **No self-boost.** A learner cannot inflate their own build's usage — the record RPC excludes the author (`build.learner_id <> caller`).
- **Multi-tenant safe.** Both the record and read RPCs enforce same-institution scope; a learner never sees or feeds another institution's builds.
- **Dark by construction.** With both flags false: the table is empty and unreferenced by any UI, the record RPC no-ops, and the graduate fn is byte-identical to today.

## 8. Not in this PR (follow-ups)

This PR ships **dark substrate only**, mirroring how #2297 shipped graduation before any UI. The learner-facing surface — a "used N times" badge on graduated peer prompts and the copy button wired to `fn_ai_pulse_record_prompt_build_use` — is a separate UI PR, to be built when Stage 1 is close to going live. Feeding usage into leaderboard publish/points is explicitly out of scope (that is a separate leaderboard fast-follow).
