# AI Pulse Feedback Loop — Decision-Ready Spec

> **Status:** DESIGN ONLY. Nothing in this document has been applied. Every DB object
> below is marked **NEEDS DIRECTOR GO (show-SQL-first)** and MUST be shown before apply.
> **Author lane:** design subagent (read-only on production). **Prod HEAD:** `jicate/main`.
> **Date:** 2026-07-17.

---

## 1. Problem + the SCF loop it mirrors

### 1.1 What AI Pulse does today (a one-way suggestion box)

AI Pulse **captures** learner feedback but never closes the loop:

- Each learner, at the end of a live session, answers *"What should change next week?"*.
  `LiveSessionService.submitQuiz` upserts that note into
  `ai_pulse_live_attendance.engagement_signals.feedback_text`, keyed purely by
  `profile_id` — so **both** enrolled learners and senior learners write through the
  identical path with no role branch (one note per `(event_id, profile_id)` row).
  - Source: `lib/services/ai-pulse/live-session-service.ts:895` (upsert of `feedback_text`),
    type at `:64`.
- The **only** consumer is the admin Champion Console:
  `app/(routes)/ai-pulse/admin/cycles/[id]/_components/learner-feedback-card.tsx`, which
  maps every note to a **read-only wall of quotes**. There is **no aggregation, no theming,
  no noise floor, no measurement, no carry-forward, and no close-back to the learner.**
  A grep for `carry-forward` / `re-ask` across `ai-pulse` is EMPTY (verified this session).
- The learner **never sees their voice again.** After submit, the quiz panel's `submitted`
  branch (`app/(routes)/ai-pulse/live/[cycle]/_components/quiz-panel.tsx:180`) shows only
  `Score: X%` and says nothing about the note. From the learner's point of view, the voice
  vanishes into a box.
- The only reciprocal that exists is a **cycle-global** free-text field the Champion can
  fill, `you_said_we_changed` (on the cycle config, read in
  `app/(routes)/ai-pulse/_components/current-cycle-card.tsx`,
  `lib/services/ai-pulse/cycles-service.ts`). It is one paragraph per cycle, not tied to any
  theme or any learner's specific note.

**Net:** AI Pulse is a suggestion box with a locked lid. It has the CAPTURE primitive and a
cycle-global reciprocal, and nothing in between or after.

### 1.2 The proven loop we mirror — SCF (session-feedback)

SCF (`academic/session-feedback`) is a **verified closed loop** already live in production.
It is the exact template. Real primitives (all verified on `jicate/main`):

| Loop stage | SCF primitive | Path |
|---|---|---|
| CAPTURE store | `session_feedback` table | `supabase/migrations/20260615233000_session_feedback_substrate.sql` |
| CAPTURE write (only path) | `fn_scf_submit_feedback` (DEFINER, anon-locked) | same migration |
| RECEIPT (learner sees own voice) | `my-voice-receipt.tsx`, `loop-closure-card.tsx` | `app/(routes)/learners/class-feedback/_components/` |
| READ (learner side) | `fn_scf_pending_for_learner` | `20260615233000_session_feedback_substrate.sql` |
| CARRY-FORWARD (explicit re-ask) | `fn_scf_carryforward_for_learner` | `20260625100000_scf_carryforward.sql` |
| AGGREGATE input (noise floor in-DB) | `fn_scf_candidate_windows` (HAVING count ≥ 3) | `20260630150000_scf_candidate_windows.sql` |
| AGGREGATE decision input (raw texts, service-role only) | `fn_scf_ai_signal` | `20260623210000_scf_ai_signal.sql` |
| DECIDE persist (synthesized, never raw) | `scf_ai_suggestions` + `fn_scf_record_suggestion` | `20260625120000_scf_self_improving_loop.sql`, `20260630140000_scf_record_suggestion_kind.sql` |
| DECIDE feed-back (self-improve hinge) | `fn_scf_prior_suggestion` | `20260628010000_scf_loop_hardening.sql` |
| MEASURE / verifier (closes loop) | `fn_scf_measure_suggestion_outcomes` | `20260625120000_scf_self_improving_loop.sql` |
| HUMAN VERDICT | `fn_scf_set_verdict` | `20260628010000_scf_loop_hardening.sql` |
| CLOSE-BACK to learner | `fn_scf_loop_closure_for_learner` | `20260630181000_scf_loop_closure_for_learner.sql` |
| REACH-BACK note | `scf_learner_notes` | `20260630210000_scf_learner_notes.sql` |
| DURABLE CROSS-CYCLE MEMORY | `social_loop_playbook` (Read→Decide→Act→Learn) | `20260624031500_social_loop_playbook.sql` |

