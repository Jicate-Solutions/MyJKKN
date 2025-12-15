# Staff Entity - Complete Context

> Staff member records with 25+ fields

---

## Overview

The `staff` table stores employee records including personal information, employment details, and department assignments.

### Table Name
`public.staff`

---

## Data Model

### Primary Entity: staff

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `staff_id` | TEXT | No | - | Employee ID (e.g., "FAC001") |
| `first_name` | TEXT | Yes | - | First name |
| `last_name` | TEXT | Yes | - | Last name |
| `gender` | TEXT | Yes | - | male/female/bigender |
| `date_of_birth` | DATE | Yes | - | Birth date |
| `marital_status` | TEXT | Yes | - | single/married/divorced/widow |
| `blood_group` | TEXT | No | - | Blood group |
| `email` | TEXT | Yes | - | Personal email |
| `phone` | TEXT | Yes | - | Contact number |
| `institution_email` | TEXT | Yes | - | Official email |
| `profile_picture` | TEXT | No | - | Photo URL |
| `address` | TEXT | No | - | Full address |
| `state` | TEXT | No | - | State name |
| `district` | TEXT | No | - | District name |
| `pincode` | TEXT | No | - | Postal code |
| `date_of_joining` | DATE | Yes | - | Employment start date |
| `designation` | TEXT | Yes | - | Job title |
| `category_id` | UUID | Yes | - | FK to employment_categories |
| `institution_id` | UUID | Yes | - | FK to institutions |
| `department_id` | UUID | Yes | - | FK to departments |
| `is_active` | BOOLEAN | Yes | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `updated_by` | UUID | No | - | Last modifier |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Enum Values

### Gender
```typescript
type Gender = 'male' | 'female' | 'bigender';
```

### Marital Status
```typescript
type MaritalStatus = 'single' | 'married' | 'divorced' | 'widow';
```

### Blood Group
```typescript
type BloodGroup =
  | 'A+' | 'A-'
  | 'B+' | 'B-'
  | 'AB+' | 'AB-'
  | 'O+' | 'O-'
  | 'A1+' | 'A1B';
```

---

## TypeScript Types

```typescript
export interface Staff {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  institution_email: string;

  // Foreign keys
  category_id: string;
  institution_id: string;
  department_id: string;

  // Related data
  category?: EmploymentCategory;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
  };

  // Audit fields
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  category_id: string;
  institution_id: string;
  institution_email: string;
  department_id: string;
  is_active?: boolean;
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {}

export interface StaffFilters {
  search?: string;
  category_id?: string;
  institution_id?: string;
  institution_email?: string;
  department_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `employment_categories` | `category_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `profiles` | `created_by` | Many-to-One |
| `profiles` | `updated_by` | Many-to-One |

### Referenced By

| Table | Via | Description |
|-------|-----|-------------|
| `staff_plan_courses` | `staff_ids[]` | Course assignments |
| `staff_plan_courses` | `primary_staff_id` | Primary instructor |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/staff/list` | List staff |
| GET | `/api/api-management/staff/list/:id` | Get staff by ID |
| POST | `/api/staff/list` | Create staff |
| PUT | `/api/staff/list/:id` | Update staff |
| DELETE | `/api/staff/list/:id` | Delete staff |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search name, email, staff_id |
| `institution_id` | UUID | Filter by institution |
| `department_id` | UUID | Filter by department |
| `category_id` | UUID | Filter by category |
| `isActive` | boolean | Filter by active status |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Sample Data

### Faculty Staff

```json
{
  "id": "staff-uuid-1",
  "staff_id": "FAC001",
  "first_name": "Dr. Ramesh",
  "last_name": "Kumar",
  "gender": "male",
  "date_of_birth": "1975-05-15",
  "marital_status": "married",
  "blood_group": "O+",
  "email": "ramesh.kumar@gmail.com",
  "phone": "9876543210",
  "institution_email": "ramesh@jkkn.ac.in",
  "profile_picture": "/uploads/staff/ramesh.jpg",
  "address": "123, Main Street, Komarapalayam",
  "state": "Tamil Nadu",
  "district": "Namakkal",
  "pincode": "638183",
  "date_of_joining": "2010-06-01",
  "designation": "Associate Professor",
  "category_id": "cat-faculty",
  "institution_id": "inst-uuid",
  "department_id": "dept-cse",
  "is_active": true,
  "category": {
    "id": "cat-faculty",
    "category_name": "Teaching Faculty"
  },
  "institution": {
    "id": "inst-uuid",
    "name": "JKKN College of Engineering",
    "counselling_code": "3839"
  },
  "department": {
    "id": "dept-cse",
    "department_name": "Computer Science and Engineering"
  }
}
```

### Administrative Staff

```json
{
  "id": "staff-uuid-2",
  "staff_id": "ADM001",
  "first_name": "Priya",
  "last_name": "Sharma",
  "gender": "female",
  "date_of_birth": "1988-10-20",
  "marital_status": "single",
  "blood_group": "A+",
  "email": "priya.sharma@gmail.com",
  "phone": "9876543211",
  "institution_email": "priya@jkkn.ac.in",
  "date_of_joining": "2018-08-15",
  "designation": "Office Coordinator",
  "category_id": "cat-admin",
  "institution_id": "inst-uuid",
  "department_id": "dept-admin",
  "is_active": true,
  "category": {
    "id": "cat-admin",
    "category_name": "Administrative Staff"
  }
}
```

---

## Dashboard Analytics

### Demographic Statistics

```typescript
interface StaffDemographicStats {
  genderDistribution: Array<{
    name: string;    // "Male", "Female", "Other"
    count: number;
    percentage: number;
  }>;
  maritalStatusDistribution: Array<{
    name: string;    // "Single", "Married", etc.
    count: number;
    percentage: number;
  }>;
  ageGroups: Array<{
    name: string;    // "20-30", "30-40", etc.
    count: number;
    percentage: number;
  }>;
}
```

### Tenure Analytics

```typescript
interface StaffTenureAnalytics {
  tenureDistribution: Array<{
    range: string;   // "0-1 years", "1-5 years", etc.
    count: number;
    percentage: number;
  }>;
  averageTenureByCategory: Array<{
    categoryName: string;
    averageTenure: number;
  }>;
  averageTenureByDepartment: Array<{
    departmentName: string;
    institutionName: string;
    averageTenure: number;
  }>;
  newHiresTrend: Array<{
    month: string;
    count: number;
  }>;
}
```

### Profile Completion

```typescript
interface StaffProfileAnalytics {
  profileCompletionBreakdown: Array<{
    field: string;          // "address", "blood_group", etc.
    completedCount: number;
    totalCount: number;
    percentage: number;
  }>;
  missingFields: Array<{
    field: string;
    missingCount: number;
    percentage: number;
  }>;
}
```

---

## Business Rules

1. **Unique Email**: `email` and `institution_email` must be unique
2. **Department in Institution**: department must belong to institution
3. **Valid Category**: category_id must reference active category
4. **DOB Validation**: date_of_birth must be in past
5. **Joining After Birth**: date_of_joining must be after date_of_birth
6. **Phone Format**: 10-digit phone number

---

## Service Location

- **Service**: `lib/services/staff/staff-service.ts`
- **Hook**: `hooks/staff/use-staff.ts`
- **Types**: `types/staff.ts`

---

*Last Updated: December 2024*
