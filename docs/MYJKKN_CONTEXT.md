# MyJKKN - Complete Context Guide

> Central Hub Application for JKKN Institutions
> A comprehensive multi-tenant educational management system

---

## For Child App Developers

**Building an application that connects to MyJKKN?** Start here:

| Resource | Path | Description |
|----------|------|-------------|
| **Quick Start** | [Integration Guide](./context/integration/README.md) | Architecture, patterns, getting started |
| **Authentication** | [Auth Guide](./context/integration/AUTHENTICATION.md) | Supabase Auth SSR, session management |
| **API Reference** | [API Docs](./context/integration/API_REFERENCE.md) | Complete endpoint documentation |
| **Permissions** | [RBAC Guide](./context/integration/PERMISSIONS.md) | Permission system, role templates |
| **Code Examples** | [Examples](./context/integration/EXAMPLES.md) | TypeScript/React code samples |

### Module Documentation

| Module | Documentation | Key Entities |
|--------|---------------|--------------|
| Organizations | [Docs](./context/modules/organizations/README.md) | Institutions, Degrees, Departments, Programs, Semesters, Sections, Courses |
| Students | [Docs](./context/modules/students/README.md) | Student profiles (80+ fields), promotion tracking |
| Users | [Docs](./context/modules/users/README.md) | Profiles, custom roles, institution access |
| Academic | [Docs](./context/modules/academic/README.md) | Timetables, attendance, periods, staff planning |
| Billing | [Docs](./context/modules/billing/README.md) | Categories, bills, receipts, invoices, discounts, refunds |
| Staff | [Docs](./context/modules/staff/README.md) | Staff profiles, employment categories |

> **Full Documentation Index**: [docs/context/INDEX.md](./context/INDEX.md)
> **Implementation Status**: [docs/context/IMPLEMENTATION_STATUS.md](./context/IMPLEMENTATION_STATUS.md)

---

## Quick Reference

| Property | Value |
|----------|-------|
| **Application** | MyJKKN |
| **Purpose** | Central hub for JKKN educational institutions |
| **Framework** | Next.js 15.5.7 (App Router) |
| **Language** | TypeScript 5 (strict mode) |
| **Backend** | Supabase (PostgreSQL with RLS) |
| **State Management** | React Query 5.x, Zustand |
| **UI Framework** | Radix UI (shadcn/ui) + Tailwind CSS 3.4.1 |
| **Form Handling** | React Hook Form + Zod validation |
| **Base URL (API)** | `https://jkkn.ai/api` |
| **PWA Enabled** | Yes (offline support) |

---

## 1. Project Overview

MyJKKN is a **multi-tenant educational management platform** designed to manage academic operations, billing, student data, staff management, resource booking, and more for JKKN group of institutions.

### Key Capabilities

- **Academic Management**: Timetables, attendance, staff planning, periods, academic years
- **Financial Operations**: Billing, invoices, receipts, refunds, discounts, payment gateway (HDFC)
- **Student Lifecycle**: Admissions, onboarding, profile management, promotion tracking
- **Staff Management**: Staff profiles, categories, planning, timetable assignments
- **Resource Management**: Resource booking, reservations, approvals, maintenance
- **User Administration**: Role-based access control, custom roles, activity audit
- **Notifications**: Push notifications, in-app notifications, email alerts
- **AI Integration**: Natural language query system for data insights
- **Bug Tracking**: Internal bug reporting and tracking system

---

## 2. Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js (App Router) | 15.5.7 |
| Language | TypeScript | 5.x |
| Runtime | React | 18.2.0 |
| Backend | Supabase | Latest |
| Database | PostgreSQL | 15+ |
| State Management | React Query | 5.72.1 |
| Client State | Zustand | Latest |
| UI Components | Radix UI (shadcn/ui) | Latest |
| CSS Framework | Tailwind CSS | 3.4.1 |
| Form Library | React Hook Form | Latest |
| Validation | Zod | Latest |
| Charts | Chart.js | Latest |
| Tables | TanStack Table | 8.x |
| Animation | Framer Motion | Latest |
| Icons | Lucide React | Latest |
| PDF Generation | jsPDF | Latest |
| Excel Export | ExcelJS | Latest |