The design below reproduces this spine for AI Pulse using AI Pulse's own grain
`(cycle_id = event_id, population)`, never copying SCF's course/faculty grain.

---

## 2. The closed loop, end-to-end

```
CAPTURE (exists)                      RECEIPT (Section 1 — front of loop)
feedback_text on live_attendance  →   inline "voice received" + persistent ledger card
     │                                 (learner sees their own voice again)
     ▼
AGGREGATE + THEME (Section 2)          Tier A = count rollup (always, zero LLM)
per (cycle, population), floor ≥3  →   Tier B = optional theme labels (LLM enrich)
     │                                 Champion reads themes beside the raw-quote wall
     ▼
CARRY-FORWARD PLAYBOOK (Section 3)     Champion answers a theme in you_said_we_changed;
decide {barToBeat,nextInstruction} →   next cycle sees prior decide + prior measured lift
     │                                 (aipulse_loop_playbook, mirrors social_loop_playbook)
     ▼
MEASURE + CLOSE-BACK (Section 4)       verifier fills outcome_lift from the NEXT cycle's
outcome = engagement next cycle    →   engagement; learner's my-pulse ledger flips from
     │                                 "notes sent / cycle answered" to "acted on → it moved"
     └──────────── feeds prior decide back into the next AGGREGATE prompt ───────────┘
```

**Two populations, one loop.** Every stage keys on `profile_id` (capture) and on the
`population ∈ {student, senior_learner}` split already shipped in
`lib/services/ai-pulse/participation-service.ts:70` (`STUDENT_COHORT_ROLES =
student | cohort_member | production_learner`; everyone else, incl. null-role =
`senior_learner`). No stage forks on role.

### Section 1 — CAPTURE + RECEIPT (front of loop)

Capture already exists and is sound. The gap is the **receipt** — the learner never sees
their voice again. Two receipt moments, both mirroring SCF discipline (confirm the SPECIFIC
thing this learner did; never a cohort claim):

1. **Immediate inline receipt** — in `quiz-panel.tsx` submitted branch (`:180`), when a
   non-empty note was submitted (the component already holds `feedback` in state and
   `submitQuiz` already returned `nextSignals.feedback_text`), render:
   *"Your voice was received — the Champion reads every note when planning next week."*
   Pure client, zero DB. Smallest change that closes the front of the loop; ships alone.
   Analog of `loop-closure-card.tsx`'s acknowledgement line
   (*"You said: better — thanks, that closes your loop."*).
2. **Persistent ledger card** — `MyVoicePulseReceipt` on `/ai-pulse/my-pulse`, mirroring
   `my-voice-receipt.tsx`. Phase-1 tiles read ONLY the learner's own
   `ai_pulse_live_attendance` rows via existing RLS self-read (`profile_id = auth.uid()`,
   granted by `ai_pulse_live_attendance_select` in
   `20260611_ai_pulse_live_attendance_and_champion.sql`) plus the public
   `you_said_we_changed`:
   - *"Notes you sent this term: N"* — distinct **cycles** with a `feedback_text` (note:
     `feedback_text` is one-per-`(cycle,learner)`, overwritten on async resubmit, so this
     counts distinct cycles-with-a-note, not distinct notes).
   - *"Cycles where the Champion published a 'You said, we changed' response: M"* — honestly
     labelled; it never claims *your* note caused it. Renders nothing until N ≥ 1 (exactly
     like `my-voice-receipt.tsx`).

