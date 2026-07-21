# SCF Struggling-Student Note — Self-Improving Safety-Review Loop

**Status:** SPEC (awaiting sign-off — nothing built)

> ## 🔴 DIRECTOR DECISION — 2026-07-19 22:20 IST (Omm, via AskUserQuestion, fully informed)
>
> **"Fix the writer first."** Chosen over "human triage as-is" and "bulk approve" (bulk approve explicitly rejected).
>
> **Evidence the decision was made on** (shadow judge, live prod data at decision time): 319 notes judged →
> **0 auto_safe** / 308 needs_human / 11 likely_unsafe. Flags: `hallucinated_specifics` 309 (97%),
> `pii_leak` 74 (notes name mentors), `inaccurate_to_signal` 60. Backlog: 1,135 draft / 3 approved / 0 rejected;
> 702 drafts stale ≥2 weeks (week_of 2026-07-06), 433 from week_of 2026-07-13.
>
> **What this means for execution (sequence amendment to this spec):**
> 1. **Pause approvals** — reviewers should NOT work the current queue; most of it is fabricated-content rejects.
>    ⚠️ Includes parking the daily super-admin approval reminder (PR #2115 ai-tasks-sweep tail) or letting it go
>    quiet naturally once drafts leave `status='draft'` — decide in the build.
> 2. **Tighten the note-writer** (`app/api/cron/scf-learner-notes` prompt): forbid invented specifics
>    (dates, ratings, session details not in the input signal) and forbid naming any person. The judge's
>    flag taxonomy is the acceptance test: regenerated notes must stop tripping `hallucinated_specifics`/`pii_leak`.
> 3. **Archive the stale 1,135** — ⚠️ `scf_learner_notes.status` CHECK allows only draft/approved/rejected;
>    archiving needs either CHECK widening (do the full TS-union sweep per
>    `feedback_db_check_widening_needs_ts_union_sweep`) or a separate marker column. Never delete — it's the
>    judge's training corpus.
> 4. **Regenerate for CURRENT strugglers only**, judge re-screens (shadow cron #2183 is live), THEN resume
>    the graduated-judge plan (PR-3 measure, PR-4 graduate) on the clean corpus.
>
> Writer-fix precision note: the judge-clean-rate on regenerated notes is the counter-metric that proves the
> writer fix worked — pair it, don't just eyeball samples.
**Date:** 2026-07-19
**Domain:** `academic/session-feedback` (SCF loop)
**Owner:** _TBD (student-wellbeing owner)_
**Related:** `specs/scf-freetext-carryforward-2026-07-19.md`, `project_selfimproving_bugfix_loop`, `project_faculty_appraisal_work_signals`

---

## 1. One-line

Replace the **super-admin-only** manual safety review of AI-written struggling-student notes with a **graduated self-improving loop**: an AI judge that learns from human approve/reject verdicts, auto-approves *only* the clearly-safe notes, and escalates everything uncertain to a (widened) human pool — so the human-review workload shrinks over time while safety is *measured*, never assumed.

## 2. Problem

- The `scf-learner-notes` cron drafts a **private, warm support message addressed to the student** ("you seem to be struggling — here's where to get help") into `scf_learner_notes` as `status='draft'`.
- A student sees it (`fn_scf_my_struggling_note`, `status='approved'` only) **only after a super-admin approves it** via `fn_scf_learner_notes_review`. The gate is a **content-safety review of an AI message to a possibly-vulnerable student** — it is correct that it exists.
- **The gate is set to the rarest role.** 1,135 drafts, **3 approved, 0 rejected** — the 1–3 super-admins for the whole institution cannot triage AI messages across 194 courses. The loop is stalled at its human gate.
- **The false binary:** "human reviews every note" (today, stuck) vs "no review" (unreviewed AI messages to struggling students — unacceptable). This spec dissolves it: the loop *learns to do the easy reviews* so humans only do the hard ones.

## 3. What exists today (build ON this — do not reinvent)

| Piece | What it is |
|---|---|
| `scf_learner_notes` | The notes table. Key cols: `learner_id`, `course_code`, `note`, `net_decline`, `week_of`, `status` (`draft`/`approved`/`rejected`), `approved_by`, `approved_at`, `reached_out`, `generated_at`. |
| `app/api/cron/scf-learner-notes/route.ts` | Generates drafts on the ₹0 Max lane (job type `scf.learner_notes`). |
| `fn_scf_learner_notes_review(p_ids uuid[], p_action text)` | **The label source.** `is_super_admin()`-gated; `approve`→`approved`, `reject`→`rejected`; records `approved_by`=reviewer, `approved_at`. Only touches `status='draft'`. |
| `fn_scf_learner_notes_pending()` | The admin approval-queue read. |
| `fn_scf_my_struggling_note()` | Student reads their own `approved` note. |
| `fn_scf_struggling_notes_sent()` | Leadership roster (principal/dean/inst-admin/super only; **wording never returned**; HOD/faculty excluded). |
| `app/(routes)/admin/learner-notes/*` | `SuperAdminOnly` approval-queue UI + `learner-notes-approval-queue.tsx` + API route. |
| AI job lane | `fn_ai_enqueue_system` / `fn_ai_enqueue` → generic Max-lane drain → `fn_ai_job_status`. Judge precedents: `scf.judge_help_ask`, `bug.reverify` (strict-JSON, recommendation-only, `interactive=false`). |
| `loop_registry` | Registry of self-improving loops: `loop_key`, `loop_class`, `gates` jsonb (4-gate pattern), `is_active`. |

## 4. Goal & success criteria (verifiable)

1. **Human-review fraction falls** across cycles **while** the **precision of auto-approval stays above a safety floor** (measured on an ongoing human spot-check sample).
2. A **2-cycle live proof** (§10) that the *next* auto-approval threshold changes **because** the prior cycle's human verdicts measured the previous threshold's real precision against a baseline — i.e. a *verified* self-improving loop, not a self-reinforcing echo.
3. **Zero unreviewed AI messages reach students** except those in a class the loop has *earned* auto-approve on (met the graduation gate), and even those are **logged and spot-checked**.

## 5. Non-goals / hard constraints

- **Do NOT change the note's audience.** It remains a student-facing support message. (Routing-to-teacher was considered and rejected in favour of keeping the human-review design but automating it.)
- **Do NOT remove human review.** The loop *reduces* it; humans always own the hard cases + spot-checks + the kill-switch.
- **The judge may auto-APPROVE only. It may NEVER auto-REJECT / auto-suppress.** Suppressing a note about a genuinely struggling student can deny help — a "looks unsafe" verdict routes to a human *fast* (priority), it never silently drops the note.
- **Crisis carve-out:** any note whose content or underlying free-text signals crisis / self-harm / safeguarding is **hard-escalated to a human counselor immediately**, never auto-approved, never queue-aged.
- **No change** to the faculty-appraisal metric work (M4/M12 — already applied & verified), the work-signals spine, or any cross-app source.
- New RPCs follow the MyJKKN lock rule: `REVOKE EXECUTE … FROM anon, PUBLIC; GRANT … TO authenticated;` and SECDEF where they read across learners.

## 6. Architecture

```
scf-learner-notes cron ──drafts──► scf_learner_notes(status='draft')
        │
        └── enqueues ─► ai job:  scf.note_safety_judge  (interactive=false, Max lane, strict JSON, recommendation-only)
                                   │
                                   ▼
                         scf_note_judgements  (judge prediction + confidence + flags, per note)
                                   │
        ┌──────────────────────────┼───────────────────────────────┐
        ▼ (auto_safe & earned)      ▼ (needs_human / any flag)       ▼ (crisis flag)
   auto-approve (logged)      human review queue (widened pool)   IMMEDIATE counselor escalation
        │                          │  fn_scf_learner_notes_review(...)
        │                          ▼
        └────────► human verdicts (approve/reject + reviewer) ──► LABELS ──► recalibrate judge threshold
                                                                             (the improvement signal)
```

### 6.1 Judge job — `scf.note_safety_judge`
- New `ai_job_types` row: `interactive=false`, Max lane, **recommendation-only** (never mutates note status by itself).
- **Input:** the draft `note` text + minimal context (`net_decline`, `course_code`, generic "struggling" flag). No new human sees the wording; the judge is an internal safety check.
- **Output (strict JSON):**
  ```json
  {
    "verdict": "auto_safe" | "needs_human" | "likely_unsafe",
    "confidence": 0.0-1.0,
    "safety_flags": ["crisis","hallucinated_specifics","alarming_tone","inaccurate_to_signal","pii_leak", ...],
    "reasons": ["<=12-word rationale", ...]
  }
  ```
- Enqueued by the generation cron immediately after each draft is persisted (`fn_ai_enqueue_system`).

### 6.2 New table — `scf_note_judgements` (audit + label pairing)
```sql
CREATE TABLE public.scf_note_judgements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid NOT NULL REFERENCES public.scf_learner_notes(id) ON DELETE CASCADE,
  verdict       text NOT NULL,                 -- auto_safe | needs_human | likely_unsafe
  confidence    numeric NOT NULL,
  safety_flags  jsonb NOT NULL DEFAULT '[]',
  reasons       jsonb NOT NULL DEFAULT '[]',
  model         text,
  threshold_ver text,                          -- which calibration produced the auto-decision
  auto_approved boolean NOT NULL DEFAULT false,
  human_action  text,                          -- approve|reject|null (filled when a human decides)
  human_by      uuid,
  human_at      timestamptz,
  agreed        boolean,                        -- judge auto_safe == human approve (shadow metric)
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- RLS: no anon; SECDEF read RPC for reviewers/leadership only.
```
`agreed` is the atom the loop learns from: it pairs each judge prediction with the eventual human decision.

### 6.3 Widen the reviewer gate (Phase 0 label engine)
- Change `fn_scf_learner_notes_review` gate from `is_super_admin()` to `is_super_admin() OR user_has_permission('scf.notes.review')`.
- Grant `scf.notes.review` to student-wellbeing roles (counselors, principals/deans — **owner decides the exact set**, §12).
- This both **clears the 1,135 backlog** and **generates the labels** the judge needs. Widening reviewers is not a competing option — it is Phase 0.

## 7. The graduated phases (never a hard "no review")

| Phase | Behaviour | Exit gate → next phase |
|---|---|---|
| **0 — Bootstrap** | Widened human pool reviews all notes. Judge does **nothing** yet. | ≥ **N₀ human verdicts** accumulated (target: ≥150 approves + a meaningful reject count) across ≥ M courses. |
| **1 — Shadow** | Judge predicts on every draft (stored in `scf_note_judgements`); **humans still decide everything**. Measure `agreed`. | Judge `auto_safe` predictions show **≥ P_floor precision** vs human-approve **and** judge caught ≥ R_floor of human-rejects, on a **held-out** sample. |
| **2 — Graduated** | Judge **auto-approves only `auto_safe` & confidence ≥ T**, per-class, once that class cleared the gate. Everything else → humans. **K% of auto-approved is sampled for human spot-check.** | Ongoing. Auto-approve fraction rises **only while** spot-check precision ≥ P_floor; drops below → **auto-pause** (kill-switch). |

- `P_floor`, `R_floor`, `T`, `K`, `N₀`, `M` are **owner-set safety parameters** (§12) — the spec fixes the *mechanism*, not the numbers.
- **Crisis flag overrides every phase** → immediate human counselor, never auto.

## 8. Safety controls (non-negotiable)

1. **Auto-approve only; never auto-reject.** (Asymmetry: a slightly-off message reaching a student is caught by spot-check; a suppressed note denies a real struggling student help.)
2. **Crisis carve-out** — hard human escalation, priority queue, no aging.
3. **Ongoing spot-check** of auto-approved notes; precision below floor → auto-pause (kill-switch), revert that class to full human review.
4. **Full audit trail** — every auto-approval logged in `scf_note_judgements` with the threshold version that made it; leadership can see *what was auto-approved and why*.
5. **Conservative default** — unknown/low-confidence/any-flag ⇒ human. The judge widens autonomy only where it has *earned* it per class.
6. **Kill-switch** — a single `loops.scf_note_safety.mode` config row (`off|shadow|graduated`) that instantly reverts to full human review.

## 9. `loop_registry` registration

> ⚠️ **AMENDED 2026-07-19 22:40 IST (loop-graph audit, Director-approved):** this loop is **already registered** as
> `loop_key='scf-note-safety'` (kebab, matching live registry conventions; domain `'academic'` matching the existing
> `scf` row — NOT `'session_feedback'`, and NOT the snake_case key below). Current row: `loop_class='intake'`,
> all 4 gates `"off"`, `owner_email='aieee@jkkn.ac.in'`, honest starting state. **PR-3 must `UPDATE` this row**
> (loop_class, gates, routine_id) — do NOT `INSERT` a new key (duplicate fork) and do NOT use
> `ON CONFLICT DO NOTHING` (first-write-wins would silently discard PR-3's richer seed).
> Same applies to `scf-freetext-carry` (also registered 2026-07-19, same state).

Register ~~`loop_key='scf_note_safety_review'`~~ → **use the existing `loop_key='scf-note-safety'` row**, graduating `loop_class` to `'self_improving'` when earned, with the 4-gate `gates` jsonb (mirroring the bug-triage loop):
- **spec_built** — this document.
- **built_live** — judge job + `scf_note_judgements` + widened review live on prod.
- **live_walked** — a real cohort of notes went draft → judged → (human or earned auto) → student, end-to-end.
- **outcome_ledger** — `agreed` + spot-check precision accumulating; threshold recalibrated at least once from real labels.

## 10. The 2-cycle verification (moat-loop discipline — the proof it's a real loop)

The loop is only a moat if the **next auto-approve decision changes BECAUSE the prior outcome was measured against a baseline.** Prove it, live:

- **Baseline B:** with labels `L₀`, calibrate threshold `T₀`. On a held-out set it auto-approves fraction `F₀` at measured precision `P₀`.
- **Cycle 1:** run shadow/graduated; collect new human verdicts + spot-checks `L₁`. Re-measure `T₀`'s *real* precision on `L₁`.
- **Cycle 2:** recalibrate → `T₁`. **Assert `F₁ > F₀` (more auto-handled) with `P₁ ≥ P_floor`** — and that `T₁ ≠ T₀` **is caused** by `L₁` (feed the same notes through both thresholds; the decisions differ *only* because the measured precision moved the threshold).
- If `F` cannot rise without `P` falling below floor, the loop is **honestly reported as "labour-saving but capped"** — no silent over-claiming. (This loop's outcome signal is *human-agreement*, not a crisp real-world outcome; §11.)

## 11. Honest limitation (state it, don't paper over it)

Unlike the bug-fix loop (a fix is *verified* by reproduction), "was this message good for a struggling student" has **no clean, fast ground truth**. So the judge learns to **agree with human reviewers** — it automates the *labour* but is **only as good as those reviewers** and cannot catch a class of harm they would also miss. Consequence baked into the design: conservative thresholds, permanent spot-checking, humans keep every hard case, and the loop is reported as **self-reinforcing (labour-saving), graduating toward verified only as real outcome signals (student response, safeguarding flags) are added later.**

## 12. Open questions for sign-off (before any build)

1. **Reviewer pool** for `scf.notes.review` (Phase 0): counselors only? + principals/deans? + HODs? (Wider = clears faster + more labels; narrower = tighter privacy.)
2. **Safety parameters:** `P_floor` (auto-approve precision floor, e.g. 98%?), `K` (spot-check %, e.g. 20%?), `N₀` (labels before shadow), `T` (confidence cutoff).
3. **Crisis routing:** who is the immediate counselor recipient per college, and via what channel (in-app + notification)?
4. **Owner** of the loop (owner_email in `loop_registry`).

## 13. Build order (each a shippable PR via `/ship-myjkkn`)

1. **PR-1 (Phase 0):** widen `fn_scf_learner_notes_review` gate + `scf.notes.review` permission + grant UI/role. Clears backlog, starts labels. *(No AI yet.)*
2. **PR-2 (substrate):** `scf_note_judgements` table + RLS + read RPC; `scf.note_safety_judge` job type; cron enqueues judge per draft. *(Shadow: predictions stored, humans still decide.)*
3. **PR-3 (measurement):** agreement + spot-check dashboards; calibration job; `loop_registry` row + gates.
4. **PR-4 (graduate):** per-class auto-approve of `auto_safe`≥T with spot-check + kill-switch, once a class clears the gate.

Each PR is independently valuable and safe; the loop only earns autonomy at PR-4, and only per-class, and only above the precision floor.

---

**Bottom line:** this keeps the human safety review that should exist, unblocks the 1,135-note pile-up immediately (Phase 0), and lets an AI judge *earn* the right to handle the easy reviews — measured, auditable, reversible, and never at the cost of an unreviewed AI message reaching a vulnerable student.
