# Question-wise Internal Mark Entry (OBE-ready) — Implementation Plan

**Date:** 2026-07-27
**Module:** `academic/internal-marks`
**Depends on:** `academic/question-papers` (COE `ia_question_papers`)

## Decisions (ratified with requester)

1. **Storage:** per-question marks ride `cia_marks.extra_marks` JSONB (flat `{key: mark}`) with the sum as `total_internal_marks`. **No COE backend change.**
2. **Scaling:** enter directly — the assigned paper's total is assumed to equal the course `internal_max_mark`. Mismatch = non-blocking amber warning only.
3. **Rollout:** new **"By Question"** mode *alongside* the existing component grid. Default stays **By Component** (zero regression).
4. **OBE scope:** capture data that is **OBE-ready**; defer the CO-tagged attainment *computation* to a separate effort.
5. **Stored keys:** per-question only (Q-keys). CO tags are recovered by joining the **locked** paper — single source of truth, no drift.

## Why this is OBE-ready (the contract)

True CO-tagged attainment (upgrading `obe_course_attainment_rollup.grain` from `course_proxy` → `co_tagged`) needs two things that do not exist today:
- **per-question marks** — this feature writes them to `cia_marks.extra_marks`.
- **question → CO map** — already present in `ia_question_papers.questions[].co_code`, frozen once the paper is `locked`.

This plan guarantees both are captured and joinable. It does **not** build the computation (that touches the COE-DB read path in `app/api/cron/copo-attainment/route.ts`, needs new SQL fns for the CO→PO roll-up, and Director ratification to leave DARK mode). Deferred, not blocked.

