# Service Request Module - Complete Implementation Plan

> **Created**: 2026-02-08
> **Module**: Service Requests (Dynamic Service Request System with Approval Workflows)
> **Status**: Planning Complete - Ready for Implementation
> **Estimated Files**: ~35 new files across types, services, hooks, API routes, and UI components

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Design Decisions Summary](#2-design-decisions-summary)
3. [Implementation Phases](#3-implementation-phases)
4. [Phase 1: Database Schema](#phase-1-database-schema)
5. [Phase 2: TypeScript Types & Validation](#phase-2-typescript-types--validation)
6. [Phase 3: Service Layer](#phase-3-service-layer)
7. [Phase 4: React Query Hooks](#phase-4-react-query-hooks)
8. [Phase 5: API Routes](#phase-5-api-routes)
9. [Phase 6: UI Pages & Components](#phase-6-ui-pages--components)
10. [Phase 7: Permission & Sidebar Integration](#phase-7-permission--sidebar-integration)
11. [Phase 8: Default Transport Service Seed](#phase-8-default-transport-service-seed)
12. [Phase 9: External TMS API Integration](#phase-9-external-tms-api-integration)
13. [Phase 10: Analytics Dashboard](#phase-10-analytics-dashboard)
14. [File Index](#file-index)
15. [Status Tracker](#status-tracker)

---

## 1. Overview & Architecture

### Module Purpose

The Service Request Module is a **dynamic, configurable service request system** that enables:
- Super Admins to define new service types with custom form fields and approval workflows
- All users (learners, faculty, staff) to submit service requests through dynamically rendered forms
- Role-based multi-step approval workflows configurable per service type
- A **default Transport Service Request** built-in, with data shared to an external TMS application via API
- Full request lifecycle tracking with timeline, comments, and internal notes

### Architecture Pattern

**Monolithic Module** — follows the existing codebase pattern (like `learners/` and `billing/`):

```
app/(routes)/service-requests/    # UI pages
lib/services/service-requests/    # Business logic (4 service files)
hooks/service-requests/           # React Query hooks
types/service-request.ts          # TypeScript types + Zod schemas
types/service-request-types.ts    # Service type configuration types
supabase/setup/01_tables.sql      # Tables (append to existing)
supabase/setup/02_functions.sql   # Functions (append to existing)
supabase/setup/03_policies.sql    # RLS policies (append to existing)
supabase/setup/04_triggers.sql    # Triggers (append to existing)
```

### Data Flow

```
Super Admin configures Service Type (fields + approval steps)
    |
User submits Service Request (dynamic form)
    |
Service validates fields & checks max_active_requests
    |
Request enters approval workflow (step-by-step, role-based)
    |
Each step: Approver can approve/reject/return
    |
On final approval: auto-fulfill (if configured) or manual fulfillment
    |
For Transport: webhook notification + pull API for TMS
    |
Close request after fulfillment
```

---

## 2. Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Service creation scope | Super Admin only, system-wide | Simplifies data model, no institution-level overrides |
| Field builder | Predefined types (text, select, date, number, boolean, textarea, file) | Covers 95% of use cases without JSON schema complexity |
| Approval model | Fully configurable per service type | Transport=1-step, others can be multi-step |
| Approver routing | Role-based only (custom_roles.role_key) | Simple, resilient, integrates with existing RBAC |
| TMS integration | Pull API + webhook notification | Robust: TMS fetches data, webhook notifies of changes |
| Transport data scope | Logistics + academic context | Helps TMS plan routes by grouping students |
| Request lifecycle | Full: draft->submitted->in_review->approved/rejected/returned->fulfilled->closed->cancelled | Complete tracking with fulfillment |
| Submit access | Per-service-type role restriction | Admin controls who can request each service |
| Concurrency | Configurable max_active_requests per type | Transport=1, others configurable |
| Dashboard views | 4 views: My Requests, Approvals, All Requests, Analytics | Comprehensive operational intelligence |
| Return flow | Configurable per approval step | Each step defines restart-from-step on return |
| Notifications | In-app + configurable email per service type | Leverages existing notification system |
| Data storage | JSONB form_data + materialized views | Flexible storage, queryable for reporting |
| API auth | API key (Bearer token) via Application Hub | Leverages existing API management |
| Service deactivation | Soft deactivate: stop new, process existing | Clean transition without disrupting in-progress |
| Attachments | Configurable per service type | Supabase Storage for file uploads |
| Fulfillment | Auto-fulfilled on approval (configurable) | Transport auto-fulfills, others manual |
| Activity log | Full timeline + internal notes | Rich audit trail with private approver notes |
| Auto-fill | Auto-populate from requester profile, read-only | Ensures data accuracy for academic context |
| Recurrence | Validity period per service type | Transport valid ~1 semester (180 days) |
| Priority | Configurable per service type | Some services allow priority, others don't |

---

## 3. Implementation Phases

```
Phase 1: Database Schema              ← Foundation
Phase 2: TypeScript Types             ← Type safety
Phase 3: Service Layer                ← Business logic
Phase 4: React Query Hooks            ← Client state
Phase 5: API Routes                   ← REST endpoints
Phase 6: UI Pages & Components        ← User interface
Phase 7: Permission & Sidebar         ← Access control
Phase 8: Transport Seed Data          ← Default service
Phase 9: External TMS API             ← Integration
Phase 10: Analytics Dashboard          ← Reporting
```

---

## Phase 1: Database Schema

### File: `supabase/setup/01_tables.sql` (APPEND to existing)

> **Status**: `[ ] Not Started`

#### Task 1.1: Create ENUM types

```sql
-- Updated: 2026-02-08 - Service Request Module
-- Service request status enum
CREATE TYPE service_request_status AS ENUM (
    'draft',
    'submitted',
    'in_review',
    'approved',
    'rejected',
    'returned',
    'fulfilled',
    'closed',
    'cancelled'
);

-- Service request field type enum
CREATE TYPE service_field_type AS ENUM (
    'text',
    'select',
    'date',
    'number',
    'boolean',
    'textarea',
    'file'
);

-- Service request priority enum
CREATE TYPE service_request_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);

-- Approval action enum
CREATE TYPE service_approval_action AS ENUM (
    'pending',
    'approved',
    'rejected',
    'returned'
);

-- Timeline event type enum
CREATE TYPE service_timeline_event_type AS ENUM (
    'status_change',
    'comment',
    'internal_note',
    'edit',
    'attachment_added',
    'system'
);
```

#### Task 1.2: Create `service_types` table

```sql
-- Service Types: Defines available service request types (Super Admin manages)
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'FileText',       -- Lucide icon name
    color VARCHAR(20) DEFAULT '#3B82F6',       -- Hex color code

    -- Configuration
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system_default BOOLEAN NOT NULL DEFAULT false,  -- true for Transport
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',         -- role_keys that can submit
    max_active_requests INTEGER NOT NULL DEFAULT 1,
    auto_fulfill_on_approval BOOLEAN NOT NULL DEFAULT false,
    enable_priority BOOLEAN NOT NULL DEFAULT false,
    enable_attachments BOOLEAN NOT NULL DEFAULT false,
    enable_email_notifications BOOLEAN NOT NULL DEFAULT true,

    -- Attachment config (when enable_attachments = true)
    attachment_config JSONB DEFAULT '{"max_files": 3, "max_size_mb": 10, "allowed_types": ["pdf", "jpg", "png", "doc", "docx"]}'::jsonb,

    -- Validity
    validity_period_days INTEGER,               -- NULL = no expiry

    -- Audit
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_service_types_slug ON service_types(slug);
CREATE INDEX idx_service_types_is_active ON service_types(is_active);
CREATE INDEX idx_service_types_is_system_default ON service_types(is_system_default);
```

#### Task 1.3: Create `service_type_fields` table

```sql
-- Service Type Fields: Dynamic form fields per service type
CREATE TABLE service_type_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,

    field_key VARCHAR(100) NOT NULL,           -- slug: pickup_location
    field_label VARCHAR(255) NOT NULL,          -- display: "Pickup Location"
    field_type service_field_type NOT NULL,
    field_options JSONB,                        -- for select: [{"label": "Route 1", "value": "route_1"}]
    is_required BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    placeholder VARCHAR(255),
    help_text TEXT,
    default_value TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite unique: no duplicate field_key per service type
    UNIQUE(service_type_id, field_key)
);

-- Indexes
CREATE INDEX idx_service_type_fields_type_id ON service_type_fields(service_type_id);
CREATE INDEX idx_service_type_fields_order ON service_type_fields(service_type_id, display_order);
```

#### Task 1.4: Create `service_request_approval_steps` table

```sql
-- Service Request Approval Steps: Configurable approval chain per service type
CREATE TABLE service_request_approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,

    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,          -- custom_roles.role_key
    is_required BOOLEAN NOT NULL DEFAULT true,
    on_return_restart_from_step INTEGER,          -- NULL = resume from current step

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite unique: no duplicate step_order per service type
    UNIQUE(service_type_id, step_order)
);

-- Indexes
CREATE INDEX idx_sr_approval_steps_type_id ON service_request_approval_steps(service_type_id);
CREATE INDEX idx_sr_approval_steps_order ON service_request_approval_steps(service_type_id, step_order);
CREATE INDEX idx_sr_approval_steps_role ON service_request_approval_steps(approver_role);
```

#### Task 1.5: Create `service_requests` table

```sql
-- Service Requests: Actual request submissions
CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(20) NOT NULL UNIQUE,  -- SR-YYYY-####

    -- References
    service_type_id UUID NOT NULL REFERENCES service_types(id),
    requester_id UUID NOT NULL REFERENCES profiles(id),
    institution_id UUID REFERENCES institutions(id),

    -- Status & workflow
    status service_request_status NOT NULL DEFAULT 'draft',
    priority service_request_priority DEFAULT 'normal',
    current_approval_step INTEGER DEFAULT 0,

    -- Dynamic form data (all field values as JSONB)
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Academic context (auto-populated from requester profile)
    requester_context JSONB DEFAULT '{}'::jsonb,
    -- Structure: { institution_name, department, program, semester, section, batch, role }

    -- Timestamps
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Validity
    validity_expires_at TIMESTAMPTZ,

    -- Cancellation
    cancellation_reason TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_service_requests_number ON service_requests(request_number);
CREATE INDEX idx_service_requests_type_id ON service_requests(service_type_id);
CREATE INDEX idx_service_requests_requester ON service_requests(requester_id);
CREATE INDEX idx_service_requests_institution ON service_requests(institution_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_priority ON service_requests(priority);
CREATE INDEX idx_service_requests_submitted_at ON service_requests(submitted_at DESC);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_service_requests_requester_type ON service_requests(requester_id, service_type_id);
CREATE INDEX idx_service_requests_status_type ON service_requests(status, service_type_id);
CREATE INDEX idx_service_requests_institution_status ON service_requests(institution_id, status);

-- Partial index for active requests (used in max_active_requests check)
CREATE INDEX idx_service_requests_active ON service_requests(requester_id, service_type_id)
    WHERE status NOT IN ('closed', 'cancelled', 'rejected');
```

#### Task 1.6: Create `service_request_approvals` table

```sql
-- Service Request Approvals: Records of approval actions
CREATE TABLE service_request_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    approval_step_id UUID REFERENCES service_request_approval_steps(id),

    step_order INTEGER NOT NULL,
    approver_id UUID NOT NULL REFERENCES profiles(id),
    action service_approval_action NOT NULL DEFAULT 'pending',
    comments TEXT,

    acted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sr_approvals_request ON service_request_approvals(service_request_id);
CREATE INDEX idx_sr_approvals_approver ON service_request_approvals(approver_id);
CREATE INDEX idx_sr_approvals_action ON service_request_approvals(action);
CREATE INDEX idx_sr_approvals_pending ON service_request_approvals(approver_id, action)
    WHERE action = 'pending';
```

#### Task 1.7: Create `service_request_timeline` table

```sql
-- Service Request Timeline: Activity log + internal notes
CREATE TABLE service_request_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id),

    event_type service_timeline_event_type NOT NULL,
    old_status service_request_status,
    new_status service_request_status,
    content TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT false,  -- true = approver-only note
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sr_timeline_request ON service_request_timeline(service_request_id);
CREATE INDEX idx_sr_timeline_created ON service_request_timeline(service_request_id, created_at DESC);
CREATE INDEX idx_sr_timeline_internal ON service_request_timeline(service_request_id, is_internal);
```

#### Task 1.8: Create `service_request_attachments` table

```sql
-- Service Request Attachments: File uploads per request
CREATE TABLE service_request_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,                           -- bytes
    file_type VARCHAR(50),                       -- mime type

    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sr_attachments_request ON service_request_attachments(service_request_id);
```

#### Task 1.9: Enable RLS on all tables

```sql
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_type_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_attachments ENABLE ROW LEVEL SECURITY;
```

### File: `supabase/setup/03_policies.sql` (APPEND to existing)

> **Status**: `[ ] Not Started`

#### Task 1.10: RLS Policies

```sql
-- Service Types: All authenticated users can view active types
CREATE POLICY "Authenticated users can view active service types"
    ON service_types FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_active = true);

-- Service Types: Only super_admin can manage
CREATE POLICY "Super admin can manage service types"
    ON service_types FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

-- Service Type Fields: Viewable if service type is viewable
CREATE POLICY "Authenticated users can view service type fields"
    ON service_type_fields FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Service Type Fields: Only super_admin can manage
CREATE POLICY "Super admin can manage service type fields"
    ON service_type_fields FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

-- Approval Steps: Viewable by authenticated users
CREATE POLICY "Authenticated users can view approval steps"
    ON service_request_approval_steps FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Approval Steps: Only super_admin can manage
CREATE POLICY "Super admin can manage approval steps"
    ON service_request_approval_steps FOR ALL
    USING (get_current_user_role() = 'super_admin')
    WITH CHECK (get_current_user_role() = 'super_admin');

-- Service Requests: Users can view own requests
CREATE POLICY "Users can view own service requests"
    ON service_requests FOR SELECT
    USING (requester_id = auth.uid());

-- Service Requests: Admins can view all
CREATE POLICY "Admins can view all service requests"
    ON service_requests FOR SELECT
    USING (
        get_current_user_role() IN ('super_admin', 'administrator')
        OR user_has_permission('service_requests.view_all')
    );

-- Service Requests: Approvers can view requests pending their role
CREATE POLICY "Approvers can view pending requests"
    ON service_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_request_approval_steps sras
            WHERE sras.service_type_id = service_requests.service_type_id
            AND sras.step_order = service_requests.current_approval_step
            AND sras.approver_role = get_current_user_role()
        )
    );

-- Service Requests: Users can insert own requests
CREATE POLICY "Users can create service requests"
    ON service_requests FOR INSERT
    WITH CHECK (requester_id = auth.uid());

-- Service Requests: Users can update own draft/returned requests
CREATE POLICY "Users can update own draft or returned requests"
    ON service_requests FOR UPDATE
    USING (
        requester_id = auth.uid() AND status IN ('draft', 'returned')
    );

-- Service Requests: Approvers and admins can update status
CREATE POLICY "Approvers can update request status"
    ON service_requests FOR UPDATE
    USING (
        get_current_user_role() IN ('super_admin', 'administrator')
        OR user_has_permission('service_requests.approve')
    );

-- Approvals: Approvers can view and manage
CREATE POLICY "Users can view approvals for their requests"
    ON service_request_approvals FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            approver_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM service_requests sr
                WHERE sr.id = service_request_approvals.service_request_id
                AND (sr.requester_id = auth.uid()
                    OR get_current_user_role() IN ('super_admin', 'administrator'))
            )
        )
    );

-- Timeline: Users can view timeline for their requests
CREATE POLICY "Users can view timeline for own requests"
    ON service_request_timeline FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE sr.id = service_request_timeline.service_request_id
            AND (
                sr.requester_id = auth.uid()
                OR get_current_user_role() IN ('super_admin', 'administrator')
                OR user_has_permission('service_requests.approve')
            )
        )
        -- Non-internal events visible to requester, internal only to approvers/admins
        AND (
            is_internal = false
            OR get_current_user_role() IN ('super_admin', 'administrator')
            OR user_has_permission('service_requests.approve')
        )
    );

-- Timeline: Authenticated users can insert
CREATE POLICY "Authenticated users can add timeline entries"
    ON service_request_timeline FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Attachments: Similar to timeline
CREATE POLICY "Users can view attachments for accessible requests"
    ON service_request_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE sr.id = service_request_attachments.service_request_id
            AND (sr.requester_id = auth.uid()
                OR get_current_user_role() IN ('super_admin', 'administrator')
                OR user_has_permission('service_requests.approve'))
        )
    );

CREATE POLICY "Users can upload attachments to own requests"
    ON service_request_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());
```

### File: `supabase/setup/04_triggers.sql` (APPEND to existing)

> **Status**: `[ ] Not Started`

#### Task 1.11: Auto-update timestamps

```sql
-- Updated: 2026-02-08 - Service Request Module triggers
CREATE TRIGGER update_service_types_updated_at
    BEFORE UPDATE ON service_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at
    BEFORE UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### File: `supabase/setup/02_functions.sql` (APPEND to existing)

> **Status**: `[ ] Not Started`

#### Task 1.12: Request number generator

```sql
-- Updated: 2026-02-08 - Generate service request number (SR-YYYY-####)
CREATE OR REPLACE FUNCTION generate_service_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_year TEXT;
    next_sequence INTEGER;
    new_number TEXT;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(request_number FROM 9) AS INTEGER)
    ), 0) + 1
    INTO next_sequence
    FROM service_requests
    WHERE request_number LIKE 'SR-' || current_year || '-%';

    new_number := 'SR-' || current_year || '-' || LPAD(next_sequence::TEXT, 4, '0');

    RETURN new_number;
END;
$$;
```

#### Task 1.13: Count active requests per user per type

```sql
-- Count active (non-closed/cancelled/rejected) requests for max check
CREATE OR REPLACE FUNCTION count_active_service_requests(
    p_user_id UUID,
    p_service_type_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM service_requests
    WHERE requester_id = p_user_id
    AND service_type_id = p_service_type_id
    AND status NOT IN ('closed', 'cancelled', 'rejected');
$$;
```

### File: `supabase/SQL_FILE_INDEX.md` (UPDATE)

> **Status**: `[ ] Not Started`

Add entries for all new tables, functions, policies, and triggers.

---

## Phase 2: TypeScript Types & Validation

### File: `types/service-request.ts` (NEW)

> **Status**: `[ ] Not Started`

```typescript
// ============================================
// SERVICE REQUEST TYPES
// ============================================

import { z } from 'zod';

// ---------- Enums ----------

export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'fulfilled'
  | 'closed'
  | 'cancelled';

export type ServiceFieldType =
  | 'text'
  | 'select'
  | 'date'
  | 'number'
  | 'boolean'
  | 'textarea'
  | 'file';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type ServiceApprovalAction = 'pending' | 'approved' | 'rejected' | 'returned';

export type ServiceTimelineEventType =
  | 'status_change'
  | 'comment'
  | 'internal_note'
  | 'edit'
  | 'attachment_added'
  | 'system';

// ---------- Status Transitions ----------

export const SERVICE_REQUEST_STATUS_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['in_review', 'cancelled'],
  in_review: ['approved', 'rejected', 'returned'],
  approved: ['fulfilled', 'closed'],  // auto-fulfill skips to closed
  rejected: [],                        // terminal
  returned: ['submitted', 'cancelled'],
  fulfilled: ['closed'],
  closed: [],                          // terminal
  cancelled: [],                       // terminal
};

// ---------- Service Type ----------

export interface ServiceType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  is_active: boolean;
  is_system_default: boolean;
  allowed_roles: string[];
  max_active_requests: number;
  auto_fulfill_on_approval: boolean;
  enable_priority: boolean;
  enable_attachments: boolean;
  enable_email_notifications: boolean;
  attachment_config: {
    max_files: number;
    max_size_mb: number;
    allowed_types: string[];
  } | null;
  validity_period_days: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Relations (joined)
  fields?: ServiceTypeField[];
  approval_steps?: ServiceRequestApprovalStep[];
}

export interface ServiceTypeField {
  id: string;
  service_type_id: string;
  field_key: string;
  field_label: string;
  field_type: ServiceFieldType;
  field_options: Array<{ label: string; value: string }> | null;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  created_at: string;
}

export interface ServiceRequestApprovalStep {
  id: string;
  service_type_id: string;
  step_order: number;
  step_name: string;
  approver_role: string;
  is_required: boolean;
  on_return_restart_from_step: number | null;
  created_at: string;
}

// ---------- Service Request ----------

export interface ServiceRequest {
  id: string;
  request_number: string;
  service_type_id: string;
  requester_id: string;
  institution_id: string | null;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority | null;
  current_approval_step: number;
  form_data: Record<string, any>;
  requester_context: {
    institution_name?: string;
    department?: string;
    program?: string;
    semester?: string;
    section?: string;
    batch?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  submitted_at: string | null;
  approved_at: string | null;
  fulfilled_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  validity_expires_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  // Relations (joined)
  service_type?: ServiceType;
  requester?: { id: string; full_name: string; email: string; avatar_url: string | null };
  institution?: { id: string; name: string };
  approvals?: ServiceRequestApproval[];
  timeline?: ServiceRequestTimelineEntry[];
  attachments?: ServiceRequestAttachment[];
}

export interface ServiceRequestApproval {
  id: string;
  service_request_id: string;
  approval_step_id: string | null;
  step_order: number;
  approver_id: string;
  action: ServiceApprovalAction;
  comments: string | null;
  acted_at: string | null;
  created_at: string;

  // Relations
  approver?: { id: string; full_name: string; email: string };
  approval_step?: ServiceRequestApprovalStep;
}

export interface ServiceRequestTimelineEntry {
  id: string;
  service_request_id: string;
  actor_id: string | null;
  event_type: ServiceTimelineEventType;
  old_status: ServiceRequestStatus | null;
  new_status: ServiceRequestStatus | null;
  content: string | null;
  is_internal: boolean;
  metadata: Record<string, any>;
  created_at: string;

  // Relations
  actor?: { id: string; full_name: string; email: string; avatar_url: string | null };
}

export interface ServiceRequestAttachment {
  id: string;
  service_request_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;

  // Relations
  uploader?: { id: string; full_name: string };
}

// ---------- DTOs ----------

export interface CreateServiceTypeDto {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  allowed_roles: string[];
  max_active_requests?: number;
  auto_fulfill_on_approval?: boolean;
  enable_priority?: boolean;
  enable_attachments?: boolean;
  enable_email_notifications?: boolean;
  attachment_config?: { max_files: number; max_size_mb: number; allowed_types: string[] };
  validity_period_days?: number | null;
  fields: CreateServiceTypeFieldDto[];
  approval_steps: CreateApprovalStepDto[];
}

export interface CreateServiceTypeFieldDto {
  field_key: string;
  field_label: string;
  field_type: ServiceFieldType;
  field_options?: Array<{ label: string; value: string }>;
  is_required?: boolean;
  display_order: number;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
}

export interface CreateApprovalStepDto {
  step_order: number;
  step_name: string;
  approver_role: string;
  is_required?: boolean;
  on_return_restart_from_step?: number | null;
}

export interface UpdateServiceTypeDto extends Partial<Omit<CreateServiceTypeDto, 'slug'>> {
  is_active?: boolean;
}

export interface CreateServiceRequestDto {
  service_type_id: string;
  form_data: Record<string, any>;
  priority?: ServiceRequestPriority;
  status?: 'draft' | 'submitted';  // Can save as draft or submit immediately
}

export interface UpdateServiceRequestDto {
  form_data?: Record<string, any>;
  priority?: ServiceRequestPriority;
}

export interface ProcessApprovalDto {
  action: 'approved' | 'rejected' | 'returned';
  comments?: string;
}

// ---------- Filters ----------

export interface ServiceRequestFilters {
  search?: string;
  service_type_id?: string;
  status?: ServiceRequestStatus | ServiceRequestStatus[];
  priority?: ServiceRequestPriority;
  requester_id?: string;
  institution_id?: string;
  submitted_from?: string;
  submitted_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceRequestListResponse {
  data: ServiceRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------- Analytics ----------

export interface ServiceRequestAnalytics {
  overview: {
    total_requests: number;
    by_status: Record<ServiceRequestStatus, number>;
    by_priority: Record<ServiceRequestPriority, number>;
    by_service_type: Array<{ type_id: string; type_name: string; count: number }>;
    avg_approval_time_hours: number;
    avg_fulfillment_time_hours: number;
  };
  trends: Array<{
    date: string;
    submitted: number;
    approved: number;
    rejected: number;
  }>;
  approval_bottlenecks: Array<{
    step_name: string;
    approver_role: string;
    avg_wait_hours: number;
    pending_count: number;
  }>;
}

// ---------- Zod Schemas ----------

export const serviceTypeFieldSchema = z.object({
  field_key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'Must be lowercase with underscores'),
  field_label: z.string().min(1).max(255),
  field_type: z.enum(['text', 'select', 'date', 'number', 'boolean', 'textarea', 'file']),
  field_options: z.array(z.object({ label: z.string(), value: z.string() })).optional().nullable(),
  is_required: z.boolean().default(false),
  display_order: z.number().int().min(0),
  placeholder: z.string().max(255).optional().nullable(),
  help_text: z.string().optional().nullable(),
  default_value: z.string().optional().nullable(),
});

export const approvalStepSchema = z.object({
  step_order: z.number().int().min(1),
  step_name: z.string().min(1).max(255),
  approver_role: z.string().min(1),
  is_required: z.boolean().default(true),
  on_return_restart_from_step: z.number().int().min(1).optional().nullable(),
});

export const createServiceTypeSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  icon: z.string().default('FileText'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  allowed_roles: z.array(z.string()).min(1, 'At least one role must be allowed'),
  max_active_requests: z.number().int().min(1).default(1),
  auto_fulfill_on_approval: z.boolean().default(false),
  enable_priority: z.boolean().default(false),
  enable_attachments: z.boolean().default(false),
  enable_email_notifications: z.boolean().default(true),
  attachment_config: z.object({
    max_files: z.number().int().min(1).max(10),
    max_size_mb: z.number().min(1).max(50),
    allowed_types: z.array(z.string()),
  }).optional(),
  validity_period_days: z.number().int().min(1).optional().nullable(),
  fields: z.array(serviceTypeFieldSchema).min(1, 'At least one field required'),
  approval_steps: z.array(approvalStepSchema).min(1, 'At least one approval step required'),
});

export const createServiceRequestSchema = z.object({
  service_type_id: z.string().uuid(),
  form_data: z.record(z.any()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['draft', 'submitted']).default('submitted'),
});

export const processApprovalSchema = z.object({
  action: z.enum(['approved', 'rejected', 'returned']),
  comments: z.string().optional(),
});

// ---------- Status Display Config ----------

export const SERVICE_REQUEST_STATUS_CONFIG: Record<ServiceRequestStatus, {
  label: string;
  variant: string;
  color: string;
  icon: string;
}> = {
  draft: { label: 'Draft', variant: 'outline', color: 'bg-gray-100 text-gray-700', icon: 'FileEdit' },
  submitted: { label: 'Submitted', variant: 'secondary', color: 'bg-blue-100 text-blue-800', icon: 'Send' },
  in_review: { label: 'In Review', variant: 'secondary', color: 'bg-yellow-100 text-yellow-800', icon: 'Eye' },
  approved: { label: 'Approved', variant: 'success', color: 'bg-green-100 text-green-800', icon: 'CheckCircle' },
  rejected: { label: 'Rejected', variant: 'destructive', color: 'bg-red-100 text-red-800', icon: 'XCircle' },
  returned: { label: 'Returned', variant: 'secondary', color: 'bg-orange-100 text-orange-800', icon: 'RotateCcw' },
  fulfilled: { label: 'Fulfilled', variant: 'success', color: 'bg-green-600 text-white', icon: 'PackageCheck' },
  closed: { label: 'Closed', variant: 'outline', color: 'bg-gray-200 text-gray-600', icon: 'Archive' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'bg-red-100 text-red-600', icon: 'Ban' },
};
```

---

## Phase 3: Service Layer

### File: `lib/services/service-requests/service-type-service.ts` (NEW)

> **Status**: `[ ] Not Started`

**Class**: `ServiceTypeService` (static methods)

**Methods**:
- `getServiceTypes(filters?)` — List all service types with optional active filter
- `getServiceType(id)` — Single type with fields + approval steps joined
- `getServiceTypeBySlug(slug)` — Lookup by slug (for Transport default)
- `createServiceType(dto: CreateServiceTypeDto)` — Create type + fields + steps atomically
- `updateServiceType(id, dto: UpdateServiceTypeDto)` — Update type, upsert fields/steps
- `deactivateServiceType(id)` — Set is_active = false
- `deleteServiceType(id)` — Hard delete (only if no requests exist)
- `seedDefaultTransportService()` — Create Transport type if not exists

**Pattern**: Follow `learner-profile-service.ts` static class pattern with `createClientSupabaseClient()`.

### File: `lib/services/service-requests/service-request-service.ts` (NEW)

> **Status**: `[ ] Not Started`

**Class**: `ServiceRequestService` (static methods)

**Methods**:
- `createRequest(dto, userId)` — Validate fields against type schema, check max_active, generate request_number, auto-populate requester_context
- `updateRequest(id, dto)` — Edit form_data (only in draft/returned status)
- `submitRequest(id)` — draft -> submitted, create first pending approval record, add timeline entry
- `cancelRequest(id, reason)` — Cancel with reason, add timeline entry
- `getRequest(id)` — Single with type, requester, timeline, approvals, attachments joined
- `getMyRequests(userId, filters)` — Paginated list filtered to requester
- `getAllRequests(filters)` — Admin view with full filters
- `getPendingApprovalRequests(userId, role)` — Requests pending this user's role approval
- `generateRequestNumber()` — Call DB function `generate_service_request_number()`
- `checkMaxActiveRequests(userId, typeId)` — Call DB function, compare with type config
- `markFulfilled(id)` — approved -> fulfilled, add timeline entry
- `closeRequest(id)` — fulfilled -> closed, set closed_at, add timeline entry
- `getRequestCountsByStatus(filters?)` — Aggregate counts for dashboard cards

### File: `lib/services/service-requests/service-request-approval-service.ts` (NEW)

> **Status**: `[ ] Not Started`

**Class**: `ServiceRequestApprovalService` (static methods)

**Methods**:
- `processApproval(requestId, dto: ProcessApprovalDto, approverId)` — Core workflow engine:
  - **approve**: Mark current step approved, advance to next step or final approval
  - **reject**: Mark rejected, set request status to rejected
  - **return**: Mark returned, handle configurable restart (from which step)
- `getPendingApprovalsForUser(userId, filters)` — Pending approval queue based on user's role
- `getPendingApprovalCount(userId)` — Count for notification badge
- `canUserApprove(userId, requestId)` — Check: user's role matches current step's approver_role
- `getApprovalHistory(requestId)` — All approval records for a request
- `getCurrentApprovalStep(requestId)` — Get active step details
- `advanceToNextStep(requestId)` — Internal: move to next approval step
- `handleReturn(requestId, returnToStep)` — Internal: handle return with configurable restart

### File: `lib/services/service-requests/service-request-timeline-service.ts` (NEW)

> **Status**: `[ ] Not Started`

**Class**: `ServiceRequestTimelineService` (static methods)

**Methods**:
- `addTimelineEntry(requestId, entry)` — Create timeline record
- `addStatusChange(requestId, actorId, oldStatus, newStatus, content?)` — Status change event
- `addComment(requestId, actorId, content)` — Public comment (visible to requester)
- `addInternalNote(requestId, actorId, content)` — Internal note (approvers only)
- `getTimeline(requestId, includeInternal)` — Filtered by role visibility
- `getRecentActivity(filters)` — For analytics dashboard

---

## Phase 4: React Query Hooks

### File: `hooks/service-requests/use-service-types.ts` (NEW)

> **Status**: `[ ] Not Started`

**Query Keys**:
```typescript
export const serviceTypeKeys = {
  all: ['service-types'] as const,
  lists: () => [...serviceTypeKeys.all, 'list'] as const,
  list: (filters?: any) => [...serviceTypeKeys.lists(), filters] as const,
  details: () => [...serviceTypeKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceTypeKeys.details(), id] as const,
  bySlug: (slug: string) => [...serviceTypeKeys.all, 'slug', slug] as const,
};
```

**Hooks**: `useServiceTypes()`, `useServiceType(id)`, `useServiceTypeBySlug(slug)`, `useCreateServiceType()`, `useUpdateServiceType()`, `useDeactivateServiceType()`

### File: `hooks/service-requests/use-service-requests.ts` (NEW)

> **Status**: `[ ] Not Started`

**Query Keys**:
```typescript
export const serviceRequestKeys = {
  all: ['service-requests'] as const,
  lists: () => [...serviceRequestKeys.all, 'list'] as const,
  list: (filters: ServiceRequestFilters) => [...serviceRequestKeys.lists(), filters] as const,
  myRequests: (userId: string, filters?: any) => [...serviceRequestKeys.all, 'my', userId, filters] as const,
  details: () => [...serviceRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceRequestKeys.details(), id] as const,
  pendingApprovals: (userId: string) => [...serviceRequestKeys.all, 'pending-approvals', userId] as const,
  pendingCount: (userId: string) => [...serviceRequestKeys.all, 'pending-count', userId] as const,
  analytics: (filters?: any) => [...serviceRequestKeys.all, 'analytics', filters] as const,
  countsByStatus: (filters?: any) => [...serviceRequestKeys.all, 'counts', filters] as const,
};
```

**Hooks**: `useServiceRequests(filters)`, `useMyServiceRequests(filters)`, `useServiceRequest(id)`, `usePendingApprovals(filters)`, `usePendingApprovalCount()`, `useCreateServiceRequest()`, `useUpdateServiceRequest()`, `useSubmitServiceRequest()`, `useCancelServiceRequest()`, `useProcessApproval()`, `useMarkFulfilled()`, `useCloseRequest()`, `useAddComment()`, `useAddInternalNote()`, `useServiceRequestAnalytics(filters)`, `useRequestCountsByStatus()`

---

## Phase 5: API Routes

### Internal Routes (for MyJKKN UI)

> **Status**: `[ ] Not Started`

| Route | Methods | File |
|-------|---------|------|
| `/api/service-requests/types` | GET, POST | `app/api/service-requests/types/route.ts` |
| `/api/service-requests/types/[id]` | GET, PATCH, DELETE | `app/api/service-requests/types/[id]/route.ts` |
| `/api/service-requests` | GET, POST | `app/api/service-requests/route.ts` |
| `/api/service-requests/my` | GET | `app/api/service-requests/my/route.ts` |
| `/api/service-requests/approvals` | GET | `app/api/service-requests/approvals/route.ts` |
| `/api/service-requests/approvals/count` | GET | `app/api/service-requests/approvals/count/route.ts` |
| `/api/service-requests/analytics` | GET | `app/api/service-requests/analytics/route.ts` |
| `/api/service-requests/[id]` | GET, PATCH | `app/api/service-requests/[id]/route.ts` |
| `/api/service-requests/[id]/submit` | POST | `app/api/service-requests/[id]/submit/route.ts` |
| `/api/service-requests/[id]/approve` | POST | `app/api/service-requests/[id]/approve/route.ts` |
| `/api/service-requests/[id]/cancel` | POST | `app/api/service-requests/[id]/cancel/route.ts` |
| `/api/service-requests/[id]/fulfill` | POST | `app/api/service-requests/[id]/fulfill/route.ts` |
| `/api/service-requests/[id]/close` | POST | `app/api/service-requests/[id]/close/route.ts` |
| `/api/service-requests/[id]/timeline` | GET, POST | `app/api/service-requests/[id]/timeline/route.ts` |

Each route follows the existing pattern: authenticate, authorize, validate, call service, return response.

---

## Phase 6: UI Pages & Components

### Route Structure

> **Status**: `[ ] Not Started`

```
app/(routes)/service-requests/
├── page.tsx                              # Hub: tabs for My Requests, Approvals, All, Analytics
├── /types/
│   ├── page.tsx                          # List all service types (admin)
│   ├── /new/page.tsx                     # Create service type + field builder
│   ├── /[id]/page.tsx                    # View service type config
│   └── /[id]/edit/page.tsx               # Edit service type
├── /new/
│   └── page.tsx                          # Select type -> dynamic form
├── /[id]/
│   ├── page.tsx                          # View request + timeline + approval status
│   └── /edit/page.tsx                    # Edit draft/returned request
├── /my-requests/
│   └── page.tsx                          # Filtered to current user
├── /approvals/
│   └── page.tsx                          # Pending approvals for current user
├── /analytics/
│   └── page.tsx                          # Analytics dashboard
└── /_components/
    ├── service-type-form.tsx             # Type creation form
    ├── field-builder.tsx                 # Visual field configuration
    ├── approval-step-builder.tsx         # Configure approval chain
    ├── dynamic-request-form.tsx          # Renders form from service_type_fields
    ├── request-timeline.tsx              # Activity log display
    ├── request-approval-panel.tsx        # Approve/reject/return actions
    ├── request-status-badge.tsx          # Status indicator
    ├── request-data-table.tsx            # Data table for requests listing
    ├── request-filters.tsx              # Filter panel
    ├── priority-badge.tsx               # Priority indicator
    ├── service-type-card.tsx            # Card for type selection
    └── request-detail-view.tsx          # Full request detail layout
```

### Key Component Details

#### `dynamic-request-form.tsx`
- Receives `ServiceTypeField[]` and renders appropriate form controls
- Maps `field_type` to shadcn/ui components (Input, Select, DatePicker, Checkbox, Textarea)
- Handles `field_options` for select dropdowns
- Validates required fields using Zod dynamic schema
- Auto-populates requester_context from user profile (read-only)

#### `field-builder.tsx`
- Drag-and-drop interface for adding/reordering fields
- Add field: select type, set label, key (auto-generated from label), options, required flag
- Preview mode: shows how the form will look to requesters
- Uses `@dnd-kit` for drag-and-drop (already in your dependencies)

#### `approval-step-builder.tsx`
- Add/remove/reorder approval steps
- Each step: name, approver role (dropdown from custom_roles), required flag, return behavior
- Visual chain preview (Step 1 -> Step 2 -> Step 3)

#### `request-timeline.tsx`
- Chronological display of all events
- Status changes with arrow indicators (old -> new)
- Comments with user avatars
- Internal notes highlighted differently (only shown to approvers)
- Relative timestamps (e.g., "2 hours ago")

---

## Phase 7: Permission & Sidebar Integration

### File: `lib/constants/permissions.ts` (UPDATE - add new category)

> **Status**: `[ ] Not Started`

```typescript
{
  name: 'Service Requests',
  key: 'service_requests',
  permissions: [
    { key: 'service_requests.types.view', label: 'View Service Types' },
    { key: 'service_requests.types.create', label: 'Create Service Types' },
    { key: 'service_requests.types.edit', label: 'Edit Service Types' },
    { key: 'service_requests.types.delete', label: 'Delete Service Types' },
    { key: 'service_requests.submit', label: 'Submit Service Requests' },
    { key: 'service_requests.view_own', label: 'View Own Requests' },
    { key: 'service_requests.view_all', label: 'View All Requests' },
    { key: 'service_requests.edit_own', label: 'Edit Own Requests' },
    { key: 'service_requests.cancel_own', label: 'Cancel Own Requests' },
    { key: 'service_requests.approve', label: 'Approve/Reject Requests' },
    { key: 'service_requests.fulfill', label: 'Mark Requests Fulfilled' },
    { key: 'service_requests.close', label: 'Close Requests' },
    { key: 'service_requests.analytics.view', label: 'View Analytics' },
    { key: 'service_requests.external_api.manage', label: 'Manage External API' },
  ]
}
```

### File: `lib/sidebarMenuLink.ts` (UPDATE - add menu group)

> **Status**: `[ ] Not Started`

Add new menu group "Service Requests" with items:
```typescript
{
  groupLabel: 'Service Requests',
  menus: [
    {
      href: '/service-requests',
      label: 'Service Requests',
      icon: ClipboardList,
      active: pathname.startsWith('/service-requests'),
      submenus: [
        { href: '/service-requests/my-requests', label: 'My Requests', active: false },
        { href: '/service-requests/new', label: 'New Request', active: false },
        { href: '/service-requests/approvals', label: 'Pending Approvals', active: false },
        { href: '/service-requests/analytics', label: 'Analytics', active: false },
        { href: '/service-requests/types', label: 'Manage Types', active: false },
      ]
    }
  ]
}
```

Add permission mappings:
```typescript
'/service-requests': 'service_requests.submit',
'/service-requests/my-requests': 'service_requests.view_own',
'/service-requests/new': 'service_requests.submit',
'/service-requests/approvals': 'service_requests.approve',
'/service-requests/analytics': 'service_requests.analytics.view',
'/service-requests/types': 'service_requests.types.view',
'/service-requests/types/new': 'service_requests.types.create',
'/service-requests/types/[id]': 'service_requests.types.view',
'/service-requests/types/[id]/edit': 'service_requests.types.edit',
'/service-requests/[id]': 'service_requests.view_own',
'/service-requests/[id]/edit': 'service_requests.edit_own',
```

---

## Phase 8: Default Transport Service Seed

### File: `lib/services/service-requests/transport-seed.ts` (NEW)

> **Status**: `[ ] Not Started`

**Purpose**: Seed the default Transport Service Request type when module is first used.

**Transport Service Type**:
```typescript
{
  slug: 'transport-request',
  name: 'Transport Service Request',
  description: 'Request bus transportation to and from campus',
  icon: 'Bus',
  color: '#3B82F6',
  is_system_default: true,
  allowed_roles: ['student', 'faculty', 'staff'],
  max_active_requests: 1,
  auto_fulfill_on_approval: true,
  enable_priority: false,
  enable_attachments: false,
  enable_email_notifications: true,
  validity_period_days: 180
}
```

**Transport Fields** (11 fields):

| # | Key | Label | Type | Required | Options |
|---|-----|-------|------|----------|---------|
| 1 | pickup_location | Pickup Point | select | Yes | Komarapalayam Bus Stop, Salem New Bus Stand, Namakkal Town, Erode Junction, Tiruchengode, Rasipuram, Paramathi, Mohanur, Sankari, Senthamangalam |
| 2 | drop_location | Drop Point | select | Yes | JKKN Campus - Komarapalayam, JKKN Campus - Namakkal, Same as pickup (return trip) |
| 3 | preferred_route | Preferred Route | select | No | Route 1-Namakkal, Route 2-Salem, Route 3-Erode, Route 4-Tiruchengode, Route 5-Rasipuram |
| 4 | bus_type | Bus Type | select | Yes | Regular, AC, Mini Bus |
| 5 | timing_preference | Timing | select | Yes | Morning Only, Evening Only, Morning & Evening |
| 6 | shift_timing | Shift | select | No | 7:00 AM - 3:30 PM, 8:00 AM - 4:30 PM, 9:00 AM - 5:00 PM |
| 7 | boarding_point_type | Boarding Point Type | select | Yes | Main Stop, Intermediate Stop, Door Pickup |
| 8 | start_date | Service Start Date | date | Yes | — |
| 9 | academic_year_validity | Valid For | select | Yes | Current Semester, Full Academic Year |
| 10 | special_needs | Special Requirements | textarea | No | — |
| 11 | emergency_contact | Emergency Contact | text | Yes | — |

**Transport Approval Flow** (1 step):

| Step | Name | Approver Role |
|------|------|--------------|
| 1 | Transport Head Review | administrator |

---

## Phase 9: External TMS API Integration

### File: `app/api/v1/transport-requests/route.ts` (NEW)

> **Status**: `[ ] Not Started`

**Authentication**: Bearer token validated against Application Hub API keys.

**GET /api/v1/transport-requests**:

Query params: `status`, `institution_id`, `from_date`, `to_date`, `updated_since`, `page`, `limit`

Response includes:
- `request_id`, `request_number`, `status`
- `requester` (name, email, phone, role)
- `academic_context` (institution, department, program, semester, section, batch)
- `transport_data` (pickup, drop, route, bus_type, timing, boarding_type, start_date, special_needs)
- `validity_expires_at`, `submitted_at`, `approved_at`

### Webhook Notification

On transport request approval:
1. Lookup registered webhook URL from Application Hub config
2. Generate HMAC-SHA256 signature using shared secret
3. POST lightweight notification to TMS webhook URL
4. Log webhook delivery in activity service

Webhook payload:
```json
{
  "event": "transport_request.approved",
  "timestamp": "ISO-8601",
  "request_id": "uuid",
  "request_number": "SR-2026-0042",
  "institution_id": "uuid"
}
```

---

## Phase 10: Analytics Dashboard

### File: `app/(routes)/service-requests/analytics/page.tsx` (NEW)

> **Status**: `[ ] Not Started`

**Dashboard Components**:

1. **Overview Cards**: Total requests, pending, approved, rejected, avg approval time
2. **Request Volume Chart**: Line chart showing submissions over time
3. **Service Type Distribution**: Bar/pie chart showing requests by type
4. **Approval Bottlenecks**: Table showing slowest approval steps
5. **Status Breakdown**: Stacked bar chart by status over time
6. **Top Requesters**: Table of users with most requests (admin view)

**Data Source**: `ServiceRequestService.getRequestCountsByStatus()` + `ServiceRequestService.getAnalytics()`

---

## File Index

### New Files (35 files)

| Category | File Path | Purpose |
|----------|-----------|---------|
| **Types** | `types/service-request.ts` | All types, interfaces, Zod schemas, constants |
| **Services** | `lib/services/service-requests/service-type-service.ts` | Service type CRUD |
| | `lib/services/service-requests/service-request-service.ts` | Request lifecycle |
| | `lib/services/service-requests/service-request-approval-service.ts` | Approval workflow engine |
| | `lib/services/service-requests/service-request-timeline-service.ts` | Timeline & comments |
| | `lib/services/service-requests/transport-seed.ts` | Transport default seed |
| **Hooks** | `hooks/service-requests/use-service-types.ts` | Service type queries/mutations |
| | `hooks/service-requests/use-service-requests.ts` | Request queries/mutations |
| **API Routes** | `app/api/service-requests/types/route.ts` | List/create types |
| | `app/api/service-requests/types/[id]/route.ts` | Get/update/delete type |
| | `app/api/service-requests/route.ts` | List/create requests |
| | `app/api/service-requests/my/route.ts` | My requests |
| | `app/api/service-requests/approvals/route.ts` | Pending approvals |
| | `app/api/service-requests/approvals/count/route.ts` | Pending count |
| | `app/api/service-requests/analytics/route.ts` | Analytics data |
| | `app/api/service-requests/[id]/route.ts` | Get/update request |
| | `app/api/service-requests/[id]/submit/route.ts` | Submit request |
| | `app/api/service-requests/[id]/approve/route.ts` | Process approval |
| | `app/api/service-requests/[id]/cancel/route.ts` | Cancel request |
| | `app/api/service-requests/[id]/fulfill/route.ts` | Mark fulfilled |
| | `app/api/service-requests/[id]/close/route.ts` | Close request |
| | `app/api/service-requests/[id]/timeline/route.ts` | Timeline get/post |
| | `app/api/v1/transport-requests/route.ts` | External TMS API |
| **Pages** | `app/(routes)/service-requests/page.tsx` | Hub page |
| | `app/(routes)/service-requests/types/page.tsx` | Type list |
| | `app/(routes)/service-requests/types/new/page.tsx` | Create type |
| | `app/(routes)/service-requests/types/[id]/page.tsx` | View type |
| | `app/(routes)/service-requests/types/[id]/edit/page.tsx` | Edit type |
| | `app/(routes)/service-requests/new/page.tsx` | New request |
| | `app/(routes)/service-requests/[id]/page.tsx` | Request detail |
| | `app/(routes)/service-requests/[id]/edit/page.tsx` | Edit request |
| | `app/(routes)/service-requests/my-requests/page.tsx` | My requests |
| | `app/(routes)/service-requests/approvals/page.tsx` | Approval queue |
| | `app/(routes)/service-requests/analytics/page.tsx` | Analytics |
| **Components** | `app/(routes)/service-requests/_components/` | ~12 component files |

### Modified Files (4 files)

| File Path | Change |
|-----------|--------|
| `supabase/setup/01_tables.sql` | Append 8 new tables + enums |
| `supabase/setup/02_functions.sql` | Append 2 new functions |
| `supabase/setup/03_policies.sql` | Append ~15 new RLS policies |
| `supabase/setup/04_triggers.sql` | Append 2 new triggers |
| `lib/constants/permissions.ts` | Add Service Requests permission category |
| `lib/sidebarMenuLink.ts` | Add Service Requests menu group + permission mappings |
| `supabase/SQL_FILE_INDEX.md` | Add entries for all new DB objects |

---

## Status Tracker

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| **1** | Database Schema (tables, policies, functions, triggers) | `[ ] Not Started` | 8 tables, 15 policies, 2 functions, 2 triggers |
| **2** | TypeScript Types & Zod Validation | `[ ] Not Started` | 1 file, ~400 lines |
| **3** | Service Layer (4 services) | `[ ] Not Started` | ~2000 lines estimated |
| **4** | React Query Hooks (2 hook files) | `[ ] Not Started` | ~500 lines estimated |
| **5** | API Routes (14 route files) | `[ ] Not Started` | Following existing REST pattern |
| **6** | UI Pages & Components (~25 files) | `[ ] Not Started` | Hub + 4 views + admin pages |
| **7** | Permission & Sidebar Integration | `[ ] Not Started` | 14 permission keys, menu group |
| **8** | Default Transport Service Seed | `[ ] Not Started` | 11 fields, 1 approval step |
| **9** | External TMS API | `[ ] Not Started` | Pull API + webhook |
| **10** | Analytics Dashboard | `[ ] Not Started` | 6 visualization components |

### Implementation Order (Recommended)

```
1. Phase 1 (Database) → Phase 2 (Types) → Phase 3 (Services)
   [Foundation - must be sequential]

2. Phase 4 (Hooks) + Phase 5 (API Routes)
   [Can be done in parallel after Phase 3]

3. Phase 7 (Permissions) → Phase 6 (UI Pages)
   [Permissions needed before UI renders correctly]

4. Phase 8 (Transport Seed) → Phase 9 (TMS API)
   [Transport seed needed before API can serve data]

5. Phase 10 (Analytics)
   [Can be done last, needs data to be meaningful]
```

---

> **Last Updated**: 2026-02-08
> **Author**: Claude Code (Brainstorming + Deep Codebase Analysis)
> **Codebase Patterns Reference**: Learners Module, Users Module, Leave Approval Chain, Next.js 16 Skill
