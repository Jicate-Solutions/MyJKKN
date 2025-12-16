# Institutional Leave Management Module

**Document ID**: `2025-12-16-MODULE-leave-management`
**Status**: Draft (Pending Approval)
**Version**: 1.0.0
**Last Updated**: 2025-12-16
**Author**: Claude Code

## Overview

The Institutional Leave Management Module provides a comprehensive system for managing academic leaves, holidays, and institutional closures. Unlike individual staff/student leave applications, this module focuses on **institution-wide leave calendar management** that directly integrates with the attendance system.

### Key Objectives
1. **Academic Calendar Management**: Define working days, holidays, and study leaves
2. **Hierarchical Scope**: Apply leaves at Institution, Department, Semester, or Section level
3. **Attendance Blocking**: Automatically prevent attendance marking on leave days
4. **Role-Based Approval**: Configurable approval workflows based on custom roles
5. **Calendar Visualization**: Monthly calendar view with color-coded leave types

## Table of Contents
1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [Business Logic](#business-logic)
4. [Permission System](#permission-system)
5. [Attendance Integration](#attendance-integration)
6. [UI Components](#ui-components)
7. [Implementation Plan](#implementation-plan)
8. [Testing Strategy](#testing-strategy)

---

## Architecture

### Module Structure
```
app/(routes)/academic/
├── leave-calendar/
│   ├── page.tsx                    # Monthly calendar view
│   └── _components/
│       ├── leave-calendar.tsx      # Main calendar component
│       ├── leave-day-cell.tsx      # Individual day cell with leave indicator
│       ├── leave-details-popover.tsx # Popover showing leave details
│       └── calendar-legend.tsx     # Color legend for leave types
├── leaves/
│   ├── page.tsx                    # Leave list view
│   ├── new/page.tsx                # Create new leave
│   ├── [id]/
│   │   ├── page.tsx                # View leave details
│   │   └── edit/page.tsx           # Edit leave
│   ├── planning/page.tsx           # Academic year planning (bulk entry)
│   ├── settings/
│   │   ├── page.tsx                # Leave settings overview
│   │   ├── types/page.tsx          # Manage leave types
│   │   └── workflows/page.tsx      # Configure approval workflows
│   └── _components/
│       ├── leave-form.tsx          # Create/edit leave form
│       ├── leave-scope-selector.tsx # Hierarchy scope selector
│       ├── approval-workflow-display.tsx
│       ├── bulk-leave-import.tsx   # Import from CSV/previous year
│       └── leave-filters.tsx

lib/services/academic/
├── leave-service.ts                # Core CRUD operations
├── leave-type-service.ts           # Leave type management
├── leave-calendar-service.ts       # Calendar-specific queries
├── leave-approval-service.ts       # Approval workflow handling
└── leave-attendance-integration.ts # Attendance blocking logic

hooks/academic/
├── useLeaves.ts                    # Leave list with filtering
├── useLeaveDetail.ts               # Single leave details
├── useLeaveCalendar.ts             # Calendar data queries
├── useLeaveTypes.ts                # Leave types management
├── useLeaveApprovals.ts            # Approval actions
└── useWorkingDays.ts               # Working days calculation

types/
└── leaves.ts                       # All leave-related TypeScript types
```

### Dependencies
**External:**
- `date-fns` - Date manipulation
- `@tanstack/react-query` - Data fetching
- `shadcn/ui` - UI components (Calendar, Popover, Form)

**Internal Module Dependencies:**
- `academic/attendance` - For attendance blocking integration
- `organizations` - For hierarchy (Institution, Department, Semester, Section)
- `auth` - For user permissions and roles

---

## Database Schema

### Entity Relationship Diagram
```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│   leave_types    │     │   institution_leaves  │     │   leave_approvals    │
├──────────────────┤     ├───────────────────────┤     ├──────────────────────┤
│ id               │◄────│ leave_type_id         │────►│ leave_id             │
│ institution_id   │     │ institution_id        │     │ approver_id          │
│ leave_type_code  │     │ scope_level           │     │ approval_chain_id    │
│ leave_type_name  │     │ department_ids[]      │     │ action               │
│ color_code       │     │ semester_ids[]        │     │ comments             │
│ requires_approval│     │ section_ids[]         │     │ action_at            │
└──────────────────┘     │ start_date            │     └──────────────────────┘
                         │ end_date              │              ▲
                         │ status                │              │
                         │ requested_by          │     ┌────────┴─────────────┐
                         │ approved_by           │     │ leave_approval_chains│
                         └───────────────────────┘     ├──────────────────────┤
                                                       │ institution_id       │
                                                       │ leave_type_id        │
                                                       │ scope_level          │
                                                       │ approval_order       │
                                                       │ approver_role_key    │
                                                       └──────────────────────┘
```

### Tables

#### 1. `leave_types` - Configurable Leave Categories
```sql
-- Created: 2025-12-16
-- Purpose: Define leave categories with visual styling for calendar

CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

    -- Identification
    leave_type_code VARCHAR(50) NOT NULL,  -- 'GAZETTED', 'STUDY', 'EMERGENCY', 'CUSTOM'
    leave_type_name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Display
    color_code VARCHAR(10) NOT NULL DEFAULT '#6B7280',  -- Tailwind gray-500
    icon_name VARCHAR(50),  -- Optional icon from Lucide

    -- Behavior
    requires_approval BOOLEAN DEFAULT true,
    is_system_type BOOLEAN DEFAULT false,  -- System types can't be deleted
    blocks_attendance BOOLEAN DEFAULT true, -- Whether to block attendance

    -- Status
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    UNIQUE(institution_id, leave_type_code)
);

-- Default leave types to seed
-- 1. GAZETTED - Government holidays (color: #EF4444 - red)
-- 2. STUDY - Study leave/exam prep (color: #3B82F6 - blue)
-- 3. EMERGENCY - Unplanned closures (color: #F59E0B - amber)
-- 4. OPTIONAL - Optional holidays (color: #10B981 - green)

-- Enable RLS
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using profiles.institution_id for access control)
CREATE POLICY "Users can view leave types for their institution"
    ON leave_types FOR SELECT
    USING (
        -- Super admin can view all
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
        OR
        -- Users can view their institution's leave types
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Super admin can manage all leave types"
    ON leave_types FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Users with permission can manage their institution leave types"
    ON leave_types FOR ALL
    USING (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN custom_roles cr ON ur.role_id = cr.id
            WHERE ur.user_id = auth.uid()
            AND (cr.permissions->>'leave.types.manage')::boolean = true
        )
    );
```

#### 2. `institution_leaves` - Main Leave Records
```sql
-- Created: 2025-12-16
-- Purpose: Store institutional leave/holiday records with hierarchical scope

CREATE TABLE institution_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,

    -- Leave Details
    leave_name VARCHAR(200) NOT NULL,  -- "Diwali Holiday", "Mid-semester Study Leave"
    description TEXT,

    -- Date Range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Scope Definition (hierarchical)
    scope_level VARCHAR(20) NOT NULL DEFAULT 'institution',
    -- Possible values: 'institution', 'department', 'semester', 'section'

    -- Scope Targets (arrays for multi-select)
    department_ids UUID[] DEFAULT '{}',  -- Departments affected
    semester_ids UUID[] DEFAULT '{}',    -- Semesters affected
    section_ids UUID[] DEFAULT '{}',     -- Sections affected

    -- Academic Context
    academic_year_id UUID REFERENCES academic_years(id),

    -- Approval Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Possible values: 'pending', 'approved', 'rejected', 'cancelled'

    -- Workflow
    requested_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Recurrence (for yearly holidays)
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern JSONB,
    -- Example: {"frequency": "yearly", "month": 10, "day": 24} for Diwali
    parent_leave_id UUID REFERENCES institution_leaves(id),  -- For recurring instances

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_scope_level CHECK (
        scope_level IN ('institution', 'department', 'semester', 'section')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'approved', 'rejected', 'cancelled')
    )
);

-- Indexes for performance
CREATE INDEX idx_institution_leaves_institution ON institution_leaves(institution_id);
CREATE INDEX idx_institution_leaves_dates ON institution_leaves(start_date, end_date);
CREATE INDEX idx_institution_leaves_status ON institution_leaves(status);
CREATE INDEX idx_institution_leaves_scope ON institution_leaves(scope_level);

-- GIN indexes for array columns (for efficient "contains" queries)
CREATE INDEX idx_institution_leaves_departments ON institution_leaves USING GIN(department_ids);
CREATE INDEX idx_institution_leaves_semesters ON institution_leaves USING GIN(semester_ids);
CREATE INDEX idx_institution_leaves_sections ON institution_leaves USING GIN(section_ids);

-- Enable RLS
ALTER TABLE institution_leaves ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using profiles.institution_id for access control)
CREATE POLICY "Super admin can view all leaves"
    ON institution_leaves FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Users can view leaves for their institution"
    ON institution_leaves FOR SELECT
    USING (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        AND (status = 'approved' OR requested_by = auth.uid())
    );

CREATE POLICY "Super admin can manage all leaves"
    ON institution_leaves FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Users with permission can create leaves"
    ON institution_leaves FOR INSERT
    WITH CHECK (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN custom_roles cr ON ur.role_id = cr.id
            WHERE ur.user_id = auth.uid()
            AND (cr.permissions->>'leave.request.create')::boolean = true
        )
    );

CREATE POLICY "Users with approval permission can update leaves"
    ON institution_leaves FOR UPDATE
    USING (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN custom_roles cr ON ur.role_id = cr.id
            WHERE ur.user_id = auth.uid()
            AND (
                (cr.permissions->>'leave.approve.institution')::boolean = true
                OR (cr.permissions->>'leave.approve.department')::boolean = true
            )
        )
    );
```

#### 3. `leave_approval_chains` - Configurable Approval Workflows
```sql
-- Created: 2025-12-16
-- Purpose: Define approval chain based on leave type and scope level

CREATE TABLE leave_approval_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

    -- Criteria (which leaves this chain applies to)
    leave_type_id UUID REFERENCES leave_types(id) ON DELETE CASCADE,  -- NULL = all types
    scope_level VARCHAR(20),  -- NULL = all scope levels

    -- Approval Configuration
    approval_order INTEGER NOT NULL DEFAULT 1,
    approver_role_key VARCHAR(50) NOT NULL,  -- 'hod', 'principal', 'administrator'

    -- Behavior
    is_mandatory BOOLEAN DEFAULT true,
    can_skip_on_absence BOOLEAN DEFAULT false,
    auto_approve_after_days INTEGER,  -- Auto-approve if no action after N days

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    UNIQUE(institution_id, leave_type_id, scope_level, approval_order)
);

-- Enable RLS
ALTER TABLE leave_approval_chains ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using profiles.institution_id for access control)
CREATE POLICY "Super admin can manage all approval chains"
    ON leave_approval_chains FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Users can view approval chains for their institution"
    ON leave_approval_chains FOR SELECT
    USING (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users with permission can manage approval chains"
    ON leave_approval_chains FOR ALL
    USING (
        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN custom_roles cr ON ur.role_id = cr.id
            WHERE ur.user_id = auth.uid()
            AND (cr.permissions->>'leave.workflows.manage')::boolean = true
        )
    );
```

#### 4. `leave_approvals` - Individual Approval Actions
```sql
-- Created: 2025-12-16
-- Purpose: Track each approval action in the workflow

CREATE TABLE leave_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_id UUID NOT NULL REFERENCES institution_leaves(id) ON DELETE CASCADE,
    approval_chain_id UUID REFERENCES leave_approval_chains(id),

    -- Approver
    approver_id UUID NOT NULL REFERENCES profiles(id),
    approver_role VARCHAR(50),  -- Role at time of approval

    -- Action
    action VARCHAR(20) NOT NULL,
    -- Possible values: 'approved', 'rejected', 'forwarded', 'returned'

    -- Details
    comments TEXT,
    action_at TIMESTAMPTZ DEFAULT now(),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_action CHECK (
        action IN ('approved', 'rejected', 'forwarded', 'returned')
    )
);

-- Indexes
CREATE INDEX idx_leave_approvals_leave ON leave_approvals(leave_id);
CREATE INDEX idx_leave_approvals_approver ON leave_approvals(approver_id);

-- Enable RLS
ALTER TABLE leave_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using profiles.institution_id for access control)
CREATE POLICY "Super admin can manage all approvals"
    ON leave_approvals FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "Users can view approvals for their institution leaves"
    ON leave_approvals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM institution_leaves il
            WHERE il.id = leave_approvals.leave_id
            AND il.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Approvers can create approval actions"
    ON leave_approvals FOR INSERT
    WITH CHECK (
        approver_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM institution_leaves il
            WHERE il.id = leave_approvals.leave_id
            AND il.institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
        )
    );
```

### Migration Script
```sql
-- Migration: 2025-12-16_create_leave_management_tables

-- Create tables in order (respecting foreign keys)
-- 1. leave_types
-- 2. institution_leaves
-- 3. leave_approval_chains
-- 4. leave_approvals

-- Seed default leave types (per institution)
INSERT INTO leave_types (
    institution_id,
    leave_type_code,
    leave_type_name,
    description,
    color_code,
    is_system_type,
    display_order
)
SELECT
    id,
    'GAZETTED',
    'Gazetted Holiday',
    'Government-declared public holidays',
    '#EF4444',
    true,
    1
FROM institutions;

-- Repeat for STUDY, EMERGENCY, OPTIONAL types...
```

---

## Business Logic

### Core Features

#### 1. Leave Creation Flow
```
User with permission → Create Leave Form → Select Scope & Dates
    ↓
Validation (date conflicts, scope validity)
    ↓
Save as 'pending' → Trigger approval workflow
    ↓
Approvers notified → Approval actions recorded
    ↓
Status updated to 'approved' → Attendance blocking activated
```

#### 2. Scope Hierarchy Logic
```typescript
// Scope cascades downward:
// - institution level → affects all departments, semesters, sections
// - department level → affects all semesters and sections in those departments
// - semester level → affects all sections in those semesters
// - section level → affects only specified sections

interface LeaveScope {
  scope_level: 'institution' | 'department' | 'semester' | 'section';
  department_ids?: string[];
  semester_ids?: string[];
  section_ids?: string[];
}

function getAffectedSections(scope: LeaveScope): string[] {
  switch (scope.scope_level) {
    case 'institution':
      return getAllSections(); // All sections in institution
    case 'department':
      return getSectionsByDepartments(scope.department_ids);
    case 'semester':
      return getSectionsBySemesters(scope.semester_ids);
    case 'section':
      return scope.section_ids || [];
  }
}
```

#### 3. Approval Workflow Processing
```typescript
interface ApprovalWorkflow {
  processApproval(leaveId: string, action: 'approve' | 'reject', comments?: string): Promise<void>;
  getNextApprover(leaveId: string): Promise<ApproverInfo | null>;
  checkApprovalComplete(leaveId: string): Promise<boolean>;
}

// Workflow logic:
// 1. Get current leave status
// 2. Find applicable approval chain
// 3. Check if current user is valid approver
// 4. Record approval action
// 5. Check if all mandatory approvals complete
// 6. If complete, update leave status to 'approved'
```

### Validation Rules

| Rule | Description | Error Message |
|------|-------------|---------------|
| Date Range | end_date must be >= start_date | "End date must be after or equal to start date" |
| Scope Requirement | Department/Semester/Section required based on scope_level | "Please select at least one {scope} for this leave type" |
| No Overlap | Approved leaves cannot overlap for same scope | "This date range overlaps with existing leave: {leave_name}" |
| Academic Year | Leave dates must fall within selected academic year | "Leave dates must be within the academic year" |
| Future Dates | Leave start_date should not be in distant past | Warning: "Creating leave for past dates" |

### Working Days Calculation
```typescript
interface WorkingDaysCalculator {
  getWorkingDays(
    institutionId: string,
    startDate: Date,
    endDate: Date,
    scope?: LeaveScope
  ): Promise<{
    totalDays: number;
    workingDays: number;
    holidays: number;
    leaveDays: number;
    weekends: number;
  }>;
}

// Logic:
// 1. Get all calendar days in range
// 2. Subtract weekends (configurable per institution)
// 3. Subtract approved leaves for the scope
// 4. Return breakdown
```

---

## Permission System

### Access Control Approach
> **IMPORTANT**: This module uses `profiles.institution_id` for institution-based access control.
> - **DO NOT** use `user_institution_access` table (reserved for billing module only)
> - Super admin (`profiles.is_super_admin = true`) has full access to all institutions
> - Regular users access only their own institution via `profiles.institution_id`
> - Permissions are checked via `user_roles` + `custom_roles.permissions` JSONB

### New Permissions for Custom Roles
```typescript
// Add to custom_roles.permissions JSONB

const leavePermissions = {
  // Calendar & View
  "leave.calendar.view": boolean,       // View leave calendar
  "leave.list.view": boolean,           // View leave list

  // Request & Manage
  "leave.request.create": boolean,      // Create leave requests
  "leave.request.edit": boolean,        // Edit own requests
  "leave.request.delete": boolean,      // Delete pending requests

  // Approval (scope-based)
  "leave.approve.section": boolean,     // Approve section-level leaves
  "leave.approve.semester": boolean,    // Approve semester-level leaves
  "leave.approve.department": boolean,  // Approve department-level leaves
  "leave.approve.institution": boolean, // Approve institution-wide leaves

  // Administration
  "leave.types.view": boolean,          // View leave types
  "leave.types.manage": boolean,        // Manage leave types (CRUD)
  "leave.workflows.view": boolean,      // View approval workflows
  "leave.workflows.manage": boolean,    // Manage approval workflows
  "leave.reports.view": boolean,        // View leave reports
  "leave.reports.export": boolean,      // Export leave data
};
```

### Role-Permission Mapping (Recommended Defaults)
| Role | Key Permissions |
|------|-----------------|
| **Super Admin** | All leave permissions |
| **Administrator** | All leave permissions |
| **Principal** | `leave.approve.institution`, `leave.approve.department`, `leave.calendar.view` |
| **HOD** | `leave.approve.department`, `leave.approve.semester`, `leave.request.create`, `leave.calendar.view` |
| **Faculty** | `leave.request.create`, `leave.calendar.view`, `leave.list.view` |
| **Staff** | `leave.calendar.view` |
| **Student** | `leave.calendar.view` (view only) |

---

## Attendance Integration

### Core Integration Point
The primary integration is **blocking attendance marking when a leave is approved**.

```typescript
// lib/services/academic/leave-attendance-integration.ts

interface LeaveAttendanceIntegration {
  /**
   * Check if attendance can be marked for given date and scope
   * Called by AttendanceService before allowing attendance marking
   */
  canMarkAttendance(params: {
    institutionId: string;
    date: string;
    departmentId?: string;
    semesterId?: string;
    sectionId?: string;
  }): Promise<AttendanceBlockCheck>;

  /**
   * Get all leave days for a date range (for calendar display)
   */
  getLeaveDaysInRange(params: {
    institutionId: string;
    startDate: string;
    endDate: string;
    scope?: LeaveScope;
  }): Promise<LeaveDay[]>;

  /**
   * Calculate working days excluding approved leaves
   */
  calculateWorkingDays(params: {
    institutionId: string;
    startDate: string;
    endDate: string;
    scope?: LeaveScope;
    excludeWeekends?: boolean;
  }): Promise<WorkingDaysResult>;
}

interface AttendanceBlockCheck {
  allowed: boolean;
  reason?: string;
  leave?: {
    id: string;
    leave_name: string;
    leave_type: string;
    color_code: string;
  };
}
```

### Implementation in AttendanceService
```typescript
// Modify: lib/services/academic/attendance-service.ts

// Add at the start of attendance marking flow
async function validateAttendanceMarking(
  context: AttendanceContext
): Promise<ValidationResult> {
  // Existing validations...

  // NEW: Check for approved leaves
  const leaveCheck = await LeaveAttendanceIntegration.canMarkAttendance({
    institutionId: context.institution_id,
    date: context.attendance_date,
    departmentId: context.department_id,
    semesterId: context.semester_id,
    sectionId: context.section_id,
  });

  if (!leaveCheck.allowed) {
    return {
      valid: false,
      error: leaveCheck.reason,
      leaveInfo: leaveCheck.leave,
    };
  }

  // Continue with existing validations...
}
```

### Database Function for Efficient Checking
```sql
-- Function to check if date is blocked by leave
CREATE OR REPLACE FUNCTION is_date_blocked_by_leave(
    p_institution_id UUID,
    p_date DATE,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
) RETURNS TABLE (
    is_blocked BOOLEAN,
    leave_id UUID,
    leave_name VARCHAR,
    leave_type_name VARCHAR,
    color_code VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE as is_blocked,
        il.id as leave_id,
        il.leave_name,
        lt.leave_type_name,
        lt.color_code
    FROM institution_leaves il
    JOIN leave_types lt ON il.leave_type_id = lt.id
    WHERE il.institution_id = p_institution_id
      AND il.status = 'approved'
      AND lt.blocks_attendance = true
      AND p_date BETWEEN il.start_date AND il.end_date
      AND (
          -- Institution-wide leave affects all
          il.scope_level = 'institution'
          -- Or scope matches the given parameters
          OR (il.scope_level = 'department' AND p_department_id = ANY(il.department_ids))
          OR (il.scope_level = 'semester' AND p_semester_id = ANY(il.semester_ids))
          OR (il.scope_level = 'section' AND p_section_id = ANY(il.section_ids))
      )
    LIMIT 1;

    -- Return false if no blocking leave found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## UI Components

### 1. Leave Calendar View (`/academic/leave-calendar`)
```
┌─────────────────────────────────────────────────────────────┐
│  ◀ December 2025 ▶                        [+ Add Leave]    │
├─────────────────────────────────────────────────────────────┤
│  Mon   Tue   Wed   Thu   Fri   Sat   Sun                    │
├─────────────────────────────────────────────────────────────┤
│   1     2     3     4     5     6     7                     │
│                                                              │
│   8     9    10    11    12    13    14                     │
│              ██████████████                                  │
│              Mid-Sem Study Leave                             │
│  15    16    17    18    19    20    21                     │
│  ██    ██                                                    │
│  Holiday                                                     │
│  22    23    24    25    26    27    28                     │
│              ██                                              │
│              Christmas                                       │
│  29    30    31                                              │
├─────────────────────────────────────────────────────────────┤
│  Legend: ■ Gazetted  ■ Study  ■ Emergency  ■ Optional       │
└─────────────────────────────────────────────────────────────┘
```

### 2. Leave List View (`/academic/leaves`)
| Column | Description |
|--------|-------------|
| Leave Name | Title of the leave |
| Type | Leave type with color badge |
| Duration | Date range (e.g., "Dec 10-12, 2025") |
| Scope | Institution / Department / Semester / Section |
| Status | Pending / Approved / Rejected (with badge) |
| Actions | View / Edit / Delete / Approve |

### 3. Leave Creation Form
```
┌─────────────────────────────────────────────────────────────┐
│  Create New Leave                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Leave Name *                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Diwali Holiday                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Leave Type *                   Scope Level *               │
│  ┌─────────────────────┐       ┌─────────────────────┐     │
│  │ ■ Gazetted Holiday ▼│       │ Institution        ▼│     │
│  └─────────────────────┘       └─────────────────────┘     │
│                                                             │
│  Date Range *                                               │
│  ┌────────────────┐  to  ┌────────────────┐                │
│  │ Oct 24, 2025   │      │ Oct 26, 2025   │                │
│  └────────────────┘      └────────────────┘                │
│                                                             │
│  [If scope is Department/Semester/Section]                  │
│  Select Departments *                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ Computer Science  ☑ Pharmacy  ☐ Nursing          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Description                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Annual Diwali celebration                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ☐ Recurring (repeat every year)                           │
│                                                             │
│                           [Cancel]  [Submit for Approval]   │
└─────────────────────────────────────────────────────────────┘
```

### Component Specifications

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `LeaveCalendar` | Monthly calendar with leave display | `month`, `year`, `institutionId`, `filters` |
| `LeaveDayCell` | Individual day cell with leave indicators | `date`, `leaves[]`, `onClick` |
| `LeaveDetailsPopover` | Show leave details on hover/click | `leave`, `onEdit`, `onDelete` |
| `LeaveForm` | Create/edit leave form | `leave?`, `onSubmit`, `onCancel` |
| `LeaveScopeSelector` | Hierarchical scope selection | `scopeLevel`, `onScopeChange`, `selectedIds` |
| `ApprovalWorkflowDisplay` | Show approval chain status | `approvals[]`, `pendingApprover` |
| `BulkLeaveImport` | Import leaves from CSV/previous year | `institutionId`, `onImportComplete` |
| `LeaveFilters` | Filter controls for leave list | `filters`, `onFilterChange` |
| `WorkingDaysCounter` | Display working days calculation | `startDate`, `endDate`, `scope` |

---

## Implementation Plan

### Phase 1: Database & Core Types (Day 1-2)
1. Create migration for all 4 tables
2. Add RLS policies
3. Create TypeScript types in `types/leaves.ts`
4. Seed default leave types
5. Add leave permissions to `custom_roles`

### Phase 2: Services & Hooks (Day 3-4)
1. Implement `leave-service.ts` (CRUD operations)
2. Implement `leave-type-service.ts`
3. Implement `leave-calendar-service.ts`
4. Implement `leave-approval-service.ts`
5. Implement `leave-attendance-integration.ts`
6. Create React Query hooks

### Phase 3: Attendance Integration (Day 5)
1. Add `canMarkAttendance` check to `AttendanceService`
2. Create `is_date_blocked_by_leave` database function
3. Update attendance UI to show leave blocking message
4. Add working days calculation

### Phase 4: Leave Calendar UI (Day 6-7)
1. Create `LeaveCalendar` component
2. Create `LeaveDayCell` component
3. Create `LeaveDetailsPopover`
4. Create calendar page with filters
5. Add calendar legend

### Phase 5: Leave Management UI (Day 8-9)
1. Create leave list page with DataTable
2. Create leave form (create/edit)
3. Create scope selector component
4. Create approval workflow display

### Phase 6: Academic Year Planning (Day 10)
1. Create bulk import component
2. Create planning page
3. Add "copy from previous year" feature
4. Add recurrence support

### Phase 7: Settings & Workflows (Day 11)
1. Create leave types management page
2. Create approval workflow configuration
3. Add permission-based access control

### Phase 8: Testing & Polish (Day 12-13)
1. Unit tests for services
2. Integration tests for attendance blocking
3. E2E tests for key flows
4. UI polish and responsive design

---

## Testing Strategy

### Unit Tests
```typescript
// leave-service.test.ts
describe('LeaveService', () => {
  describe('createLeave', () => {
    it('should create leave with valid data');
    it('should reject overlapping leaves for same scope');
    it('should set status to pending when approval required');
  });

  describe('isDateBlockedByLeave', () => {
    it('should return true for institution-wide leave');
    it('should return true for matching department leave');
    it('should return false for non-matching scope');
  });
});
```

### Integration Tests
```typescript
// leave-attendance-integration.test.ts
describe('Leave-Attendance Integration', () => {
  it('should block attendance on approved leave day');
  it('should allow attendance on pending leave day');
  it('should correctly calculate working days excluding leaves');
});
```

### E2E Test Scenarios
1. **Create and approve a leave**
   - Faculty creates leave → HOD approves → Principal approves → Status approved
2. **Attendance blocking verification**
   - Create approved leave → Attempt attendance marking → Should be blocked
3. **Calendar display**
   - Navigate calendar → Verify leaves display with correct colors
4. **Bulk import**
   - Import from CSV → Verify all leaves created correctly

---

## Sidebar Menu Integration

Add to `lib/sidebarMenuLink.ts`:
```typescript
// Under Academic Management section
{
  href: '/academic/leave-calendar',
  label: 'Leave Calendar',
  icon: CalendarDays,
  permission: 'leave.calendar.view',
},
{
  href: '/academic/leaves',
  label: 'Leave Management',
  icon: CalendarOff,
  permission: 'leave.list.view',
  subItems: [
    {
      href: '/academic/leaves/planning',
      label: 'Academic Year Planning',
      permission: 'leave.request.create',
    },
    {
      href: '/academic/leaves/settings',
      label: 'Leave Settings',
      permission: 'leave.types.manage',
    },
  ],
},
```

---

## API Reference

### REST-like Supabase Queries

| Operation | Table | Query Pattern |
|-----------|-------|---------------|
| List leaves | `institution_leaves` | `.select('*, leave_types(*), profiles!requested_by(*)')` |
| Get leave by ID | `institution_leaves` | `.select('*, leave_types(*), leave_approvals(*)')` |
| Create leave | `institution_leaves` | `.insert({...})` |
| Update leave | `institution_leaves` | `.update({...}).eq('id', id)` |
| Delete leave | `institution_leaves` | `.delete().eq('id', id)` |
| Get calendar leaves | `institution_leaves` | `.select(...).gte('start_date', from).lte('end_date', to)` |

---

## Related Documentation
- [Attendance Module](./attendance-module.md)
- [Custom Roles System](../auth/custom-roles.md)
- [Academic Hierarchy](../organization/academic-hierarchy.md)

## Update Log
- **2025-12-16**: Initial documentation created (Claude Code)

---

**APPROVAL STATUS**: Pending user confirmation before implementation.

**Next Steps After Approval:**
1. Create database migration
2. Update TypeScript types
3. Implement services following the module builder pattern
4. Build UI components
5. Add permission checks
6. Test attendance integration
