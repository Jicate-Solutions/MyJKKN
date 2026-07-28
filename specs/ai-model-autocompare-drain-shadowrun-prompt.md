# Feature A — Auto-Compare Model-Quality Loop · Windows Max-Lane Drain Shadow-Run Prompt

**Status: SCAFFOLDING / NOT YET WIRED.** This is a paste-ready instruction for the
Windows Max-lane drain. The loop does **nothing** until BOTH are true:

1. The Director has applied the migration
   `supabase/migrations/20260731130000_model_switch_autocompare_substrate.sql`
   (creates `model_switch_evaluations`, `model_switch_comparisons`,
   the `model_compare.judge` ai_job_type, and `fn_model_switch_record_comparison`).
2. The Windows drain has been taught the shadow-run behaviour described below **and
   that behaviour has been empirically verified on the box** (see the RED flags).

It mirrors the proven **SCF note-safety shadow-judge** pattern
(`supabase/migrations/20260719054000_scf_note_safety_judge_shadow_substrate.sql`):
a shadow observer that stores predictions and NEVER changes live behaviour.

---

## What the drain does today (unchanged baseline)

For each claimed `ai_jobs` row, the drain resolves the job's model from
`ai_job_types` (`provider` + `model_id`, falling back to `ai_model_config`), runs
the NEW/current model once, and writes the result back to the job. Nothing about a
model switch is observed. **That single run is the NEW-model output.**

---

## What to ADD (the shadow-run) — paste-ready instruction for the drain

> **Shadow-run the OLD model whenever a switch is under evaluation.**
>
> After you claim an `ai_jobs` row and resolve its `job_type`, check whether that
> `job_type` currently has an OPEN evaluation:
>
> ```sql
> SELECT id, old_provider, old_model_id, comparisons_done, comparisons_target
> FROM   public.model_switch_evaluations
> WHERE  job_type = :claimed_job_type
>   AND  status = 'collecting'
> ORDER  BY switched_at DESC
> LIMIT  1;   -- run as service_role
> ```
>
> - **No row →** run the job normally. Do nothing else. (This is the common case;
>   zero extra load.)
> - **Row found (status = `collecting`) →** in addition to the normal NEW-model run:
>   1. Run the **OLD** model (`old_provider` / `old_model_id` from the row) on the
>      **exact same assembled input** you gave the NEW model. Same prompt, same
>      payload — the comparison is only valid if the input is identical.
>   2. You now hold `old_output` and `new_output` for the same input.
>   3. **Enqueue a `model_compare.judge` job** carrying BOTH outputs plus the
>      `switch_id` and the source `ai_job_id`, e.g. build the `prompt` payload as:
>
>      ```
>      JOB PURPOSE / INPUT CONTEXT:
>      <the job's input context>
>
>      OLD_OUTPUT:
>      <old_output>
>
>      NEW_OUTPUT:
>      <new_output>
>      ```
>
>      and pass `switch_id` + `ai_job_id` alongside so the recorder can attribute
>      the verdict. (Randomising which output is labelled first is a nice-to-have;
>      the judge prompt already controls for position bias against an absolute
>      rubric, so it is not required.)
>   4. When the `model_compare.judge` job completes, read its strict-JSON result
>      `{verdict, reason}` and record it — as **service_role**:
>
>      ```sql
>      SELECT public.fn_model_switch_record_comparison(
>        :switch_id,            -- p_switch_id
>        :judge_verdict,        -- 'old_better' | 'new_better' | 'tie'
>        :source_ai_job_id,     -- p_ai_job_id   (optional)
>        :old_output,           -- p_old_output  (optional)
>        :new_output,           -- p_new_output  (optional)
>        :judge_reason          -- p_reason      (optional, <=200 chars)
>      );
>      ```
>
>      The RPC tallies the verdict and, once `comparisons_done >= comparisons_target`
>      (default 20), flips the evaluation to `status = 'verdict_ready'` with a
>      **conservative** `verdict` (`new_worse` only when the old model wins by a
>      clear margin; otherwise `tie`/`new_better`).
>
> **Recommendation-only.** Setting `verdict = 'new_worse'` does NOT revert anything.
> A human (the Director) reads the evaluation and decides whether to switch back.
> The drain must never change `ai_job_types.model_id` on its own.

---

## 🔴 MANDATORY FLAGS — read before trusting this

- **This DOUBLES load for compared jobs.** Every job whose `job_type` has an open
  evaluation runs the model **twice** (OLD + NEW) plus a third `model_compare.judge`
  run. On the ₹0 Max lane that is real, finite capacity. Keep `comparisons_target`
  small (20), evaluate **one** `job_type` at a time, and expect the compared
  `job_type`'s throughput to drop while an evaluation is `collecting`. Do not open
  evaluations on high-volume job types without capacity headroom.

- **This is correctness-critical.** The whole point is to tell the Director whether
  a model change helped or hurt. A wrong tally, a mismatched input between the OLD
  and NEW run, or a mislabelled verdict produces a **false** recommendation. A false
  `new_worse` nags the Director into reverting a good model; a false `new_better`
  hides a regression. The judge prompt is deliberately conservative (ties by
  default) for exactly this reason — do not "help" it by breaking ties yourself.

- **The box exec is currently safety-blocked → empirical verification required
  before trust.** The Windows Max-lane drain's command execution is safety-blocked
  at time of writing, so this shadow-run has **NOT been run end-to-end on the box.**
  Before this loop is trusted for any real model decision:
  - Verify the drain can actually claim, run OLD + NEW, and enqueue/complete a
    `model_compare.judge` job on the real box (not just in theory).
  - Verify `fn_model_switch_record_comparison` is reachable as service_role from the
    box and that the tally + verdict flip behave on a seeded test evaluation.
  - Confirm the OLD and NEW runs receive byte-identical input.
  Until that empirical run is green, treat every stored verdict as **unverified**.

- **Silent-drain = orphaned lock, not "job done".** If the Max lane goes quiet while
  an evaluation is open, suspect an orphaned single-flight lock (known failure mode),
  not a completed comparison. `comparisons_done` stuck below target = still collecting.

---

## Verification checklist (for whoever wires this)

- [ ] Migration applied on prod by the Director; four objects exist.
- [ ] `model_compare.judge` present in `ai_job_types` with `provider='anthropic'`,
      `model_id='claude-sonnet-4-6'`, `lane='max'`, `interactive=false`.
- [ ] `fn_model_switch_record_comparison` EXECUTE granted to `service_role` only
      (anon/authenticated/PUBLIC revoked) — verify with `\df+` / `has_function_privilege`.
- [ ] Drain shadow-run runs OLD + NEW on identical input; enqueues judge; records verdict.
- [ ] Seeded 20-comparison dry run flips `status → verdict_ready` with the expected
      conservative verdict; confirmed on the box.
- [ ] Load impact on the compared `job_type` measured and acceptable.
