'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock } from '@/components/code-block';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Key,
  Shield,
  Zap,
  BookOpen,
  Code2,
  Lightbulb,
  Building2,
  Users,
  GraduationCap,
  Briefcase,
  FileText,
  Target,
  Activity,
  Building,
  XCircle,
  FlaskConical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { B2AEndpointTesterDialog } from './b2a-endpoint-tester';

// ─── Code snippets ──────────────────────────────────────────────────────────

const authExample = `// Every B2A request requires a Bearer token
const response = await fetch('https://jkkn.ai/api/b2a/admission', {
  headers: {
    'Authorization': 'Bearer jkkn_b2a_your_api_key_here',
    'Accept': 'application/json',
  },
});`;

const errorEnvelope = `// All errors use this consistent envelope
{
  "error": {
    "code": "NOT_FOUND",          // Machine-readable error code
    "message": "Admission record not found."  // Human-readable description
  }
}

// Common error codes:
// UNAUTHORIZED      → 401  Missing or invalid API key
// FORBIDDEN         → 403  API key lacks permission for this module
// NOT_FOUND         → 404  Record does not exist (or out of institution scope)
// RATE_LIMIT_EXCEEDED → 429  Too many requests — check Retry-After header
// INVALID_ID        → 400  UUID format is invalid
// MISSING_PARAMS    → 400  Required query parameters not provided
// INTERNAL_ERROR    → 500  Server-side failure
// MODULE_NOT_IMPLEMENTED → 501  Module is planned but not yet available`;

const successEnvelope = `// Single-record endpoints (e.g. /admission/:id)
{
  "success": true,
  "data": { /* record object */ }
}

// List endpoints (e.g. /admission, /staff)
{
  "success": true,
  "data": [ /* array of records */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 148,
    "totalPages": 8
  }
}

// Aggregation endpoints (e.g. /admission/stats, /attendance/trend)
{
  "success": true,
  "data": { /* summary / computed object */ }
}`;

const rateLimitHeaders = `// Rate limit status is returned on every successful response
HTTP/1.1 200 OK
X-RateLimit-Limit: 60        // Max requests per minute
X-RateLimit-Remaining: 54    // Remaining in current window
X-RateLimit-Reset: 2026-02-23T10:01:00.000Z  // When window resets

// On 429 Too Many Requests:
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-02-23T10:01:00.000Z
Retry-After: 37              // Seconds until you can retry`;

// ─── Module endpoint examples ────────────────────────────────────────────────

const admissionListCode = `// List admissions with filters
const res = await fetch(
  'https://jkkn.ai/api/b2a/admission?status=pending&page=1&limit=20',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, first_name, last_name, student_email, status, application_id,
//              department_id, program_id, entry_type, gender, date_of_birth, ... }`;

const admissionStatsCode = `// Institution-level admission statistics
const res = await fetch('https://jkkn.ai/api/b2a/admission/stats', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → { total, by_status: { pending, approved, rejected }, by_entry_type: { ... },
//           by_department: { ... }, by_gender: { male, female, other } }`;

const admissionSingleCode = `// Fetch one admission by UUID
const res = await fetch(
  'https://jkkn.ai/api/b2a/admission/3fa85f64-5717-4562-b3fc-2c963f66afa6',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data → full admission record with parent details, address, counseling info, ...`;

const attendanceListCode = `// List attendance records for a date range
const res = await fetch(
  'https://jkkn.ai/api/b2a/attendance?from=2026-02-01&to=2026-02-23&page=1',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, student_id, attendance_date, period_id, status,
//              department_id, program_id, institution_id, ... }`;

const attendanceTrendCode = `// Daily attendance trend — max 90-day window
const res = await fetch(
  'https://jkkn.ai/api/b2a/attendance/trend?from=2026-02-01&to=2026-02-23',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data → { from: "2026-02-01", to: "2026-02-23",
//           trend: { "2026-02-01": 423, "2026-02-02": 0, "2026-02-03": 418, ... } }`;

const attendancePendingCode = `// Students below the attendance threshold
const res = await fetch(
  'https://jkkn.ai/api/b2a/attendance/pending?threshold=75',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data[0] → { student_id, name, attendance_percentage, attended, total }`;

const billingCode = `// List billing records
const res = await fetch(
  'https://jkkn.ai/api/b2a/billing?status=pending&page=1&limit=50',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, student_id, fee_type, amount, paid_amount, balance,
//              status, due_date, created_at, ... }`;

const grievanceCode = `// List service requests / grievances
const res = await fetch(
  'https://jkkn.ai/api/b2a/grievance?status=open&page=1',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, title, description, category, status, priority,
//              submitted_by, assigned_to, created_at, updated_at, ... }`;

const okrCode = `// List OKR objectives
const res = await fetch(
  'https://jkkn.ai/api/b2a/okr/objectives?status=active&page=1',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, title, description, type, status, progress,
//              owner_id, key_results: [...], due_date, ... }`;

const learnersCode = `// List learner profiles
const res = await fetch(
  'https://jkkn.ai/api/b2a/learners?status=active&page=1&limit=20',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, first_name, last_name, roll_number, email, mobile,
//              department_id, program_id, semester, status, ... }`;

