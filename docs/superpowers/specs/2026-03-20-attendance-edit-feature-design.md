# Attendance Edit Feature — Design Spec

**Date:** 2026-03-20
**Module:** Academic / Attendance
**Status:** Approved

---

## 1. Problem Statement

Once attendance is marked by a faculty member, it is immutable — no role (except super admin) can correct it. In practice, faculty sometimes mark attendance for the wrong student, or make a Present/Absent mistake. The feature adds a controlled edit capability with a full audit trail so errors can be corrected while maintaining accountability.

---

## 2. Scope

### What IS editable
- Individual student attendance **status only**: `Present` ↔ `Absent`

### What is NOT editable (even in edit mode)
- Course name, period name, faculty assignment, section, timetable, date
- `OnDuty` status — owned by the leave system, protected from manual override

### Who can edit
| Role | Scope |
|------|-------|
| **Super Admin** | Any attendance record, any institution |
| **HOD** | Only records where `timetable.department_id = profile.department_id` AND `timetable.institution_id = profile.institution_id` |
| Faculty / Others | Cannot edit — read-only |

### Who can view audit history
- **Super Admin only.** HOD and faculty have no visibility into the audit log.

---

## 3. Database Changes

### 3.1 New Table: `attendance_audit_log`

Location: `supabase/setup/01_tables.sql`

```sql
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

CREATE INDEX idx_audit_log_attendance_id ON attendance_audit_log(attendance_id);
CREATE INDEX idx_audit_log_edited_at     ON attendance_audit_log(edited_at DESC);
CREATE INDEX idx_audit_log_student_id    ON attendance_audit_log(student_id, edited_at DESC);
```

**Design notes:**
- `edited_by_name` and `edited_by_role` are denormalized — ensures display accuracy even if profile changes. `edited_by_role` is informational only and must NOT be used for access-control decisions; the authoritative role is always `get_current_user_role()`.
- **Immutable:** no UPDATE or DELETE policies. Append-only.
- `ON DELETE RESTRICT` on `attendance_id` — prevents deletion of a `student_attendance` record that has audit history. This is intentional: if a record has been edited, it cannot be deleted without first clearing its audit trail via a super admin database operation. This preserves the accountability chain.
- `attendance_id` is nullable-compatible with `RESTRICT` (not `CASCADE`) — if the parent is later force-deleted at the DB level, audit rows are orphaned rather than silently removed.
- Audit log volume per `attendance_id` is unbounded in this version; rate-limiting or max-edit-count enforcement is deferred to a future release.

### 3.2 RLS Policies for `attendance_audit_log`

Location: `supabase/setup/03_policies.sql`

```sql
-- Only super admin can read audit logs
CREATE POLICY "audit_log_select_super_admin" ON attendance_audit_log
    FOR SELECT USING (
        get_current_user_role() = 'super_admin'
    );

-- Only super admin and HOD can insert audit rows (matches edit permission table)
CREATE POLICY "audit_log_insert_by_role" ON attendance_audit_log
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('super_admin', 'hod')
    );

-- No UPDATE or DELETE policies (immutable log)
```

**Note:** The INSERT policy is intentionally narrow — only `super_admin` and `hod` match the edit permission table in Section 2. Broader roles (administrator, custom-permission faculty) may mark attendance but cannot edit it, so they must never write to the audit log.

### 3.3 No changes to `student_attendance` table
The existing `updated_at` timestamp captures when the record was last modified. Full edit history is in `attendance_audit_log`. No new columns needed on the main table.

---

## 4. Service Layer Changes

### 4.1 File to modify
**Exact path:** `lib/services/academic/attendance-service.ts`

This is the service file that exposes `saveConsolidatedAttendance` used by the mark page. Confirm by searching for `saveConsolidatedAttendance` — it should appear in this file.

### 4.2 HOD Department Scope Enforcement

Two-layer enforcement (defense in depth):

**Layer 1 — UI (before showing Edit button):**
```typescript
const isHODDepartmentMatch = isHOD &&
  profile?.department_id === contextData?.department_id &&
  profile?.institution_id === contextData?.institution_id

const canEditAttendance = isSuperAdmin || isHODDepartmentMatch
```

**Layer 2 — Service (before writing — prevents API-level bypass):**
```typescript
if (!isSuperAdmin) {
  if (profile.role !== 'hod') throw new Error('Not authorized to edit attendance')
  if (profile.department_id !== timetable.department_id) throw new Error('HOD can only edit attendance in their department')
  if (profile.institution_id !== timetable.institution_id) throw new Error('HOD can only edit attendance in their institution')
}
```

### 4.3 Updated `saveConsolidatedAttendance` — Edit Path

When `existingAttendance` is present (edit flow):

**Data shapes used in diff:**
- `existingAttendance.attendance_data` is a JSONB object: `{ [periodId]: { students: Array<{ student_id: string, status: string, section_id: string, marked_at: string }> } }`
- `updatedAttendanceData` passed by the UI is a flat per-period map for the UI state (see Section 5.3 for the flattened UI shape). The service normalizes these before diffing.
- In practice `attendanceData` in the UI is a flat `Record<studentId, 'Present' | 'Absent' | 'OnDuty'>` for the current period. The service reconstructs the full JSONB format from this before the UPSERT.

