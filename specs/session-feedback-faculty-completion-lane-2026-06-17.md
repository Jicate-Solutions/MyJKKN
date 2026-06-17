# SPEC ADDENDUM — Session Feedback: Faculty Completion Lane (A) + Two-Sided Gate Switch (B)

| | |
|---|---|
| **Date** | 2026-06-17 |
| **Status** | 🟡 Spec for sign-off — extends the shipped substrate |
| **Parent spec** | `specs/post-class-feedback-attendance-gate-2026-06-15.md` |
| **Decision owner** | Director (Omm) |
| **Director decision (2026-06-17)** | Build **A (visibility)** now; wire **B (hard 100%)** as a policy flip "when needed" |

---

## 0. What's already shipped (do NOT rebuild)

From the parent spec (live in prod, verified 2026-06-17):

- Tables `session_feedback`, `session_feedback_checklist_config` (RLS on; 5 platform-default checklist items).
- RPCs `fn_scf_pending_for_learner`, `fn_scf_confirmation_status`, `fn_scf_submit_feedback`, `fn_scf_faculty_summary`, `fn_scf_principal_escalations`, `fn_scf_escalation_followups`.
- UI lanes: `/academic/session-feedback/{learn,me,faculty,principal}`.
- **Invariant (must be preserved):** we **never** mutate `student_attendance.attendance_data`. Confirmation is **derived** over a join, never written back to the faculty record.

### The gap this addendum fills
`fn_scf_faculty_summary` returns the **numerator only** — `responses`, `avg_understood`, `low_understanding` — grouped by session, matched on `faculty_email`. It never reads the **Present roster** (the denominator), so faculty cannot see *completion %* and cannot see *who is still pending*. A adds exactly that.

---

## 1. The decision being specified

Make the feedback loop **two-sided**: the faculty's session shows a **feedback-completion status** built from the students they marked Present. Two modes, controlled by one policy:

- **A — Visibility (build now, default):** faculty sees `confirmed / present (%)`, a per-session **Pending** badge, and the **list of who hasn't submitted** (names only). Nothing is blocked. The faculty's legal attendance record is untouched.
- **B — Hard 100% (flip later, per college):** the session is formally **Incomplete** until every Present student has submitted *within a window*; learner attendance treated as `present-pending` downstream. Still **no mutation** of `attendance_data` — "incomplete" is a derived status, and a faculty/principal override exists for genuine cases.

### Non-negotiable design guard (the trap to avoid)
> Do **not** void the faculty's official attendance record because a student didn't open the app. Faculty attendance is the legal teaching record. "Incomplete" is a *derived feedback-confirmation status layered on top*, never a change to what the faculty marked. One unreachable student must never erase a taught class.

---

## 2. The "who, but not what" split (core privacy rule)

The parent spec made feedback **content** anonymous to faculty. To chase 100%, faculty needs to know **who hasn't submitted** — but must never see **what** any student said.

| Faculty CAN see | Faculty CANNOT see |
|---|---|
| Completion counts: `22 / 30 confirmed (73%)` | Any individual `understood` score |
| **Names of NON-submitters** (so they can nudge) | Any `checklist` / `free_text` |
| Anonymized averages (existing `fn_scf_faculty_summary`) | Identity↔content linkage of submitters |

**Why this is safe:** the pending list contains only students who have submitted *nothing* yet — there is no content to leak. Once a student submits, they **drop off** the pending list (they never appear with their content).

**Known residual risk (accept for v1, note in UI):** in very small classes a faculty member watching the list shrink can infer "student X just submitted *something*" (not what). Content stays hidden. Mitigation (batch reveal / k-anonymity threshold) is a fast-follow if a college objects.

---

## 3. New RPCs (all SECURITY DEFINER, `SET search_path = public`, `REVOKE EXECUTE FROM anon, PUBLIC` + `GRANT TO authenticated`)

### 3a. `fn_scf_faculty_completion(p_from date, p_to date)` — coverage per session
Resolve caller faculty by `profiles.email` of `auth.uid()` (same as `fn_scf_faculty_summary`). For each session in `[p_from, p_to]` where the period's `assigned_faculty ->> 'faculty_email'` (case-insensitive) = caller email:

```
RETURNS TABLE (
  attendance_date date, timetable_id uuid, period_id text,
  course_code text, course_name text,
  present_count int,          -- students[] with status='Present'
  confirmed_count int,        -- of those, with a session_feedback row
  pending_count int,          -- present_count - confirmed_count
  completion_pct numeric,     -- round(confirmed/present*100, 0); 0 when present=0
  within_window boolean       -- now() <= session_end + window_hours (see §5)
)
```
Compute `present_count`/`confirmed_count` over `jsonb_array_elements(period.value->'students')` joined to `session_feedback` on `(student_id, attendance_date, period_id)`. Read window_hours via `fn_get_policy_int('session_feedback.window_hours', <institution_id>)`.

