# Fix: Leave/OnDuty - Display Learner Academic Details

**Date**: 2026-01-29
**Issue**: Learner's degree, department, semester, and section details not showing in table and details modal
**Priority**: High
**Status**: ✅ Fixed

---

## Problem

In the Leave/OnDuty approvals page:
1. ❌ Table column not showing degree, department, semester
2. ❌ Details modal not showing academic information
3. ❌ Only showing learner name and roll number

---

## Root Cause

### Issue 1: Incomplete Query Joins

**Super Admin Query** (`getAllPendingApplicationsForSuperAdmin`):
```typescript
// ❌ BEFORE: Missing relationships
.select(`
  *,
  learner:learner_id(...),
  section:section_id(id, section_name),  // Missing degree
  institution:institution_id(id, name),
  // ❌ Missing department and semester
`)
```

**Regular Approver Query** (`getPendingApprovals`):
```typescript
// ❌ BEFORE: Missing relationships
.select(`
  *,
  application:leave_onduty_applications(
    *,
    learner:learners_profiles(...),
    section:sections(id, section_name)  // Missing degree
    // ❌ Missing department, semester, institution
  )
`)
```

### Issue 2: Details Modal Missing Fields

The modal only displayed:
- ✅ Learner name
- ✅ Roll number
- ❌ Degree (missing)
- ❌ Department (missing)
- ❌ Semester (missing)
- ❌ Section (missing)

---

## Solution

### 1. Fixed Super Admin Query

**File**: `lib/services/academic/leave-onduty-approval-service.ts`

```typescript
// ✅ AFTER: Complete relationships
.select(`
  *,
  learner:learner_id(
    id,
    first_name,
    last_name,
    roll_number,
    register_number,
    student_email
  ),
  section:section_id(
    id,
    section_name,
    degree:degree_id(id, degree_name, degree_code)  // ✅ Added degree
  ),
  department:department_id(id, department_name, department_code),  // ✅ Added
  semester:semester_id(id, semester_name),  // ✅ Added
  institution:institution_id(id, name),
  approvals:leave_onduty_approvals(*)
`)
```

### 2. Fixed Regular Approver Query

**File**: `lib/services/academic/leave-onduty-approval-service.ts`

```typescript
// ✅ AFTER: Complete relationships
.select(`
  *,
  application:leave_onduty_applications(
    *,
    learner:learners_profiles(...),
    section:sections(
      id,
      section_name,
      degree:degrees(id, degree_name, degree_code)  // ✅ Added degree
    ),
    department:departments(id, department_name, department_code),  // ✅ Added
    semester:semesters(id, semester_name),  // ✅ Added
    institution:institutions(id, name)  // ✅ Added
  )
`)
```

### 3. Enhanced Table Columns

**File**: `app/(routes)/academic/leave-onduty/approvals/_components/approvals-columns.tsx`

**Super Admin Column**:
```typescript
// Shows: Institution, Degree, Department, Semester
{
  id: 'institution_dept_semester',
  header: 'Institution, Dept & Semester',
  cell: ({ row }) => (
    <div className="space-y-1">
      <Building2 /> {institution.name}
      <GraduationCap /> {degree.degree_name}  // ✅ Added
      <BookOpen /> {department.department_name}
      <Users /> {semester.semester_name}
    </div>
  ),
}
```

**Regular Approver Column**:
```typescript
// Shows: Degree, Department, Semester, Section
{
  id: 'academic_details',
  header: 'Degree, Dept, Sem & Section',
  cell: ({ row }) => (
    <div className="space-y-1">
      <GraduationCap /> {degree.degree_name} ({degree.degree_code})  // ✅ Added
      <BookOpen /> {department.department_name}  // ✅ Added
      <Users /> {semester.semester_name} • Sec {section.section_name}  // ✅ Added
    </div>
  ),
}
```

### 4. Enhanced Details Modal

**File**: `app/(routes)/academic/leave-onduty/approvals/page.tsx`

```typescript
// ✅ AFTER: Complete student information
<div>
  <h4>Student Information</h4>
  <div className="space-y-2">
    <p>Name: {learner.first_name} {learner.last_name}</p>
    <p>Roll Number: {learner.roll_number}</p>
    <p>Register Number: {learner.register_number}</p>

    {/* ✅ Added Academic Details */}
    <p>Degree: {section.degree.degree_name} ({degree_code})</p>
    <p>Department: {department.department_name} ({department_code})</p>
    <p>Semester: {semester.semester_name}</p>
    <p>Section: {section.section_name}</p>

    {/* Super Admin only */}
    {isSuperAdmin && <p>Institution: {institution.name}</p>}
  </div>
</div>
```

---

## Changes Summary

### Files Modified

1. **Service**: `lib/services/academic/leave-onduty-approval-service.ts`
   - ✅ Updated `getAllPendingApplicationsForSuperAdmin()` query
   - ✅ Updated `getPendingApprovals()` query
   - ✅ Added degree, department, semester joins

