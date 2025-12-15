# API Reference

> Complete endpoint documentation for MyJKKN

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:3000` |
| Production | `https://myjkkn.jkkn.ac.in` |

---

## Authentication

All API requests require authentication via Bearer token:

```
Authorization: Bearer {access_token}
```

See [AUTHENTICATION.md](./AUTHENTICATION.md) for obtaining tokens.

---

## Organizations Module

### Institutions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/institutions` | List institutions |
| GET | `/api/api-management/organization/institutions/:id` | Get institution |
| POST | `/api/organization/institutions` | Create institution |
| PUT | `/api/organization/institutions/:id` | Update institution |
| DELETE | `/api/organization/institutions/:id` | Delete institution |

### Degrees

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/degrees` | List degrees |
| GET | `/api/api-management/organization/degrees/:id` | Get degree |
| POST | `/api/organization/degrees` | Create degree |
| PUT | `/api/organization/degrees/:id` | Update degree |
| DELETE | `/api/organization/degrees/:id` | Delete degree |

### Departments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/departments` | List departments |
| GET | `/api/api-management/organization/departments/:id` | Get department |
| POST | `/api/organization/departments` | Create department |
| PUT | `/api/organization/departments/:id` | Update department |
| DELETE | `/api/organization/departments/:id` | Delete department |

### Programs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/programs` | List programs |
| GET | `/api/api-management/organization/programs/:id` | Get program |
| POST | `/api/organization/programs` | Create program |
| PUT | `/api/organization/programs/:id` | Update program |
| DELETE | `/api/organization/programs/:id` | Delete program |

### Semesters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/semesters` | List semesters |
| GET | `/api/api-management/organization/semesters/:id` | Get semester |
| POST | `/api/organization/semesters` | Create semester |
| PUT | `/api/organization/semesters/:id` | Update semester |
| DELETE | `/api/organization/semesters/:id` | Delete semester |

### Sections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/sections` | List sections |
| GET | `/api/api-management/organization/sections/:id` | Get section |
| POST | `/api/organization/sections` | Create section |
| PUT | `/api/organization/sections/:id` | Update section |
| DELETE | `/api/organization/sections/:id` | Delete section |

### Courses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/courses` | List courses |
| GET | `/api/api-management/organization/courses/:id` | Get course |
| POST | `/api/organization/courses` | Create course |
| PUT | `/api/organization/courses/:id` | Update course |
| DELETE | `/api/organization/courses/:id` | Delete course |

### Course Mappings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organization/course-mappings` | List mappings |
| POST | `/api/organization/course-mappings` | Create mapping |
| DELETE | `/api/organization/course-mappings/:id` | Delete mapping |

---

## Students Module

### Student Records

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/students/list` | List students |
| GET | `/api/api-management/students/list/:id` | Get student |
| POST | `/api/students/list` | Create student |
| PUT | `/api/students/list/:id` | Update student |
| DELETE | `/api/students/list/:id` | Delete student |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search name, roll number, email |
| `institution_id` | UUID | Filter by institution |
| `degree_id` | UUID | Filter by degree |
| `department_id` | UUID | Filter by department |
| `program_id` | UUID | Filter by program |
| `semester_id` | UUID | Filter by semester |
| `section_id` | UUID | Filter by section |
| `status` | string | active/inactive/pending/exited/graduated |
| `entry_type` | string | regular/lateral/transfer |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Users Module

### Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/users/profiles` | List profiles |
| GET | `/api/api-management/users/profiles/:id` | Get profile |
| PUT | `/api/users/profiles/:id` | Update profile |

### Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/users/roles` | List roles |
| GET | `/api/api-management/users/roles/:id` | Get role |
| POST | `/api/users/roles` | Create role |
| PUT | `/api/users/roles/:id` | Update role |
| DELETE | `/api/users/roles/:id` | Delete role |

### User Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/users/user-roles` | List user role assignments |
| POST | `/api/users/user-roles` | Assign role to user |
| DELETE | `/api/users/user-roles/:id` | Remove role from user |

