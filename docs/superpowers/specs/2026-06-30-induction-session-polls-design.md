# Induction Session Polls — Design Spec

- **Date:** 2026-06-30
- **Module:** Events → Induction (`app/(routes)/events/induction`, `lib/services/induction`)
- **Status:** Approved design, pending implementation plan
- **Author:** Boobalan + Claude (brainstormed)

## 1. Goal

Let an induction session host (credited resource person, coordinator, or admin)
attach an **opinion poll** to an individual session. Enrolled freshers of that
session's batch answer it; the host watches **live, anonymized vote tallies** in
the session details. Polls are dynamic — the host builds any number of questions,
each with its own options.

This mirrors the existing **Live Pulse** feature (`induction_session_pulse`),
extending it from a fixed 1–5 rating to host-authored questions/options with a
per-option live tally.

## 2. Confirmed decisions (from requirements Q&A)

| Decision | Choice |
|---|---|
| Poll type | **Opinion poll** — live vote tally, no correct answers, no scoring |
| Questions per poll | **Multiple** questions; **one poll per session** |
| Answer types | **Single-choice (radio)** and **multiple-choice (checkbox)** |
| Results privacy | **Anonymous totals only**, k≥3 floor (counts hidden until 3 answers) |
| Who answers | Enrolled freshers of the session's batch (same gate as feedback/pulse) |
| Who sees results | **Host only** (resource person / coordinator / admin) |
| UI home | A **"Poll" control on each session row** (next to Attendance) → build + open/close + live results in one dialog |

## 3. Non-goals (YAGNI)

- No quiz mode (no correct answers, no per-learner scores, no leaderboard).
- No free-text questions in v1 (choice-based only).
- No learner-facing results view (host-only; can be added later as a toggle).
- No cron — auto-close is lazy (evaluated on read), like Pulse.
- No new RBAC permission keys.

## 4. Data model

Four normalized tables, mirroring the `meeting_polls`/`lc_polls` convention plus
the pulse lifecycle. All `induction_session_poll*`.

```sql
-- One poll per session.
CREATE TABLE public.induction_session_poll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL UNIQUE REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id)        ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id)  ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  issued_at       timestamptz,                 -- set when first opened
  auto_close_at   timestamptz,                 -- issued_at + 240 min; NULL while draft
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.induction_session_poll_question (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id) ON DELETE CASCADE,
  prompt      text NOT NULL,
  kind        text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi')),
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ispq_poll ON public.induction_session_poll_question(poll_id, position);

CREATE TABLE public.induction_session_poll_option (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  label       text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ispo_question ON public.induction_session_poll_option(question_id, position);

CREATE TABLE public.induction_session_poll_vote (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id)          ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES public.induction_session_poll_option(id)   ON DELETE CASCADE,
  learner_id  uuid NOT NULL,             -- same learner identity as event_session_feedback.learner_id
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_id, learner_id)
);
CREATE INDEX idx_ispv_question ON public.induction_session_poll_vote(question_id);
CREATE INDEX idx_ispv_poll_learner ON public.induction_session_poll_vote(poll_id, learner_id);
```

**Privacy contract:** `learner_id` exists only to enforce one ballot per
learner per question and to allow changing an answer while open. It is NEVER
returned by the totals RPC. Totals are counts only, with a k≥3 floor.

**RLS:** all four tables get `ENABLE ROW LEVEL SECURITY` + a single
`super_admin`-only `FOR ALL` policy (support/debug). All real access flows
through the DEFINER RPCs in §6. `updated_at` touched by the existing
`induction_touch_updated_at` trigger on the poll table.

## 5. Lifecycle & edit rules

- **draft:** host builds questions/options; invisible to learners.
- **open:** `status='open'`, `issued_at=now()`, `auto_close_at=now()+240min`.
  Enrolled batch freshers see the prompt; votes accepted.
- **closed:** host closes early, OR lazy auto-close when `auto_close_at` passes
  (evaluated on every totals/learner read — no cron).
- **Edit safety:**
  - Zero votes → fully editable (add/remove/relabel/reorder anything).
  - Votes exist → may **add** questions/options and **relabel/reorder** existing
    ones (votes key on id, not text); **deleting** a question/option that has
    votes **raises** an exception (protects the tally).

## 6. RPCs

All `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`,
`REVOKE EXECUTE ... FROM anon, PUBLIC`, `GRANT EXECUTE ... TO authenticated`.
Host authorization reuses the existing
`public._fn_induction_can_manage_session_pulse(p_session_id)` (credited resource
person OR coordinator with `induction.manage` + institution access OR super/admin).

### Host
- `fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb) → uuid`
  Diff-upserts the structure. `p_questions` =
  `[{id?, prompt, kind, position, options:[{id?, label, position}]}]`.
  Inserts rows without `id`, updates rows by `id`, deletes omitted rows **iff**
  they have no votes (else RAISE). Creates the poll row (status `draft`) on first
  call. Returns poll id.