---

## 3. Architecture Overview

### 5-Layer Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Pages Layer                                           │
│  Location: app/(routes)/[module]/                               │
│  Purpose: Route handlers, page composition, layout              │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: Components Layer                                      │
│  Location: components/ + app/(routes)/[module]/_components/     │
│  Purpose: Reusable UI, forms, tables, dialogs                   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: Hooks Layer                                           │
│  Location: hooks/[module]/                                      │
│  Purpose: State management, data fetching, side effects         │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4: Services Layer                                        │
│  Location: lib/services/[module]/                               │
│  Purpose: Business logic, Supabase operations, validation       │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 5: Database Layer (Supabase)                             │
│  Location: supabase/setup/                                      │
│  Purpose: Tables, RLS policies, functions, triggers             │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Pattern

```
User Action → Page → Component → Hook → Service → Supabase → Database
                                   ↑                          ↓
                                   └──── Response Data ───────┘
```

### Key Architectural Patterns

- **Multi-tenancy**: Institution-based data isolation via `institution_id`
- **RLS Policies**: Database-level security for all tables
- **RBAC**: Role-based access control with 240+ permissions
- **React Query**: Server state management with caching
- **Server Components**: Default for pages, client components for interactivity

---

## 4. Module Registry

### Complete Module List (19 Modules)

| Module | Path | Description | Key Features |
|--------|------|-------------|--------------|
| **academic** | `/academic/` | Academic operations management | Timetables, attendance, periods, staff planning, academic years |
| **admin** | `/admin/` | System administration | Bug reports viewer, AI query tools, system settings |
| **admissions** | `/admissions/` | Student admissions CRM | Application management, analytics, pipeline tracking |
| **ai-query** | `/ai-query/` | AI-powered data insights | Natural language queries, context-aware responses |
| **application-hub** | `/application-hub/` | Application registry | API documentation, integrated apps, categories |
| **applications** | `/applications/` | Application management | App categorization, access control |
| **audit-trail** | `/audit-trail/` | Activity logging | User activity tracking, compliance logs |
| **billing** | `/billing/` | Financial operations | Invoices, receipts, refunds, discounts, schedules, reports |
| **bug-leaderboard** | `/bug-leaderboard/` | Bug metrics | Reporter rankings, bug statistics |
| **dashboard** | `/dashboard/` | Personalized dashboard | Role-based widgets, analytics |
| **my-bug-reports** | `/my-bug-reports/` | Personal bug reports | Self-service bug tracking |
| **notifications** | `/notifications/` | Notification center | Push, in-app, email notifications |
| **organizations** | `/organizations/` | Organization structure | Institutions, departments, programs, semesters, sections, courses |
| **profile** | `/profile/` | User profile | Profile management, settings |
| **resource-management** | `/resource-management/` | Resource booking | Resources, reservations, approvals, maintenance |
| **staff** | `/staff/` | Staff management | Staff profiles, categories, dashboards |
| **students** | `/students/` | Student management | Student profiles, dashboard, promotion |
| **system** | `/system/` | System configuration | API keys, system settings |
| **users** | `/users/` | User administration | User management, roles, permissions, activity logs |

### Module Sub-Features

#### Academic Module
```
academic/
├── attendance/        # Daily attendance tracking, period-wise
├── timetables/        # Timetable management, slot assignments
├── periods/           # Period configuration per institution
├── staff-planning/    # Staff allocation, course assignments
└── academic-years/    # Academic year management
```

#### Billing Module
```
billing/
├── schedule/          # Bill generation schedules
├── invoices/          # Invoice generation and management
├── receipts/          # Payment receipts
├── refunds/           # Refund processing
├── discounts/         # Discount management
├── reports/           # Financial reports
└── categories/        # Bill categories (parent, sub, item)
```

#### Organizations Module
```
organizations/
├── institutions/      # Institution management
├── departments/       # Department structure
├── programs/          # Academic programs
├── semesters/         # Semester configuration
├── sections/          # Class sections
├── courses/           # Course catalog
└── degrees/           # Degree types
```

---

## 5. Database Schema Summary

### Overview Statistics