### 3b. `fn_scf_faculty_pending_roster(p_attendance_date date, p_timetable_id uuid, p_period_id text)` — who hasn't submitted
1. **Authorize:** the caller MUST be the assigned faculty for that exact `(date, timetable_id, period_id)` (`assigned_faculty ->> 'faculty_email'` = caller email). Else `RAISE EXCEPTION 'not the assigned faculty'`.
2. Return one row per Present student **without** a `session_feedback` row:
```
RETURNS TABLE ( student_name text, register_number text )   -- identity ONLY
```
Resolve name/register_number from `learners_profiles` where `learners_profiles.id = (students[] ->> 'student_id')::uuid`.
3. **Hard rule:** this RPC must select **zero** columns from `session_feedback` and never join to feedback content. Submitters are excluded by `NOT EXISTS (... session_feedback ...)`.

> Keep `fn_scf_faculty_summary` as-is — it is the **quality** signal (anonymized averages). Completion (3a) is the **coverage** signal. Two different questions, two RPCs.

---

## 4. Policy switch (uses the real `platform_policies` mechanism)

Seed via migration (platform-default scope, plus optional per-institution overrides). Read with the existing `fn_get_policy_*` helpers.

| policy_key | data_type | enum_options | default | read with |
|---|---|---|---|---|
| `session_feedback.gate_mode` | text | `["off","visibility","hard"]` | `visibility` | `fn_get_policy_text('session_feedback.gate_mode', inst)` |
| `session_feedback.window_hours` | int | — | `48` | `fn_get_policy_int('session_feedback.window_hours', inst)` |

- `off` → feature dark for that institution.
- `visibility` (**A**, default) → completion + roster visible; **nothing blocks**.
- `hard` (**B**) → faculty session derived-status = `Incomplete` until `pending_count = 0` within window; learner attendance treated `present-pending` in downstream attendance-% reads. Override (faculty/principal) marks remaining pending students `excused` for completion math — recorded in a small `session_feedback_completion_overrides` table (`session key`, `student_id`, `reason`, `by`, `at`), **never** touching `attendance_data`.

Set `ui_widget`/`ui_category`/`ui_consequence` on the policy rows so they render in the policy admin UI (matches existing rows like `admission.form_abandon.*`). **B ships dark behind `gate_mode` — flipping a college to `hard` is a config change, no deploy.**

---

## 5. Safety valve (makes "100%" achievable)

- **Window:** feedback due within `window_hours` (default 48) of session end. After the window, `within_window=false`; in mode `hard` the session escalates instead of blocking forever.
- **Override:** faculty/principal can mark specific Present students `excused` (withdrawn, hospitalised, device lost). Completion math = `confirmed / (present − excused)`. So "100%" means *100% of reachable students in the window*, not an impossible absolute.

---

## 6. UI changes (extend the existing faculty lane — do not add a new module)

`app/(routes)/academic/session-feedback/faculty/page.tsx`:
- Add a **Completion** view alongside the existing quality summary. Per-session row: course · date · `22/30 confirmed (73%)` · status badge (`Complete` / `N pending` / `Incomplete` in mode `hard`).
- Row action **"View pending"** → drawer listing non-submitters (name + register number) with **Copy list** (and, later, a nudge/notify action). Caption: *"You can see who hasn't submitted — not what anyone said."*
- Badge styling reads `gate_mode`: informational under `visibility`, escalated under `hard`.
- New hook `useFacultyCompletion(from,to)` + `useSessionPendingRoster(...)` in `hooks/use-session-feedback.ts`; service methods in `lib/services/session-feedback-service.ts`; types in `types/session-feedback.ts`.

---

## 7. Build order & acceptance (goal-driven)

1. **Migration** (`supabase/migrations/<ts>_session_feedback_faculty_completion.sql`): RPCs 3a/3b, `session_feedback_completion_overrides` table (RLS on), policy seed rows, grants/revokes, `NOTIFY pgrst, 'reload schema';`. Update `supabase/SQL_FILE_INDEX.md`.
2. **Service/hooks/types**, then **faculty UI** Completion view + pending drawer.
3. Ship via `/ship-myjkkn` → deploy → verify.

**Acceptance (must verify live, not just CI):**
- For a real faculty session, 3a's `present/confirmed/pending` match the attendance blob and `session_feedback` exactly.
- 3b returns **only** non-submitter identities; a non-assigned faculty caller is denied; **no** content column is ever returned.
- `gate_mode`/`window_hours` resolve per institution via `fn_get_policy_*`; flipping `gate_mode` to `hard` changes only derived status (attendance_data byte-identical before/after).
- Default everywhere = `visibility`. Pilot the 3 active colleges (Dental, Pharmacy, Allied Health), watch completion %, escalate to `hard` per college only when it stalls.

---

## 8. Rollout sequence
1. Build A (default `visibility`) → soft-launch the 3 colleges already marking attendance.
2. Measure real completion % over 1–2 weeks.
3. Flip `session_feedback.gate_mode = hard` per college (config, no deploy) = **B**, only where completion stalls below target.
