# Live Poll Engine Generalization — Spec

**Date:** 2026-07-04
**Status:** Approved to build (Director) — Phase A starting
**Origin:** The Mentimeter-style live poll (word-cloud + rating-scale + realtime + k≥3 anonymity) shipped for induction (PR #1757, `induction_session_poll*`) is valuable but siloed. Make it MyJKKN's **shared** live-poll engine so any learning facilitator can run one — in regular classes and training — not just induction resource persons.

## Locked decisions (Director)

1. **One shared engine**, not a 7th poll silo. (MyJKKN already has ~6 poll/pulse systems.)
2. **Surfaces:** induction session (done) + regular class session + CDC (learner) training + HR (staff) training.
3. **Both classes and training** in scope.
4. **App-based join** — audiences are already known to the app (section students, enrolled trainees, freshers). **No QR/join-code.**
5. **Regular classes:** *upgrade the existing Live Pulse Check in place* (PR #1626, session-feedback module) to use the rich engine — it must **keep feeding the session-feedback loop**.

## Current state (from production sweep, 2026-07-04)

- **Engine (to generalize):** `induction_session_poll`, `_question`, `_option`, `_vote` + RPCs; UI = `session-poll-dialog.tsx` (builder), `session-poll-presenter.tsx` (projector), `session-poll-banner.tsx` (learner), `use-induction-poll-realtime.ts` (already generic), `induction-poll-service.ts`.
- **`induction_session_poll` columns:** id, **session_id**, **event_id**, institution_id, status, issued_at, auto_close_at, created_by, created_at, updated_at, current_question_id. Only `session_id`/`event_id` are induction-specific.
- **Resolvers (the pattern to replicate per context):**
  - `_fn_induction_can_manage_session_pulse(session_id)` → is_speaker OR coordinator OR admin.
  - `_fn_induction_learner_can_answer_poll(poll_id, learner)` → learner ∈ `induction_enrollment` for the poll's event.
- **Regular classes** already have a poll: **#1626 "Live Pulse Check"** (session-feedback module, `session_feedback` keyed by `(timetable_id, period_id, section_id)`), but it's a simple 10s-refresh feedback pulse — NOT word-cloud/scale/realtime. **Upgrade target.**
- **Training already exists:** CDC (`cdc_training_programmes`, `cdc_training_enrollments`), HR (`hr_training_sessions`, `hr_training_enrollments`), plus SH/health. Not net-new.
- Other poll systems (ai-pulse, meetings, learners-council, parent) are out of scope (future Phase D consolidation).

## Target architecture

A poll is owned by a **context** instead of an induction session:

- `context_type text` ∈ `{ 'induction_session', 'class_session', 'cdc_training_session', 'hr_training_session' }`
- `context_id uuid` — the id within that context (event_session id / class-session key / training session id).

Two **dispatcher** functions route by `context_type` to per-context implementations:

- `fn_live_poll_can_manage(context_type, context_id) → boolean`
- `fn_live_poll_can_answer(context_type, context_id, learner) → boolean`

Every existing induction RPC's authorization calls are replaced by these dispatchers. The word-cloud/scale/realtime/anonymity logic is **unchanged** — it never depended on the context.

### Per-context resolvers

| Context | can_manage | can_answer (audience) |
|---|---|---|
| induction_session | existing `_fn_induction_can_manage_session_pulse` | existing `_fn_induction_learner_can_answer_poll` |
| class_session | the period's assigned facilitator (timetable/period/section + staff planning) | students in the section (section enrollment) |
| cdc_training_session | the training's trainer | `cdc_training_enrollments` for that programme/session |
| hr_training_session | the training's trainer | `hr_training_enrollments` for that session |

`class_session` context_id: a synthetic key over `(timetable_id, period_id, section_id)` — resolve via a lookup row or a composite-encoded id (finalized in Phase B).

## Phasing

### Phase A — Generalize the engine (foundation, 1 migration PR + service rename)
- **DB (evolve in place, no risky renames):** add `context_type text NOT NULL DEFAULT 'induction_session'` and `context_id uuid` to `induction_session_poll`; backfill `context_id = session_id`; keep `session_id`/`event_id` (nullable for non-induction). Add a `live_poll` **view/alias** for the new generic name.
- Add `fn_live_poll_can_manage` / `fn_live_poll_can_answer` dispatchers (induction branch only for now).
- Rewire the changed RPCs (`fn_induction_*`) to call the dispatchers. **No behavior change for induction.** All anon-locks preserved.
- **Migration safety:** forced-rollback dry-run; live vote test; impersonation matrix must still pass for induction. Existing induction polls must be byte-for-byte unaffected in behavior.

### Phase B — Regular classes (upgrade the Live Pulse Check)
- Add `class_session` branch to both dispatchers.
- **Loop-preservation contract:** the upgraded in-class poll MUST continue writing whatever the session-feedback loop consumes from #1626 (identify the exact write in Phase B before touching it). Do NOT break the feedback loop.
- Surface the rich builder/presenter in the facilitator's class/attendance flow; learners see it in their class view.

### Phase C — Training (CDC + HR)
- Add `cdc_training_session` + `hr_training_session` branches.
- Surface the poll on each training-session page; audience from the respective enrollments.

### Phase D — (later, separate program) Consolidation
- Fold ai-pulse / meetings polls into the shared engine.

## Risks & contracts

- **R1 — live induction poll migration (Phase A):** the poll tables carry a live 435-student session. Migration must be additive + dry-run-proven; induction behavior unchanged.
- **R2 — session-feedback loop coupling (Phase B):** #1626 feeds the loop. The upgrade must preserve that write. Map it before editing.
- **R3 — per-context anonymity/RLS:** the k≥3 floor and the realtime private-channel receive policy must be re-derived per context (each context's `can_answer` gates the realtime subscribe). No cross-tenant / cross-section leakage.
- **R4 — fragmentation:** every future fix lands once (shared engine). This is the whole point — do not fork.

## Definition of done (per phase)
- Phase A: induction polls behave identically; dispatchers live; dry-run + live-vote + impersonation matrix green; PR merged + deployed + verified.
- Phase B/C: a facilitator can build + open a word-cloud/scale poll on a real (draft) class/training session; audience resolves correctly; anonymity floor holds; loop preserved (B).
