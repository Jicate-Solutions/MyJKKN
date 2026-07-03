# Induction Attendance — Back-Mark Guide for Coordinators

**Date:** 2026-07-03
**Program:** Fresher Induction 2026 — JKKN College of Arts and Science (Self), 435 freshers, ends 2026-07-08
**For:** the program's induction coordinators (currently Miss. P. Dheepika and Mr. T. Satheskumar)

---

## Why this matters (one paragraph)

A fresher **completes** induction only if their attendance is **75% or higher**. As of July 3,
**no attendance has been marked for any session** — days 1–5 (20 sessions) are all blank. If it
stays blank, every one of the 435 freshers fails completion automatically, and the program's
scorecard and NAAC evidence stay at zero — even though the freshers actually attended. Marking is
quick: about **one minute per day** using the bulk day button.

## How to back-mark a past day (1 minute per day)

1. Open **MyJKKN → Events → Induction → Fresher Induction 2026** (the sessions page).
2. Find the day's header row (e.g. **Day 1**) and click the **Mark day attendance** button on the right.
3. Click **Mark all present**, then change only the exceptions (Absent / Excused / OD).
   - If a learner already has different marks across that day's sessions, they show
     "Varies by session" — the day-mark won't overwrite a deliberate partial-day mark.
4. Click **Save**. One pass covers every session of that day for both batches.
5. Repeat for each pending day. A yellow banner at the top of the sessions list shows exactly
   which days are still pending. A day clears only when **every learner** on its roster has a
   mark (Present/Absent/Excused/OD all count) — so mark the absentees too, don't skip them.
6. **If a new fresher joins mid-program**, earlier days re-open on the banner — that's correct:
   completion counts every session against them too. Mark their pre-joining days (usually
   **Excused**) so they aren't failed for days before they arrived.

## The daily rhythm for the remaining days (until July 8)

- **Same day (best) or next morning:** open **Mark day attendance** for the day just finished,
  mark all present, adjust exceptions, save.
- Resource persons assigned to a session can also mark attendance for their own session.

## What this unlocks

- **Completion** for every fresher who genuinely attended (attendance ≥75% + profile complete).
- The **Scorecard** section fills in (participation by department and batch).
- **NAAC evidence** (criteria 5.1.3 / 7.2.1) can be recorded from real data.

---

*Technical note (for maintainers): the pending-days banner is driven by
`fn_induction_attendance_coverage` (read-only, coordinator/manager-gated), shipped alongside this
guide. Day marks fan out into the same `event_session_attendance` rows as per-session marking.*
