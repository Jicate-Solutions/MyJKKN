# Session Feedback — honesty fixes (Rank 1)

**Date:** 2026-07-24
**Author:** Director interview 2026-07-23/24 (verbatim decisions), built by Claude
**Status:** spec → build → Draft PR (Director reviews; never self-merge/deploy)
**Module:** `app/(routes)/academic/session-feedback/` (the Senior Learners' page) + the understanding-band SoT + its 3 AI copies

---

## Why

The Director screenshotted the Senior Learners' Session Feedback page and found the labels
contradicted reality. Root causes (from prod data, 2026-07-23):

1. **Band mislabels good teaching.** Individual `understood` answers are 4 or 5 in
   **83%** of rows; per-session average is **4.12**; yet the "Strong" band started at
   **≥4.5**, so only ~16% of sessions cleared it and **~84% read "Mixed."** Senior Learners saw
   "0 of N Strong" though teaching is genuinely fine. This is a *labels* bug, not a
   teaching problem.
2. **The completion banner lies.** "All your sessions are complete" renders whenever
   zero sessions carry the hard-gate `incomplete` status — but Overdue/Open sessions
   (pending feedback, past or inside window) are a *different* status, so the banner
   claimed "all complete" while the table below showed 4/6 Overdue/Open.
3. **Tiny samples count.** Sessions with 0–2 responses were folded into the summary
   tallies, so a 0-response session read as "zero low understanding" and a 1-response
   "5" read as a Strong session.
4. **Blended praise over a zero.** The single "Here's what's working — you've had a
   good run" card could fire even with zero Strong sessions.

## Decisions (locked — do not re-litigate)

| # | Decision |
|---|----------|
| B1 | Completion banner shows the **real pending count**; says "all complete" only when truly no session has pending learners. |
| B2/D3 | Exclude sessions with **< 3 responses** from every understanding tally (reuse the module-wide k≥3 floor). A 0-response session never counts as "zero low understanding." |
| D1 | Recalibrate the understanding band: **< 3 Low · 3–<4.0 Mixed · ≥4.0 Strong** (was ≥4.5). Cross-surface — applied to the `understandingLevel` SoT **and** all 3 `understandingBandWord` AI copies in lockstep. |
| D2 | **Honest-first** summary tone: no "good run"/"here's what's working" when 0 courses are Strong. State the real picture + a concrete next step. |
| D4 | Replace the single blended verdict with a **per-course breakdown** — each course's own band; courses with no qualifying feedback shown "no feedback yet". **Bands only, never raw averages** (Director 2026-07-06, Goodhart). |
| D6 | Auto-close overdue sessions after ~3–5 days with whatever came in. **Split to its own PR** (needs a completion migration + cron). Not in this PR. |

## Band recalibration — blast radius & the STANDOUT decoupling

`understandingLevel(avg)` is the single source of truth. **9 consumers** import it:
the Senior Learners' page, principal page, admin page, feedback-confirmation tab, followup-cell,
scf-leadership-concerns-card, facilitator-strengths-card, my-loop-notes-card,
verdict-at-next-class-card. Changing the one function moves the label on **all** of
them at once (HOD dashboard + principal + admin included) — this is the intended
"fix bands EVERYWHERE at once" behaviour.

**Expected shift:** ~16% → ~65% of sessions move from "Mixed" to "Strong" platform-wide.
This is the point (it stops mislabelling genuinely-fine teaching), but it is a visible
change on leadership dashboards — flagged in the PR.

**Decoupling (important):** the cron `scf-generate-suggestions` uses a *separate*
constant `STANDOUT_THRESHOLD = 4.5` to decide whether to generate a **success** note
vs an **improvement** note. That is a note-volume/cost control, NOT a display band.
This PR moves the **display** band to 4.0 but leaves `STANDOUT_THRESHOLD` at 4.5.
Consequence: a 4.0–4.5 session now shows **"Strong"** but can still receive a *gentle*
improvement note if learners left ≥2 genuine concerns (never a hard contradiction — an
improvement note for a strong class reads "class largely understood; one small
refinement"). If the Director wants success notes to also start at 4.0, that is a
one-line follow-up (raises note volume + Claude cost ~4×).

## Files touched

- `components/session-feedback/understanding-band.tsx` — `understandingLevel` band boundary 4.5 → 4.0 + doc comment.
- `lib/ai-tasks/registry.ts` — `understandingBandWord` 4.5 → 4.0 + comment.
- `app/api/academic/session-feedback/ai-suggest-improvement/route.ts` — `understandingBandWord` 4.5 → 4.0 + comment.
- `app/api/cron/scf-generate-suggestions/route.ts` — `understandingBandWord` band boundary decoupled from `STANDOUT_THRESHOLD`, 4.5 → 4.0 (STANDOUT stays 4.5) + comment.
- `app/(routes)/academic/session-feedback/faculty/page.tsx` — B1 banner honesty; B2/D3 ≥3 floor; D2/D4 replace `FacultyRewardCard` with a per-course honest band summary; suppress the band in the per-session table for < 3 responses.

No DB migration in this PR (D6, the only DB change, is deferred).

## JKKN terminology (zero-tolerance in new copy)

New copy uses **learners**, **sessions**, and **courses** — never the legacy terms.
"mark"/"marks" stays (DOMAIN_EXEMPT). Existing identifiers grandfathered.

## Verification (Build Depth Gate)

1. Scoped `tsc` on the touched files — green.
2. JKKN terminology delta-gate on new copy — green.
3. **Render-as-Senior-Learners proof** (admin-mint on a jicate/main worktree dev server, real
   service-role key): the summary states the truth (no praise over 0 Strong), per-course
   bands render, a session with < 3 responses is excluded/suppressed, and after D1 a
   genuinely-4.1 course reads "Strong."
4. Flip Draft → Ready so CI attests (draft PRs skip all real gates).