const staffCode = `// List staff members
const res = await fetch(
  'https://jkkn.ai/api/b2a/staff?role_type=faculty&page=1',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { id, first_name, last_name, email, designation,
//              department_id, role_type, facilitator_certification, ... }`;

const orgsCode = `// Institutions
const institutions = await fetch('https://jkkn.ai/api/b2a/organizations/institutions?is_active=true',
  { headers: { 'Authorization': 'Bearer <key>' } }
).then(r => r.json());

// Departments (optionally filtered by degree)
const departments = await fetch('https://jkkn.ai/api/b2a/organizations/departments?is_active=true&degree_id=<uuid>',
  { headers: { 'Authorization': 'Bearer <key>' } }
).then(r => r.json());

// Courses
const courses = await fetch('https://jkkn.ai/api/b2a/organizations/courses?is_active=true',
  { headers: { 'Authorization': 'Bearer <key>' } }
).then(r => r.json());`;

const morningBriefCode = `// Institution morning brief — one call to get today's snapshot
const res = await fetch('https://jkkn.ai/api/b2a/morning-brief', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → {
//   date: "2026-02-23",
//   attendance: { today_percentage: 82.4, below_threshold_count: 12 },
//   admissions: { pending_review: 7, approved_today: 3 },
//   grievances: { open: 5, overdue: 1 },
//   billing: { pending_collections: 124 }
// }`;

// ─── Missing endpoint code snippets ──────────────────────────────────────────

const billingSummaryCode = `// Institution-level billing summary
const res = await fetch('https://jkkn.ai/api/b2a/billing/summary', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → { total_billed, total_collected, total_outstanding,
//           by_status: { paid, partial, unpaid, overdue } }`;

const billingOutstandingCode = `// Outstanding collections — filter by overdue days
const res = await fetch(
  'https://jkkn.ai/api/b2a/billing/outstanding?days_overdue=30',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data, pagination } = await res.json();
// data[0] → { student_id, name, amount_due, days_overdue, due_date, ... }`;

const grievanceDashboardCode = `// Grievance dashboard summary
const res = await fetch('https://jkkn.ai/api/b2a/grievance/dashboard', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → { total, open, in_progress, resolved, overdue,
//           avg_resolution_days, by_category: { ... } }`;

const grievanceSingleCode = `// Single grievance by UUID
const res = await fetch(
  'https://jkkn.ai/api/b2a/grievance/3fa85f64-5717-4562-b3fc-2c963f66afa6',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data → full grievance with status history, comments, attachments ...`;

const okrComplianceCode = `// OKR compliance metrics
const res = await fetch('https://jkkn.ai/api/b2a/okr/compliance', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → { compliance_rate, objectives_with_krs, total_objectives, avg_progress }`;

const okrStatsCode = `// OKR aggregate statistics
const res = await fetch('https://jkkn.ai/api/b2a/okr/stats', {
  headers: { 'Authorization': 'Bearer <key>' }
});
const { data } = await res.json();
// data → { total, by_status: { draft, active, completed, cancelled }, avg_progress }`;

const learnersSingleCode = `// Single learner profile by UUID
const res = await fetch(
  'https://jkkn.ai/api/b2a/learners/3fa85f64-5717-4562-b3fc-2c963f66afa6',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data → full learner record with academic history, contact info, enrollment ...`;

const staffSingleCode = `// Single staff member by UUID
const res = await fetch(
  'https://jkkn.ai/api/b2a/staff/3fa85f64-5717-4562-b3fc-2c963f66afa6',
  { headers: { 'Authorization': 'Bearer <key>' } }
);
const { data } = await res.json();
// data → full staff profile with qualifications, assignments, certifications ...`;

// ─── Full TypeScript service example ────────────────────────────────────────

const tsServiceExample = `// lib/services/b2a-client.ts
// Reusable typed client for the B2A API Gateway

const B2A_BASE = 'https://jkkn.ai/api/b2a';

type B2AResponse<T> =
  | { success: true; data: T; pagination?: Pagination }
  | { success: false; error: { code: string; message: string } };

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function b2aFetch<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string>
): Promise<B2AResponse<T>> {
  const url = new URL(\`\${B2A_BASE}\${path}\`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      Accept: 'application/json',
    },
    next: { revalidate: 0 }, // always fresh — B2A has no caching
  });

  return res.json() as Promise<B2AResponse<T>>;
}

// --- Typed helpers ---

export interface AdmissionRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  student_email: string | null;
  status: string | null;
  application_id: string | null;
  department_id: string | null;
  program_id: string | null;
  entry_type: string | null;
  gender: string | null;
  created_at: string;
}

export const B2AClient = {
  admission: {
    list: (key: string, params?: { status?: string; page?: string; limit?: string }) =>
      b2aFetch<AdmissionRecord[]>(key, '/admission', params as Record<string, string>),

    get: (key: string, id: string) =>
      b2aFetch<AdmissionRecord>(key, \`/admission/\${id}\`),

    stats: (key: string) =>
      b2aFetch<Record<string, unknown>>(key, '/admission/stats'),
  },

  attendance: {
    list: (key: string, params?: { from?: string; to?: string; page?: string }) =>
      b2aFetch<unknown[]>(key, '/attendance', params as Record<string, string>),

    trend: (key: string, from: string, to: string) =>
      b2aFetch<{ from: string; to: string; trend: Record<string, number> }>(
        key, '/attendance/trend', { from, to }
      ),
  },

  morningBrief: {
    get: (key: string) =>
      b2aFetch<Record<string, unknown>>(key, '/morning-brief'),
  },
};`;