| Metric | Count |
|--------|-------|
| Total Tables | 68 |
| Total Fields | 1,200+ |
| Stored Functions | 236+ |
| RLS Policies | 250+ |
| Database Triggers | 72 |
| Views | 7 |
| Indexes | 382 |

> **Detailed Entity Documentation**: See [docs/context/entities/](./context/entities/) for complete field definitions and relationships.

### Tables by Domain

#### Academic Domain (8 tables)
- `academic_years` - Academic year periods
- `degrees` - Degree types (UG, PG, Diploma, etc.)
- `departments` - Department information
- `programs` - Academic programs
- `semesters` - Semester configurations
- `sections` - Class sections
- `courses` - Course catalog
- `course_mappings` - Course-section mappings

#### Billing Domain (10 tables)
- `student_bills` - Individual student bills
- `receipts` - Payment receipts
- `invoices` - Generated invoices
- `discounts` - Discount records
- `refunds` - Refund transactions
- `parent_categories` - Top-level bill categories
- `sub_categories` - Sub-categories
- `item_categories` - Line item categories
- `billing_schedules` - Automated billing schedules
- `payment_transactions` - HDFC payment records

#### Users & Auth Domain (4 tables)
- `profiles` - User profile data
- `users` - Supabase auth users
- `user_institution_access` - Institution access mapping
- `custom_roles` - Custom role definitions

#### Resource Management Domain (7 tables)
- `resources` - Physical resources
- `reservations` - Booking records
- `resource_approvals` - Approval workflow
- `resource_usage_logs` - Usage tracking
- `resource_categories` - Resource categories
- `resource_attributes` - Custom attributes
- `maintenance_records` - Maintenance logs

#### Other Key Tables
- `students` - Comprehensive student profiles
- `staff` - Staff member profiles
- `staff_plans` - Staff allocation plans
- `timetables` - Timetable configurations
- `periods` - Period definitions
- `daily_attendance` - Attendance records
- `notifications` - System notifications
- `bug_reports` - Bug tracking
- `activity_logs` - Audit trail
- `api_keys` - API key management
- `applications` - Integrated applications
- `categories` - Application categories

### Standard Table Pattern

```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  -- Entity-specific fields
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id)
);

-- Standard indexes
CREATE INDEX idx_entities_institution ON entities(institution_id);
CREATE INDEX idx_entities_active ON entities(is_active);
```

---

## 6. API System Documentation

### Base URL & Authentication

```
Base URL: https://jkkn.ai/api
API Key Format: jk_xxxxx_xxxxx
Authentication: Bearer token in Authorization header
```

### Available API Endpoints

#### Organizations API
```
GET /api-management/organizations/institutions
GET /api-management/organizations/institutions/:id
GET /api-management/organizations/departments
GET /api-management/organizations/departments/:id
GET /api-management/organizations/programs
GET /api-management/organizations/degrees
GET /api-management/organizations/courses
```

#### Students API
```
GET /api-management/students
GET /api-management/students/:id
Query params: page, limit, search, institution_id
```

#### Staff API
```
GET /api-management/staff
GET /api-management/staff/:id
Query params: page, limit, is_active, institution_id, department_id
```

### Code Example: Fetching Data

```typescript
// TypeScript fetch example
const fetchStudents = async (apiKey: string) => {
  const response = await fetch(
    'https://jkkn.ai/api/api-management/students?page=1&limit=10',
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
};
```

### Standard API Response Format

```json
{
  "data": [
    { "id": "uuid", "field1": "value1", "...": "..." }
  ],
  "metadata": {
    "page": 1,
    "totalPages": 10,
    "total": 100,
    "limit": 10
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized (invalid/missing API key) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Rate Limited |

---

## 7. Authentication & Authorization

### RBAC System Overview

MyJKKN uses a **Role-Based Access Control (RBAC)** system with:

- **240+ permission mappings** in `lib/sidebarMenuLink.ts`
- **Institution-scoped access** via `user_institution_access` table
- **Custom roles** for flexible permission assignment
- **RLS policies** for database-level security

### Standard Roles

| Role | Description | Scope |
|------|-------------|-------|
| `super_admin` | Full system access | All institutions |
| `admin` | Institution administrator | Single institution |
| `hod` | Head of Department | Department level |
| `faculty` | Teaching staff | Assigned courses |
| `student` | Student user | Own data only |

### Permission Format

```
module.entity.action

