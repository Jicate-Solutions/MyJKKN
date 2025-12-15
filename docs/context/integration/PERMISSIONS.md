# Permission System Guide

> Understanding MyJKKN's RBAC and permission structure

---

## Overview

MyJKKN uses a Role-Based Access Control (RBAC) system with:
- **Custom Roles**: Admin-defined roles with specific permissions
- **Multi-Role Assignment**: Users can have multiple roles
- **Permission Merging**: Union (OR) logic for combined permissions
- **Institution Scoping**: Permissions apply per-institution

---

## Permission Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  USER (Profile)                                                  │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Role 1    │    │   Role 2    │    │   Role 3    │         │
│  │  (Faculty)  │    │ (HOD Extra) │    │ (Billing)   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ↓                                    │
│              ┌─────────────────────────┐                        │
│              │   MERGED PERMISSIONS    │                        │
│              │   (Union / OR Logic)    │                        │
│              └─────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Merge Example

```typescript
// Role 1 (Faculty) Permissions
{
  "academic.attendance.view": true,
  "academic.attendance.mark": true,
  "students.list.view": true
}

// Role 2 (HOD) Permissions
{
  "students.list.view": true,
  "students.list.edit": true,
  "academic.timetables.view": true
}

// Merged (Union) Result
{
  "academic.attendance.view": true,
  "academic.attendance.mark": true,
  "students.list.view": true,      // From both
  "students.list.edit": true,      // From Role 2
  "academic.timetables.view": true // From Role 2
}
```

---

## Permission Key Structure

```
{module}.{entity}.{action}
```

Examples:
- `students.list.view` - View student list
- `billing.bills.create` - Create bills
- `academic.attendance.mark` - Mark attendance

---

## Complete Permission Reference

### Organization Permissions

| Key | Description |
|-----|-------------|
| `organization.institutions.view` | View institutions |
| `organization.institutions.create` | Create institutions |
| `organization.institutions.edit` | Edit institutions |
| `organization.institutions.delete` | Delete institutions |
| `organization.degrees.view` | View degrees |
| `organization.degrees.create` | Create degrees |
| `organization.degrees.edit` | Edit degrees |
| `organization.degrees.delete` | Delete degrees |
| `organization.departments.view` | View departments |
| `organization.departments.create` | Create departments |
| `organization.departments.edit` | Edit departments |
| `organization.departments.delete` | Delete departments |
| `organization.programs.view` | View programs |
| `organization.programs.create` | Create programs |
| `organization.programs.edit` | Edit programs |
| `organization.programs.delete` | Delete programs |
| `organization.semesters.view` | View semesters |
| `organization.semesters.create` | Create semesters |
| `organization.semesters.edit` | Edit semesters |
| `organization.semesters.delete` | Delete semesters |
| `organization.sections.view` | View sections |
| `organization.sections.create` | Create sections |
| `organization.sections.edit` | Edit sections |
| `organization.sections.delete` | Delete sections |
| `organization.courses.view` | View courses |
| `organization.courses.create` | Create courses |
| `organization.courses.edit` | Edit courses |
| `organization.courses.delete` | Delete courses |
| `organization.course-mappings.view` | View course mappings |
| `organization.course-mappings.create` | Create course mappings |
| `organization.course-mappings.delete` | Delete course mappings |

### Students Permissions

| Key | Description |
|-----|-------------|
| `students.dashboard.view` | View students dashboard |
| `students.list.view` | View student list |
| `students.list.create` | Create students |
| `students.list.edit` | Edit students |
| `students.list.delete` | Delete students |
| `students.promotion.view` | View promotion |
| `students.promotion.create` | Process promotion |

### Users Permissions

| Key | Description |
|-----|-------------|
| `users.dashboard.view` | View users dashboard |
| `users.profiles.view` | View user profiles |
| `users.profiles.edit` | Edit user profiles |
| `users.roles.view` | View roles |
| `users.roles.create` | Create roles |
| `users.roles.edit` | Edit roles |
| `users.roles.delete` | Delete roles |
| `users.institution-access.view` | View institution access |
| `users.institution-access.create` | Grant access |
| `users.institution-access.edit` | Modify access |
| `users.institution-access.delete` | Revoke access |

### Academic Permissions

| Key | Description |
|-----|-------------|
| `academic.dashboard.view` | View academic dashboard |
| `academic.academic-years.view` | View academic years |
| `academic.academic-years.create` | Create academic years |
| `academic.academic-years.edit` | Edit academic years |
| `academic.academic-years.delete` | Delete academic years |
| `academic.regulations.view` | View regulations |
| `academic.regulations.create` | Create regulations |
| `academic.batches.view` | View batches |
| `academic.batches.create` | Create batches |
| `academic.periods.view` | View periods |
| `academic.periods.create` | Create periods |
| `academic.periods.edit` | Edit periods |
| `academic.periods.delete` | Delete periods |
| `academic.timetables.view` | View timetables |
| `academic.timetables.create` | Create timetables |
| `academic.timetables.edit` | Edit timetables |
| `academic.timetables.delete` | Delete timetables |
| `academic.staff-plans.view` | View staff plans |
| `academic.staff-plans.create` | Create staff plans |
| `academic.staff-plans.edit` | Edit staff plans |
| `academic.attendance.view` | View attendance |
| `academic.attendance.mark` | Mark attendance |
| `academic.attendance.edit` | Edit attendance |

