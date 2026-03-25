# Attendance Edit Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow super admins (all institutions) and HODs (own department only) to edit student Present/Absent status after attendance is marked, with an append-only audit log visible only to super admins.

**Architecture:** Database-first approach — new `attendance_audit_log` table (append-only, RLS-gated) stores per-student status changes. The existing `upsertConsolidatedAttendance` in `attendance-core-service.ts` gains an edit path that diffs old vs new JSONB and writes audit rows. The mark page extends its existing `isEditMode` + `isSuperAdmin` logic to include HOD scope. The report detail page adds a super-admin-only audit history panel.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TypeScript, bun:test, shadcn/ui (Table, Skeleton, Alert), React Query (`useQuery`), `lib/utils/enhanced-logger.ts`

**Spec:** `docs/superpowers/specs/2026-03-20-attendance-edit-feature-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/setup/01_tables.sql` | MODIFY — append | `attendance_audit_log` table + 3 indexes |
| `supabase/setup/03_policies.sql` | MODIFY — append | RLS SELECT (super_admin) + INSERT (super_admin, hod) |
| `types/attendance.ts` | MODIFY — append | `AttendanceAuditEntry`, `AttendanceEditDiff` interfaces |
| `lib/services/academic/attendance-service.ts` | MODIFY — add method | `getAttendanceAuditLog()` public method (delegates to core) |
| `lib/services/academic/attendance-core-service.ts` | MODIFY — edit path | Diff logic + audit INSERT inside existing `if (existingRecord)` UPDATE branch |
| `app/(routes)/academic/attendance/mark/page.tsx` | MODIFY | HOD variables, `initialEditSnapshot` ref, `editDiff` computation, `canEditAttendance`, OnDuty guard |
| `app/(routes)/academic/attendance/mark/components/attendance-summary-modal.tsx` | MODIFY | `editDiff` prop, diff table section, disable Confirm when no changes |
| `app/(routes)/academic/attendance/reports/[id]/page.tsx` | MODIFY — add section | Audit history panel at page bottom (super admin only) |
| `hooks/academic/use-attendance.ts` | VERIFY — no change needed | `saveConsolidatedAttendance` passes full DTO to `AttendanceCoreService` unmodified; confirm pass-through at line ~421 before Task 6 Step 7 |
| `__tests__/lib/attendance/audit-log.test.ts` | CREATE | Unit tests for diff logic and getAttendanceAuditLog |

---

## Task 1: Database — `attendance_audit_log` Table

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append at end)

- [ ] **Step 1: Append the table + indexes to 01_tables.sql**

  Open `supabase/setup/01_tables.sql` and append at the very end:

  ```sql
  -- ============================================================
  -- attendance_audit_log
  -- Added: 2026-03-20 — Tracks all edits to student attendance status.
  -- Append-only (no UPDATE/DELETE policies). Super admin SELECT only.
  -- ON DELETE RESTRICT prevents deleting a student_attendance record
  -- that has been edited, preserving the accountability chain.
  -- ============================================================
  CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
      id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      attendance_id   UUID        REFERENCES student_attendance(id) ON DELETE RESTRICT,
      period_id       TEXT        NOT NULL,
      student_id      UUID        NOT NULL,
      old_status      TEXT        NOT NULL CHECK (old_status IN ('Present', 'Absent', 'OnDuty')),
      new_status      TEXT        NOT NULL CHECK (new_status IN ('Present', 'Absent', 'OnDuty')),
      edited_by       UUID        NOT NULL REFERENCES profiles(id),
      edited_by_name  TEXT        NOT NULL,
      edited_by_role  TEXT        NOT NULL,
      edited_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      institution_id  UUID        NOT NULL REFERENCES institutions(id),
      attendance_date DATE        NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_attendance_id
      ON attendance_audit_log(attendance_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_edited_at
      ON attendance_audit_log(edited_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_student_id
      ON attendance_audit_log(student_id, edited_at DESC);
  ```

- [ ] **Step 2: Run the SQL in Supabase Dashboard**

  Go to Supabase Dashboard → SQL Editor. Paste and run ONLY the `CREATE TABLE` and three `CREATE INDEX` statements above.

  Expected: No errors. Verify by running:
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'attendance_audit_log'
  ORDER BY ordinal_position;
  ```
  Should return 12 rows (id, attendance_id, period_id, student_id, old_status, new_status, edited_by, edited_by_name, edited_by_role, edited_at, institution_id, attendance_date).

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/setup/01_tables.sql
  git commit -m "feat(db): add attendance_audit_log table with ON DELETE RESTRICT"
  ```

---

## Task 2: Database — RLS Policies for `attendance_audit_log`

**Files:**
- Modify: `supabase/setup/03_policies.sql` (append at end)