```
1. Scope check (HOD dept/institution, or super admin)
2. DIFF computation:
     oldStudents = existingAttendance.attendance_data[periodId].students
     // oldStudents is Array<{ student_id, status, ... }>
     newStudents = reconstructed students array from UI attendanceData map
     changed = students where old.status !== new.status
               AND new.status !== 'OnDuty'  ← protect OnDuty records
               AND old.status !== 'OnDuty'  ← also skip if originally OnDuty
3. UPSERT student_attendance (existing save logic, unchanged)
4. INSERT one audit row per changed student:
     {
       attendance_id: upsertedRecord.id,
       period_id: periodId,
       student_id: student.student_id,
       old_status: student.old_status,
       new_status: student.new_status,
       edited_by: profile.id,
       edited_by_name: profile.full_name,
       edited_by_role: profile.role,
       edited_at: now(),
       institution_id: institutionId,
       attendance_date: attendanceDate
     }
```

**Atomicity note:** Steps 3 and 4 run sequentially. Audit logging is best-effort — a failed audit INSERT does not roll back the attendance update. If strict atomicity is required in future, wrap in a Supabase RPC transaction.

### 4.4 New Service Method: `getAttendanceAuditLog`

```typescript
static async getAttendanceAuditLog(attendanceId: string): Promise<AttendanceAuditEntry[]>
```

```sql
SELECT
  aal.*,
  lp.full_name AS student_name,
  lp.roll_number
FROM attendance_audit_log aal
LEFT JOIN learners_profiles lp ON lp.id = aal.student_id
WHERE aal.attendance_id = $1
ORDER BY aal.edited_at DESC
```

- Returns `[]` when RLS blocks access (non-super-admin roles) — Supabase returns empty result silently.
- **Throws** on unexpected Supabase errors (network failure, malformed query). The calling component must handle the error state from `useQuery` (see Section 6.2).

### 4.5 New TypeScript Types

```typescript
export interface AttendanceAuditEntry {
  id: string
  attendance_id: string
  period_id: string
  student_id: string
  student_name?: string        // joined from learners_profiles
  roll_number?: string         // joined from learners_profiles
  old_status: 'Present' | 'Absent' | 'OnDuty'
  new_status: 'Present' | 'Absent' | 'OnDuty'
  edited_by: string
  edited_by_name: string
  edited_by_role: string       // informational only — not for access control
  edited_at: string
  institution_id: string
  attendance_date: string
}

// Used in the modal diff preview (edit mode only)
export interface AttendanceEditDiff {
  studentId: string
  studentName: string
  oldStatus: 'Present' | 'Absent'  // OnDuty excluded — edit UI never produces OnDuty
  newStatus: 'Present' | 'Absent'
}
```

**Note on `OnDuty` in `AttendanceAuditEntry`:** The `old_status` and `new_status` fields include `OnDuty` in the type for historical read completeness — in theory a future code path could record a correction involving OnDuty. In practice, the current edit UI never generates an `OnDuty` value (OnDuty is leave-system controlled). `AttendanceEditDiff` intentionally narrows to `Present | Absent` because it represents only what the edit UI can produce.

---

## 5. UI Changes — `mark/page.tsx`

### 5.1 Edit Button Visibility

**Before:**
```typescript
{isSuperAdmin && existingAttendance && <EditButton />}
```

**After:**
```typescript
const isHODDepartmentMatch = isHOD &&
  profile?.department_id === contextData?.department_id &&
  profile?.institution_id === contextData?.institution_id

const canEditAttendance = isSuperAdmin || isHODDepartmentMatch

{canEditAttendance && existingAttendance && <EditButton />}
```

`contextData` is already loaded from the timetable fetch (lines ~197–238 in current `mark/page.tsx`). No extra query needed.

### 5.2 Alert Banner States

| State | Visible To | Content |
|-------|-----------|---------|
| Existing, view mode, faculty | Faculty | "Attendance already marked" + Back button |
| Existing, view mode, HOD (dept match) | HOD | "Attendance already marked" + Edit Attendance button |
| Existing, view mode, super admin | Super Admin | "Attendance already marked" + Edit Attendance button |
| Edit mode active | HOD or Super Admin | "Edit Mode — All changes are recorded in the audit log" + View Only button |

### 5.3 UI Attendance Data Shape

`attendanceData` in `mark/page.tsx` is a **flat per-period map** for the currently selected period only:

```typescript
// attendanceData shape in component state:
Record<studentId, 'Present' | 'Absent' | 'OnDuty'>
// e.g. { 'uuid-student-1': 'Present', 'uuid-student-2': 'Absent' }
```

This is distinct from the nested JSONB stored in the database. The service reconstructs the full JSONB format before writing.

### 5.4 OnDuty Protection in Toggle

