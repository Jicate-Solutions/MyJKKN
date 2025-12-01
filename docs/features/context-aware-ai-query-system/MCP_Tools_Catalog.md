# MCP Tools Catalog: MyJKKN AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **Total Tools** | 60+ |
| **Modules Covered** | 12 |

---

## Overview

This document catalogs all MCP tools available for the AI Query System. Each tool maps to a Supabase RPC function and is protected by permission validation.

---

## Module 1: ACADEMIC

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_attendance` | `ai_rpc_attendance` | student_attendance | academic.attendance.view |
| `get_attendance_summary` | `ai_rpc_attendance_summary` | student_attendance | academic.attendance.view |
| `get_attendance_defaulters` | `ai_rpc_attendance_defaulters` | student_attendance | academic.attendance.view |
| `get_timetables` | `ai_rpc_timetables` | timetables | academic.timetables.view |
| `get_timetable_slots` | `ai_rpc_timetable_slots` | timetable_slot_continuity | academic.timetables.view |
| `get_periods` | `ai_rpc_periods` | periods | academic.periods.view |
| `get_staff_plans` | `ai_rpc_staff_plans` | staff_plans, staff_plan_courses | academic.staff_planning.view |
| `get_courses` | `ai_rpc_courses` | courses, course_mappings | academic.courses.view |
| `get_academic_years` | `ai_rpc_academic_years` | academic_years | academic.years.view |

### Tool Definitions

```typescript
// get_attendance
{
  name: "get_attendance",
  description: "Get student attendance records with optional filters",
  parameters: {
    type: "object",
    properties: {
      student_id: { type: "string", description: "Specific student UUID" },
      section_id: { type: "string", description: "Filter by section" },
      department_id: { type: "string", description: "Filter by department" },
      date_from: { type: "string", format: "date" },
      date_to: { type: "string", format: "date" },
      threshold: { type: "number", description: "Attendance % threshold" }
    }
  }
}

// get_attendance_defaulters
{
  name: "get_attendance_defaulters",
  description: "Get students below attendance threshold",
  parameters: {
    type: "object",
    properties: {
      department_id: { type: "string" },
      threshold: { type: "number", default: 75 },
      semester: { type: "string", enum: ["current", "previous", "all"] }
    }
  }
}
```

---

## Module 2: BILLING

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_student_bills` | `ai_rpc_student_bills` | billing_student_bills | billing.bills.view |
| `get_bills_summary` | `ai_rpc_bills_summary` | billing_* | billing.bills.view |
| `get_fee_defaulters` | `ai_rpc_fee_defaulters` | billing_student_bills | billing.bills.view |
| `get_invoices` | `ai_rpc_invoices` | billing_invoices | billing.invoices.view |
| `get_receipts` | `ai_rpc_receipts` | billing_receipts | billing.receipts.view |
| `get_discounts` | `ai_rpc_discounts` | billing_discounts | billing.discounts.view |
| `get_refunds` | `ai_rpc_refunds` | billing_refunds | billing.refunds.view |
| `get_billing_categories` | `ai_rpc_billing_categories` | billing_*_categories | billing.categories.view |
| `get_payment_transactions` | `ai_rpc_payment_transactions` | payment_transactions | billing.payments.view |

### Tool Definitions

```typescript
// get_fee_defaulters
{
  name: "get_fee_defaulters",
  description: "Get students with unpaid or overdue fees",
  parameters: {
    type: "object",
    properties: {
      department_id: { type: "string" },
      status: { type: "string", enum: ["unpaid", "overdue", "partially_paid"] },
      min_amount: { type: "number" },
      due_before: { type: "string", format: "date" }
    }
  }
}

// get_bills_summary
{
  name: "get_bills_summary",
  description: "Get billing summary with totals",
  parameters: {
    type: "object",
    properties: {
      department_id: { type: "string" },
      category_id: { type: "string" },
      date_from: { type: "string", format: "date" },
      date_to: { type: "string", format: "date" }
    }
  }
}
```