**MINIMAL-DATA DECISION:** Section 1 needs **no new column and no new table** — the receipt
reads existing rows. So Section 1 ships with **ZERO director-go objects**. The richer
per-note *"acted on"* tile cannot be truthfully populated in Section 1 (there is no per-note
acknowledgment primitive yet; the only reciprocal is cycle-global `you_said_we_changed`); it
depends on Sections 2 + 4. One optional forward-seam RPC (`fn_ai_pulse_my_voice`) is
deferred to when Section 4 lands.

### Section 2 — AGGREGATE + THEME

**Grain:** one signal row per `(cycle_id = event_id, population)`. The cross-college Thursday
cycle is a single `event_id`, so the grain is `(cycle, population)` — **not** split by
institution (that would fragment small cohorts below the noise floor). `institution_id` is
stored on the row for reference only, never in the dedupe key.

**Noise floor:** mirror SCF's `HAVING count(*) >= 3`. Only materialize a signal row for a
`(cycle, population)` when `feedback_responses >= MIN_RESPONSES` (default 3). The count is
done **in-DB** in the candidate RPC so PostgREST's ~1000-row cap can never silently
truncate a large cycle — the identical failure `fn_scf_candidate_windows` was written to
prevent.

**Two-tier, LLM-OPTIONAL (hard requirement):**
- **Tier A — count rollup (always works, zero LLM):** `aipulse_feedback_signal`, one row per
  `(cycle, population)` carrying `responses`, `feedback_responses`, and engagement
  aggregates already in `engagement_signals` (`quiz_pass_rate`, `joined_on_time_rate`).
  `fn_aipulse_record_signal` upserts it. The Champion always gets a numeric rollup + the
  existing raw-quote wall, even if no model runs.
- **Tier B — optional LLM enrichment:** `aipulse_feedback_theme`, 0..N rows per
  `(cycle, population)`, one per `theme_key` `{label, mention_count, sentiment, share_pct}`.
  Stores **AGGREGATE labels + counts only, NEVER raw comment text** (mirrors
  `scf_ai_suggestions` storing synthesized guidance, never `free_texts`). When no LLM runs,
  this table stays empty and the loop degrades cleanly to Tier A.

**Raw-text reader (service-role ONLY, like `fn_scf_ai_signal`):** `fn_aipulse_feedback_signal
(cycle, population)` returns counts + the raw anonymized `feedback_texts[]` for the cron to
feed a model. Because it returns the most identity-adjacent payload, it is REVOKED from
anon, authenticated, PUBLIC and GRANTed **service_role only**.

**Champion read (anon-locked + GRANT authenticated):** `fn_aipulse_themes_for_cycle
(p_cycle_id)`, SECURITY DEFINER, gated internally on `is_super_admin() / is_admin() OR
user_has_permission('aiPulse:cycles.manage')`, returns per-population signal + theme rows
(aggregate only, no raw text) → safe to GRANT authenticated. A new pure-UI card renders it
beside the existing raw-quote wall. The Champion answers themes in `you_said_we_changed`
(Section 3/4 close-back).

### Section 3 — CARRY-FORWARD PLAYBOOK (decide, self-improve hinge)

Mirrors `social_loop_playbook` + `fn_scf_prior_suggestion`. When a Champion answers a theme,
the decision is persisted so the **next cycle** knows what to beat — turning a one-off review
into a ratchet.

- `aipulse_loop_playbook`: one row per closed `(cycle, population)`, mirroring
  `social_loop_playbook`: `read_summary` (Tier A + top theme labels snapshot), `decide` jsonb
  `{barToBeat, nextInstruction, themeAnswered}`, `learning` text. `fn_aipulse_record_playbook`
  upserts it (idempotent).
- `fn_aipulse_prior_decide(p_cycle_id, p_population)`: the self-improvement hinge. Returns the
  most recent prior `(same population)` `decide` + its measured `outcome_lift` (from Section
  4), injected into the NEXT aggregate prompt so the model proposes better having seen its own
  track record. Analog of `fn_scf_prior_suggestion`.

The Champion-facing carry-forward surface is a card on the live/admin console that shows *"last
cycle you told this population you'd change X — did engagement move?"* — the AI Pulse analog of
SCF's carry-forward re-ask, but at cycle grain (the Champion re-asks, not the individual
learner, because AI Pulse's reciprocal is cycle-global).