// ─── React Query integration example ─────────────────────────────────────────

const reactQueryExample = `// hooks/use-b2a-admission.ts
import { useQuery } from '@tanstack/react-query';

const API_KEY = process.env.NEXT_PUBLIC_B2A_API_KEY!;

export function useAdmissions(filters: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['b2a', 'admissions', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const res = await fetch(
        \`https://jkkn.ai/api/b2a/admission?\${params}\`,
        { headers: { Authorization: \`Bearer \${API_KEY}\` } }
      );

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error.message);
      }
      return res.json();
    },
    staleTime: 30_000,  // 30s — B2A data changes often
    retry: (count, error: Error) => {
      // Don't retry auth/forbidden errors
      if (error.message.includes('401') || error.message.includes('403')) return false;
      return count < 2;
    },
  });
}

// Usage in a component:
// const { data, isLoading, error } = useAdmissions({ status: 'pending', page: 1 });`;

// ─── cURL examples ────────────────────────────────────────────────────────────

const curlExamples = `# Morning brief (no params needed)
curl -s https://jkkn.ai/api/b2a/morning-brief \\
  -H "Authorization: Bearer jkkn_b2a_your_key" | jq .

# Admissions list with filters
curl -s "https://jkkn.ai/api/b2a/admission?status=pending&limit=10" \\
  -H "Authorization: Bearer jkkn_b2a_your_key" | jq .data

# Single admission by ID
curl -s https://jkkn.ai/api/b2a/admission/3fa85f64-5717-4562-b3fc-2c963f66afa6 \\
  -H "Authorization: Bearer jkkn_b2a_your_key"

# Attendance trend for last 7 days
curl -s "https://jkkn.ai/api/b2a/attendance/trend?from=2026-02-16&to=2026-02-23" \\
  -H "Authorization: Bearer jkkn_b2a_your_key" | jq .data.trend

# Staff list — faculty only
curl -s "https://jkkn.ai/api/b2a/staff?role_type=faculty&limit=50" \\
  -H "Authorization: Bearer jkkn_b2a_your_key"

# Verify your key is working
curl -o /dev/null -s -w "%{http_code}\\n" \\
  https://jkkn.ai/api/b2a/morning-brief \\
  -H "Authorization: Bearer jkkn_b2a_your_key"
# 200 = working, 401 = bad key, 403 = module not permitted`;

// ─── Use case examples ────────────────────────────────────────────────────────

const useCaseDashboardCode = `// AI-powered institution dashboard
// Fetches all key metrics in parallel using Promise.all

async function buildDashboardPayload(apiKey: string) {
  const [brief, pendingAdmissions, lowAttendance] = await Promise.all([
    fetch('https://jkkn.ai/api/b2a/morning-brief', {
      headers: { Authorization: \`Bearer \${apiKey}\` }
    }).then(r => r.json()),

    fetch('https://jkkn.ai/api/b2a/admission?status=pending&limit=5', {
      headers: { Authorization: \`Bearer \${apiKey}\` }
    }).then(r => r.json()),

    fetch('https://jkkn.ai/api/b2a/attendance/pending?threshold=75', {
      headers: { Authorization: \`Bearer \${apiKey}\` }
    }).then(r => r.json()),
  ]);

  return {
    summary: brief.data,
    actionItems: {
      admissionsPendingReview: pendingAdmissions.data,
      studentsNeedingAttention: lowAttendance.data,
    }
  };
}`;

const useCaseReportCode = `// Automated weekly report generation
// Collects trend data and formats for email/PDF

async function generateWeeklyReport(apiKey: string, weekStart: string, weekEnd: string) {
  const [attendanceTrend, admissionStats, openGrievances] = await Promise.all([
    fetch(\`https://jkkn.ai/api/b2a/attendance/trend?from=\${weekStart}&to=\${weekEnd}\`,
      { headers: { Authorization: \`Bearer \${apiKey}\` } }).then(r => r.json()),

    fetch('https://jkkn.ai/api/b2a/admission/stats',
      { headers: { Authorization: \`Bearer \${apiKey}\` } }).then(r => r.json()),

    fetch('https://jkkn.ai/api/b2a/grievance?status=open',
      { headers: { Authorization: \`Bearer \${apiKey}\` } }).then(r => r.json()),
  ]);

  const avgAttendance = Object.values(attendanceTrend.data.trend as Record<string, number>)
    .reduce((sum, n) => sum + n, 0) / 7;

  return {
    period: { from: weekStart, to: weekEnd },
    attendance: { daily: attendanceTrend.data.trend, weeklyAvg: Math.round(avgAttendance) },
    admissions: admissionStats.data,
    grievances: { open: openGrievances.pagination?.total ?? 0 },
  };
}`;