---

## Module 3: STUDENTS

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_students` | `ai_rpc_students` | students | students.view |
| `get_student_details` | `ai_rpc_student_details` | students, admissions | students.view |
| `get_students_by_status` | `ai_rpc_students_by_status` | students | students.view |
| `get_students_by_section` | `ai_rpc_students_by_section` | students, sections | students.view |
| `get_student_onboarding_status` | `ai_rpc_onboarding_status` | students | students.view |
| `get_promotion_candidates` | `ai_rpc_promotion_candidates` | students | students.promotion.view |

### Tool Definitions

```typescript
// get_students
{
  name: "get_students",
  description: "Get student list with filters",
  parameters: {
    type: "object",
    properties: {
      department_id: { type: "string" },
      program_id: { type: "string" },
      semester_id: { type: "string" },
      section_id: { type: "string" },
      status: { type: "string", enum: ["active", "inactive", "graduated", "exited", "pending"] },
      search: { type: "string", description: "Search by name or roll number" }
    }
  }
}
```

---

## Module 4: STAFF

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_staff` | `ai_rpc_staff` | staff | staff.view |
| `get_staff_details` | `ai_rpc_staff_details` | staff, profiles | staff.view |
| `get_staff_by_department` | `ai_rpc_staff_by_department` | staff | staff.view |
| `get_employment_categories` | `ai_rpc_employment_categories` | employment_categories | staff.categories.view |
| `get_faculty_course_assignments` | `ai_rpc_faculty_assignments` | staff_plan_courses | staff.view |

---

## Module 5: ADMISSIONS

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_admissions` | `ai_rpc_admissions` | admissions | admissions.view |
| `get_admission_by_status` | `ai_rpc_admissions_by_status` | admissions | admissions.view |
| `get_admission_statistics` | `ai_rpc_admission_stats` | admissions | admissions.view |
| `get_applications` | `ai_rpc_applications` | admissions | admissions.view |

---

## Module 6: ORGANIZATION HIERARCHY

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_institutions` | `ai_rpc_institutions` | institutions | organizations.institutions.view |
| `get_degrees` | `ai_rpc_degrees` | degrees | organizations.degrees.view |
| `get_departments` | `ai_rpc_departments` | departments | organizations.departments.view |
| `get_programs` | `ai_rpc_programs` | programs | organizations.programs.view |
| `get_semesters` | `ai_rpc_semesters` | semesters | organizations.semesters.view |
| `get_sections` | `ai_rpc_sections` | sections | organizations.sections.view |
| `get_hierarchy_summary` | `ai_rpc_hierarchy_summary` | all org tables | organizations.view |

---

## Module 7: RESOURCE MANAGEMENT

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_resources` | `ai_rpc_resources` | resources | resources.resources.view |
| `get_resource_reservations` | `ai_rpc_reservations` | resource_reservations | resources.reservations.view |
| `get_resource_availability` | `ai_rpc_resource_availability` | resources, reservations | resources.resources.view |
| `get_pending_approvals` | `ai_rpc_pending_approvals` | resource_approvals | resources.approvals.view |
| `get_resource_usage_logs` | `ai_rpc_usage_logs` | resource_usage_logs | resources.analytics.view |
| `get_maintenance_schedules` | `ai_rpc_maintenance` | resource_maintenance_schedules | resources.maintenance.view |

---

## Module 8: USER MANAGEMENT

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_users` | `ai_rpc_users` | profiles | users.view |
| `get_user_roles` | `ai_rpc_user_roles` | user_roles, custom_roles | users.roles.view |
| `get_custom_roles` | `ai_rpc_custom_roles` | custom_roles | roles.view |
| `get_user_activity` | `ai_rpc_user_activity` | user_activity_logs | users.activity.view |
| `get_user_institution_access` | `ai_rpc_institution_access` | user_institution_access | users.access.view |

---