### Institution Access

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/users/institution-access` | List access |
| POST | `/api/users/institution-access` | Grant access |
| PUT | `/api/users/institution-access/:id` | Update access |
| DELETE | `/api/users/institution-access/:id` | Revoke access |

---

## Academic Module

### Academic Years

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/academic-years` | List years |
| GET | `/api/api-management/academic/academic-years/:id` | Get year |
| POST | `/api/academic/academic-years` | Create year |
| PUT | `/api/academic/academic-years/:id` | Update year |
| DELETE | `/api/academic/academic-years/:id` | Delete year |

### Regulations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/regulations` | List regulations |
| POST | `/api/academic/regulations` | Create regulation |

### Batches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/batches` | List batches |
| POST | `/api/academic/batches` | Create batch |

### Periods

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/periods` | List periods |
| POST | `/api/academic/periods` | Create period |
| PUT | `/api/academic/periods/:id` | Update period |
| DELETE | `/api/academic/periods/:id` | Delete period |

### Timetables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/timetables` | List timetables |
| GET | `/api/api-management/academic/timetables/:id` | Get timetable |
| POST | `/api/academic/timetables` | Create timetable |
| PUT | `/api/academic/timetables/:id` | Update timetable |
| DELETE | `/api/academic/timetables/:id` | Delete timetable |

### Staff Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/staff-plans` | List plans |
| POST | `/api/academic/staff-plans` | Create plan |
| PUT | `/api/academic/staff-plans/:id` | Update plan |

### Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/attendance` | List attendance |
| GET | `/api/academic/attendance/by-date` | Get by timetable + date |
| POST | `/api/academic/attendance` | Create/upsert attendance |
| PUT | `/api/academic/attendance/:id` | Update attendance |

---

## Billing Module

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/parent-categories` | List parent |
| GET | `/api/api-management/billing/sub-categories` | List sub |
| GET | `/api/api-management/billing/item-categories` | List items |
| POST | `/api/billing/[type]-categories` | Create category |

### Student Bills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/bills` | List bills |
| GET | `/api/api-management/billing/bills/:id` | Get bill |
| POST | `/api/billing/bills` | Create bill |
| POST | `/api/billing/bills/bulk` | Bulk create |
| PUT | `/api/billing/bills/:id` | Update bill |

### Receipts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/receipts` | List receipts |
| GET | `/api/api-management/billing/receipts/:id` | Get receipt |
| POST | `/api/billing/receipts` | Create receipt |

### Invoices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/invoices` | List invoices |
| POST | `/api/billing/invoices` | Create invoice |

### Discounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/discounts` | List discounts |
| POST | `/api/billing/discounts` | Create discount |
| PUT | `/api/billing/discounts/:id/approve` | Approve discount |

### Refunds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/billing/refunds` | List refunds |
| POST | `/api/billing/refunds` | Create refund |
| PUT | `/api/billing/refunds/:id/approve` | Approve refund |

---

## Staff Module

### Staff Records

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/list` | List staff |
| GET | `/api/api-management/staff/list/:id` | Get staff |
| POST | `/api/staff/list` | Create staff |
| PUT | `/api/staff/list/:id` | Update staff |
| DELETE | `/api/staff/list/:id` | Delete staff |

### Employment Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/categories` | List categories |
| POST | `/api/staff/categories` | Create category |

---

## Response Formats

### List Response

```json
{
  "data": [
    { "id": "uuid-1", ... },
    { "id": "uuid-2", ... }
  ],
  "metadata": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### Single Item Response

```json
{
  "data": {
    "id": "uuid",
    "field": "value",
    ...
  }
}
```

### Create Response

```json
{
  "data": {
    "id": "new-uuid",
    ...
  },
  "message": "Created successfully"
}
```

### Error Response

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "statusCode": 400
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 500 | Server Error |

---

*Last Updated: December 2024*