### Billing Permissions

| Key | Description |
|-----|-------------|
| `billing.dashboard.view` | View billing dashboard |
| `billing.categories.view` | View categories |
| `billing.categories.manage` | Manage categories |
| `billing.bills.view` | View bills |
| `billing.bills.create` | Create bills |
| `billing.bills.edit` | Edit bills |
| `billing.bills.delete` | Delete bills |
| `billing.payments.create` | Process payments |
| `billing.receipts.view` | View receipts |
| `billing.receipts.create` | Create receipts |
| `billing.invoices.view` | View invoices |
| `billing.invoices.create` | Create invoices |
| `billing.discounts.view` | View discounts |
| `billing.discounts.create` | Apply discounts |
| `billing.discounts.approve` | Approve discounts |
| `billing.refunds.view` | View refunds |
| `billing.refunds.create` | Create refunds |
| `billing.refunds.approve` | Approve refunds |
| `billing.refunds.process` | Process refunds |
| `billing.reports.view` | View reports |

### Staff Permissions

| Key | Description |
|-----|-------------|
| `staff.dashboard.view` | View staff dashboard |
| `staff.list.view` | View staff list |
| `staff.list.create` | Create staff |
| `staff.list.edit` | Edit staff |
| `staff.list.delete` | Delete staff |
| `staff.categories.view` | View categories |
| `staff.categories.manage` | Manage categories |

---

## Role Templates

### Super Admin
All permissions enabled - full system access.

### Institution Admin
```json
{
  "organization.*": true,
  "students.*": true,
  "users.*": true,
  "academic.*": true,
  "billing.*": true,
  "staff.*": true
}
```

### Faculty
```json
{
  "academic.attendance.view": true,
  "academic.attendance.mark": true,
  "academic.timetables.view": true,
  "students.list.view": true
}
```

### Accountant
```json
{
  "billing.dashboard.view": true,
  "billing.bills.view": true,
  "billing.bills.create": true,
  "billing.payments.create": true,
  "billing.receipts.view": true,
  "billing.receipts.create": true,
  "billing.invoices.view": true,
  "billing.invoices.create": true,
  "billing.reports.view": true
}
```

### HOD (Head of Department)
```json
{
  "students.list.view": true,
  "students.list.edit": true,
  "academic.timetables.view": true,
  "academic.timetables.create": true,
  "academic.attendance.view": true,
  "academic.staff-plans.view": true,
  "academic.staff-plans.create": true,
  "staff.list.view": true
}
```

---

## Institution Access Types

| Type | Description | Capabilities |
|------|-------------|--------------|
| `full` | Full access | Read + Write all modules |
| `read_only` | Read-only access | View only, no modifications |
| `billing_only` | Billing access only | Full access to billing module only |

---

## Checking Permissions

### Client-Side (React Hook)

```typescript
import { usePermissions } from '@/hooks/use-permissions';

function Component() {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  // Check single permission
  if (hasPermission('students.list.create')) {
    // Show create button
  }

  // Check any of multiple permissions
  if (hasAnyPermission(['billing.bills.view', 'billing.receipts.view'])) {
    // Show billing section
  }

  // Check all permissions required
  if (hasAllPermissions(['billing.discounts.create', 'billing.discounts.approve'])) {
    // Full discount management
  }
}
```

### Server-Side (API Route)

```typescript
import { checkPermission } from '@/lib/permissions';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasPermission = await checkPermission(user.id, 'students.list.create');

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Proceed with operation
}
```

---

## Super Admin Bypass

Users with `is_super_admin: true` in their profile bypass all permission checks:

```typescript
function checkAccess(profile: UserProfile, permission: string): boolean {
  if (profile.is_super_admin) {
    return true; // Always allowed
  }

  return hasPermission(profile, permission);
}
```

---

## Permission Validation in API

### Route Handler Pattern

```typescript
// app/api/students/list/route.ts

export async function POST(request: NextRequest) {
  // 1. Authentication
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // 2. Permission Check
  const hasPermission = await checkUserPermission(
    user.id,
    'students.list.create'
  );

  if (!hasPermission) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Permission denied: students.list.create' },
      { status: 403 }
    );
  }

  // 3. Institution Access Check
  const body = await request.json();
  const hasInstitutionAccess = await checkInstitutionAccess(
    user.id,
    body.institution_id
  );

  if (!hasInstitutionAccess) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'No access to this institution' },
      { status: 403 }
    );
  }

  // 4. Proceed with operation
  const result = await StudentService.createStudent(body);
  return NextResponse.json({ data: result });
}
```

---

*Last Updated: December 2024*