- `fn_induction_open_session_poll(p_session_id uuid) → induction_session_poll`
  Advisory-locked + idempotent (reuse an already-open poll). Requires ≥1 question.
- `fn_induction_close_session_poll(p_poll_id uuid) → induction_session_poll`
- `fn_induction_get_session_poll(p_session_id uuid) → jsonb`
  Full structure (questions+options ordered by position) + status + `has_votes`,
  for the builder and results header.
- `fn_induction_session_poll_totals(p_poll_id uuid) → jsonb`
  Live anonymized tally:
  `{ status, auto_close_at, enrolled_count, response_count, suppressed,
     questions:[{ id, prompt, kind, response_count,
                  options:[{ id, label, count, pct }] }] }`.
  `suppressed=true` (counts NULL) until poll `response_count` (distinct learners
  who cast ≥1 vote) ≥ 3 — k≥3 floor, mirroring pulse.

### Learner
Gate (all three): caller is a learner (`get_my_learner_id()`), enrolled in the
poll's event, session applies to their batch (`batch_id IS NULL OR = mine`), poll
`status='open'` and not past `auto_close_at`.
- `fn_induction_session_poll_for_learner() → TABLE(...)`
  My currently-open polls + `already_answered` (drives the banner). Mirrors
  `fn_induction_session_pulse_for_learner`.
- `fn_induction_get_poll_for_answering(p_poll_id uuid) → jsonb`
  Questions/options to render + `my_answers` (`{question_id: [option_id]}`) so a
  learner can review/change while open.
- `fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb) → void`
  `p_answers` = `[{question_id, option_ids:[...]}]`. Validates: poll open;
  `single` → exactly 1 option; `multi` → 0+; every option belongs to its
  question. Replaces the learner's prior votes for the submitted questions in one
  transaction (delete + insert).

`NOTIFY pgrst, 'reload schema';` at the end of the migration.

## 7. UI

### Host — `session-poll-dialog.tsx` (launched from each session row in `sessions-section.tsx`, beside `AttendanceDialog`)
One dialog, three jobs:
1. **Build:** question repeater (prompt + single/multi toggle + options repeater;
   add/remove/reorder). Saves via `fn_induction_upsert_session_poll`. Destructive
   edits disabled once `has_votes`.
2. **Open live / Close:** buttons calling open/close RPCs.
3. **Live results:** per-question horizontal bars (count + %), "n / enrolled
   answered", auto-refresh every 8s while open, k≥3 suppression message. Mirrors
   `SessionPulseControl` polling.

A small badge on the session row shows poll state (e.g. "Poll · live" / "Poll ·
24 answered").

### Learner — `session-poll-banner.tsx` + answer form under `learners/my-induction/_components/`
Mirrors `induction-pulse-banner`: lists my open polls → answer form (radio per
single question, checkboxes per multi) → submit → "Submitted — you can change
your answers while the poll is open." Rendered on `/learners/my-induction` and
`/my-induction-sessions`. No results shown to learners (host-only).

## 8. Code surfaces (file manifest)

| Layer | File |
|---|---|
| Migration | `supabase/migrations/<ts>_induction_session_polls.sql` (+ mirror to `supabase/setup/`) |
| Types | register 4 tables in `types/supabase.ts` |
| Service | `lib/services/induction/induction-poll-service.ts` (host + learner methods + types) |
| Host UI | `app/(routes)/events/induction/[id]/_components/session-poll-dialog.tsx`; wire button into `sessions-section.tsx` |
| Learner UI | `app/(routes)/learners/my-induction/_components/session-poll-banner.tsx` (+ answer form); mount in the my-induction page + `/my-induction-sessions` |

## 9. Permissions / RLS / grants

- **No new permission keys.** Host gate = `_fn_induction_can_manage_session_pulse`
  (uses `induction.manage` + speaker membership + super/admin). Learner gate =
  enrollment + batch. Both already exist.
- All RPCs `REVOKE FROM anon, PUBLIC` / `GRANT TO authenticated` (per the
  "lock new RPCs from anon" rule).
- Tables RLS-on, `super_admin`-only direct policy.

## 10. Edge cases

- Session `batch_id IS NULL` (Combined) → poll visible to all enrolled freshers.
- Deleting a session CASCADE-drops the poll and all questions/options/votes.
- One poll per session (UNIQUE `session_id`) — re-opening reuses the same poll.
- Re-submitting replaces prior votes (idempotent ballot).
- Lazy auto-close: a totals/learner read past `auto_close_at` flips status to
  `closed`.
- Empty poll (no questions) can't be opened (RPC raises).

## 11. Verification plan

- `mcp__ide__getDiagnostics` on each touched TS file (no full `tsc`).
- Apply migration; confirm 4 tables registered in `types/supabase.ts`.
- Manual: as a coordinator build a 2-question poll (1 single, 1 multi), open it;
  as an enrolled learner answer; confirm host live tally increments and stays
  suppressed below 3 responses; change a learner answer and confirm the tally
  updates; close and confirm learners no longer see it.
- Confirm a non-enrolled learner and a different-batch learner never see the poll.