Examples:
- academic.periods.view
- billing.invoices.create
- students.profile.edit
- users.roles.delete
```

### Permission Hook Usage

```typescript
// Check permissions
const { userProfile, isSuperAdmin, hasPermission } = usePermissions();

// Check institution access
const { hasAccessToInstitution, userInstitutions } = useUserInstitutionAccess();

// Permission guard component
<PermissionGuard module="academic.periods" action="create">
  <Button>Create Period</Button>
</PermissionGuard>

// Shorthand guards
<CanView module="billing.invoices">...</CanView>
<CanCreate module="students">...</CanCreate>
<CanEdit module="staff">...</CanEdit>
<CanDelete module="users.roles">...</CanDelete>
```

### Key Auth Files

| File | Purpose |
|------|---------|
| `lib/auth/auth-service.ts` | Authentication logic |
| `lib/auth/route-matcher.ts` | Route protection |
| `lib/auth/api-institution-filter.ts` | API filtering |
| `lib/constants/permissions.ts` | Permission definitions |
| `hooks/use-permissions.ts` | Permission hooks |

---

## 8. Service Layer Patterns

### Service Location Convention

```
lib/services/
├── academic/
│   ├── attendance-service.ts
│   ├── timetable-service.ts
│   ├── period-service.ts
│   └── staff-plan-service.ts
├── billing/
│   ├── billing-invoice-service.ts
│   ├── billing-receipt-service.ts
│   └── billing-refund-service.ts
├── student/
│   └── student-service.ts
├── organization/
│   ├── institution-service.ts
│   └── department-service.ts
└── [module]/
    └── [entity]-service.ts
```

### Standard Service Pattern

```typescript
// lib/services/[module]/[entity]-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';

export class EntityService {
  private static supabase = createClientSupabaseClient();

