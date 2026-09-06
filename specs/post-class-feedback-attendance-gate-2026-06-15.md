# SPEC — Post-Class Feedback → Attendance Gate + Principal Escalation

| | |
|---|---|
| **Date** | 2026-06-15 |
| **Status** | 🟡 Spec for sign-off — substrate build staged, UI swarm follows |
| **Decision owner** | Director (Omm) |
| **Origin** | Director idea, 2026-06-15 |
| **Model chosen** | **Hard gate** (Director, 2026-06-15) — attendance not *confirmed* until the learner submits post-class feedback |

---

## 1. What we're building

After every class, the learner submits a short, compulsory feedback form (a checklist — e.g. "NotebookLM used properly" — plus an "understood?" signal and free text). Three things hang off it:

1. **Attendance confirmation** — a learner's attendance for a session is *confirmed* only once their feedback exists. Until then it's **present-pending** (never silently "absent").
2. **Faculty quality signal** — feedback is aggregated per session/faculty (anonymous to faculty).
3. **Principal escalation** — sessions whose understanding falls below a threshold escalate to the Principal.

---

## 2. Ground truth (live-verified 2026-06-15) — why the design is what it is

- **Attendance is a faculty-owned JSONB blob, not per-student rows.** `student_attendance` (6,136 live rows) stores `attendance_data` JSONB keyed by `period_id`. Each period entry holds:
  - `students[]` → `{ student_id, status: 'Present'|'Absent', marked_at, section_id }`
  - `course_id`, `course_code`, `course_name`, `period_name`, `start_time`, `end_time`
  - `assigned_faculty` → `{ faculty_id, faculty_name, faculty_email }` ← **the teacher being rated**
  - `marked_by_details` → who marked it
- `daily_session_attendance` is **0 rows (dead)** — ignore it. The real grain is `student_attendance` → `attendance_data[period_id]`.
- **Consequence:** there is no per-student "confirmed" flag to flip, and the blob is written by faculty. Having learners write into it = concurrent-write races + RLS mess. **So confirmation must be DERIVED, never a blob mutation.**

### Design principle
> **Confirmed attendance = `status='Present'` in the blob AND a `session_feedback` row exists.**
> We compute this over a join; we never modify `attendance_data`. The faculty's legal record stays untouched; the gate is a layer on top.

---

## 3. A "session" identity

A class session a learner can give feedback on is the tuple:
`(institution_id, attendance_date, timetable_id, period_id, section_id)` → which self-resolves (from the blob) to `course_id`/`course_code`/`course_name` + `assigned_faculty.faculty_id`.

The learner's eligibility to give feedback = they appear with `status='Present'` in that period's `students[]`. (Absent learners don't give feedback — there's nothing to confirm.)

---

## 4. Data model (new)

### `session_feedback` — one row per (learner, session)
```
id                uuid pk
institution_id    uuid not null
student_id        uuid not null            -- the learner (matches students[].student_id)
attendance_date   date not null
timetable_id      uuid not null
period_id         text not null            -- the attendance_data key
section_id        uuid
course_id         uuid
course_code       text
faculty_id        uuid                     -- assigned_faculty.faculty_id (who is rated)
understood        smallint not null        -- 1..5 (or 0/1) understanding signal
checklist         jsonb not null default '{}'  -- { "notebooklm_used": true, ... } against the config
free_text         text
created_at        timestamptz default now()
updated_at        timestamptz default now()
UNIQUE (student_id, attendance_date, period_id)   -- one feedback per learner per session
```

### `session_feedback_checklist_config` — per-institution configurable checklist
```
id                uuid pk
institution_id    uuid                     -- null = platform default
item_key          text not null            -- 'notebooklm_used'
label             text not null            -- 'NotebookLM used properly in class'
sort_order        int default 0
is_active         boolean default true
UNIQUE (institution_id, item_key)
```
(Seed a sensible default set incl. `notebooklm_used`. Director can edit later via an admin lane — out of scope for v1, config table is enough.)

### Escalation
Computed (not a heavy new table for v1): a session escalates when, across its feedback rows, the understanding signal breaches a threshold (e.g. `avg(understood) < 3` OR `count(understood<=2) >= N`). Reuse the existing `attendance-escalation-service` *pattern*. v1 surfaces escalations via an RPC over `session_feedback` aggregated by session; a persisted `session_feedback_escalations` table (with `acknowledged_by`/`resolved_at`) is a fast-follow if the Principal needs a workflow.

---

