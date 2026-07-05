# Faculty-Feedback → Exam-Eligibility Link — BUILD SPEC

**Date:** 2026-07-05
**Status:** APPROVED for build (8 decisions locked via 2-round Director interview 2026-07-05).
**Precondition already LIVE:** `session_feedback.gate_mode='hard'` + `attendance_coupling_enabled=true` (global), flipped 2026-07-05 03:47 UTC. See `project_d2_faculty_gate_flipped_live_2026_07_05` memory.
**Legal:** Director states legal is cleared (the R2 gate in `faculty-engagement-adoption-2026-07-04.md`).

> All production facts read via `git show jicate/main:<path>` + Supabase Mgmt API. omm-dev is stale.

---

## Locked decisions (the policy)

| # | Decision | Value |
|---|----------|-------|
| 1 | Attendance confirms only when learner submits feedback | LIVE (gate=hard) |
| 2 | Student present but can't submit (dead phone/app down) | **No exceptions** — no override, no kiosk fallback |
| 3 | Does missing feedback affect exam eligibility? | **Yes — build the real consumer** |
| 4 | Effective window | **Forward-only from `enforcement_start_date` = 2026-07-05.** Pre-rule classes never count |
| 5 | Pass line | **75% of CONFIRMED attendance** (reuse the existing consolidation 75% line) |
| 6 | Settle-in | **Eligibility can only be affected once the learner has ≥ 10 counted class-marks** (present+absent) in-window. Below that = "not enough data", never flagged |
| 7 | Learner transparency | **Yes** — learner sees their own confirmed % + an early warning as they approach 75% |
| 8 | Action when below line | **Advisory** — surfaces in the attendance consolidation report + learner view; a human decides detention/condonation. **NOT an automated exam block** |

---

## Two builds

### BUILD 1 — Forward-only scoping of the LIVE hard gate (urgent; fixes a live inconsistency)

**Problem:** `fn_scf_faculty_completion` computes `session_status` over the caller's window (faculty page uses last-30-days). Under the now-live `gate=hard`, PAST (pre-2026-07-05) sessions are marked **`incomplete`/`overdue`** (red) on faculty pages — contradicting decision #4 and confusing faculty with red on classes taught before the rule existed. Faculty-facing only (no student impact yet), but visible now.

**Fix:**
1. New policy row `session_feedback.enforcement_start_date` (string date, default `'2026-07-05'`, global; institution-overridable) via `platform_policies`. Guard it with the SAME super-admin trigger family? — NO (it's not a live-toggle kill-switch); a normal super-admin-writable policy is fine. Add to `lib/policies/keys.ts`.
2. In `fn_scf_faculty_completion`, resolve `v_start := fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05',institution)::date`, and change the status CASE so a session with `attendance_date < v_start` can NEVER be `incomplete`/`overdue`:
   ```
   CASE
     WHEN d.pending_ct <= 0                          THEN 'complete'
     WHEN d.attendance_date < v_start                THEN 'open'   -- pre-rule: neutral, never red
     WHEN d.gmode = 'hard' AND d.win                 THEN 'incomplete'
     WHEN d.win                                      THEN 'open'
     ELSE                                                 'overdue'
   END
   ```
   (Pre-rule pending sessions render as neutral "Open", not red. `hardActive`/`incompleteCount` on the faculty page then only count in-scope sessions.)
3. Verify via impersonation: a faculty with pre- and post-2026-07-05 pending sessions → pre-rule ones are NOT `incomplete`.

**Files:** `supabase/migrations/<ts>_scf_enforcement_start_date.sql` (policy seed + `CREATE OR REPLACE fn_scf_faculty_completion`), `lib/policies/keys.ts`. Apply via Mgmt API (deploy ships code not migrations).

### BUILD 2 — The exam-eligibility consumer (the "real link")

Wire the confirmed-attendance % into the advisory eligibility surface, scoped + floored per decisions #4–#8.

**2a. RPC floors** — extend `fn_scf_effective_attendance` (keep signature; additive):
- **Forward-only:** floor `p_from` to `max(p_from, enforcement_start_date)` so pre-rule marks never dilute the effective %.
- **Settle-in (#6):** add `total_marks = present_marks + absent_marks` to the output (already computable); the CONSUMER treats `total_marks < 10` as "insufficient data → not flagged" (do NOT hide the row; show "building…"). Keep the raw compute in the RPC; the 10-floor is a *display/flag* rule so the number stays inspectable.
- Coupling flag already `true` (live). Server-side dark-gate (returns 0 rows when off) stays.

**2b. Consolidation report (advisory surface, #8)** — `app/(routes)/academic/attendance/consolidation/[id]/` + its service:
- Add a **"Confirmed attendance %"** column beside the existing official %, fed by `getEffectiveAttendanceCoupling` (already exists, currently uncalled).
- Apply the **75% line (#5)** to the confirmed % as a **FLAG** (badge: OK ≥75 / At-risk <75 / Building <10 marks). No auto-block; the existing human detention/condonation flow is unchanged.
- Forward-only + ≥10 floor honored via 2a.

**2c. Learner-facing view + warning (#7)** — the learner attendance surface (`app/(routes)/learners/` My-Attendance / `learners/class-feedback`):
- Show the learner their own **confirmed %** and a plain-language line: "X of your Y classes are confirmed. Give quick feedback after each class to keep this up."
- **Early warning** when confirmed % is within a margin above 75% (e.g. 75–80%) or below: "Your confirmed attendance is close to the 75% line — submit pending feedback." Reuse the existing pending-feedback nudge plumbing where possible.

**2d. NOT in scope (explicit):** no automated exam block / hall-ticket gating; no mutation of `student_attendance` (derivation stays read-only/recomputable); no per-student override (decision #2).

---

## Rollout / safety
- Break-glass rollback of the whole thing = the 2 policy writes in `project_d2_faculty_gate_flipped_live_2026_07_05` (gate→visibility, coupling→false). Build 1/2 code is inert when gate=visibility.
- Day-one watch on `bug_reports` (feedback/attendance keywords) is running.
- Faculty heads-up note drafted (Director sends).

## Verify-by
- Build 1: impersonation shows pre-2026-07-05 pending sessions are never `incomplete`; post-rule ones are.
- Build 2: consolidation report shows Confirmed % column with correct 75%/≥10 flags scoped forward-only; a learner sees their own % + warning; no `student_attendance` write; no auto-block path exists.