const useCaseAIAgentCode = `// AI agent context builder
// Provides an LLM with structured institution data to answer questions

async function buildAgentContext(apiKey: string): Promise<string> {
  const brief = await fetch('https://jkkn.ai/api/b2a/morning-brief', {
    headers: { Authorization: \`Bearer \${apiKey}\` }
  }).then(r => r.json());

  // Format as a prompt-friendly context block
  const { date, attendance, admissions, grievances, billing } = brief.data;

  return \`
## Institution Status — \${date}

**Attendance**: Today's attendance is \${attendance.today_percentage}%.
\${attendance.below_threshold_count} students are below the 75% threshold.

**Admissions**: \${admissions.pending_review} applications pending review.
\${admissions.approved_today} approved today.

**Grievances**: \${grievances.open} open service requests,
\${grievances.overdue} overdue.

**Billing**: \${billing.pending_collections} students with pending fee collections.
\`;
}

// Then pass this context to your LLM:
// const context = await buildAgentContext(apiKey);
// const response = await openai.chat.completions.create({
//   messages: [
//     { role: 'system', content: 'You are an institution management assistant.' },
//     { role: 'user', content: context + '\\nWhat should the principal focus on today?' }
//   ]
// });`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function B2AApiDocs() {
  const [testEndpointId, setTestEndpointId] = useState<string | null>(null);

  return (
    <div className='space-y-6'>
      <Alert>
        <Zap className='h-4 w-4' />
        <AlertTitle>Business-to-Agent (B2A) API Gateway</AlertTitle>
        <AlertDescription>
          The B2A API provides read-only, authenticated access to institution data for AI agents,
          automation workflows, and third-party integrations. All endpoints require a valid API key
          issued by your institution administrator.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue='overview'>
        <TabsList className='flex w-full justify-around flex-wrap gap-1 h-auto'>
          <TabsTrigger value='overview'>
            <BookOpen className='h-4 w-4 mr-1' />
            Overview
          </TabsTrigger>
          <TabsTrigger value='endpoints'>
            <Code2 className='h-4 w-4 mr-1' />
            Endpoints
          </TabsTrigger>
          <TabsTrigger value='examples'>
            <Zap className='h-4 w-4 mr-1' />
            Code Examples
          </TabsTrigger>
          <TabsTrigger value='usecases'>
            <Lightbulb className='h-4 w-4 mr-1' />
            Use Cases
          </TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
        <TabsContent value='overview' className='space-y-6 mt-4'>
          {/* Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Key className='h-4 w-4' />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                Every B2A request must include your API key as a Bearer token in the{' '}
                <code className='bg-muted px-1 rounded text-xs'>Authorization</code> header.
                API keys are scoped to specific modules — a key for the{' '}
                <code className='bg-muted px-1 rounded text-xs'>admission</code> module cannot
                access <code className='bg-muted px-1 rounded text-xs'>staff</code> data.
              </p>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm'>
                <div className='space-y-1'>
                  <p className='font-medium'>Key format</p>
                  <code className='text-xs bg-muted px-2 py-1 rounded block'>
                    jkkn_b2a_xxxxxxxxxxxxxxxx
                  </code>
                </div>
                <div className='space-y-1'>
                  <p className='font-medium'>Header format</p>
                  <code className='text-xs bg-muted px-2 py-1 rounded block'>
                    Authorization: Bearer &lt;key&gt;
                  </code>
                </div>
              </div>
              <CodeBlock code={authExample} language='javascript' />
              <Alert variant='destructive' className='py-2'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription className='text-xs'>
                  Never expose API keys in client-side code or public repositories. Use environment
                  variables and server-side fetch only.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Rate Limiting */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Clock className='h-4 w-4' />
                Rate Limiting
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                Each API key is limited to <strong>60 requests per minute</strong>. The current
                window status is returned on every response as HTTP headers. When the limit is
                exceeded, the API returns <code className='bg-muted px-1 rounded text-xs'>429</code>{' '}
                with a <code className='bg-muted px-1 rounded text-xs'>Retry-After</code> header.
              </p>
              <CodeBlock code={rateLimitHeaders} language='http' />
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm'>
                {[
                  { label: 'Limit', value: '60 req/min', color: 'text-blue-600' },
                  { label: 'Window', value: 'Rolling 1 minute', color: 'text-green-600' },
                  { label: 'Scope', value: 'Per API key', color: 'text-orange-600' },
                ].map(item => (
                  <div key={item.label} className='bg-muted/50 rounded p-3 text-center'>
                    <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                    <p className='text-xs text-muted-foreground'>{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Response Format */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Shield className='h-4 w-4' />
                Response Format
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-muted-foreground'>
                All B2A responses use a consistent envelope. Successful responses carry{' '}
                <code className='bg-muted px-1 rounded text-xs'>success: true</code> and a{' '}
                <code className='bg-muted px-1 rounded text-xs'>data</code> field. Errors always
                follow the same structure regardless of HTTP status code.
              </p>
              <Tabs defaultValue='success'>
                <TabsList>
                  <TabsTrigger value='success'>
                    <CheckCircle2 className='h-3 w-3 mr-1' /> Success
                  </TabsTrigger>
                  <TabsTrigger value='error'>
                    <XCircle className='h-3 w-3 mr-1' /> Error
                  </TabsTrigger>
                </TabsList>
                <TabsContent value='success' className='mt-3'>
                  <CodeBlock code={successEnvelope} language='json' />
                </TabsContent>
                <TabsContent value='error' className='mt-3'>
                  <CodeBlock code={errorEnvelope} language='json' />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Module overview table */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Activity className='h-4 w-4' />
                Available Modules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {[
                  { name: 'admission', desc: 'Student admission applications and statistics', status: 'live', endpoints: 3 },
                  { name: 'attendance', desc: 'Student attendance records and trend analysis', status: 'live', endpoints: 3 },
                  { name: 'billing', desc: 'Fee structures, invoices, and payment status', status: 'live', endpoints: 3 },
                  { name: 'grievance', desc: 'Student and staff service requests', status: 'live', endpoints: 3 },
                  { name: 'okr', desc: 'Institutional OKR objectives and key results', status: 'live', endpoints: 3 },
                  { name: 'learners', desc: 'Learner profiles and enrollment data', status: 'live', endpoints: 2 },
                  { name: 'staff', desc: 'Faculty and staff directory', status: 'live', endpoints: 2 },
                  { name: 'organizations', desc: 'Institutions, departments, and courses', status: 'live', endpoints: 3 },
                  { name: 'morning-brief', desc: 'Daily institution-wide summary snapshot', status: 'live', endpoints: 1 },
                  { name: 'campus-living', desc: 'Hostel and residential facility data', status: 'soon', endpoints: 0 },
                  { name: 'solutions', desc: 'Solutions and implementation tracking', status: 'soon', endpoints: 0 },
                  { name: 'learners-council', desc: 'Student council and committee data', status: 'soon', endpoints: 0 },
                ].map(mod => (
                  <div key={mod.name} className='flex items-center justify-between py-2 border-b last:border-0 gap-2'>
                    <div className='flex items-center gap-2 min-w-0'>
                      <code className='text-xs bg-muted px-1.5 py-0.5 rounded shrink-0'>{mod.name}</code>
                      <span className='text-xs text-muted-foreground truncate hidden sm:block'>{mod.desc}</span>
                    </div>
                    <div className='flex items-center gap-2 shrink-0'>
                      {mod.status === 'live' ? (
                        <>
                          <Badge variant='outline' className='text-xs text-green-600 border-green-600'>
                            Live
                          </Badge>
                          <span className='text-xs text-muted-foreground'>{mod.endpoints} endpoint{mod.endpoints !== 1 ? 's' : ''}</span>
                        </>
                      ) : (
                        <Badge variant='outline' className='text-xs text-yellow-600 border-yellow-600'>
                          Coming soon
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ENDPOINTS TAB ────────────────────────────────────── */}
        <TabsContent value='endpoints' className='mt-4'>
          <Accordion type='multiple' className='space-y-2'>

            {/* Admission */}
            <AccordionItem value='admission' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <GraduationCap className='h-4 w-4 text-blue-500' />
                  <span className='font-medium'>Admission</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-blue-100 text-blue-700 border-blue-200'>admission</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Access student admission applications. Supports filtering by status, entry type,
                  and department. Includes aggregate statistics and single-record detail lookup.
                </p>

                <div className='space-y-3'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/admission</code>
                    <span className='text-xs text-muted-foreground flex-1'>List admissions</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('admission-list')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <div className='text-xs text-muted-foreground pl-4 space-y-1'>
                    <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>status</code> · <code className='bg-muted px-1 rounded'>entry_type</code> · <code className='bg-muted px-1 rounded'>department_id</code> · <code className='bg-muted px-1 rounded'>program_id</code> · <code className='bg-muted px-1 rounded'>from</code> · <code className='bg-muted px-1 rounded'>to</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code> (max 100)</p>
                  </div>
                  <CodeBlock code={admissionListCode} language='javascript' />

                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/admission/stats</code>
                    <span className='text-xs text-muted-foreground flex-1'>Aggregate statistics</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('admission-stats')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <CodeBlock code={admissionStatsCode} language='javascript' />

                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/admission/:id</code>
                    <span className='text-xs text-muted-foreground flex-1'>Single record (UUID)</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('admission-single')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <CodeBlock code={admissionSingleCode} language='javascript' />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Attendance */}
            <AccordionItem value='attendance' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Activity className='h-4 w-4 text-green-500' />
                  <span className='font-medium'>Attendance</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-green-100 text-green-700 border-green-200'>attendance</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Query attendance records, compute daily trends, and identify students below the
                  attendance threshold. The trend endpoint is ideal for chart visualisations.
                </p>

                <div className='space-y-3'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/attendance</code>
                    <span className='text-xs text-muted-foreground flex-1'>Daily attendance records</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('attendance-list')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <div className='text-xs text-muted-foreground pl-4'>
                    <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>from</code> · <code className='bg-muted px-1 rounded'>to</code> · <code className='bg-muted px-1 rounded'>student_id</code> · <code className='bg-muted px-1 rounded'>department_id</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                  </div>
                  <CodeBlock code={attendanceListCode} language='javascript' />

                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/attendance/trend</code>
                    <span className='text-xs text-muted-foreground flex-1'>Max 90-day range</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('attendance-trend')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <Alert className='py-2'>
                    <AlertDescription className='text-xs'>
                      Both <code className='bg-muted px-1 rounded'>?from</code> and <code className='bg-muted px-1 rounded'>?to</code> are required in <code>YYYY-MM-DD</code> format. The date range cannot exceed 90 days.
                    </AlertDescription>
                  </Alert>
                  <CodeBlock code={attendanceTrendCode} language='javascript' />

                  <div className='flex items-center gap-2 flex-wrap'>
                    <Badge className='text-xs'>GET</Badge>
                    <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/attendance/pending</code>
                    <span className='text-xs text-muted-foreground flex-1'>Students below threshold</span>
                    <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('attendance-pending')}>
                      <FlaskConical className='h-3 w-3' />Try It
                    </Button>
                  </div>
                  <div className='text-xs text-muted-foreground pl-4'>
                    <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>threshold</code> (default 75, percentage)</p>
                  </div>
                  <CodeBlock code={attendancePendingCode} language='javascript' />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Billing */}
            <AccordionItem value='billing' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <FileText className='h-4 w-4 text-yellow-500' />
                  <span className='font-medium'>Billing</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-yellow-100 text-yellow-700 border-yellow-200'>billing</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Access fee records, invoice status, payment information, and institution-level
                  billing summaries. Supports filtering by billing status and due date.
                </p>

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/billing</code>
                  <span className='text-xs text-muted-foreground flex-1'>List billing records</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('billing-list')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>status</code> (unpaid/partial/paid/overdue) · <code className='bg-muted px-1 rounded'>due_before</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                </div>
                <CodeBlock code={billingCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/billing/summary</code>
                  <span className='text-xs text-muted-foreground flex-1'>Institution billing summary</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('billing-summary')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={billingSummaryCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/billing/outstanding</code>
                  <span className='text-xs text-muted-foreground flex-1'>Outstanding collections</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('billing-outstanding')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>days_overdue</code> (filter to records overdue by at least N days)</p>
                </div>
                <CodeBlock code={billingOutstandingCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* Grievance */}
            <AccordionItem value='grievance' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <AlertCircle className='h-4 w-4 text-red-500' />
                  <span className='font-medium'>Grievance</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-red-100 text-red-700 border-red-200'>grievance</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Read service requests and grievances submitted by students and staff.
                  Includes a dashboard summary and single-record detail lookup.
                </p>

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/grievance</code>
                  <span className='text-xs text-muted-foreground flex-1'>List grievances</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('grievance-list')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>status</code> · <code className='bg-muted px-1 rounded'>priority</code> · <code className='bg-muted px-1 rounded'>from</code> · <code className='bg-muted px-1 rounded'>to</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                </div>
                <CodeBlock code={grievanceCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/grievance/dashboard</code>
                  <span className='text-xs text-muted-foreground flex-1'>Dashboard summary</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('grievance-dashboard')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={grievanceDashboardCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/grievance/:id</code>
                  <span className='text-xs text-muted-foreground flex-1'>Single grievance (UUID)</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('grievance-single')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={grievanceSingleCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* OKR */}
            <AccordionItem value='okr' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Target className='h-4 w-4 text-purple-500' />
                  <span className='font-medium'>OKR</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-purple-100 text-purple-700 border-purple-200'>okr</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Access institutional OKR objectives, key results, compliance metrics, and
                  aggregate statistics. Track progress percentages and filter by type or status.
                </p>

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/okr/objectives</code>
                  <span className='text-xs text-muted-foreground flex-1'>List objectives</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('okr-objectives')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>status</code> · <code className='bg-muted px-1 rounded'>type</code> · <code className='bg-muted px-1 rounded'>from</code> · <code className='bg-muted px-1 rounded'>to</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                </div>
                <CodeBlock code={okrCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/okr/compliance</code>
                  <span className='text-xs text-muted-foreground flex-1'>Compliance metrics</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('okr-compliance')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={okrComplianceCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/okr/stats</code>
                  <span className='text-xs text-muted-foreground flex-1'>Aggregate statistics</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('okr-stats')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={okrStatsCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* Learners */}
            <AccordionItem value='learners' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Users className='h-4 w-4 text-teal-500' />
                  <span className='font-medium'>Learners</span>
                  <Badge variant='outline' className='text-xs'>2 endpoints</Badge>
                  <Badge className='text-xs bg-teal-100 text-teal-700 border-teal-200'>learners</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Retrieve learner/student profiles including enrollment data, academic standing,
                  and contact information. Supports full lifecycle status filtering.
                </p>

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/learners</code>
                  <span className='text-xs text-muted-foreground flex-1'>List learner profiles</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('learners-list')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>lifecycle_status</code> · <code className='bg-muted px-1 rounded'>department_id</code> · <code className='bg-muted px-1 rounded'>semester_id</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                </div>
                <CodeBlock code={learnersCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/learners/:id</code>
                  <span className='text-xs text-muted-foreground flex-1'>Single learner (UUID)</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('learners-single')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={learnersSingleCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* Staff */}
            <AccordionItem value='staff' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Briefcase className='h-4 w-4 text-indigo-500' />
                  <span className='font-medium'>Staff</span>
                  <Badge variant='outline' className='text-xs'>2 endpoints</Badge>
                  <Badge className='text-xs bg-indigo-100 text-indigo-700 border-indigo-200'>staff</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Access staff and faculty profiles. Filter by role type (faculty, admin, etc.)
                  or department for targeted queries. Single-record lookup available.
                </p>

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/staff</code>
                  <span className='text-xs text-muted-foreground flex-1'>List staff members</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('staff-list')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <div className='text-xs text-muted-foreground pl-4'>
                  <p><strong>Query params:</strong> <code className='bg-muted px-1 rounded'>role_type</code> · <code className='bg-muted px-1 rounded'>department_id</code> · <code className='bg-muted px-1 rounded'>page</code> · <code className='bg-muted px-1 rounded'>limit</code></p>
                </div>
                <CodeBlock code={staffCode} language='javascript' />

                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/staff/:id</code>
                  <span className='text-xs text-muted-foreground flex-1'>Single staff member (UUID)</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('staff-single')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={staffSingleCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* Organizations */}
            <AccordionItem value='organizations' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Building2 className='h-4 w-4 text-orange-500' />
                  <span className='font-medium'>Organizations</span>
                  <Badge variant='outline' className='text-xs'>3 endpoints</Badge>
                  <Badge className='text-xs bg-orange-100 text-orange-700 border-orange-200'>organizations</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  Access the organizational structure — institutions, departments, and courses.
                  Useful for populating dropdowns, building directory trees, or seeding agent context
                  with the institution&apos;s structure.
                </p>

                <div className='space-y-2'>
                  {[
                    { path: '/api/b2a/organizations/institutions', id: 'orgs-institutions', desc: 'List institutions' },
                    { path: '/api/b2a/organizations/departments', id: 'orgs-departments', desc: 'List departments' },
                    { path: '/api/b2a/organizations/courses', id: 'orgs-courses', desc: 'List courses' },
                  ].map(item => (
                    <div key={item.id} className='flex items-center gap-2 flex-wrap'>
                      <Badge className='text-xs'>GET</Badge>
                      <code className='text-xs bg-muted px-2 py-0.5 rounded'>{item.path}</code>
                      <span className='text-xs text-muted-foreground flex-1'>{item.desc}</span>
                      <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId(item.id)}>
                        <FlaskConical className='h-3 w-3' />Try It
                      </Button>
                    </div>
                  ))}
                </div>

                <CodeBlock code={orgsCode} language='javascript' />
                <Alert className='py-2'>
                  <AlertDescription className='text-xs'>
                    <strong>Note on institution scoping:</strong> For multi-institution keys,
                    <code className='bg-muted px-1 rounded ml-1'>?institution_id</code> can be passed
                    to override the key&apos;s default scope. Departments and courses are always filtered
                    to the resolved institution.
                  </AlertDescription>
                </Alert>
              </AccordionContent>
            </AccordionItem>

            {/* Morning Brief */}
            <AccordionItem value='morning-brief' className='border rounded-lg px-4'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Building className='h-4 w-4 text-sky-500' />
                  <span className='font-medium'>Morning Brief</span>
                  <Badge variant='outline' className='text-xs'>1 endpoint</Badge>
                  <Badge className='text-xs bg-sky-100 text-sky-700 border-sky-200'>morning-brief</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-4 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  A single endpoint that aggregates today&apos;s key metrics across all modules —
                  attendance, admissions, grievances, and billing. Designed as a low-cost single
                  call for daily dashboards and AI agent context building.
                </p>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Badge className='text-xs'>GET</Badge>
                  <code className='text-xs bg-muted px-2 py-0.5 rounded'>/api/b2a/morning-brief</code>
                  <span className='text-xs text-muted-foreground flex-1'>Daily institution snapshot</span>
                  <Button size='sm' variant='outline' className='h-6 text-xs px-2 gap-1' onClick={() => setTestEndpointId('morning-brief')}>
                    <FlaskConical className='h-3 w-3' />Try It
                  </Button>
                </div>
                <CodeBlock code={morningBriefCode} language='javascript' />
              </AccordionContent>
            </AccordionItem>

            {/* Stub modules */}
            <AccordionItem value='stubs' className='border rounded-lg px-4 border-dashed'>
              <AccordionTrigger className='hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <Clock className='h-4 w-4 text-muted-foreground' />
                  <span className='font-medium text-muted-foreground'>Coming Soon</span>
                  <Badge variant='outline' className='text-xs text-yellow-600 border-yellow-600'>3 modules</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='space-y-3 pt-2 pb-4'>
                <p className='text-sm text-muted-foreground'>
                  These modules are authenticated and rate-limited but return{' '}
                  <Badge variant='outline' className='text-xs mx-1'>501 MODULE_NOT_IMPLEMENTED</Badge>
                  until their data sources are available. You can request access now — calls will
                  automatically succeed once the module is activated.
                </p>
                <div className='space-y-2'>
                  {[
                    { path: '/api/b2a/campus-living', module: 'campus-living', desc: 'Hostel, rooms, and residential facilities' },
                    { path: '/api/b2a/solutions', module: 'solutions', desc: 'Institution solutions and outcome tracking' },
                    { path: '/api/b2a/learners-council', module: 'learners-council', desc: 'Student council and committee data' },
                  ].map(item => (
                    <div key={item.path} className='flex items-center justify-between py-2 border rounded px-3 bg-muted/30'>
                      <div>
                        <code className='text-xs'>{item.path}</code>
                        <p className='text-xs text-muted-foreground mt-0.5'>{item.desc}</p>
                      </div>
                      <Badge variant='outline' className='text-xs shrink-0 ml-2'>501</Badge>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </TabsContent>

        {/* ── CODE EXAMPLES TAB ────────────────────────────────── */}
        <TabsContent value='examples' className='space-y-6 mt-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>TypeScript Service Client</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                A reusable typed wrapper around the B2A API. Centralises the base URL,
                auth header, and query parameter handling so callers only provide typed arguments.
              </p>
              <CodeBlock code={tsServiceExample} language='typescript' />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>React Query Integration</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Wrap B2A calls in React Query hooks for automatic caching, loading states,
                and error boundaries in your UI components.
              </p>
              <CodeBlock code={reactQueryExample} language='typescript' />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>cURL Quick Reference</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Test endpoints directly from your terminal. Pipe through{' '}
                <code className='bg-muted px-1 rounded text-xs'>jq</code> for formatted JSON output.
              </p>
              <CodeBlock code={curlExamples} language='bash' />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USE CASES TAB ────────────────────────────────────── */}
        <TabsContent value='usecases' className='space-y-6 mt-4'>

          <Alert>
            <Lightbulb className='h-4 w-4' />
            <AlertTitle>Real-World Scenarios</AlertTitle>
            <AlertDescription>
              Common patterns for integrating B2A into automation pipelines, AI agents,
              and reporting systems.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <Activity className='h-4 w-4 text-blue-500' />
                Use Case 1: AI-Powered Institution Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Build a dashboard that pulls live institution metrics in a single render pass.
                Use <code className='bg-muted px-1 rounded text-xs'>Promise.all</code> to fetch
                all data concurrently and stay within the rate limit budget.
              </p>
              <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                <span>Modules used:</span>
                {['morning-brief', 'admission', 'attendance'].map(m => (
                  <Badge key={m} variant='outline' className='text-xs'>{m}</Badge>
                ))}
              </div>
              <CodeBlock code={useCaseDashboardCode} language='typescript' />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <FileText className='h-4 w-4 text-green-500' />
                Use Case 2: Automated Weekly Report
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Generate weekly performance summaries for principals and management.
                Combine attendance trends with admission stats and open grievances.
              </p>
              <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                <span>Modules used:</span>
                {['attendance', 'admission', 'grievance'].map(m => (
                  <Badge key={m} variant='outline' className='text-xs'>{m}</Badge>
                ))}
              </div>
              <CodeBlock code={useCaseReportCode} language='typescript' />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <Zap className='h-4 w-4 text-purple-500' />
                Use Case 3: LLM Agent Context Builder
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Provide an AI assistant (GPT, Claude, Gemini) with structured institution context
                so it can answer questions like &quot;What should the principal focus on today?&quot;
                or &quot;Are there any students at risk?&quot;
              </p>
              <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                <span>Modules used:</span>
                {['morning-brief'].map(m => (
                  <Badge key={m} variant='outline' className='text-xs'>{m}</Badge>
                ))}
              </div>
              <CodeBlock code={useCaseAIAgentCode} language='typescript' />
            </CardContent>
          </Card>

          {/* Best practices */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <CheckCircle2 className='h-4 w-4 text-green-500' />
                Best Practices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-3 text-sm'>
                {[
                  {
                    title: 'Always fetch server-side',
                    desc: 'Never call B2A endpoints from browser code. API keys must stay on the server. Use Next.js Server Components, Route Handlers, or server actions.',
                  },
                  {
                    title: 'Use morning-brief as your entry point',
                    desc: 'One call to /morning-brief costs 1 of your 60 req/min budget and returns aggregated data across all modules. Use it for dashboards before drilling into specifics.',
                  },
                  {
                    title: 'Cache where data is stable',
                    desc: 'Organization structure (institutions, departments, courses) changes rarely. Cache with a 5-minute TTL. Attendance and admission data should never be cached.',
                  },
                  {
                    title: 'Respect the Retry-After header',
                    desc: 'When you receive a 429, read the Retry-After header value (in seconds) and wait exactly that long. Exponential backoff without the header will waste request budget.',
                  },
                  {
                    title: 'Handle NOT_FOUND gracefully in multi-tenant setups',
                    desc: 'A 404 on /admission/:id means either the record doesn\'t exist OR it belongs to a different institution. The API intentionally conflates these for security.',
                  },
                  {
                    title: 'Scope keys to the minimum required module',
                    desc: 'Request separate API keys for each integration. A morning-brief key should not have admission write access. Principle of least privilege applies.',
                  },
                ].map((item, i) => (
                  <div key={i} className='flex gap-3'>
                    <CheckCircle2 className='h-4 w-4 text-green-500 mt-0.5 shrink-0' />
                    <div>
                      <p className='font-medium'>{item.title}</p>
                      <p className='text-muted-foreground text-xs mt-0.5'>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      {/* Interactive endpoint tester — opened by "Try It" buttons throughout */}
      <B2AEndpointTesterDialog
        endpointId={testEndpointId}
        onClose={() => setTestEndpointId(null)}
      />
    </div>
  );
}
