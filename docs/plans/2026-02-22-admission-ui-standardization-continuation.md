# Admission Module UI Standardization — Continuation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring all 20 non-compliant admission pages to the same ContentLayout + Breadcrumb + DataTable standard used by the leads module.

**Architecture:** Each list page gets a `_components/<page>-data-table.tsx` (DataTable wrapper with fetchDataFn) + updated `page.tsx` (ContentLayout → Breadcrumb → DataTable). Non-list pages (dashboards/forms) get only the ContentLayout + Breadcrumb wrapper added to the existing content.

**Tech Stack:** Next.js 15 App Router, `@/components/data-table/data-table` (DataTable), `@/components/layout/content-layout` (ContentLayout), shadcn/ui Breadcrumb, Supabase, React Query

---

## Reference: Leads Module Pattern

**page.tsx pattern** (`app/(routes)/admission/leads/page.tsx`):
```tsx
'use client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { LeadsDataTable } from './_components/leads-data-table';

function AdmissionLeadsPageContent() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Leads">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Leads</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <LeadsDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionLeadsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionLeadsPageContent />
    </AdmissionErrorBoundary>
  );
}
```

**data-table.tsx pattern** (minimal version for simple list pages):
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { SomeService } from '@/lib/services/admission/some-service';

export function SomeDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const data = await SomeService.getItems(institutionId);
    // For services without pagination: return full array
    const filtered = params.search
      ? data.filter(item => JSON.stringify(item).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    const paginated = filtered.slice(start, start + params.limit);
    return {
      success: true,
      data: paginated,
      pagination: {
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(filtered.length / params.limit),
        total_items: filtered.length,
      },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'items', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

---

## Current State Summary

### ✅ DONE (skip these):
- `group-dashboard`, `workflow-config`, `insights`, `re-engagement`, `parent-communication`, `calls`

### 🔵 GROUP A: _components built, page.tsx needs update (12 pages)
These have `columns.tsx` already created. Need: `*-data-table.tsx` + updated `page.tsx`.

| Page | Data Type | Service Method |
|------|-----------|----------------|
| `assignment-rules` | `AssignmentRule` | `AssignmentRulesService.getAssignmentRules(institutionId)` |
| `counselor-view` | N/A (dashboard) | N/A — just add ContentLayout wrapper |
| `documents` | `PendingDocument` | `DocumentService.getPendingDocuments(institutionId)` |
| `feedback` | `FeedbackCandidate` | `FeedbackService.getCandidates({institutionId})` |
| `lateral-entry` | `LateralEntryApplication` | `LateralEntryService.getApplications({institutionId})` |
| `merit-list` | `MeritListCandidate` (local in columns.tsx) | `MeritListService.getMeritLists(institutionId)` → shape to MeritListCandidate |
| `offer-letter` | `OfferLetterRow` | `OfferLetterService.getOfferLetters({institutionId})` |
| `publishers` | `EducationConsultant` | `ConsultantService` from `@/lib/services/admission/consultant-service` |
| `scoring-rules` | `ScoringRule` | `ScoringRulesService.getScoringRules(institutionId)` |
| `seat-confirmation` | `AdmissionPaymentRow` | `SeatConfirmationService.getPayments({institutionId})` |
| `sources` | `SourceSummary` | `SourceTrackingService.getSourceBreakdown(institutionId)` |
| `status` | `ApplicationStatusEntry` | `StatusTrackingService.getApplications({institutionId})` |

### 🟡 GROUP B: Need ContentLayout + Breadcrumb only (8 pages)
These are complex dashboards/forms — DO NOT replace their content, just WRAP it.

`apply`, `data-profiling`, `deduplication`, `hostels`, `interviews`, `phone-validation`, `scholarships`, `screening-exam`

---

## Batch 1: Quick Wrapper — counselor-view

### Task 1: Fix counselor-view — add ContentLayout

**Files:**
- Modify: `app/(routes)/admission/counselor-view/page.tsx`

**What to do:** The page already has `Breadcrumb` but is missing the `ContentLayout` wrapper. Find the main `return (` in the `CounselorDailyViewContent` function (or equivalent root function) and:
1. Add `import { ContentLayout } from '@/components/layout/content-layout';` at the top
2. Wrap the outermost JSX with `<ContentLayout title="Counselor View">...</ContentLayout>`

The breadcrumb trail should be: Dashboard / Admission / Counselor View

**Step 1: Read the file**
Read `app/(routes)/admission/counselor-view/page.tsx` fully to understand current structure.

**Step 2: Add ContentLayout import**
Add after the existing breadcrumb import line:
```tsx
import { ContentLayout } from '@/components/layout/content-layout';
```

**Step 3: Wrap main return with ContentLayout**
Find the main return JSX and wrap:
```tsx
<ContentLayout title="Counselor View">
  {/* existing content */}
</ContentLayout>
```

**Step 4: Verify**
Check the file saved correctly with `grep -n "ContentLayout" app/(routes)/admission/counselor-view/page.tsx`

---

## Batch 2: GROUP B — Wrap 8 dashboard/form pages with ContentLayout + Breadcrumb

For EACH page in this batch: read the full page.tsx, add `ContentLayout` + `Breadcrumb` wrapper. DO NOT change any existing logic, state, hooks, or UI components.

**Pattern for GROUP B pages:**
```tsx
// Add this import at the top:
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

// In the main return, wrap existing content like this:
export default function SomePage() {
  // ... existing state and hooks ...
  return (
    <ContentLayout title="Page Title">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Page Title</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {/* ENTIRE EXISTING JSX CONTENT — move here unchanged */}
      </div>
    </ContentLayout>
  );
}
```

### Task 2a: apply/page.tsx

**Files:** Modify `app/(routes)/admission/apply/page.tsx`
- Page title: "Apply"
- Breadcrumb: Dashboard / Admission / Apply
- This is a multi-step application form. Wrap the entire return JSX.

### Task 2b: data-profiling/page.tsx

**Files:** Modify `app/(routes)/admission/data-profiling/page.tsx`
- Page title: "Data Profiling"
- Breadcrumb: Dashboard / Admission / Data Profiling

### Task 2c: deduplication/page.tsx

**Files:** Modify `app/(routes)/admission/deduplication/page.tsx`
- Page title: "Deduplication"
- Breadcrumb: Dashboard / Admission / Deduplication

### Task 2d: hostels/page.tsx

**Files:** Modify `app/(routes)/admission/hostels/page.tsx`
- Page title: "Hostels"
- Breadcrumb: Dashboard / Admission / Hostels

### Task 2e: interviews/page.tsx

**Files:** Modify `app/(routes)/admission/interviews/page.tsx`
- Page title: "Interviews"
- Breadcrumb: Dashboard / Admission / Interviews

### Task 2f: phone-validation/page.tsx

**Files:** Modify `app/(routes)/admission/phone-validation/page.tsx`
- Page title: "Phone Validation"
- Breadcrumb: Dashboard / Admission / Phone Validation

### Task 2g: scholarships/page.tsx

**Files:** Modify `app/(routes)/admission/scholarships/page.tsx`
- Page title: "Scholarships"
- Breadcrumb: Dashboard / Admission / Scholarships

### Task 2h: screening-exam/page.tsx

**Files:** Modify `app/(routes)/admission/screening-exam/page.tsx`
- Page title: "Screening Exam"
- Breadcrumb: Dashboard / Admission / Screening Exam

**Step for ALL Task 2 pages:**
1. Read the full page.tsx
2. Add ContentLayout + Breadcrumb imports at the top
3. Wrap the outermost return JSX with ContentLayout → div.space-y-6 → Breadcrumb + existing content
4. Verify with grep

---

## Batch 3: GROUP A — Create data-table + update page.tsx

For each page: (1) create `_components/<page>-data-table.tsx`, (2) replace `page.tsx` with leads-style layout.

**Important notes for GROUP A:**
- `sources` and `scoring-rules` already have `_components/*-data-table.tsx` but they are `// placeholder` — REPLACE the file content entirely
- `offer-letter` has an empty `_components/` dir — create `columns.tsx` first, then data-table
- For services that don't return paginated results (they return a flat array), use the client-side pagination pattern shown in the Reference section above
- Always read the existing `columns.tsx` to understand the data type BEFORE writing data-table.tsx

---

### Task 3a: assignment-rules

**Files:**
- Create: `app/(routes)/admission/assignment-rules/_components/assignment-rules-data-table.tsx`
- Replace: `app/(routes)/admission/assignment-rules/page.tsx`

**Step 1: Read existing columns.tsx**
Read `app/(routes)/admission/assignment-rules/_components/columns.tsx` — type is `AssignmentRule` from `@/lib/services/admission/assignment-rules-service`

**Step 2: Create data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { AssignmentRulesService } from '@/lib/services/admission/assignment-rules-service';

export function AssignmentRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const data = await AssignmentRulesService.getAssignmentRules(institutionId);
    const filtered = params.search
      ? data.filter(r => (r.name + ' ' + (r.description || '')).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'assignment-rules', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

**Step 3: Replace page.tsx**
```tsx
'use client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { AssignmentRulesDataTable } from './_components/assignment-rules-data-table';

function AssignmentRulesPageContent() {
  return (
    <ContentLayout title="Assignment Rules">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Assignment Rules</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AssignmentRulesDataTable />
      </div>
    </ContentLayout>
  );
}

export default function AssignmentRulesPage() {
  return (
    <AdmissionErrorBoundary>
      <AssignmentRulesPageContent />
    </AdmissionErrorBoundary>
  );
}
```

---

### Task 3b: documents

**Files:**
- Create: `app/(routes)/admission/documents/_components/documents-data-table.tsx`
- Replace: `app/(routes)/admission/documents/page.tsx`

**Step 1: Read existing columns.tsx**
Type: `PendingDocument` from `@/lib/services/admission/document-service`
Export: `pendingDocumentsColumns` (note: NOT `columns`)

**Step 2: Create data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { pendingDocumentsColumns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { DocumentService } from '@/lib/services/admission/document-service';

export function DocumentsDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const data = await DocumentService.getPendingDocuments(institutionId);
    const filtered = params.search
      ? data.filter(d => (d.file_name + ' ' + d.document_type_name).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => pendingDocumentsColumns as any}
      exportConfig={{ entityName: 'documents', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

**Step 3: Replace page.tsx** (same leads pattern, title "Documents", last breadcrumb "Documents", import `DocumentsDataTable`)

---

### Task 3c: feedback

**Files:**
- Create: `app/(routes)/admission/feedback/_components/feedback-data-table.tsx`
- Replace: `app/(routes)/admission/feedback/page.tsx`

**Step 1: Read existing columns.tsx**
Type: `FeedbackCandidate` from `@/lib/services/admission/feedback-service`
Export: `columns`

**Step 2: Create data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { FeedbackService } from '@/lib/services/admission/feedback-service';

export function FeedbackDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const result = await FeedbackService.getCandidates({ institutionId });
    const data = Array.isArray(result) ? result : (result as any).candidates || [];
    const filtered = params.search
      ? data.filter((c: any) => (c.full_name + ' ' + c.email).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'feedback', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

> **Note:** Check `FeedbackService.getCandidates` signature before writing — it may require different filter fields. Read the first 30 lines of `lib/services/admission/feedback-service.ts` to confirm the return type.

**Step 3: Replace page.tsx** (leads pattern, title "Feedback", import `FeedbackDataTable`)

---

### Task 3d: lateral-entry

**Files:**
- Create: `app/(routes)/admission/lateral-entry/_components/lateral-entry-data-table.tsx`
- Replace: `app/(routes)/admission/lateral-entry/page.tsx`

**Step 1: Read existing columns.tsx**
Type: `LateralEntryApplication` from `@/lib/services/admission/lateral-entry-service`
Service method: `LateralEntryService.getApplications({ institutionId })`

**Step 2: Create data-table.tsx**
Follow the same client-side pagination pattern. For `getApplications`, it may return `{ data, total }` or a plain array — read the service method signature to confirm.

**Step 3: Replace page.tsx** (leads pattern, title "Lateral Entry", import `LateralEntryDataTable`)

---

### Task 3e: merit-list

**Files:**
- Create: `app/(routes)/admission/merit-list/_components/merit-list-data-table.tsx`
- Replace: `app/(routes)/admission/merit-list/page.tsx`

**Step 1: Read columns.tsx**
The columns.tsx defines its own `MeritListCandidate` interface locally (NOT from service). The `DataTable` must use this type. `MeritListService.getMeritLists(institutionId)` returns `MeritListRow[]` — you must map/transform to `MeritListCandidate` shape. Read both the columns.tsx and `lib/services/admission/merit-list-service.ts` to understand the mapping.

**Step 2: Create data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { MeritListService } from '@/lib/services/admission/merit-list-service';
import type { MeritListCandidate } from './columns';

export function MeritListDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: { page: number; limit: number; search: string; ... }) => {
    const rows = await MeritListService.getMeritLists(institutionId);
    // Map MeritListRow → MeritListCandidate (read both types to confirm field mapping)
    const data: MeritListCandidate[] = rows.map(r => ({ id: r.id, name: r.name || '', ... }));
    const filtered = params.search ? data.filter(c => c.name.toLowerCase().includes(params.search.toLowerCase())) : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'merit-list', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

**Step 3: Replace page.tsx** (leads pattern, title "Merit List", import `MeritListDataTable`)

---

### Task 3f: offer-letter

**Files:**
- Create: `app/(routes)/admission/offer-letter/_components/columns.tsx`
- Create: `app/(routes)/admission/offer-letter/_components/offer-letter-data-table.tsx`
- Replace: `app/(routes)/admission/offer-letter/page.tsx`

**Step 1: Read offer-letter-service.ts**
Read `lib/services/admission/offer-letter-service.ts` to understand `OfferLetterRow` fields.

**Step 2: Create columns.tsx** (the _components dir is empty — create fresh)
```tsx
'use client';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { OfferLetterRow } from '@/lib/services/admission/offer-letter-service';

export const columns: ColumnDef<OfferLetterRow>[] = [
  {
    accessorKey: 'application_number',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Application #" />,
    cell: ({ row }) => <span className="font-mono text-sm">{row.getValue('application_number')}</span>,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.getValue<string>('status');
      const colorMap: Record<string, string> = {
        pending: 'bg-yellow-100 text-yellow-800',
        accepted: 'bg-green-100 text-green-800',
        declined: 'bg-red-100 text-red-800',
        expired: 'bg-gray-100 text-gray-800',
      };
      return <Badge className={colorMap[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
    },
  },
  {
    accessorKey: 'issued_at',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Issued" />,
    cell: ({ row }) => {
      const val = row.getValue<string>('issued_at');
      return val ? <span>{format(new Date(val), 'dd MMM yyyy')}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'deadline_date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Deadline" />,
    cell: ({ row }) => {
      const val = row.getValue<string>('deadline_date');
      return val ? <span>{format(new Date(val), 'dd MMM yyyy')}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
];
```
> Adjust columns based on actual `OfferLetterRow` fields — read the service type before writing.

**Step 3: Create data-table.tsx**
Use `OfferLetterService.getOfferLetters({ institutionId })` — check return type (may be `{ data, total }` or flat array).

**Step 4: Replace page.tsx** (leads pattern, title "Offer Letters", import `OfferLetterDataTable`)

---

### Task 3g: publishers

**Files:**
- Create: `app/(routes)/admission/publishers/_components/publishers-data-table.tsx`
- Replace: `app/(routes)/admission/publishers/page.tsx`

**Step 1: Read columns.tsx**
Type: `EducationConsultant` from `@/types/education-consultants`

**Step 2: Find the correct service**
Check `lib/services/admission/consultant-service.ts` for a method to list consultants. If not found, check `@/hooks/admission` for a consultant hook.

**Step 3: Create data-table.tsx** following the same pattern.

**Step 4: Replace page.tsx** (leads pattern, title "Publishers", import `PublishersDataTable`)

---

### Task 3h: scoring-rules

**Files:**
- Replace: `app/(routes)/admission/scoring-rules/_components/scoring-rules-data-table.tsx` (currently `// placeholder`)
- Replace: `app/(routes)/admission/scoring-rules/page.tsx`

**Step 1: Read columns.tsx**
Type: `ScoringRule` from `@/lib/services/admission/scoring-rules-service`
Service: `ScoringRulesService.getScoringRules(institutionId)` → `ScoringRule[]`

**Step 2: Replace scoring-rules-data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { ScoringRulesService } from '@/lib/services/admission/scoring-rules-service';

export function ScoringRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const data = await ScoringRulesService.getScoringRules(institutionId);
    const filtered = params.search
      ? data.filter(r => (r.name + ' ' + (r.description || '')).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'scoring-rules', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

**Step 3: Replace page.tsx** (leads pattern, title "Scoring Rules", import `ScoringRulesDataTable`)

---

### Task 3i: seat-confirmation

**Files:**
- Create: `app/(routes)/admission/seat-confirmation/_components/seat-confirmation-data-table.tsx`
- Replace: `app/(routes)/admission/seat-confirmation/page.tsx`

**Step 1: Read columns.tsx**
Type: `AdmissionPaymentRow` from `@/lib/services/admission/seat-confirmation-service`
Service: `SeatConfirmationService.getPayments({ institutionId })` → read service to get return type

**Step 2: Create data-table.tsx** using `SeatConfirmationService.getPayments({ institutionId })` with client-side pagination.

**Step 3: Replace page.tsx** (leads pattern, title "Seat Confirmation", import `SeatConfirmationDataTable`)

---

### Task 3j: sources

**Files:**
- Replace: `app/(routes)/admission/sources/_components/sources-data-table.tsx` (currently `// placeholder`)
- Replace: `app/(routes)/admission/sources/page.tsx`

**Step 1: Read columns.tsx**
Type: `SourceSummary` from `@/lib/services/admission/source-tracking-service`
Service: `SourceTrackingService.getSourceBreakdown(institutionId)` → `SourceSummary[]`

**Step 2: Replace sources-data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { SourceTrackingService } from '@/lib/services/admission/source-tracking-service';

export function SourcesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const data = await SourceTrackingService.getSourceBreakdown(institutionId);
    const filtered = params.search
      ? data.filter(s => s.source.toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'sources', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="source"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```
> Note: `idField="source"` because `SourceSummary` may not have an `id` field.

**Step 3: Replace page.tsx** (leads pattern, title "Sources", import `SourcesDataTable`)

---

### Task 3k: status

**Files:**
- Create: `app/(routes)/admission/status/_components/status-data-table.tsx`
- Replace: `app/(routes)/admission/status/page.tsx`

**Step 1: Read columns.tsx**
The columns.tsx uses a local `ApplicationStatusRow` type (NOT imported from a service). The service `StatusTrackingService.getApplications` returns `ApplicationStatusEntry[]`. You need to check what fields `ApplicationStatusRow` expects vs what `ApplicationStatusEntry` provides, and map if needed.

Read `app/(routes)/admission/status/_components/columns.tsx` fully to understand `ApplicationStatusRow`.
Read `lib/services/admission/status-tracking-service.ts` lines 1-60 to understand `ApplicationStatusEntry`.

**Step 2: Create status-data-table.tsx**
```tsx
'use client';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { StatusTrackingService } from '@/lib/services/admission/status-tracking-service';

export function StatusDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = async (params: {
    page: number; limit: number; search: string;
    from_date: string; to_date: string; sort_by: string; sort_order: string;
  }) => {
    const result = await StatusTrackingService.getApplications({ institutionId });
    const data = Array.isArray(result) ? result : (result as any).applications || [];
    const filtered = params.search
      ? data.filter((a: any) => JSON.stringify(a).toLowerCase().includes(params.search.toLowerCase()))
      : data;
    const start = (params.page - 1) * params.limit;
    return {
      success: true,
      data: filtered.slice(start, start + params.limit),
      pagination: { page: params.page, limit: params.limit, total_pages: Math.ceil(filtered.length / params.limit), total_items: filtered.length },
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'status', columnMapping: {}, columnWidths: [], headers: [] }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
```

**Step 3: Replace page.tsx** (leads pattern, title "Application Status", import `StatusDataTable`)

---

## Execution Order

**Recommended parallel batches:**

```
Batch 1 (1 task):  Task 1 — counselor-view ContentLayout fix
Batch 2 (8 tasks): Tasks 2a–2h — GROUP B wrappers (all parallel)
Batch 3 (6 tasks): Tasks 3a, 3b, 3c, 3j, 3h, 3i — simpler GROUP A pages (parallel)
Batch 4 (5 tasks): Tasks 3d, 3e, 3f, 3g, 3k — complex GROUP A pages needing type mapping (parallel)
```

## Verification

After all tasks complete, run a final compliance check:
```bash
BASE="app/(routes)/admission"
PAGES="apply assignment-rules counselor-view data-profiling deduplication documents feedback hostels interviews lateral-entry merit-list offer-letter phone-validation publishers scholarships scoring-rules screening-exam seat-confirmation sources status"
for page in $PAGES; do
  cl=$(grep -l "ContentLayout" "$BASE/$page/page.tsx" 2>/dev/null | wc -l)
  br=$(grep -l "Breadcrumb" "$BASE/$page/page.tsx" 2>/dev/null | wc -l)
  echo "$page | CL:$cl | BR:$br"
done
```
Expected: all pages show `CL:1 | BR:1`