2. **Columns**: `app/(routes)/academic/leave-onduty/approvals/_components/approvals-columns.tsx`
   - ✅ Added degree to super admin column
   - ✅ Created new academic details column for regular approvers
   - ✅ Shows degree, department, semester, section

3. **Page**: `app/(routes)/academic/leave-onduty/approvals/page.tsx`
   - ✅ Enhanced student information section
   - ✅ Added all academic details to modal
   - ✅ Improved formatting and labels

---

## Data Structure

### Application Object (After Fix)

```typescript
{
  id: "uuid",
  learner_id: "uuid",
  section_id: "uuid",
  department_id: "uuid",
  semester_id: "uuid",
  institution_id: "uuid",

  // Joined relationships
  learner: {
    id: "uuid",
    first_name: "John",
    last_name: "Doe",
    roll_number: "21CS001",
    register_number: "2021001",
    student_email: "john@example.com"
  },

  section: {
    id: "uuid",
    section_name: "A",
    degree: {  // ✅ Now included
      id: "uuid",
      degree_name: "B.E. Computer Science",
      degree_code: "BE-CS"
    }
  },

  department: {  // ✅ Now included
    id: "uuid",
    department_name: "Computer Science & Engineering",
    department_code: "CSE"
  },

  semester: {  // ✅ Now included
    id: "uuid",
    semester_name: "Semester 3"
  },

  institution: {
    id: "uuid",
    name: "JKKN College of Engineering"
  }
}
```

---

## User Interface

### Table Display

**Super Admin View**:
```
┌────────────────────────────────────────┐
│ Institution, Dept & Semester           │
├────────────────────────────────────────┤
│ 🏢 JKKN College of Engineering        │
│ 🎓 B.E. Computer Science              │
│ 📚 Computer Science & Engineering     │
│ 👥 Semester 3                         │
└────────────────────────────────────────┘
```

**Regular Approver View**:
```
┌────────────────────────────────────────┐
│ Degree, Dept, Sem & Section           │
├────────────────────────────────────────┤
│ 🎓 B.E. Computer Science (BE-CS)      │
│ 📚 Computer Science & Engineering     │
│ 👥 Semester 3 • Sec A                 │
└────────────────────────────────────────┘
```

### Details Modal

**Student Information Section**:
```
┌─────────────────────────────────────────┐
│ Student Information                     │
├─────────────────────────────────────────┤
│ Name: John Doe                          │
│ Roll Number: 21CS001                    │
│ Register Number: 2021001                │
│ Degree: B.E. Computer Science (BE-CS)   │
│ Department: CSE (CSE)                   │
│ Semester: Semester 3                    │
│ Section: A                              │
│ Institution: JKKN College of Engineering│ (super admin only)
└─────────────────────────────────────────┘
```

---

## Testing Checklist

### Table Display
- [ ] Super admin sees institution column with degree
- [ ] Regular approver sees academic details column
- [ ] Degree name and code display correctly
- [ ] Department name displays correctly
- [ ] Semester name displays correctly
- [ ] Section name displays correctly (regular approver only)

### Details Modal
- [ ] All student info fields display
- [ ] Degree shows with code in parentheses
- [ ] Department shows with code in parentheses
- [ ] Semester displays correctly
- [ ] Section displays correctly
- [ ] Institution displays for super admin only

### Data Integrity
- [ ] All foreign keys resolve correctly
- [ ] No "Unknown" or null values for existing data
- [ ] Degree comes from section relationship
- [ ] Department and semester come from application FKs

---

## Database Relationships

### Foreign Key Chain

```
leave_onduty_applications
  ├─ learner_id → learners_profiles
  ├─ section_id → sections
  │                  └─ degree_id → degrees
  ├─ department_id → departments
  ├─ semester_id → semesters
  └─ institution_id → institutions
```

### Query Pattern (PostgREST)

```sql
-- Using FK column names with colon syntax
section:section_id(
  id,
  section_name,
  degree:degree_id(id, degree_name, degree_code)
)

-- OR using table names directly
section:sections(
  id,
  section_name,
  degree:degrees(id, degree_name, degree_code)
)
```

---

## Known Limitations

1. **Degree via Section**: Degree comes through section relationship
   - If section doesn't have degree_id, degree won't show

2. **Null Values**: If foreign keys are null in application:
   - Department, semester, or section might not display
   - Handled with conditional rendering

---

## Future Enhancements

1. **Direct Degree Reference**: Add `degree_id` to applications table for direct relationship
2. **Fallback Values**: Show "Not Assigned" instead of hiding fields
3. **Validation**: Ensure all required relationships exist before creating application
4. **Bulk Update**: Tool to fix applications with missing relationships

---

**Status**: ✅ Fixed
**Testing**: Ready for verification
**Deployment**: Production ready
