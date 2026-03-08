# Class Incharges Module — Design Document

**Date:** 2026-03-08
**Module:** Staff / Facilitators Management
**Status:** Approved, pending implementation

---

## Overview

Add a **Class Incharges** sub-module under the existing Facilitators Management section. This allows administrators to assign one or more staff members as class incharges for any section, navigated through the institution → degree → department → program → semester → section hierarchy.

---

## Requirements

- Multiple incharges can be assigned per section (no limit, no ranking — all equal)
- Assignments are persistent (not scoped to academic year); managed via `is_active`
- Staff data sourced from the existing `staff` table
- Module lives under "Facilitators Management" in the sidebar
- Full CRUD: assign, remove, toggle active, list

---

## Database Schema

### New Table: `class_incharges`

```sql
CREATE TABLE class_incharges (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID        NOT NULL REFERENCES institutions(id),
  section_id     UUID        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  staff_id       UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID        REFERENCES profiles(id),
  updated_by     UUID        REFERENCES profiles(id),

  UNIQUE (section_id, staff_id)
);

CREATE INDEX idx_class_incharges_institution_id ON class_incharges(institution_id);
CREATE INDEX idx_class_incharges_section_id ON class_incharges(section_id);
CREATE INDEX idx_class_incharges_staff_id ON class_incharges(staff_id);
```

### RLS Policies

| Policy | Rule |
|--------|------|
| SELECT | Users with any institution access level |
| INSERT | Users with `admin/write/full` access to institution |
| UPDATE | Users with `admin/write/full` access to institution |
| DELETE | Users with `admin/full` access only |

### Design Notes

- `institution_id` denormalized from section for efficient RLS filtering (no join needed)
- `ON DELETE CASCADE` on `section_id` and `staff_id` auto-cleans orphaned assignments
- `UNIQUE(section_id, staff_id)` enforces integrity at DB level

---

## Application Architecture

### Approach: Section-List with Inline Assignment Dialog

Single page at `/staff/class-incharges/` showing sections filtered by hierarchy, with a manage dialog per row.

### File Structure

```
app/(routes)/staff/class-incharges/
├── page.tsx
└── _components/
    ├── class-incharges-page-client.tsx
    ├── class-incharges-filters.tsx
    ├── class-incharges-list.tsx
    ├── assign-incharge-dialog.tsx
    └── class-incharge-columns.tsx

lib/services/staff/
└── class-incharge-service.ts

hooks/staff/
└── use-class-incharges.ts

types/staff.ts                  ← append ClassIncharge + ClassInchargeFilters
lib/sidebarMenuLink.ts          ← add menu entry
supabase/setup/01_tables.sql    ← add table + indexes
supabase/setup/03_policies.sql  ← add 4 RLS policies
```

### Service Methods (`ClassInchargeService`)

| Method | Purpose |
|--------|---------|
| `getIncharges(filters)` | Paginated list of sections with their incharges |
| `getInchargesBySection(sectionId)` | All incharges for one section (for dialog) |
| `assignIncharge(data)` | Create assignment record |
| `removeIncharge(id)` | Hard delete assignment |
| `toggleActive(id, is_active)` | Soft enable/disable |

### React Query Hooks

| Hook | Purpose |
|------|---------|
| `useClassIncharges(filters)` | Main list query |
| `useInchargesBySection(sectionId)` | Dialog query |
| `useAssignIncharge()` | Mutation — invalidates list |
| `useRemoveIncharge()` | Mutation — invalidates list |

---

## UI/UX Flow

### Main Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Class Incharges                          [Assign Incharge +] │
│ Breadcrumb: Home > Facilitators > Class Incharges            │
├─────────────────────────────────────────────────────────────┤
│ FILTERS (collapsible card)                                   │
│ [Institution ▼] [Degree ▼] [Department ▼]                   │
│ [Program ▼]     [Semester ▼] [Section ▼]   [Reset]          │
├─────────────────────────────────────────────────────────────┤
│ DATA TABLE                                                   │
│ Section       │ Semester   │ Program  │ Incharges │ Actions  │
│ ─────────────────────────────────────────────────────────── │
│ Section A     │ Sem 1      │ B.Tech   │ 👤👤+1   │ [Manage] │
│ Section B     │ Sem 1      │ B.Tech   │ 👤       │ [Manage] │
│ Section C     │ Sem 2      │ M.Tech   │ —        │ [Assign] │
└─────────────────────────────────────────────────────────────┘
```

### Data Table Columns

| Column | Content |
|--------|---------|
| Section | `section_name` |
| Semester | semester name |
| Program | program name |
| Department | department name |
| Incharges | avatar stack (max 3 shown + overflow badge) |
| Actions | `Manage` if assigned, `Assign` if empty |

### Assign/Manage Dialog

```
┌──────────────────────────────────────────┐
│ Manage Class Incharges — Section A        │
│ B.Tech CSE › Sem 1                       │
├──────────────────────────────────────────┤
│ Currently Assigned:                       │
│  [👤 John Doe  ×]  [👤 Jane Smith  ×]   │
├──────────────────────────────────────────┤
│ Add Incharge:                             │
│ [Search staff by name...          ▼]     │
│                          [Add Staff]     │
└──────────────────────────────────────────┘
```

- Staff dropdown filtered by `institution_id`
- Already-assigned staff excluded from dropdown
- Remove (×) triggers `useRemoveIncharge` with confirmation
- "Add Staff" calls `useAssignIncharge` and refreshes instantly

---

## Permissions

| Key | Action |
|-----|--------|
| `staff.class_incharges.view` | View the list page |
| `staff.class_incharges.create` | Assign new incharge |
| `staff.class_incharges.edit` | Toggle active status |
| `staff.class_incharges.delete` | Remove assignment |

---

## Sidebar Entry

Add under "Facilitators Management" in `lib/sidebarMenuLink.ts`:

```typescript
{
  href: '/staff/class-incharges',
  label: 'Class Incharges',
  icon: UserCheck,
}
```
