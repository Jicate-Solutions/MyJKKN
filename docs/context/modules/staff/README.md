# Staff Module - Complete Context

> Staff management, employment categories, and workforce analytics

---

## Overview

The Staff module manages teaching and non-teaching staff members across institutions. Staff records are linked to departments, employment categories, and can be assigned to courses for timetables.

### Key Features
- **Staff Records**: 25+ field comprehensive staff profiles
- **Employment Categories**: Faculty, Administrative, Technical staff types
- **Department Assignment**: Link staff to departments
- **Dashboard Analytics**: Demographics, tenure, profile completion
- **Staff Planning Integration**: Staff can be assigned to courses

### Database Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `staff` | Staff member records | first_name, last_name, designation |
| `employment_categories` | Staff type categories | category_name, description |

---

## Staff vs Users

| Aspect | Staff (this module) | Users/Profiles |
|--------|---------------------|----------------|
| Purpose | Employee records | Authentication/login |
| Created by | Admin registers | Admin creates + invite |
| Contains | Employment details | Auth credentials |
| Relationship | Staff may have linked profile | Profile may be staff |

### Staff-User Linking
- Staff members who need login access are linked via email
- `staff.email` = `profiles.email` for matching
- Staff without system access have no linked profile

---

## Module Entities

| Document | Description |
|----------|-------------|
| [staff-entity.md](./staff-entity.md) | Staff member record (25+ fields) |
| [categories.md](./categories.md) | Employment categories |

---

## Staff Dashboard

### Overview Statistics

```typescript
interface StaffOverviewStats {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  newHires: number;           // Current month
  profileCompletionRate: number;
  averageTenure: number;      // Years
  staffWithProfiles: number;
  staffWithoutProfiles: number;
}
```

### Available Analytics

| Metric | Description |
|--------|-------------|
| Registration Trends | Staff addition over time |
| Institution Stats | Staff count per institution |
| Department Stats | Staff count per department |
| Category Stats | Staff by employment type |
| Geographic Stats | State/district distribution |
| Demographic Stats | Gender, age, marital status |
| Tenure Analytics | Service duration analysis |
| Profile Analytics | Data completeness |

---

## Permissions

### Permission Keys

| Operation | Permission Key | Description |
|-----------|----------------|-------------|
| View Dashboard | `staff.dashboard.view` | Access staff dashboard |
| View Staff | `staff.list.view` | View staff records |
| Create Staff | `staff.list.create` | Add new staff |
| Edit Staff | `staff.list.edit` | Modify staff records |
| Delete Staff | `staff.list.delete` | Remove staff |
| View Categories | `staff.categories.view` | View categories |
| Manage Categories | `staff.categories.manage` | CRUD categories |

---

## API Endpoints Summary

### Staff Records

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/list` | List staff |
| GET | `/api/api-management/staff/list/:id` | Get staff by ID |
| POST | `/api/staff/list` | Create staff |
| PUT | `/api/staff/list/:id` | Update staff |
| DELETE | `/api/staff/list/:id` | Delete staff |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/categories` | List categories |
| GET | `/api/api-management/staff/categories/:id` | Get category |
| POST | `/api/staff/categories` | Create category |
| PUT | `/api/staff/categories/:id` | Update category |
| DELETE | `/api/staff/categories/:id` | Delete category |

---

## Staff Flow

### Staff Registration

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT INSTITUTION                                           │
│     - Choose institution for staff                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. ENTER PERSONAL INFO                                          │
│     - Name, gender, DOB, marital status                         │
│     - Contact: email, phone                                     │
│     - Address details                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. ENTER EMPLOYMENT INFO                                        │
│     - Category (Faculty, Admin, etc.)                           │
│     - Department assignment                                     │
│     - Designation                                               │
│     - Date of joining                                           │
│     - Institution email                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. UPLOAD PHOTO (Optional)                                      │
│     - Profile picture                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. SAVE STAFF RECORD                                            │
│     - Generate staff_id (if auto)                               │
│     - Create staff record                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Staff User Account Creation (Optional)

```
┌─────────────────────────────────────────────────────────────────┐
│  IF STAFF NEEDS SYSTEM ACCESS                                    │
│                                                                  │
│  1. Admin creates user profile with staff's email               │
│  2. Assigns role with appropriate permissions                   │
│  3. Grants institution access                                   │
│  4. Sends invitation email                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### Staff Planning
- Staff records available for course assignment
- `staff_plan_courses.staff_ids[]` references `staff.id`

### Timetables
- Timetable slots can have staff assigned
- `timetable_data.[day].[period].staff_ids[]` references `staff.id`

### Attendance
- Faculty can be assigned to mark attendance
- `attendance_data.[slot].assigned_faculty` contains staff info

---

## Service Locations

| Service | Path |
|---------|------|
| Staff Service | `lib/services/staff/staff-service.ts` |
| Category Service | `lib/services/staff/category-service.ts` |
| Staff Dashboard (in service) | Analytics within staff-service |

---

*Last Updated: December 2024*