```typescript
const toggleAttendance = (studentId: string) => {
  if (existingAttendance && !isEditMode) return
  const current = attendanceData[studentId]
  // OnDuty is leave-system controlled — skip silently in both mark and edit modes
  if (current === 'OnDuty') return
  setAttendanceData(prev => ({
    ...prev,
    [studentId]: current === 'Present' ? 'Absent' : 'Present'
  }))
}
```

OnDuty students show their existing leave badge and their button is visually non-interactive in edit mode (same `opacity-60 cursor-not-allowed` style as locked buttons).

### 5.5 Confirmation Modal — Edit Diff Preview

**Where `editDiff` is computed:**
When the user clicks "Save Attendance" in edit mode, `editDiff` is computed immediately before opening `AttendanceSummaryModal` by comparing:
- `initialEditSnapshot` — a snapshot of `attendanceData` taken at the moment `setIsEditMode(true)` is called (stored in a `useRef` or separate state)
- `attendanceData` — the current state after user toggles

```typescript
// Taken when edit mode is entered:
const initialEditSnapshot = useRef<Record<string, string>>({})
// In setIsEditMode(true) handler:
initialEditSnapshot.current = { ...attendanceData }

// Computed at modal open time:
const editDiff: AttendanceEditDiff[] = students
  .filter(s => initialEditSnapshot.current[s.id] !== attendanceData[s.id])
  .filter(s => attendanceData[s.id] !== 'OnDuty')
  .map(s => ({
    studentId: s.id,
    studentName: s.full_name,
    oldStatus: initialEditSnapshot.current[s.id] as 'Present' | 'Absent',
    newStatus: attendanceData[s.id] as 'Present' | 'Absent'
  }))
```

**Modal receives `editDiff` prop** and renders an additional section in edit mode:
```
⚠️  You are editing already-marked attendance.
    The following changes will be saved:

    Student Name     Change
    Ravi Kumar       Absent → Present
    Priya S.         Present → Absent

    These changes will be recorded in the audit log.
```

If `editDiff.length === 0` (user opened edit mode but changed nothing), the Confirm button is **disabled** with tooltip: *"No changes detected."*

---

## 6. UI Changes — `reports/[id]/page.tsx`

### 6.1 Audit History Section

Rendered at the bottom of the report detail page. Conditionally rendered and fetched **only when `isSuperAdmin`**.

**Layout:**
```
📋 Edit History
──────────────────────────────────────────────────────────
Student        Period    Change            Edited By              When
Ravi Kumar     Period 3  Absent → Present  John (super_admin)     20 Mar 10:42
Priya S.       Period 3  Present → Absent  John (super_admin)     20 Mar 10:42

[Loading state]:  Skeleton rows (2–3 placeholder rows)
[Error state]:    "Could not load edit history. Please try again."
[Empty state]:    "No edits recorded — attendance has not been modified since first marked."
```

**Period name resolution:**
Period names are resolved from the already-loaded `attendance_data` JSONB on the page. Use the `period_id` from the audit row as a key:

```typescript
const periodName = attendanceRecord?.attendance_data?.[entry.period_id]?.period_name
  ?? entry.period_id  // fallback: show raw period_id if JSONB key no longer exists
```

This handles the edge case where a timetable was restructured after the audit row was written.

### 6.2 Data Loading

```typescript
// Only fetch when super admin — skips the query entirely for other roles
const {
  data: auditLog,
  isLoading: auditLoading,
  isError: auditError
} = useQuery({
  queryKey: ['attendance-audit', attendanceId],
  queryFn: () => AttendanceService.getAttendanceAuditLog(attendanceId),
  enabled: isSuperAdmin && !!attendanceId
})
```

The component renders loading skeleton, error message, empty state, or populated table based on `auditLoading`, `auditError`, and `auditLog?.length`.

---

## 7. Component Summary

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/setup/01_tables.sql` | ADD | `attendance_audit_log` table + 3 indexes |
| `supabase/setup/03_policies.sql` | ADD | RLS: SELECT (super_admin), INSERT (super_admin + hod) |
| `types/attendance.ts` | ADD | `AttendanceAuditEntry`, `AttendanceEditDiff` interfaces |
| `lib/services/academic/attendance-service.ts` | MODIFY | HOD scope check, diff logic, audit INSERT in edit path |
| `lib/services/academic/attendance-service.ts` | ADD | `getAttendanceAuditLog(attendanceId)` method |
| `app/(routes)/academic/attendance/mark/page.tsx` | MODIFY | `canEditAttendance` condition, `initialEditSnapshot` ref, OnDuty toggle protection, `editDiff` computation |
| `app/(routes)/academic/attendance/mark/components/attendance-summary-modal.tsx` | MODIFY | Add `editDiff` prop + edit diff preview section + disabled confirm when no changes |
| `app/(routes)/academic/attendance/reports/[id]/page.tsx` | ADD | Audit history section: loading/error/empty/populated states, super admin only |

---

## 8. Out of Scope (Future)

- Time-window restriction (e.g. edits only within 48 hours)
- HOD viewing their own edit history
- Faculty requesting corrections (approval workflow)
- Bulk edit across multiple students at once
- Reverting an edit back to original
- Rate-limiting or max-edit-count enforcement on the edit path