  // List with filters and pagination
  static async getEntities(filters: EntityFilters): Promise<EntityResponse> {
    let query = this.supabase
      .from('entities')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    // Pagination
    const { page = 1, limit = 10 } = filters;
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: data || [],
      metadata: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  // Get by ID
  static async getEntityById(id: string): Promise<Entity | null> {
    const { data, error } = await this.supabase
      .from('entities')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Create
  static async createEntity(data: CreateEntityDto): Promise<Entity> {
    const { data: created, error } = await this.supabase
      .from('entities')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return created;
  }

  // Update
  static async updateEntity(id: string, data: UpdateEntityDto): Promise<Entity> {
    const { data: updated, error } = await this.supabase
      .from('entities')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  // Delete
  static async deleteEntity(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('entities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
```

### Key Services by LOC

| Service | Lines of Code | Purpose |
|---------|---------------|---------|
| `ai-query-service.ts` | 24,000+ | AI query processing |
| `activity-service.ts` | 18,000+ | Activity logging |
| `student-service.ts` | 2,800+ | Student management |
| `billing-invoice-service.ts` | 3,000+ | Invoice operations |
| `timetable-service.ts` | 2,500+ | Timetable management |

---

## 9. Component Library

### UI Component Categories

#### Base UI Components (`components/ui/`)
50+ shadcn/ui components including:
- `button`, `input`, `label`, `textarea`
- `select`, `checkbox`, `radio-group`, `switch`
- `dialog`, `sheet`, `popover`, `tooltip`
- `card`, `accordion`, `tabs`, `table`
- `alert`, `badge`, `avatar`
- `calendar`, `date-picker`
- `dropdown-menu`, `command`, `combobox`
- `form`, `toast`, `skeleton`

#### Layout Components (`components/layout/`)
- `ContentLayout` - Main content wrapper with title
- `SidebarLayout` - Sidebar navigation wrapper
- `Navbar` - Top navigation bar
- `Footer` - Page footer
- `Breadcrumb` - Navigation breadcrumbs

#### Data Display (`components/`)
- `DataTable` - Advanced data table with sorting, filtering
- `CodeBlock` - Syntax-highlighted code display
- `EmptyState` - Empty data placeholder
- `LoadingSpinner` - Loading indicators

#### Module-Specific (`components/[module]/`)
- `components/admissions/` - Admission forms, pipeline
- `components/billing/` - Invoice, receipt components
- `components/bug-reporter/` - Bug reporting UI
- `components/ai-query/` - AI query interface
- `components/resource-management/` - Resource booking UI

### Component Pattern Example

```typescript
// components/[module]/entity-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // ... other fields
});

interface EntityFormProps {
  initialData?: Entity;
  onSubmit: (data: EntityFormData) => Promise<void>;
}

export function EntityForm({ initialData, onSubmit }: EntityFormProps) {
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || { name: '' }
  });

  const handleSubmit = async (data: EntityFormData) => {
    try {
      await onSubmit(data);
      toast({ title: 'Success', description: 'Entity saved' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}
```

---

## 10. Hooks Directory

### Hook Location Convention

```
hooks/
├── use-auth.ts                    # Authentication state
├── use-permissions.ts             # Permission checking (12.5K LOC)
├── use-toast.ts                   # Toast notifications
├── use-mobile.ts                  # Mobile detection
├── use-sidebar.ts                 # Sidebar state
├── use-notifications.ts           # Notifications
├── use-push-notifications.ts      # Push notification subscription
├── use-favorites.ts               # User favorites
├── academic/
│   ├── use-attendance.ts          # Attendance data
│   ├── use-timetables.ts          # Timetable management
│   ├── use-periods.ts             # Period configuration
│   └── use-staff-plans.ts         # Staff planning
├── billing/
│   ├── use-billing-invoices.ts    # Invoice management
│   ├── use-billing-receipts.ts    # Receipt management
│   └── use-student-bills.ts       # Student bills
├── students/
│   └── use-students.ts            # Student data
├── organization/
│   ├── use-institutions.ts        # Institutions
│   ├── use-departments.ts         # Departments
│   └── use-programs.ts            # Programs
└── [module]/
    └── use-[entity].ts
```

### Standard Hook Pattern

```typescript
// hooks/[module]/use-[entity].ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { EntityService } from '@/lib/services/[module]/entity-service';
import { Entity, EntityFilters } from '@/types/[module]';

interface UseEntityReturn {
  entities: Entity[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createEntity: (data: CreateEntityDto) => Promise<Entity>;
  updateEntity: (id: string, data: UpdateEntityDto) => Promise<Entity>;
  deleteEntity: (id: string) => Promise<void>;
}

export function useEntity(filters: EntityFilters = {}): UseEntityReturn {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await EntityService.getEntities(filters);
      setEntities(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createEntity = async (data: CreateEntityDto) => {
    const created = await EntityService.createEntity(data);
    await fetch();
    return created;
  };

  const updateEntity = async (id: string, data: UpdateEntityDto) => {
    const updated = await EntityService.updateEntity(id, data);
    await fetch();
    return updated;
  };

  const deleteEntity = async (id: string) => {
    await EntityService.deleteEntity(id);
    await fetch();
  };

  return {
    entities,
    loading,
    error,
    refetch: fetch,
    createEntity,
    updateEntity,
    deleteEntity
  };
}
```

### Key Hooks

| Hook | Purpose | LOC |
|------|---------|-----|
| `usePermissions` | Permission and role checking | 12,500 |
| `useAuth` | Authentication state | 1,500 |
| `useNotifications` | Notification management | 800 |
| `useUserInstitutionAccess` | Institution access checking | 600 |
| `useTimetables` | Timetable CRUD operations | 1,200 |
| `useAttendance` | Attendance management | 1,000 |

---

## 11. AI Integration

### AI Query System Overview

MyJKKN includes a **context-aware AI query system** that allows users to ask natural language questions about their data.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Service | `lib/services/ai-query-service.ts` | Query processing, tool execution |
| Types | `types/ai-query.ts` | TypeScript definitions |
| Hook | `hooks/use-ai-query.ts` | React hook for queries |
| UI | `components/ai-query/` | Query interface components |
| Page | `app/(routes)/ai-query/` | AI query page |

### Features

- **Context-Aware**: Queries consider user role, institution, and permissions
- **Tool Registry**: 100+ available tools for data retrieval
- **Rate Limiting**: Per-user query limits
- **Action Tiers**: Read, write, admin action levels
- **Permission-Based**: Tools filtered by user permissions
- **Rich Results**: Tables, charts, summaries

### AI Query Flow

```
User Query → Context Building → Tool Selection → Execution → Formatting → Response
                   ↓                  ↓              ↓
            User Role &         Tool Registry    Supabase
            Institution         & Permissions    Queries
```

### Usage Example

```typescript
import { useAIQuery } from '@/hooks/use-ai-query';

function AIQueryComponent() {
  const { query, loading, result, error } = useAIQuery();

  const handleQuery = async () => {
    await query('Show me attendance statistics for this semester');
  };

  return (
    <div>
      <button onClick={handleQuery}>Ask AI</button>
      {loading && <p>Processing...</p>}
      {result && <AIResultDisplay data={result} />}
    </div>
  );
}
```

---

## 12. Development Patterns

### Adding a New Module Workflow

```
Step 1: Database Schema
└── Update supabase/setup/01_tables.sql

Step 2: TypeScript Types
└── Create types/[module].ts

Step 3: Service Layer
└── Create lib/services/[module]/[entity]-service.ts

Step 4: React Hooks
└── Create hooks/[module]/use-[entity].ts

Step 5: UI Components
└── Create app/(routes)/[module]/_components/

Step 6: Page Routes
└── Create app/(routes)/[module]/page.tsx

Step 7: Permissions
└── Update lib/sidebarMenuLink.ts
└── Update lib/constants/permissions.ts

Step 8: Database Policies
└── Update supabase/setup/03_policies.sql
```

### Page Structure Pattern

```
app/(routes)/[module]/
├── page.tsx                    # Listing page
├── layout.tsx                  # Module layout (optional)
├── new/
│   └── page.tsx                # Create form page
├── [id]/
│   ├── page.tsx                # Detail view page
│   └── edit/
│       └── page.tsx            # Edit form page
└── _components/
    ├── columns.tsx             # Table column definitions
    ├── data-table.tsx          # Data table component
    ├── entity-form.tsx         # Create/edit form
    ├── entity-filters.tsx      # Filter controls
    └── row-actions.tsx         # Row action menu
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `StudentForm.tsx` |
| Hooks | camelCase with `use` prefix | `use-students.ts` |
| Services | PascalCase with `Service` suffix | `StudentService` |
| Types | PascalCase | `Student`, `CreateStudentDto` |
| Pages | `page.tsx` | `app/(routes)/students/page.tsx` |
| Utilities | camelCase | `formatDate.ts` |

---

## 13. File Structure Reference

```
D:\Projects\MyJKKN\
├── app/
│   ├── (routes)/                 # Feature modules (19 modules)
│   │   ├── academic/
│   │   ├── admin/
│   │   ├── admissions/
│   │   ├── ai-query/
│   │   ├── application-hub/
│   │   ├── applications/
│   │   ├── audit-trail/
│   │   ├── billing/
│   │   ├── bug-leaderboard/
│   │   ├── dashboard/
│   │   ├── my-bug-reports/
│   │   ├── notifications/
│   │   ├── organizations/
│   │   ├── profile/
│   │   ├── resource-management/
│   │   ├── staff/
│   │   ├── students/
│   │   ├── system/
│   │   └── users/
│   ├── api/                      # API routes
│   ├── auth/                     # Auth routes
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # shadcn/ui components (50+)
│   ├── layout/                   # Layout components
│   ├── admissions/               # Admissions components
│   ├── billing/                  # Billing components
│   ├── ai-query/                 # AI query components
│   ├── bug-reporter/             # Bug reporter
│   └── resource-management/      # Resource components
├── hooks/
│   ├── academic/                 # Academic hooks
│   ├── billing/                  # Billing hooks
│   ├── organization/             # Organization hooks
│   ├── students/                 # Student hooks
│   └── use-*.ts                  # Utility hooks
├── lib/
│   ├── services/                 # Service layer (20 categories)
│   │   ├── academic/
│   │   ├── billing/
│   │   ├── student/
│   │   ├── organization/
│   │   └── ...
│   ├── auth/                     # Auth utilities
│   ├── supabase/                 # Supabase client
│   ├── utils/                    # Helper utilities
│   ├── constants/                # Constants & permissions
│   ├── config/                   # Configuration
│   ├── query-keys.ts             # React Query keys
│   └── sidebarMenuLink.ts        # Menu configuration
├── types/
│   ├── academics.ts
│   ├── ai-query.ts
│   ├── attendance.ts
│   ├── auth.ts
│   ├── billing.ts
│   ├── organizations.ts
│   ├── resource-management.ts
│   ├── student.ts
│   └── ...                       # 35+ type files
├── supabase/
│   ├── setup/
│   │   ├── 00_master_setup.sql   # Extensions, helpers
│   │   ├── 01_tables.sql         # Table definitions
│   │   ├── 02_functions.sql      # Stored functions
│   │   ├── 03_policies.sql       # RLS policies
│   │   ├── 04_triggers.sql       # Database triggers
│   │   ├── 05_views.sql          # Views
│   │   └── 06_foreign_keys.sql   # Foreign keys
│   ├── migrations/               # Version-controlled migrations
│   └── SQL_FILE_INDEX.md         # Database documentation
├── public/
│   ├── icons/                    # PWA icons
│   ├── manifest.json             # PWA manifest
│   └── sw.js                     # Service worker
├── docs/                         # Documentation
├── .env                          # Environment variables
├── next.config.ts                # Next.js config
├── tailwind.config.js            # Tailwind config
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
└── CLAUDE.md                     # AI development guide
```

---

## Additional Resources

### Context Documentation (For AI-Assisted Development)

The `docs/context/` folder contains comprehensive, module-wise documentation designed for students building connected applications using AI assistants:

| Resource | Path | Description |
|----------|------|-------------|
| **Documentation Index** | [docs/context/INDEX.md](./context/INDEX.md) | Complete navigation guide |
| **Implementation Status** | [docs/context/IMPLEMENTATION_STATUS.md](./context/IMPLEMENTATION_STATUS.md) | Track documentation progress |
| **Integration Guide** | [docs/context/integration/](./context/integration/) | Child app integration (5 files) |
| **Organizations Module** | [docs/context/modules/organizations/](./context/modules/organizations/) | Academic hierarchy (8 files) |
| **Students Module** | [docs/context/modules/students/](./context/modules/students/) | Student entity (80+ fields) |
| **Users Module** | [docs/context/modules/users/](./context/modules/users/) | RBAC, profiles, access |
| **Academic Module** | [docs/context/modules/academic/](./context/modules/academic/) | Timetables, attendance (6 files) |
| **Billing Module** | [docs/context/modules/billing/](./context/modules/billing/) | Financial operations (7 files) |
| **Staff Module** | [docs/context/modules/staff/](./context/modules/staff/) | Staff management (3 files) |

### Internal Documentation
- `docs/development-flow/CODEBASE_STRUCTURE.md` - Architecture overview
- `docs/development-flow/MODULE_CREATION_QUICK_START.md` - Quick start guide
- `docs/DUAL_LAYER_PERMISSION_SYSTEM.md` - Permission system details
- `CLAUDE.md` - AI development instructions

### API Documentation
- `/application-hub/api-guidelines` - API documentation (in-app)
- `app/(routes)/application-hub/api-guidelines/_components/` - API docs components

### Database Reference
- `supabase/SQL_FILE_INDEX.md` - Complete database index
- `supabase/setup/` - Schema definitions

---

## Version Info

| Component | Version |
|-----------|---------|
| Document Version | 2.0 |
| Last Updated | December 2024 |
| MyJKKN Version | 15.5.7 |
| Author | Claude Code |

### Change Log

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Dec 2024 | Added "For Child App Developers" section, corrected database statistics (68 tables), added context documentation links (40+ files), integration guide navigation |
| 1.0 | Nov 2024 | Initial document creation |

---

*This document provides a comprehensive overview of the MyJKKN system. For detailed implementation guidance, refer to the [context documentation](./context/INDEX.md) and existing code patterns.*
