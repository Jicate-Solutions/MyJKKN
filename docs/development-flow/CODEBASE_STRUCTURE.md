# MyJKKN Codebase Structure Guide

## Quick Reference

### Directory Organization

```
MyJKKN/
├── app/(routes)/              # Next.js App Router with route groups
├── components/                # Reusable React components
├── hooks/                     # Custom React hooks
├── lib/
│   ├── services/              # Business logic services
│   ├── supabase/              # Supabase configuration
│   └── utils/                 # General utilities
├── types/                     # TypeScript type definitions
├── supabase/                  # Database migrations & setup
└── public/                    # Static assets
```

### Project Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **UI**: React + Shadcn/UI + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **State**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod

---

## Module Layers

### 1. Types Layer (`types/`)

- Entity interfaces with all properties
- Create/Update DTOs
- Filter interfaces
- Response interfaces with metadata

### 2. Service Layer (`lib/services/`)

- Static classes with static methods
- Database operations using Supabase
- Business logic implementation
- Error handling and logging

### 3. Hooks Layer (`hooks/`)

- React hooks for state management
- Data fetching logic
- Loading/error states
- Reusable hook patterns

### 4. Components Layer (`components/` + `app/(routes)/[module]/_components/`)

- Reusable UI components (components/)
- Module-specific components (\_components/)
- Forms, filters, data tables
- Row actions and dialogs

### 5. Pages Layer (`app/(routes)/`)

- Listing pages with filters and tables
- Create/Edit form pages
- Detail/View pages
- Report pages

---

## Major Modules Overview

### Academic Module (`/app/(routes)/academic/`)

**Sub-modules**: Attendance, Timetables, Periods, Staff Planning, Years

**Key Services**:

- AttendanceService
- TimetableService
- PeriodService
- StaffPlanService
- AcademicYearService

**Key Hooks**:

- useAttendance()
- useTimetables()
- usePeriods()
- useStaffPlans()

**Key Types**: attendance.ts, academics.ts, staff-planning.ts

### Billing Module (`/app/(routes)/billing/`)

**Sub-modules**: Schedule, Invoices, Receipts, Refunds, Discounts, Reports, Categories

**Key Services**:

- BillingInvoiceService
- BillingReceiptService
- BillingRefundService
- BillingDiscountService
- StudentBillService
- Category services (parent, sub, item)

**Key Hooks**:

- useBillingInvoices()
- useBillingReceipts()
- useBillingRefunds()
- useStudentBills()

**Key Types**: billing.ts, billing-schedule.ts

### Student Module (`/app/(routes)/students/`)

**Sub-modules**: List, Dashboard, Promotion, Onboarding

**Key Services**:

- StudentService
- StudentProfileSyncService

**Key Hooks**:

- useStudent() / useStudents()

**Key Types**: student.ts

### Organization Module (`/app/(routes)/organization/`)

**Key Services**:

- OrganizationService
- DepartmentService
- ProgramService
- SemesterService
- SectionService
- CourseService
- DegreeService

### Staff Module (`/app/(routes)/staff/`)

**Key Services**:

- StaffService
- CategoryService

### Resource Management (`/app/(routes)/resource-management/`)

**Key Services**:

- ResourceService
- ReservationService
- MaintenanceService
- Category services

---

## Key Patterns

### Standard Page Structure

```
page.tsx (listing)
├── ContentLayout
├── Breadcrumb
├── Filters
└── DataTable

new/page.tsx (create)
└── Form

[id]/page.tsx (detail)
└── Detail components

[id]/edit/page.tsx (update)
└── Form with initial data
```

### Service Pattern

```typescript
export class EntityService {
  private static supabase = createClientSupabaseClient();

  static async getEntity(filters) { }
  static async createEntity(data) { }
  static async updateEntity(id, data) { }
  static async deleteEntity(id) { }
}
```

### Hook Pattern

```typescript
export function useEntity(filters = {}) {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => { }, [filters]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entities, loading, error, refetch: fetch };
}
```

### Data Table Pattern

- Schema validation with Zod
- Column definitions in columns.tsx
- DataTable component wrapper
- Filters component
- Row actions menu

---

## Permission & Access Control

### Permission System

- Module-based permissions (e.g., 'academic.periods.view')
- Action-based checks ('view', 'create', 'edit', 'delete')
- Role-based access (super_admin, admin, hod, faculty, etc.)
- Institution-based filtering

### Permission Guard Usage

```typescript
<PermissionGuard module='academic.periods' action='create'>
  <Button>Create Period</Button>
</PermissionGuard>

// Or use shorthand
<CanCreate module='academic.periods'>
  <Button>Create Period</Button>
</CanCreate>
```

### Institution Access

```typescript
const { userProfile, isSuperAdmin } = usePermissions();
const { hasAccessToInstitution } = useUserInstitutionAccess();
```

---

## Common Services & Hooks

### Authentication

- `useAuth()` - Current user profile and auth state
- `usePermissions()` - Permission checking
- `useUserInstitutionAccess()` - Institution access checking

### Data Management

- `useUserDashboard()` - Dashboard data
- `useNotifications()` - Notifications
- `useFavorites()` - Saved favorites
- `useActivity()` - Activity logs

---

## Database Structure

### Typical Table Pattern

```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  [entity fields],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_entities_institution ON entities(institution_id);
CREATE INDEX idx_entities_active ON entities(is_active);
```

### RLS Policies Pattern

```sql
-- Read access for authenticated users
CREATE POLICY "Enable read for authenticated users"
  ON entities FOR SELECT
  USING (auth.role() = 'authenticated_user');

-- Write access for admins only
CREATE POLICY "Enable write for admins"
  ON entities FOR INSERT
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access
      WHERE user_id = auth.uid()
      AND access_type IN ('admin', 'super_admin')
      AND is_active = true
    )
  );
```

---

## Logging Convention

### Log Format

Use module prefix: `[module/submodule]`

```typescript
console.log('[academic/attendance] Action completed:', details);
console.warn('[academic/attendance] Validation warning:', data);
console.error('[academic/attendance] Error occurred:', error);
```

### Log Levels

- `console.log()` - Info messages
- `console.warn()` - Warnings and validation issues
- `console.error()` - Errors and failures

---

## Development Workflow

1. **Create Types** → Define all TypeScript interfaces
2. **Create Service** → Implement business logic
3. **Create Hook** → Wrap service with state management
4. **Create Components** → Build UI components
5. **Create Pages** → Compose pages with components
6. **Add Permissions** → Configure menu and RLS
7. **Test & Document** → Write tests and docs

---

## File Naming Conventions

- Components: `entity-name.tsx`
- Hooks: `use-entity-name.ts`
- Services: `entity-name-service.ts`
- Types: `entity-name.ts`
- Pages: `page.tsx`
- Utilities: `entity-name-utils.ts`

---

## Additional Resources

- See `MODULE_STRUCTURE_GUIDE.md` for detailed creation guide
- Check existing modules for pattern examples
- Review Supabase setup in `supabase/setup/`
- Check permission system in `types/auth.ts`