### Section 4 — MEASURE + CLOSE-BACK (verifier + learner-visible close)

Mirrors `fn_scf_measure_suggestion_outcomes` + `fn_scf_loop_closure_for_learner`.

- **Verifier:** `fn_aipulse_measure_outcomes` (service-role, cron). For each unmeasured
  playbook row old enough, sets `outcome` = the engagement aggregate (e.g. `quiz_pass_rate`
  or a chosen composite) of the **earliest next cycle with ≥ MIN_RESPONSES for the same
  population**, and `lift = outcome − input`. The ≥3 next-cycle floor prevents a stray
  low-response cycle locking a false lift (SCF's exact guard). Improvement-only measurement.
- **Close-back to learner:** upgrades the Section-1 ledger. `fn_ai_pulse_my_voice` (the
  forward-seam RPC deferred from Section 1) is now built: a self-scoped DEFINER read
  (`p_user := auth.uid()`, never a caller-supplied id) that JOINs the learner's own noted
  cycles → the theme the Champion answered → the measured population lift, so the ledger card
  can honestly flip a tile from *"cycle answered"* to *"acted on → engagement moved +Δ."*
  Honesty rule (from `fn_scf_loop_closure_for_learner`): the chain is
  *your note's cycle → a recorded Champion change (traceable playbook row) → the population's
  later engagement rising* — it never claims your individual note was the sole cause.

---

## 3. Every NEW DB object (proposed SQL sketches)

> All RPCs below follow the **mandatory lock pattern**: `SECURITY DEFINER` +
> `SET search_path = public` + `REVOKE EXECUTE ... FROM anon, PUBLIC` + explicit `GRANT`.
> Cross-tenant / cron writers are further restricted to `service_role` only. Every object is
> **NEEDS DIRECTOR GO (show-SQL-first)**.

### 3.0 Section 1 — NONE

Section 1 (receipt) introduces **no DB object**. It reads existing rows via existing RLS.
`fn_ai_pulse_my_voice` is listed under Section 4 (where its cross-row join first exists).

### 3.1 `aipulse_feedback_signal` (table) — Tier A rollup — **NEEDS DIRECTOR GO**

```sql
-- Section 2 Tier A. One row per (cycle, population). Aggregate-only, no raw text.
CREATE TABLE IF NOT EXISTS public.aipulse_feedback_signal (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id           uuid NOT NULL,               -- = ai_pulse event_id
  population         text NOT NULL CHECK (population IN ('student','senior_learner')),
  institution_id     uuid,                         -- reference only, NOT in dedupe key
  responses          int  NOT NULL DEFAULT 0,
  feedback_responses int  NOT NULL DEFAULT 0,      -- rows with a non-empty feedback_text
  quiz_pass_rate     numeric,
  joined_on_time_rate numeric,
  min_responses      int  NOT NULL DEFAULT 3,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, population)                    -- idempotent upsert key
);
ALTER TABLE public.aipulse_feedback_signal ENABLE ROW LEVEL SECURITY;
-- No direct policies: all reads via fn_aipulse_themes_for_cycle (DEFINER),
-- all writes via fn_aipulse_record_signal (service_role DEFINER). Deny-all direct.
```

### 3.2 `aipulse_feedback_theme` (table) — Tier B labels — **NEEDS DIRECTOR GO**

```sql
-- Section 2 Tier B. 0..N per (cycle, population). AGGREGATE labels + counts ONLY.
CREATE TABLE IF NOT EXISTS public.aipulse_feedback_theme (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL,
  population     text NOT NULL CHECK (population IN ('student','senior_learner')),
  theme_key      text NOT NULL,
  label          text NOT NULL,                    -- synthesized label, NEVER a raw comment
  mention_count  int  NOT NULL DEFAULT 0,
  sentiment      text CHECK (sentiment IN ('positive','neutral','negative')),
  share_pct      numeric,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, population, theme_key)          -- idempotent upsert key
);
ALTER TABLE public.aipulse_feedback_theme ENABLE ROW LEVEL SECURITY;
-- Deny-all direct; reads via fn_aipulse_themes_for_cycle, writes via fn_aipulse_record_signal.
```

### 3.3 `aipulse_loop_playbook` (table) — Section 3 durable memory — **NEEDS DIRECTOR GO**

```sql
-- Section 3. One row per closed (cycle, population). Mirrors social_loop_playbook.
CREATE TABLE IF NOT EXISTS public.aipulse_loop_playbook (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL,
  population     text NOT NULL CHECK (population IN ('student','senior_learner')),
  read_summary   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Tier A + top theme snapshot (the READ)
  decide         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {barToBeat,nextInstruction,themeAnswered}
  learning       text,
  input_metric   numeric,                              -- the "before" engagement (Section 4 reads)
  outcome_metric numeric,                              -- the "after", filled by verifier
  outcome_lift   numeric,                              -- outcome - input (NULL until measured)
  measured_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, population)
);
ALTER TABLE public.aipulse_loop_playbook ENABLE ROW LEVEL SECURITY;
-- Deny-all direct; reads via fn_aipulse_prior_decide (DEFINER), writes via
-- fn_aipulse_record_playbook + fn_aipulse_measure_outcomes (service_role DEFINER).
```

### 3.4 `fn_aipulse_candidate_cycles` (rpc) — Section 2 generator input — **NEEDS DIRECTOR GO**

```sql
-- Cross-tenant window generator with in-DB noise floor. service_role ONLY.
CREATE OR REPLACE FUNCTION public.fn_aipulse_candidate_cycles(p_min_responses int DEFAULT 3)
RETURNS TABLE (cycle_id uuid, population text, institution_id uuid,
               responses int, feedback_responses int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT event_id AS cycle_id,
         CASE WHEN pr.role = ANY (ARRAY['student','cohort_member','production_learner'])
              THEN 'student' ELSE 'senior_learner' END AS population,
         max(la.institution_id) AS institution_id,
         count(*)::int AS responses,
         count(*) FILTER (WHERE nullif(trim(la.engagement_signals->>'feedback_text'),'') IS NOT NULL)::int
           AS feedback_responses
  FROM ai_pulse_live_attendance la
  JOIN profiles pr ON pr.id = la.profile_id
  GROUP BY event_id, population
  HAVING count(*) FILTER (WHERE nullif(trim(la.engagement_signals->>'feedback_text'),'') IS NOT NULL)
         >= p_min_responses           -- ≥3 floor done in-DB → no PostgREST 1000-row truncation
  ORDER BY max(la.updated_at);        -- fair rotation
$$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_candidate_cycles(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_candidate_cycles(int) TO service_role;
```

### 3.5 `fn_aipulse_feedback_signal` (rpc) — Section 2 raw-text reader — **NEEDS DIRECTOR GO**

```sql
-- Returns counts + raw anonymized feedback_texts[] for the model. MOST identity-adjacent
-- payload → service_role ONLY. Client never receives free texts.
CREATE OR REPLACE FUNCTION public.fn_aipulse_feedback_signal(p_cycle_id uuid, p_population text)
RETURNS TABLE (responses int, feedback_responses int,
               avg_quiz_pass numeric, feedback_texts text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ /* aggregate rows for (cycle,population); array_agg of trimmed feedback_text */ $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_feedback_signal(uuid,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_feedback_signal(uuid,text) TO service_role;
```

### 3.6 `fn_aipulse_record_signal` (rpc) — Section 2 Tier A/B persist — **NEEDS DIRECTOR GO**

```sql
-- Upserts aipulse_feedback_signal (Tier A) and 0..N aipulse_feedback_theme (Tier B).
-- Cron-driven, cross-tenant, unscoped writer → service_role ONLY (deliberate deviation
-- from GRANT authenticated, flagged: it writes across institutions).
CREATE OR REPLACE FUNCTION public.fn_aipulse_record_signal(p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ /* ON CONFLICT (cycle_id,population) DO UPDATE ...; themes ON CONFLICT (…,theme_key) */ $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_record_signal(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_record_signal(jsonb) TO service_role;
```

### 3.7 `fn_aipulse_themes_for_cycle` (rpc) — Section 2 Champion read — **NEEDS DIRECTOR GO**

```sql
-- The GRANT-authenticated read. Internally permission-gated. Aggregate only, no raw text.
CREATE OR REPLACE FUNCTION public.fn_aipulse_themes_for_cycle(p_cycle_id uuid)
RETURNS TABLE (population text, responses int, feedback_responses int,
               theme_key text, label text, mention_count int, sentiment text, share_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('aiPulse:cycles.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT s.population, s.responses, s.feedback_responses,
                      t.theme_key, t.label, t.mention_count, t.sentiment, t.share_pct
    FROM aipulse_feedback_signal s
    LEFT JOIN aipulse_feedback_theme t
      ON t.cycle_id = s.cycle_id AND t.population = s.population
    WHERE s.cycle_id = p_cycle_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_themes_for_cycle(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_themes_for_cycle(uuid) TO authenticated;
```

### 3.8 `fn_aipulse_record_playbook` (rpc) — Section 3 persist — **NEEDS DIRECTOR GO**

```sql
-- Persists the Champion's decide {barToBeat,nextInstruction,themeAnswered}. Idempotent.
CREATE OR REPLACE FUNCTION public.fn_aipulse_record_playbook(p_cycle_id uuid, p_population text,
                                                             p_read_summary jsonb, p_decide jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('aiPulse:cycles.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO aipulse_loop_playbook (cycle_id, population, read_summary, decide)
  VALUES (p_cycle_id, p_population, p_read_summary, p_decide)
  ON CONFLICT (cycle_id, population)
  DO UPDATE SET read_summary = EXCLUDED.read_summary, decide = EXCLUDED.decide, updated_at = now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_record_playbook(uuid,text,jsonb,jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_record_playbook(uuid,text,jsonb,jsonb) TO authenticated;
```

### 3.9 `fn_aipulse_prior_decide` (rpc) — Section 3 self-improve hinge — **NEEDS DIRECTOR GO**

```sql
-- Feeds the previous cycle's decide + measured lift into the NEXT aggregate prompt.
-- service_role (cron-consumed) — analog of fn_scf_prior_suggestion.
CREATE OR REPLACE FUNCTION public.fn_aipulse_prior_decide(p_cycle_id uuid, p_population text)
RETURNS TABLE (decide jsonb, outcome_lift numeric, measured_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ /* most-recent prior (same population) playbook row before this cycle */ $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_prior_decide(uuid,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_prior_decide(uuid,text) TO service_role;
```

### 3.10 `fn_aipulse_measure_outcomes` (rpc) — Section 4 verifier — **NEEDS DIRECTOR GO**

```sql
-- Closes the loop. For each unmeasured playbook row old enough, outcome = engagement of the
-- EARLIEST next cycle with ≥ min_responses for the same population; lift = outcome - input.
-- The ≥3 next-cycle floor prevents a stray low-response cycle locking a false lift.
CREATE OR REPLACE FUNCTION public.fn_aipulse_measure_outcomes(p_min_responses int DEFAULT 3)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ /* UPDATE outcome_metric, outcome_lift, measured_at; return rows measured */ $$;
REVOKE EXECUTE ON FUNCTION public.fn_aipulse_measure_outcomes(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_aipulse_measure_outcomes(int) TO service_role;
```

### 3.11 `fn_ai_pulse_my_voice` (rpc) — Section 4 learner close-back — **NEEDS DIRECTOR GO**

```sql
-- Self-scoped ledger read: p_user := auth.uid() ALWAYS, never a caller-supplied id
-- (confused-deputy guard). JOINs learner's noted cycles → answered theme → measured lift.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_voice()
RETURNS TABLE (cycle_id uuid, note_present boolean, theme_answered text,
               champion_responded boolean, population_lift numeric, measured boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY /* own live_attendance rows → aipulse_loop_playbook (same cycle+population)
                  → outcome_lift; honesty: chain not sole-cause */ ;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_voice() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_voice() TO authenticated;
```

### 3.12 Cron jobs — **NEEDS DIRECTOR GO** (Vercel cron routes, not DB objects, but listed for completeness)

- `app/api/cron/aipulse-aggregate/route.ts` — calls `fn_aipulse_candidate_cycles` →
  `fn_aipulse_feedback_signal` → (optional LLM) → `fn_aipulse_record_signal`.
- `app/api/cron/aipulse-measure/route.ts` — calls `fn_aipulse_measure_outcomes`.
  (Mirror `app/api/cron/scf-generate-suggestions` and `scf-measure-outcomes`.)

---

## 4. Every NEW UI surface (with file path)

| Surface | Path | Section | DB? |
|---|---|---|---|
| Inline "voice received" line in submitted branch | `app/(routes)/ai-pulse/live/[cycle]/_components/quiz-panel.tsx` (~:180) | 1 | none |
| `MyVoicePulseReceipt` ledger card | `app/(routes)/ai-pulse/my-pulse/_components/my-voice-pulse-receipt.tsx` (new) + wired into `app/(routes)/ai-pulse/my-pulse/page.tsx` | 1 (Phase-1) / upgraded by 4 | reads own rows (P1); `fn_ai_pulse_my_voice` (P4) |
| Champion theme card (beside raw-quote wall) | `app/(routes)/ai-pulse/admin/cycles/[id]/_components/aipulse-theme-card.tsx` (new) alongside existing `learner-feedback-card.tsx` | 2 | `fn_aipulse_themes_for_cycle` |
| Carry-forward "did engagement move?" card | `app/(routes)/ai-pulse/admin/cycles/[id]/_components/aipulse-carryforward-card.tsx` (new) | 3 | `fn_aipulse_record_playbook`, prior decide surfaced server-side |
| Loop-closure tile upgrade (acted-on → +Δ) | same `my-voice-pulse-receipt.tsx` | 4 | `fn_ai_pulse_my_voice` |

---

## 5. PR CHAIN

Ordered PRs. Each lists what it touches, its dependency, and whether it needs a DB go.
**PR-A ships completely alone with zero DB** and delivers the front-of-loop close immediately.

| PR | Title | Touches | Depends on | DB go? |
|---|---|---|---|---|
| **PR-A** | Receipt: inline + ledger (Phase-1) | `quiz-panel.tsx` inline line; new `my-voice-pulse-receipt.tsx` + `my-pulse/page.tsx` wiring — reads existing rows only | — | **No** |
| **PR-B** | Types + permission keys | `types/supabase.ts` (hand-add the 3 new tables + RPC signatures — types are NOT auto-generated here); `lib/constants/permissions.ts` (`aiPulse:cycles.manage` if absent) | PR-A (parallel-safe) | No (types only) |
| **PR-C** | DB substrate | Migrations for `aipulse_feedback_signal`, `aipulse_feedback_theme`, `aipulse_loop_playbook` (§3.1–3.3) + all RPCs (§3.4–3.11) with lock pattern; append to `supabase/SQL_FILE_INDEX.md` | PR-B (types must match) | **YES** |
| **PR-D** | Aggregate engine + Champion theme card | `app/api/cron/aipulse-aggregate/route.ts` (new); `aipulse-theme-card.tsx`; calls `fn_aipulse_candidate_cycles/_feedback_signal/_record_signal/_themes_for_cycle` | PR-C | uses §3 objects (no new go) |
| **PR-E** | Carry-forward playbook UI | `aipulse-carryforward-card.tsx`; wires `fn_aipulse_record_playbook` + `fn_aipulse_prior_decide` into aggregate prompt | PR-D | uses §3 objects |
| **PR-F** | Measure + close-back | `app/api/cron/aipulse-measure/route.ts` (new, `fn_aipulse_measure_outcomes`); upgrade `my-voice-pulse-receipt.tsx` to `fn_ai_pulse_my_voice`; register cron in `vercel.json` | PR-E | uses §3 objects |

Dependency spine: **A ⟂ (independent) → B → C → D → E → F.** PR-A and PR-B can land in
parallel; everything from C on is serial because each reads the previous stage's writes.

---

## 6. Two-population handling, privacy, idempotency

**Two populations (learners + senior learners).**
- Capture keys on `profile_id` — a single code path writes both populations
  (`live-session-service.ts:895`), no role branch.
- Every aggregate/playbook/measure object carries `population ∈ {student, senior_learner}`
  derived by the EXACT split already shipped in `participation-service.ts:70`
  (`STUDENT_COHORT_ROLES`; null-role → `senior_learner`). No stage forks on role; population
  is a column, not a code path.
- **Ledger home caveat (OPEN):** the Phase-1 ledger card lives on `/ai-pulse/my-pulse`, gated
  by `aiPulse:view.self` (`my-pulse/page.tsx:63`). If senior learners do not hold
  `aiPulse:view.self`, the ledger card won't render for them — but the **inline quiz-panel
  receipt renders at the submit surface regardless of role**, so the front-of-loop close is
  never lost for either population.

**Privacy of feedback.**
- Raw `feedback_text` is the most identity-adjacent payload. The only RPC that returns raw
  texts (`fn_aipulse_feedback_signal`) is **service_role ONLY** — never reachable by any
  authenticated client. The Champion read (`fn_aipulse_themes_for_cycle`) and the persisted
  theme table return **aggregate labels + counts only, never raw comment text** (mirrors
  `scf_ai_suggestions`).
- A learner reads only **their own** `feedback_text` (RLS `profile_id = auth.uid()`); the
  ledger and `fn_ai_pulse_my_voice` are strictly self-scoped (`p_user := auth.uid()`, never a
  caller-supplied id — the confused-deputy guard that PR #1995 retrofitted across `ai_rpc_*`).
- Noise floor ≥3 (`MIN_RESPONSES`) is enforced **in-DB** so a theme/signal never materializes
  for a group small enough to de-anonymize, and PostgREST truncation can't leak a partial set.

**Idempotency.**
- Every writer upserts on a natural key: `aipulse_feedback_signal UNIQUE(cycle_id,
  population)`, `aipulse_feedback_theme UNIQUE(cycle_id, population, theme_key)`,
  `aipulse_loop_playbook UNIQUE(cycle_id, population)`. Re-drains `ON CONFLICT DO UPDATE` and
  never duplicate — same guarantee as `fn_scf_record_suggestion`.
- The verifier measures each playbook row at most once (guards on `measured_at IS NULL`).
- ⚠️ **`ON CONFLICT DO NOTHING` trap** (session receipt): if any seed/backfill uses
  `DO NOTHING`, the first-APPLIED row wins and a later richer write silently no-ops — use
  `DO UPDATE` for the aggregate writers, and verify post-apply ROW STATE, not just that the
  statement ran.

---

## 7. Risks / OPEN questions

1. **Per-note acknowledgment doesn't exist yet.** Phase-1 receipt is honestly *"Notes you
   sent" + "Cycles where the Champion answered"* — a true per-note *"acted on"* tile is
   deferred to Section 4. Confirm this honest framing is acceptable as the front-of-loop close.
2. **`feedback_text` is one-per-`(cycle,learner)`**, overwritten on async resubmit. So
   *"Notes you sent"* counts **distinct cycles-with-a-note**, not distinct notes. Confirm the
   wording.
3. **Senior-learner ledger home** depends on whether they hold `aiPulse:view.self` — OPEN
   (see §6). Inline receipt is unaffected.
4. **Echo of own note text back to the learner** (*"you wrote: …"*) is privacy-safe (own row)
   but a Phase-1 nice-to-have. Confirm whether wanted.
5. **`SUPABASE_SERVICE_ROLE_KEY` grants** on the cron routes must use the real key, and the
   `types/supabase.ts` additions must be **hand-added** (types are not auto-generated here) or
   the typecheck gate passes vacuously and the new tables stay invisible to `tsc`.
6. **SCF is NOT in `supabase/SQL_FILE_INDEX.md`** (grep empty) — SCF lives entirely in
   `supabase/migrations/`. This spec's DB objects follow the same migration-file convention,
   not the `setup/0X_*.sql` convention. Confirm the migration-file placement is intended.
7. **Composite engagement metric for `outcome`** (§3.10) is unspecified: `quiz_pass_rate`
   alone, or a blend with `joined_on_time_rate` / feedback sentiment? OPEN — pick before PR-F.
8. **LLM-optional degradation** must be tested: with the model disabled, Tier A must still
   render a numeric rollup and the loop must not stall waiting on empty `aipulse_feedback_theme`.