### The join contract (for the future attainment engine)
```
FOR each cia_marks row written in By-Question mode:
  paper := locked ia_question_papers WHERE (institution, session, cia_round, program, course)   -- one set assumed
  FOR each key in cia_marks.extra_marks:
      q  := paper.question WHERE qKey(q) == key
      co := q.co_code ;  obtained := extra_marks[key] ;  max := extra_marks_max[key]
  aggregate obtained/max per (student, co) → threshold → CO level → CO-PO → PO level
```
**Assumption:** one locked/approved paper per (course, round, session). Multi-set disambiguation is a future enhancement (blocked until COE adds a `paper_id`/`set` column to `cia_marks`; today's whitelist strips any non-numeric field).

---

## Question key convention — `qKey(q)`

Deterministic, human-readable, collision-proof, stable against the locked paper:

```
qKey(q) = `${q.part_label ?? ''}${q.question_number}${q.sub_label ?? ''}`   // e.g. "A1", "A2", "B16a"
fallback if part_label empty: `Q${q.question_number}${q.sub_label ?? ''}`
guard: if two questions collide, append `_${q.display_order}` (defensive; should never fire on a well-formed paper)
```
`is_choice_alternative` ("(OR)") questions are **excluded** from columns and keys — same rule the authoring grid uses ([paper-authoring.tsx:148](../../app/(routes)/academic/question-papers/_components/paper-authoring.tsx#L148)) — so alternatives never double-count.

---

## Files to CREATE

### 1. `hooks/internal-marks/use-assigned-paper.ts`
- Reuses `useQuestionPapers({ institutionId, examSessionId, ciaRound, programCode, semester })` and filters the returned list to `course_code === filters.course_code`.
- Selection precedence: `status === 'locked'` > `'approved'` > none. (Draft papers do NOT enable question mode — marks must key off a finalized paper.)
- Then `usePaperDetail(paper.id)` for `questions[]` (list omits the array; detail carries it).
- Returns `{ paper: IaQuestionPaperDetail | null, hasAssignedPaper: boolean, isLoading }`.

### 2. `app/(routes)/academic/internal-marks/_components/question-mark-entry-grid.tsx`
Transpose of `PaperAuthoring`; mirrors `MarkEntryGrid`'s structure and reuses its patterns verbatim:
- **Columns** = `paper.questions.filter(q => !q.is_choice_alternative)`. Header: `{qKey}` + `Max: {q.marks}` + small `CO {q.co_code}` badge (visibility only — not stored).
- **Rows** = learners (same `LearnerForMarkEntry[]` as component grid).
- **Cell** = numeric input; reuse color-coded states, Enter-to-next navigation, `maxLength`, digit-only strip.
- **Validation:** per cell `0 ≤ mark ≤ q.marks`; all-cells-mandatory guard; block save on any over-max (reuse `validationErrors` + `summaryStats` logic).
- **Row total** = Σ question marks. **maxTotal** = Σ `q.marks`.
- **Amber warning** when `maxTotal !== courseMaxMark` (mismatch is allowed per decision #2).
- **alreadySaved lock** (view-only) reused verbatim — re-hydrate from `existingMarks[].marks[qKey]` (works because `flattenExtraMarks` merges `extra_marks` into `marks` on read).
- **Sync record build** (per learner):
  ```ts
  extra_marks:     { [qKey(q)]: mark, ... }
  extra_marks_max: { [qKey(q)]: q.marks, ... }
  total_internal_marks: rowTotal
  max_internal_marks:   maxTotal   // == courseMaxMark by assumption
  // NO standard component columns emitted in this mode
  ```
  Everything else (`institutions_id`, `examination_session_id`, `course_offering_id`, `student_id`, `exam_registration_id`, `cia_round`, `cia_setting_id`, `marks_status`) identical to `MarkEntryGrid`.
- **PDF:** reuse `generateInternalMarksPDF` with `components = columns.map(q => ({ code: qKey(q), name: qKey(q), max_marks: q.marks }))` — the generator is column-agnostic.

## Files to MODIFY

### 3. `app/(routes)/academic/internal-marks/page.tsx`
- Add `useAssignedPaper(...)`.
- When `hasAssignedPaper`, render a `ToggleGroup` (**By Component** | **By Question**) above the grid; default **By Component**.
- Conditionally render `<QuestionMarkEntryGrid>` vs `<MarkEntryGrid>`. Same `onSubmit={handleSubmitMarks}` / `submitMutation` — the write path is unchanged.
- When no assigned paper: toggle hidden/disabled with hint "Assign & approve a question paper to enter marks question-wise."

### 4. `types/internal-marks.ts`
- Export `qKey(q: IaPaperQuestion): string` and a `QuestionColumn` helper type. No wire-shape change (`extra_marks` already typed as `Record<string, number>`).

### 5. (Optional, precision) `app/api/question-papers/route.ts`
- Add `course_code` to the `passthrough` array for server-side single-course filtering. **Default: skip** — filter client-side in the hook (no API change).

---

## Edge cases

| Case | Handling |
|---|---|
| No paper / draft-only | By-Question disabled with hint; component mode unaffected. |
| Mixed-mode on one round | Both modes write the same `cia_marks` row (unique key = student+offering+session+round). If a round already has saved marks, the other mode is view-only (`alreadySaved` lock) — prevents mixed writes. |
| Paper total ≠ internal max | Non-blocking amber banner (per decision #2). |
| CAS institutions | No new logic — QP + marks proxies already collapse CAS via `resolveCoeInstitutionCode`. |
| Entry window / deadline | Reuse `getEntryWindowStatus`; POST route's IST cutoff already covers question-mode saves. |
| `(OR)` choice questions | Excluded from columns/keys/totals. |

## Testing

1. Course+round with an approved paper → By-Question toggle appears → columns match non-OR questions with correct maxes + CO badges.
2. Exceed a question's max → cell red, save blocked.
3. Save → COE `cia_marks` row has `extra_marks: {A1:…}`, `extra_marks_max`, correct `total_internal_marks`; re-open → grid re-hydrates view-only from `marks[qKey]`.
4. Component-mode course (no paper) → unchanged (regression check).
5. Round-trip a By-Question save through `/api/internal-marks/report` → per-question values flatten into `marks` map.

## Explicitly out of scope (deferred, documented)

- CO-tagged attainment computation (`grain='co_tagged'` rollups), CO→PO roll-up, course CO-attainment report.
- COE-DB read path changes in `copo-attainment` cron.
- Multi-set paper disambiguation (needs a COE `cia_marks.paper_id` column).
- Any change to the component-based grid's write shape.