## Module 9: NOTIFICATIONS & COMMUNICATION

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_notifications` | `ai_rpc_notifications` | notifications, user_notifications | notifications.view |
| `get_unread_notifications` | `ai_rpc_unread_notifications` | user_notifications | notifications.view |
| `get_push_subscriptions` | `ai_rpc_push_subscriptions` | push_subscriptions | notifications.view |

---

## Module 10: BUG REPORTS & SUPPORT

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_bug_reports` | `ai_rpc_bug_reports` | bug_reports | bug_reports.view |
| `get_bug_report_details` | `ai_rpc_bug_report_details` | bug_reports, messages, participants | bug_reports.view |
| `get_my_bug_reports` | `ai_rpc_my_bug_reports` | bug_reports | bug_reports.view |

---

## Module 11: DASHBOARD & ANALYTICS

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_dashboard_widgets` | `ai_rpc_dashboard_widgets` | dashboard_* | dashboard.view |
| `get_kpi_summary` | `ai_rpc_kpi_summary` | multiple | analytics.view |
| `get_analytics_overview` | `ai_rpc_analytics_overview` | multiple | analytics.view |

---

## Module 12: APPLICATION HUB

### Query Tools

| Tool Name | RPC Function | Tables | Permission Required |
|-----------|--------------|--------|---------------------|
| `get_applications_hub` | `ai_rpc_applications_hub` | applications, categories | applications.view |
| `get_app_favorites` | `ai_rpc_app_favorites` | user_app_favorites | applications.view |

---

## ACTION TOOLS

### Tier 1 (Auto-execute)

| Tool Name | RPC Function | Permission Required |
|-----------|--------------|---------------------|
| `export_csv` | `ai_rpc_export_data` | [module].view |
| `create_complaint` | `ai_rpc_create_complaint` | complaints.create |
| `mark_notification_read` | `ai_rpc_mark_read` | notifications.view |

### Tier 2 (One-click confirm)

| Tool Name | RPC Function | Permission Required |
|-----------|--------------|---------------------|
| `send_notification` | `ai_rpc_send_notification` | notifications.send |
| `send_sms` | external SMS API | notifications.send |
| `send_email` | external Email API | notifications.send |
| `create_ticket` | `ai_rpc_create_ticket` | complaints.create |
| `reserve_resource` | `ai_rpc_reserve_resource` | resources.reserve |

### Tier 3 (Explicit confirm for >50 recipients)

| Tool Name | RPC Function | Permission Required |
|-----------|--------------|---------------------|
| `bulk_notification` | `ai_rpc_bulk_notification` | notifications.bulk |
| `bulk_sms` | external SMS API | notifications.bulk |
| `bulk_email` | external Email API | notifications.bulk |

### Tier 4 (Blocked)

| Tool Name | Status | Message |
|-----------|--------|---------|
| `delete_record` | BLOCKED | "Please contact administrator" |
| `financial_transaction` | BLOCKED | "Please use billing module" |
| `modify_permissions` | BLOCKED | "Please contact administrator" |

---

## CONTEXT TOOLS (Internal)

| Tool Name | RPC Function | Purpose |
|-----------|--------------|---------|
| `get_user_context` | `ai_rpc_user_context` | Get current user's context |
| `validate_permission` | `ai_rpc_validate_access` | Check if user has permission |
| `get_accessible_scope` | `ai_rpc_accessible_scope` | Get user's data scope |
| `get_current_academic_context` | `ai_rpc_academic_context` | Get current year/semester |

---

## Tool Response Format

All tools return a standardized response:

```typescript
interface ToolResponse {
  success: boolean;
  data: any;
  metadata: {
    total_count: number;
    returned_count: number;
    has_more: boolean;
    filters_applied: Record<string, any>;
  };
  actions_available: ActionDefinition[];
  error?: {
    code: string;
    message: string;
  };
}

interface ActionDefinition {
  id: string;
  label: string;
  tier: 1 | 2 | 3 | 4;
  parameters_required?: string[];
  confirmation_message?: string;
}
```