- [ ] **Step 1: Append RLS policies to 03_policies.sql**

  Open `supabase/setup/03_policies.sql` and append at the very end:

  ```sql
  -- ============================================================
  -- attendance_audit_log RLS policies
  -- Added: 2026-03-20
  -- SELECT: super_admin only (audit history is admin-only visibility)
  -- INSERT: super_admin and hod only (matches edit permission table)
  -- No UPDATE or DELETE — log is immutable
  -- ============================================================
  ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "audit_log_select_super_admin"
      ON public.attendance_audit_log
      FOR SELECT
      USING (get_current_user_role() = 'super_admin');

  CREATE POLICY "audit_log_insert_by_role"
      ON public.attendance_audit_log
      FOR INSERT
      WITH CHECK (get_current_user_role() IN ('super_admin', 'hod'));
  ```

- [ ] **Step 2: Run the SQL in Supabase Dashboard**

  Run the `ALTER TABLE` + both `CREATE POLICY` statements in the SQL Editor.

  Expected: No errors. Verify:
  ```sql
  SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'attendance_audit_log';
  ```
  Should return 2 rows: `audit_log_select_super_admin` (SELECT) and `audit_log_insert_by_role` (INSERT).

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/setup/03_policies.sql
  git commit -m "feat(db): add RLS policies for attendance_audit_log (super_admin select, hod insert)"
  ```

---

## Task 3: TypeScript Types

**Files:**
- Modify: `types/attendance.ts` (append two interfaces at end)

- [ ] **Step 1: Append interfaces to types/attendance.ts**

  Open `types/attendance.ts`. At the end of the file, append:

  ```typescript
  // ─── Attendance Edit Audit Types ──────────────────────────────────────────────
  // Added: 2026-03-20 — Supports attendance edit feature + audit trail

  /**
   * One row from attendance_audit_log, with student details joined from learners_profiles.
   * old_status / new_status include 'OnDuty' for historical read completeness.
   * The edit UI never produces OnDuty — use AttendanceEditDiff for UI-layer diffs.
   * edited_by_role is INFORMATIONAL ONLY — never use for access-control logic.
   */
  export interface AttendanceAuditEntry {
    id: string
    attendance_id: string
    period_id: string
    student_id: string
    student_name?: string    // joined from learners_profiles.full_name
    roll_number?: string     // joined from learners_profiles.roll_number
    old_status: 'Present' | 'Absent' | 'OnDuty'
    new_status: 'Present' | 'Absent' | 'OnDuty'
    edited_by: string
    edited_by_name: string
    edited_by_role: string
    edited_at: string
    institution_id: string
    attendance_date: string
  }

  /**
   * Represents a single student's status change in the edit UI confirmation modal.
   * Narrowed to Present | Absent only — OnDuty is leave-system controlled and
   * is never togglable via the edit interface.
   */
  export interface AttendanceEditDiff {
    studentId: string
    studentName: string
    oldStatus: 'Present' | 'Absent'
    newStatus: 'Present' | 'Absent'
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit 2>&1 | grep -i "attendance" | head -20
  ```

  Expected: No errors related to attendance types.

- [ ] **Step 3: Commit**

  ```bash
  git add types/attendance.ts
  git commit -m "feat(types): add AttendanceAuditEntry and AttendanceEditDiff interfaces"
  ```

---

## Task 4: Service — `getAttendanceAuditLog` Method

**Files:**
- Modify: `lib/services/academic/attendance-core-service.ts` (add method)
- Modify: `lib/services/academic/attendance-service.ts` (add delegation)
- Create: `__tests__/lib/attendance/audit-log.test.ts`

- [ ] **Step 1: Write the failing test first**

  Create `__tests__/lib/attendance/audit-log.test.ts`:

  ```typescript
  import { mock, describe, it, expect, beforeEach } from 'bun:test'

  // ─── Mock Supabase BEFORE importing ──────────────────────────────────────────
  const mockData = [
    {
      id: 'audit-1',
      attendance_id: 'att-1',
      period_id: 'period-slot-1',
      student_id: 'student-1',
      old_status: 'Absent',
      new_status: 'Present',
      edited_by: 'user-1',
      edited_by_name: 'Admin John',
      edited_by_role: 'super_admin',
      edited_at: '2026-03-20T10:42:00Z',
      institution_id: 'inst-1',
      attendance_date: '2026-03-20',
      student_name: 'Ravi Kumar',
      roll_number: '21CS001',
    },
  ]

  const mockSelect = mock(() => ({
    eq: mock(() => ({
      order: mock(() => Promise.resolve({ data: mockData, error: null })),
    })),
  }))
  const mockFrom = mock(() => ({ select: mockSelect }))

  await mock.module('@/lib/supabase/client', () => ({
    createClientSupabaseClient: mock(() => ({ from: mockFrom })),
  }))

  // ─── Import AFTER mocks ───────────────────────────────────────────────────────
  const { AttendanceCoreService } = await import(
    '../../../lib/services/academic/attendance-core-service'
  )

  describe('AttendanceCoreService.getAttendanceAuditLog', () => {
    it('returns audit entries for a given attendance_id', async () => {
      const result = await AttendanceCoreService.getAttendanceAuditLog('att-1')
      expect(result).toHaveLength(1)
      expect(result[0].student_name).toBe('Ravi Kumar')
      expect(result[0].old_status).toBe('Absent')
      expect(result[0].new_status).toBe('Present')
    })

    it('returns empty array when supabase returns empty data', async () => {
      mockSelect.mockImplementationOnce(() => ({
        eq: mock(() => ({
          order: mock(() => Promise.resolve({ data: [], error: null })),
        })),
      }))
      const result = await AttendanceCoreService.getAttendanceAuditLog('att-no-edits')
      expect(result).toEqual([])
    })

    it('throws when supabase returns an error', async () => {
      mockSelect.mockImplementationOnce(() => ({
        eq: mock(() => ({
          order: mock(() =>
            Promise.resolve({ data: null, error: new Error('DB error') })
          ),
        })),
      }))
      await expect(
        AttendanceCoreService.getAttendanceAuditLog('att-bad')
      ).rejects.toThrow()
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd D:/Projects/MyJKKN && bun test __tests__/lib/attendance/audit-log.test.ts
  ```

  Expected: FAIL — `getAttendanceAuditLog is not a function` or similar.

- [ ] **Step 3: Add `getAttendanceAuditLog` to `attendance-core-service.ts`**

  Open `lib/services/academic/attendance-core-service.ts`. Add this static method to the `AttendanceCoreService` class (place it after the existing `upsertConsolidatedAttendance` method):

  ```typescript
  /**
   * Returns all audit log entries for a given student_attendance record.
   * RLS ensures only super_admin can read these — all other roles get [].
   * Throws on unexpected Supabase errors.
   * Added: 2026-03-20 — Attendance edit audit trail
   */
  static async getAttendanceAuditLog(attendanceId: string): Promise<AttendanceAuditEntry[]> {
    const { data, error } = await (this.supabase
      .from('attendance_audit_log') as any)
      .select(`
        *,
        learners_profiles!student_id (
          full_name,
          roll_number
        )
      `)
      .eq('attendance_id', attendanceId)
      .order('edited_at', { ascending: false })

    if (error) {
      logger.error('academic/attendance', 'Failed to fetch attendance audit log', error)
      throw error
    }

    // Flatten the joined learners_profiles into the flat AttendanceAuditEntry shape
    return (data || []).map((row: any) => ({
      ...row,
      student_name: row.learners_profiles?.full_name ?? undefined,
      roll_number: row.learners_profiles?.roll_number ?? undefined,
      learners_profiles: undefined,
    })) as AttendanceAuditEntry[]
  }
  ```

  Add the import at the top of the file (with existing imports):
  ```typescript
  import type { AttendanceAuditEntry } from '@/types/attendance'
  ```

- [ ] **Step 4: Add delegation in `attendance-service.ts`**

  Open `lib/services/academic/attendance-service.ts`. Find the block of static delegation methods (the pattern of `static methodName(...args) { return AttendanceCoreService.methodName(...args) }`). Add:

  ```typescript
  static getAttendanceAuditLog(
    ...args: Parameters<typeof AttendanceCoreService.getAttendanceAuditLog>
  ) {
    return AttendanceCoreService.getAttendanceAuditLog(...args)
  }
  ```

- [ ] **Step 5: Run tests — all should pass**

  ```bash
  bun test __tests__/lib/attendance/audit-log.test.ts
  ```

  Expected: 3 tests PASS.

- [ ] **Step 6: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | grep -i "attendance" | head -20
  ```

  Expected: No errors.

- [ ] **Step 7: Commit**

  ```bash
  git add lib/services/academic/attendance-core-service.ts \
          lib/services/academic/attendance-service.ts \
          __tests__/lib/attendance/audit-log.test.ts \
          types/attendance.ts
  git commit -m "feat(service): add getAttendanceAuditLog method with unit tests"
  ```

---

## Task 5: Service — Audit Diff + INSERT in Edit Path

**Files:**
- Modify: `lib/services/academic/attendance-core-service.ts` — inside `upsertConsolidatedAttendance`

**Context:** The existing update path starts at the `if (existingRecord)` branch (around line 400). After the successful `UPDATE`, we add: compute the diff, then insert audit rows.

- [ ] **Step 1: Write the failing test for diff logic**

  Add a new `describe` block to `__tests__/lib/attendance/audit-log.test.ts`:

  ```typescript
  describe('computeAttendanceDiff (internal helper)', () => {
    it('detects changed statuses between old and new student arrays', async () => {
      // We test the exported helper directly once it exists
      const { computeAttendanceDiff } = await import(
        '../../../lib/services/academic/attendance-core-service'
      )

      const oldStudents = [
        { student_id: 's1', status: 'Absent', section_id: 'sec1', marked_at: '' },
        { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' },
        { student_id: 's3', status: 'OnDuty', section_id: 'sec1', marked_at: '' },
      ]
      const newStudents = [
        { student_id: 's1', status: 'Present', section_id: 'sec1', marked_at: '' }, // changed
        { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' }, // unchanged
        { student_id: 's3', status: 'Absent', section_id: 'sec1', marked_at: '' },  // OnDuty → skip
      ]

      const diff = computeAttendanceDiff(oldStudents, newStudents)

      expect(diff).toHaveLength(1)
      expect(diff[0]).toEqual({
        student_id: 's1',
        old_status: 'Absent',
        new_status: 'Present',
      })
    })

    it('returns empty array when nothing changed', async () => {
      const { computeAttendanceDiff } = await import(
        '../../../lib/services/academic/attendance-core-service'
      )
      const students = [
        { student_id: 's1', status: 'Present', section_id: 'sec1', marked_at: '' },
      ]
      const diff = computeAttendanceDiff(students, students)
      expect(diff).toEqual([])
    })

    it('skips students whose new status is OnDuty (Absent → OnDuty)', async () => {
      const { computeAttendanceDiff } = await import(
        '../../../lib/services/academic/attendance-core-service'
      )
      const oldStudents = [
        { student_id: 's1', status: 'Absent', section_id: 'sec1', marked_at: '' },
        { student_id: 's2', status: 'Present', section_id: 'sec1', marked_at: '' },
      ]
      const newStudents = [
        { student_id: 's1', status: 'OnDuty', section_id: 'sec1', marked_at: '' }, // Absent → OnDuty: skip
        { student_id: 's2', status: 'Absent', section_id: 'sec1', marked_at: '' }, // Present → Absent: include
      ]
      const diff = computeAttendanceDiff(oldStudents, newStudents)
      expect(diff).toHaveLength(1)
      expect(diff[0].student_id).toBe('s2')
      expect(diff[0].old_status).toBe('Present')
      expect(diff[0].new_status).toBe('Absent')
    })
  })
  ```

- [ ] **Step 2: Run test — confirm fails**

  ```bash
  bun test __tests__/lib/attendance/audit-log.test.ts
  ```

  Expected: FAIL — `computeAttendanceDiff is not exported`.

- [ ] **Step 3: Add `computeAttendanceDiff` export and audit INSERT to `attendance-core-service.ts`**

  **3a — Add the pure helper function** (add OUTSIDE the class, near the top of the file after imports):

  ```typescript
  /**
   * Computes which students changed status between two snapshots.
   * OnDuty entries are skipped in both old and new — leave system owns that status.
   * Exported for unit testing.
   */
  export function computeAttendanceDiff(
    oldStudents: Array<{ student_id: string; status: string }>,
    newStudents: Array<{ student_id: string; status: string }>
  ): Array<{ student_id: string; old_status: string; new_status: string }> {
    const newMap = new Map(newStudents.map((s) => [s.student_id, s.status]))
    return oldStudents
      .filter((old) => {
        if (old.status === 'OnDuty') return false           // skip OnDuty originals
        const newStatus = newMap.get(old.student_id)
        if (!newStatus || newStatus === 'OnDuty') return false  // skip if new is OnDuty
        return old.status !== newStatus                     // only changed rows
      })
      .map((old) => ({
        student_id: old.student_id,
        old_status: old.status,
        new_status: newMap.get(old.student_id)!,
      }))
  }
  ```

  **3b — Add service-layer HOD scope guard** at the TOP of the `if (existingRecord)` block (before the fetch of existing data). This is the second enforcement layer — it prevents API-level bypass even if the UI guard is circumvented.

  Find the line inside `if (existingRecord) {` that starts fetching existing data:
  ```typescript
  // Fetch existing record to get current attendance_data for merging
  const { data: currentRecord, error: fetchError } = await this.supabase
  ```

  BEFORE that line, insert:

  ```typescript
  // ─── Service-layer HOD scope check (added 2026-03-20) ────────────────────
  // Prevents API-level bypass: only super_admin can edit any record;
  // HOD can only edit records within their own institution + department.
  if (data.is_edit_mode) {
    const editorProfile = data.editor_profile
    if (!editorProfile) {
      throw new Error('editor_profile is required for attendance edits')
    }
    if (editorProfile.role !== 'super_admin') {
      if (editorProfile.role !== 'hod') {
        throw new Error('Not authorized to edit attendance')
      }
      // Fetch timetable department to validate HOD scope
      const { data: timetableData } = await this.supabase
        .from('timetables')
        .select('department_id, institution_id')
        .eq('id', data.timetable_id)
        .single()
      if (!timetableData) {
        throw new Error('Cannot verify HOD scope: timetable not found')
      }
      if ((timetableData as any).department_id !== data.department_id) {
        throw new Error('HOD can only edit attendance in their own department')
      }
      if ((timetableData as any).institution_id !== data.institution_id) {
        throw new Error('HOD can only edit attendance in their own institution')
      }
    }
  }
  // ─── End scope check ──────────────────────────────────────────────────────
  ```

  **Note:** `data.department_id` is already part of `UpsertConsolidatedAttendanceDto` (existing field). `data.timetable_id` and `data.institution_id` are also existing fields. No new DTO fields are needed for this check.

  **3c — Extend the `if (existingRecord)` UPDATE branch** to write audit rows after a successful UPDATE.

  Find the section that reads (after a successful UPDATE):
  ```typescript
  if (updateError) throw updateError;
  result = updateResult;
  ```

  Immediately AFTER `result = updateResult;` (still inside the `if (existingRecord)` block), add:

  ```typescript
  // ─── Audit log: record per-student status changes ────────────────────────
  // Added: 2026-03-20 — Attendance edit audit trail
  // Only runs when an edit is being performed (data.is_edit_mode === true)
  // and the caller provides the required editor profile details.
  if (data.is_edit_mode && data.editor_profile && data.period_id_being_edited) {
    const periodKey = data.period_id_being_edited
    const oldPeriodStudents: Array<{ student_id: string; status: string }> =
      (existingAttendanceData[periodKey]?.students || [])
    const newPeriodStudents: Array<{ student_id: string; status: string }> =
      (mergedAttendanceData[periodKey]?.students || [])

    const diff = computeAttendanceDiff(oldPeriodStudents, newPeriodStudents)

    if (diff.length > 0) {
      const auditRows = diff.map((change) => ({
        attendance_id: (existingRecord as any).id,
        period_id: periodKey,
        student_id: change.student_id,
        old_status: change.old_status,
        new_status: change.new_status,
        edited_by: data.editor_profile!.id,
        edited_by_name: data.editor_profile!.full_name,
        edited_by_role: data.editor_profile!.role,
        edited_at: new Date().toISOString(),
        institution_id: data.institution_id,
        attendance_date: data.attendance_date,
      }))

      const { error: auditError } = await (this.supabase
        .from('attendance_audit_log') as any)
        .insert(auditRows)

      if (auditError) {
        // Best-effort: log but do not throw — attendance update already succeeded
        logger.error('academic/attendance', 'Failed to write attendance audit log', auditError)
      }
    }
  }
  // ─── End audit log ────────────────────────────────────────────────────────
  ```

  **3c — Extend the `UpsertConsolidatedAttendanceDto` type** in `types/attendance.ts` (the interface is at approximately line 180 in that file). Add the three optional fields:

  ```typescript
  // Optional fields for edit mode audit trail (added 2026-03-20)
  is_edit_mode?: boolean
  period_id_being_edited?: string
  editor_profile?: {
    id: string
    full_name: string
    role: string
  }
  ```

  Confirm the location first:
  ```bash
  grep -n "UpsertConsolidatedAttendanceDto" types/attendance.ts
  ```
  It should return a single line in `types/attendance.ts`. Add the fields at the end of that interface.

- [ ] **Step 4: Run tests — all pass**

  ```bash
  bun test __tests__/lib/attendance/audit-log.test.ts
  ```

  Expected: 6 tests PASS (3 from Task 4 + 3 new diff tests).

- [ ] **Step 5: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | grep -i "attendance\|upsert\|audit" | head -20
  ```

  Expected: No errors.

- [ ] **Step 6: Commit**

  ```bash
  git add lib/services/academic/attendance-core-service.ts \
          types/attendance.ts \
          __tests__/lib/attendance/audit-log.test.ts
  git commit -m "feat(service): add audit diff + INSERT in upsertConsolidatedAttendance edit path"
  ```

---

## Task 6: UI — `mark/page.tsx` HOD Edit Support

**Files:**
- Modify: `app/(routes)/academic/attendance/mark/page.tsx`

**Context:** The page already has `isSuperAdmin` (line 65), `isEditMode` (line 97), `existingAttendance` (line 94), `contextData` (loaded ~line 197). There is NO `isHOD` variable yet.

- [ ] **Step 1: Add `isHOD` and `canEditAttendance` variables**

  Find the block near line 65 where `isSuperAdmin` is declared:
  ```typescript
  const { userProfile, isSuperAdmin } = usePermissions();
  ```

  Below it (or after `profile` is available), add:
  ```typescript
  const isHOD = profile?.role === 'hod'
  const isHODDepartmentMatch =
    isHOD &&
    !!profile?.department_id &&
    profile.department_id === contextData?.department_id &&
    profile.institution_id === contextData?.institution_id
  const canEditAttendance = isSuperAdmin || isHODDepartmentMatch
  ```

  **Important:** `contextData` is set in a `useEffect` and starts as `null`. The derived `isHODDepartmentMatch` will be `false` until `contextData` loads — this is the correct behavior (no Edit button flashes while loading).

- [ ] **Step 2: Add `initialEditSnapshot` ref**

  Near the other `useState`/`useRef` declarations at the top, add:
  ```typescript
  const initialEditSnapshot = useRef<Record<string, string>>({})
  ```

- [ ] **Step 3: Capture snapshot when edit mode is entered**

  Find everywhere `setIsEditMode(true)` is called (search for it — should be 1–2 places). Immediately before each call, add:
  ```typescript
  initialEditSnapshot.current = { ...attendanceData }
  setIsEditMode(true)
  ```
  Replace the bare `setIsEditMode(true)` calls.

- [ ] **Step 4: Add OnDuty guard to `toggleAttendance`**

  Find the `toggleAttendance` function. At the very start of the function body (after the guard for `existingAttendance && !isEditMode`), add:
  ```typescript
  // OnDuty is leave-system controlled — never allow manual toggle
  if (attendanceData[studentId] === 'OnDuty') return
  ```

- [ ] **Step 5: Replace all `isSuperAdmin` edit-gate checks with `canEditAttendance`**

  Search for all occurrences of `isSuperAdmin` in the JSX that control the Edit button or edit mode UI. Replace with `canEditAttendance` where appropriate.

  Key pattern to find (around line 1544):
  ```typescript
  {isSuperAdmin ? (
    // Edit Attendance button
  ```
  Change to:
  ```typescript
  {canEditAttendance ? (
    // Edit Attendance button
  ```

  **Do NOT replace** `isSuperAdmin` checks that are unrelated to editing (e.g., institution filter bypass, period availability checks).

- [ ] **Step 6: Compute `editDiff` before opening the modal**

  Find `handleSaveAttendance` (around line 1105) — this is called when the user clicks "Save Attendance". Before the modal is opened, add the diff computation:

  ```typescript
  // Compute diff for edit mode modal preview
  const editDiff: AttendanceEditDiff[] = isEditMode
    ? students
        .filter(
          (s: any) =>
            initialEditSnapshot.current[s.id] !== attendanceData[s.id] &&
            attendanceData[s.id] !== 'OnDuty'
        )
        .map((s: any) => ({
          studentId: s.id,
          // Use full_name (standard profile field). The || s.name fallback handles
          // older student record shapes that use 'name' instead of 'full_name'.
          // 'Unknown' is the last-resort fallback and should not appear in practice.
          studentName: s.full_name || s.name || 'Unknown',
          oldStatus: initialEditSnapshot.current[s.id] as 'Present' | 'Absent',
          newStatus: attendanceData[s.id] as 'Present' | 'Absent',
        }))
    : []
  ```

  Pass `editDiff` and `isEditMode` as props when opening the `AttendanceSummaryModal`.

- [ ] **Step 7: Verify hook pass-through, then add audit fields to payload**

  **First — open `hooks/academic/use-attendance.ts` and find `saveConsolidatedAttendance` (around line 420).** Confirm it passes the full payload object directly to `AttendanceCoreService.upsertConsolidatedAttendance` without destructuring or picking specific fields. If it spreads or picks, add the three new fields explicitly to the spread. No code change is needed if it passes the full object as-is.

  **Then — find `performSaveAttendance` (around line 1159 in `mark/page.tsx`)** where the payload for `saveConsolidatedAttendance` is built. Add the new audit fields to the payload:

  ```typescript
  // Audit trail fields (added 2026-03-20)
  is_edit_mode: isEditMode && !!existingAttendance,
  period_id_being_edited: isEditMode ? periodId : undefined,
  editor_profile: isEditMode && profile
    ? {
        id: profile.id,
        full_name: profile.full_name || 'Unknown',
        role: profile.role || 'unknown',
      }
    : undefined,
  ```

- [ ] **Step 8: Manual test (mark page)**

  Start the dev server:
  ```bash
  bun dev
  ```

  Test as **super admin**:
  1. Navigate to an already-marked attendance period
  2. Verify "Edit Attendance" button is visible
  3. Click Edit → verify banner changes to "Edit Mode — All changes are recorded in the audit log"
  4. Toggle a student (not OnDuty) → verify button toggles
  5. Try clicking an OnDuty student → verify button does NOT toggle

  Test as **HOD** (in their own department):
  1. Log in as HOD
  2. Navigate to an attendance record for their department
  3. Verify "Edit Attendance" button is visible
  4. Navigate to a different department's attendance record
  5. Verify "Edit Attendance" button is NOT visible

- [ ] **Step 9: Commit**

  ```bash
  git add "app/(routes)/academic/attendance/mark/page.tsx"
  git commit -m "feat(ui): extend attendance edit to HOD (dept-scoped), add audit snapshot + diff"
  ```

---

## Task 7: UI — `attendance-summary-modal.tsx` Edit Diff Preview

**Files:**
- Modify: `app/(routes)/academic/attendance/mark/components/attendance-summary-modal.tsx`

- [ ] **Step 1: Read the existing modal file**

  ```bash
  cat -n "app/(routes)/academic/attendance/mark/components/attendance-summary-modal.tsx" | head -60
  ```

  Understand existing props and structure before editing.

- [ ] **Step 2: Add `editDiff` and `isEditMode` props**

  Find the props interface (likely named `AttendanceSummaryModalProps` or similar). Add:

  ```typescript
  isEditMode?: boolean
  editDiff?: AttendanceEditDiff[]
  ```

  Add the import at the top of the file:
  ```typescript
  import type { AttendanceEditDiff } from '@/types/attendance'
  ```

- [ ] **Step 3: Add edit diff section to modal body**

  Inside the modal body, after the existing summary content but BEFORE the action buttons, add conditionally rendered diff section:

  ```tsx
  {isEditMode && editDiff && editDiff.length > 0 && (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 space-y-2">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        ⚠️ You are editing already-marked attendance. The following changes will be saved:
      </p>
      <div className="rounded border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Student</th>
              <th className="text-left px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {editDiff.map((diff) => (
              <tr key={diff.studentId} className="border-t dark:border-gray-700">
                <td className="px-3 py-2">{diff.studentName}</td>
                <td className="px-3 py-2">
                  <span className="text-red-600 dark:text-red-400">{diff.oldStatus}</span>
                  {' → '}
                  <span className="text-green-600 dark:text-green-400">{diff.newStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        These changes will be recorded in the audit log.
      </p>
    </div>
  )}
  ```

- [ ] **Step 4: Disable Confirm button when no changes in edit mode**

  Find the Confirm button. Wrap its `disabled` prop:

  ```typescript
  disabled={isEditMode && (!editDiff || editDiff.length === 0)}
  title={isEditMode && (!editDiff || editDiff.length === 0)
    ? 'No changes detected'
    : undefined}
  ```

- [ ] **Step 5: Manual test**

  1. Open edit mode on a marked attendance period
  2. Toggle 2 students
  3. Click "Save Attendance" → verify modal shows the diff table with both changes
  4. Verify "These changes will be recorded in the audit log" text is visible
  5. Open edit mode but toggle nothing → verify Confirm is disabled with "No changes detected" tooltip

- [ ] **Step 6: Commit**

  ```bash
  git add "app/(routes)/academic/attendance/mark/components/attendance-summary-modal.tsx"
  git commit -m "feat(ui): add edit diff preview to attendance summary modal"
  ```

---

## Task 8: UI — Audit History Section on Report Page

**Files:**
- Modify: `app/(routes)/academic/attendance/reports/[id]/page.tsx`

- [ ] **Step 1: Read the existing report page**

  ```bash
  wc -l "app/(routes)/academic/attendance/reports/[id]/page.tsx"
  ```

  Then read the last 100 lines to understand where to append the audit section:
  ```bash
  tail -100 "app/(routes)/academic/attendance/reports/[id]/page.tsx"
  ```

- [ ] **Step 2: Add imports**

  At the top of the file, add:
  ```typescript
  import type { AttendanceAuditEntry } from '@/types/attendance'
  import { AttendanceService } from '@/lib/services/academic/attendance-service'
  import { Skeleton } from '@/components/ui/skeleton'
  ```

  (Check which are already imported before adding to avoid duplicates.)

- [ ] **Step 3: Add the audit log query**

  The `[id]` route param in this page is stored as `reportId` (confirmed: `const reportId = params.id as string` near the top of the file). Use that variable name throughout.

  Near the existing `useQuery` calls for the report data, add:

  ```typescript
  const {
    data: auditLog,
    isLoading: auditLoading,
    isError: auditError,
  } = useQuery({
    queryKey: ['attendance-audit', reportId],
    queryFn: () => AttendanceService.getAttendanceAuditLog(reportId),
    enabled: isSuperAdmin && !!reportId,
  })
  ```

- [ ] **Step 4: Add the Audit History section to JSX**

  At the bottom of the page's main content (before closing `</div>` of the page container), add:

  ```tsx
  {/* Audit History — super admin only */}
  {isSuperAdmin && (
    <div className="mt-8 space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2">
        📋 Edit History
      </h3>

      {auditLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      )}

      {auditError && (
        <p className="text-sm text-destructive">
          Could not load edit history. Please try again.
        </p>
      )}

      {!auditLoading && !auditError && (!auditLog || auditLog.length === 0) && (
        <p className="text-sm text-muted-foreground">
          No edits recorded — attendance has not been modified since first marked.
        </p>
      )}

      {!auditLoading && !auditError && auditLog && auditLog.length > 0 && (
        <div className="rounded-md border dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Period</th>
                <th className="text-left px-4 py-3 font-medium">Change</th>
                <th className="text-left px-4 py-3 font-medium">Edited By</th>
                <th className="text-left px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry: AttendanceAuditEntry) => {
                // Resolve period name from the already-loaded attendance_data JSONB
                const periodName =
                  (attendanceRecord as any)?.attendance_data?.[entry.period_id]?.period_name
                  ?? entry.period_id

                return (
                  <tr key={entry.id} className="border-t dark:border-gray-700">
                    <td className="px-4 py-3">
                      {entry.student_name ?? entry.student_id}
                      {entry.roll_number && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({entry.roll_number})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{periodName}</td>
                    <td className="px-4 py-3">
                      <span className="text-red-600 dark:text-red-400">{entry.old_status}</span>
                      {' → '}
                      <span className="text-green-600 dark:text-green-400">{entry.new_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.edited_by_name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({entry.edited_by_role})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(entry.edited_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )}
  ```

  **Note:** Check the variable name used for the loaded attendance record in the existing page — likely `attendanceRecord`, `report`, or `data`. Use whichever is correct.

- [ ] **Step 5: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | grep "reports/\[id\]" | head -20
  ```

  Expected: No errors.

- [ ] **Step 6: Manual test (report page)**

  1. Mark attendance for a period
  2. Edit it as super admin, change 2 students, confirm
  3. Navigate to the report page for that record
  4. Scroll to bottom → verify "Edit History" section appears with 2 rows
  5. Log in as HOD → navigate to same report page → verify NO "Edit History" section
  6. Log in as faculty → verify NO "Edit History" section

- [ ] **Step 7: Commit**

  ```bash
  git add "app/(routes)/academic/attendance/reports/[id]/page.tsx"
  git commit -m "feat(ui): add audit history section to attendance report page (super admin only)"
  ```

---

## Task 9: End-to-End Integration Test

- [ ] **Step 1: Run all attendance-related tests**

  ```bash
  bun test __tests__/lib/attendance/
  ```

  Expected: All tests pass.

- [ ] **Step 2: Full E2E flow — super admin**

  1. Start dev server: `bun dev`
  2. Log in as super admin
  3. Mark attendance for a period (new record)
  4. Go back to attendance, navigate to the same period
  5. Verify "Edit Attendance" button is visible
  6. Click Edit — verify banner: "Edit Mode — All changes are recorded in the audit log"
  7. Toggle 2 students (avoid OnDuty students)
  8. Click "Save Attendance" → verify modal shows diff table with exactly 2 rows
  9. Confirm → verify success toast + redirect to report page
  10. On report page → scroll to bottom → verify "Edit History" section with 2 rows showing correct names, changes, editor name, timestamp

- [ ] **Step 3: Full E2E flow — HOD (own department)**

  1. Log in as HOD
  2. Navigate to marked attendance for a period in HOD's department
  3. Verify "Edit Attendance" button IS visible
  4. Navigate to marked attendance for a different department period
  5. Verify "Edit Attendance" button is NOT visible
  6. As HOD, edit 1 student in own department → confirm
  7. Log in as super admin → navigate to report → verify audit row shows HOD's name + role

- [ ] **Step 4: Verify OnDuty protection**

  1. On a period with an OnDuty student
  2. Enter edit mode as super admin
  3. Click the OnDuty student's button → verify it does NOT toggle
  4. Verify their status stays OnDuty after saving

- [ ] **Step 5: Final commit**

  ```bash
  git add .
  git commit -m "feat(attendance): complete attendance edit feature with HOD scope + audit trail"
  ```

---

## Rollback

If issues arise:

**Database:**
```sql
DROP TABLE IF EXISTS attendance_audit_log;  -- also drops indexes and policies automatically
```
Also revert the appended blocks in both SQL files on disk:
- Remove the `CREATE TABLE` + 3 `CREATE INDEX` block from `supabase/setup/01_tables.sql`
- Remove the `ALTER TABLE` + 2 `CREATE POLICY` block from `supabase/setup/03_policies.sql`

**Service:**
- The `is_edit_mode`, `editor_profile`, and `period_id_being_edited` fields are **optional** in the DTO — existing callers that don't pass them are completely unaffected
- Remove the HOD scope check block and audit INSERT block from `attendance-core-service.ts`

**UI:**
- The UI changes are additive — revert `canEditAttendance` to `isSuperAdmin` in `mark/page.tsx` to restore original behavior
- Remove `editDiff` prop from the modal to restore the original modal