## 5. RPCs (all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated)

| RPC | Who | Does |
|---|---|---|
| `fn_scf_submit_feedback(p_period_id, p_attendance_date, p_timetable_id, p_understood, p_checklist, p_free_text)` | learner | Validates the caller is `Present` in that session's blob; upserts their `session_feedback` row (resolves course/faculty/section from the blob server-side). The **only** write path. |
| `fn_scf_pending_for_learner()` | learner | Returns sessions where the caller is `Present` in the blob but has **no** feedback row → the "give feedback to confirm attendance" queue + nudge. |
| `fn_scf_confirmation_status(p_from date, p_to date)` | learner | Per-session: present-pending vs confirmed (Present + feedback). Drives the learner's attendance view. |
| `fn_scf_faculty_summary(p_from, p_to)` | faculty | Aggregated, **anonymized** feedback for the caller's own sessions (`assigned_faculty.faculty_id = me`): understanding avg, checklist completion %, count — never individual learner identities. |
| `fn_scf_principal_escalations(p_from, p_to)` | principal/HOD/dean/admin | Sessions in the caller's institution breaching the understanding threshold, with faculty + course + the aggregate signal. |

**Identity rule:** feedback is *identified* (so the gate knows whose attendance to confirm) but every faculty/principal-facing read is *aggregated/anonymized* — no path exposes "learner X rated you low."

---

## 6. RLS

- `session_feedback`: learner SELECT/INSERT/UPDATE own (`student_id = auth.uid()`-resolved); no faculty/principal *direct* read (they go through the anonymizing RPCs); super_admin all. Writes flow only through `fn_scf_submit_feedback`.
- `session_feedback_checklist_config`: SELECT to authenticated; write to admins only.

---

## 7. UI lanes (the parallel swarm — disjoint subtrees, conflict-proof)

Each agent owns one non-overlapping route subtree + its own components; **none** edits shared infra (types/service/hooks are built in the substrate first), and **none** commits the regenerated route-manifest.

| Lane | Route subtree | What |
|---|---|---|
| **L1 — Learner feedback form** | `app/(routes)/academic/session-feedback/learn/**` | Post-class form: the configured checklist + understood signal + free text. Pulls `fn_scf_pending_for_learner`; submit via `fn_scf_submit_feedback`. ~10-second UX. |
| **L2 — Learner attendance-confirmation view + nudge** | `app/(routes)/academic/session-feedback/me/**` | "These sessions are present-pending until you give feedback." Uses `fn_scf_confirmation_status`. The nudge surface. |
| **L3 — Faculty session insight** | `app/(routes)/academic/session-feedback/faculty/**` | Anonymized understanding/checklist signal on the faculty's own sessions. Uses `fn_scf_faculty_summary`. |
| **L4 — Principal escalation dashboard** | `app/(routes)/academic/session-feedback/principal/**` | Sessions below threshold, by faculty/course. Uses `fn_scf_principal_escalations`. |

Substrate (built first, sequentially): migration (tables + RLS + 5 RPCs) + `types/session-feedback.ts` + `lib/services/session-feedback-service.ts` + `hooks/use-session-feedback.ts` + nav/permission entries.

---

## 8. ⚠️ DEFERRED — one decision before the official attendance % is touched

The hard gate raises a **legal/compliance** question the substrate deliberately does **not** answer yet:

> **Does a present-pending (attended, no feedback) session count toward the official attendance % used for exam eligibility?**

- **Layered (recommended for v1):** the official % (from the consolidation service) is unchanged; "confirmation" is a compliance layer on top (pending → nudge → escalate). Zero risk to exam eligibility.
- **Strict:** unconfirmed-present is *excluded* from the official % until feedback is given. This changes `attendance-consolidation-service` math → directly affects exam eligibility. **Requires explicit Director sign-off + likely a grace window + a regularization path** before wiring.

The substrate + L1–L4 ship the full feedback/gate/escalation experience under the **Layered** reading. Flipping to **Strict** is a separate, gated change to the consolidation service.

---

## 9. Build order

1. **Substrate** (sequential, this session): migration + types + service + hooks. Apply RPCs live (show-SQL-first), smoke-test. Open substrate PR.
2. **Swarm** (parallel worktree agents, after substrate lands): L1–L4, each a disjoint route subtree, each its own PR. Reconcile per the conflict-proof recipe (verify no out-of-lane edits; don't commit route-manifest).
3. **Strict-% coupling**: only after Director signs off §8.
