// Canonical definition of every B2A API endpoint.
// Used by both the documentation and the interactive endpoint tester.

export type ParamType = 'text' | 'date' | 'number' | 'select';

export interface ParamDef {
  name: string;
  label: string;
  type: ParamType;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface B2AEndpointDef {
  id: string;
  method: 'GET';
  /** Route path — use `:id` for path parameters. e.g. `/api/b2a/admission/:id` */
  path: string;
  description: string;
  module: string;
  /** True when the path contains a `:id` segment that must be filled before sending */
  hasPathId?: boolean;
  params?: ParamDef[];
}

export const B2A_ENDPOINTS: B2AEndpointDef[] = [
  // ── Morning Brief ─────────────────────────────────────────────────────────
  {
    id: 'morning-brief',
    method: 'GET',
    path: '/api/b2a/morning-brief',
    description: 'Daily institution snapshot',
    module: 'morning-brief',
  },

  // ── Admission ─────────────────────────────────────────────────────────────
  {
    id: 'admission-list',
    method: 'GET',
    path: '/api/b2a/admission',
    description: 'List admissions',
    module: 'admission',
    params: [
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['pending', 'approved', 'enrolled', 'rejected'],
      },
      {
        name: 'entry_type',
        label: 'Entry Type',
        type: 'text',
        placeholder: 'e.g. regular',
      },
      { name: 'from', label: 'From', type: 'date' },
      { name: 'to', label: 'To', type: 'date' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        defaultValue: '20',
        placeholder: 'max 100',
      },
    ],
  },
  {
    id: 'admission-stats',
    method: 'GET',
    path: '/api/b2a/admission/stats',
    description: 'Admission aggregate statistics',
    module: 'admission',
  },
  {
    id: 'admission-single',
    method: 'GET',
    path: '/api/b2a/admission/:id',
    description: 'Single admission by UUID',
    module: 'admission',
    hasPathId: true,
  },

  // ── Attendance ────────────────────────────────────────────────────────────
  {
    id: 'attendance-list',
    method: 'GET',
    path: '/api/b2a/attendance',
    description: 'Daily attendance records',
    module: 'attendance',
    params: [
      { name: 'from', label: 'From', type: 'date' },
      { name: 'to', label: 'To', type: 'date' },
      { name: 'student_id', label: 'Student ID', type: 'text', placeholder: 'UUID' },
      { name: 'department_id', label: 'Department ID', type: 'text', placeholder: 'UUID' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'attendance-trend',
    method: 'GET',
    path: '/api/b2a/attendance/trend',
    description: 'Attendance trend (max 90-day range)',
    module: 'attendance',
    params: [
      {
        name: 'from',
        label: 'From',
        type: 'date',
        required: true,
        description: 'Required — YYYY-MM-DD',
      },
      {
        name: 'to',
        label: 'To',
        type: 'date',
        required: true,
        description: 'Required — YYYY-MM-DD',
      },
    ],
  },
  {
    id: 'attendance-pending',
    method: 'GET',
    path: '/api/b2a/attendance/pending',
    description: 'Students below attendance threshold',
    module: 'attendance',
    params: [
      {
        name: 'threshold',
        label: 'Threshold %',
        type: 'number',
        defaultValue: '75',
        description: 'Default 75 — students below this percentage are returned',
      },
    ],
  },

  // ── Billing ───────────────────────────────────────────────────────────────
  {
    id: 'billing-list',
    method: 'GET',
    path: '/api/b2a/billing',
    description: 'List billing records',
    module: 'billing',
    params: [
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['unpaid', 'partial', 'paid', 'overdue'],
      },
      { name: 'due_before', label: 'Due Before', type: 'date' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'billing-summary',
    method: 'GET',
    path: '/api/b2a/billing/summary',
    description: 'Institution-level billing summary',
    module: 'billing',
  },
  {
    id: 'billing-outstanding',
    method: 'GET',
    path: '/api/b2a/billing/outstanding',
    description: 'Outstanding fee collections',
    module: 'billing',
    params: [
      {
        name: 'days_overdue',
        label: 'Days Overdue',
        type: 'number',
        placeholder: 'e.g. 30',
        description: 'Only return records overdue by at least N days',
      },
    ],
  },

  // ── Grievance ─────────────────────────────────────────────────────────────
  {
    id: 'grievance-list',
    method: 'GET',
    path: '/api/b2a/grievance',
    description: 'List grievances / service requests',
    module: 'grievance',
    params: [
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['open', 'in_progress', 'resolved', 'closed'],
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        options: ['low', 'medium', 'high', 'critical'],
      },
      { name: 'from', label: 'From', type: 'date' },
      { name: 'to', label: 'To', type: 'date' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'grievance-dashboard',
    method: 'GET',
    path: '/api/b2a/grievance/dashboard',
    description: 'Grievance dashboard summary',
    module: 'grievance',
  },
  {
    id: 'grievance-single',
    method: 'GET',
    path: '/api/b2a/grievance/:id',
    description: 'Single grievance by UUID',
    module: 'grievance',
    hasPathId: true,
  },

  // ── OKR ───────────────────────────────────────────────────────────────────
  {
    id: 'okr-objectives',
    method: 'GET',
    path: '/api/b2a/okr/objectives',
    description: 'List OKR objectives',
    module: 'okr',
    params: [
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['draft', 'active', 'completed', 'cancelled'],
      },
      { name: 'type', label: 'Type', type: 'text', placeholder: 'e.g. institutional' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'okr-compliance',
    method: 'GET',
    path: '/api/b2a/okr/compliance',
    description: 'OKR compliance metrics',
    module: 'okr',
  },
  {
    id: 'okr-stats',
    method: 'GET',
    path: '/api/b2a/okr/stats',
    description: 'OKR aggregate statistics',
    module: 'okr',
  },

  // ── Learners ──────────────────────────────────────────────────────────────
  {
    id: 'learners-list',
    method: 'GET',
    path: '/api/b2a/learners',
    description: 'List learner profiles',
    module: 'learners',
    params: [
      {
        name: 'lifecycle_status',
        label: 'Status',
        type: 'select',
        options: [
          'enquiry',
          'pending',
          'approved',
          'rejected',
          'waitlisted',
          'active',
          'inactive',
          'exited',
          'graduated',
          'alumni',
        ],
      },
      { name: 'department_id', label: 'Department ID', type: 'text', placeholder: 'UUID' },
      { name: 'semester_id', label: 'Semester ID', type: 'text', placeholder: 'UUID' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'learners-single',
    method: 'GET',
    path: '/api/b2a/learners/:id',
    description: 'Single learner by UUID',
    module: 'learners',
    hasPathId: true,
  },

  // ── Staff ─────────────────────────────────────────────────────────────────
  {
    id: 'staff-list',
    method: 'GET',
    path: '/api/b2a/staff',
    description: 'List staff members',
    module: 'staff',
    params: [
      {
        name: 'role_type',
        label: 'Role Type',
        type: 'select',
        options: ['faculty', 'admin', 'support', 'management'],
      },
      { name: 'department_id', label: 'Department ID', type: 'text', placeholder: 'UUID' },
      { name: 'page', label: 'Page', type: 'number', defaultValue: '1' },
      { name: 'limit', label: 'Limit', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'staff-single',
    method: 'GET',
    path: '/api/b2a/staff/:id',
    description: 'Single staff member by UUID',
    module: 'staff',
    hasPathId: true,
  },

  // ── Organizations ─────────────────────────────────────────────────────────
  {
    id: 'orgs-institutions',
    method: 'GET',
    path: '/api/b2a/organizations/institutions',
    description: 'List institutions',
    module: 'organizations',
    params: [
      {
        name: 'is_active',
        label: 'Active Only',
        type: 'select',
        options: ['true', 'false'],
      },
    ],
  },
  {
    id: 'orgs-departments',
    method: 'GET',
    path: '/api/b2a/organizations/departments',
    description: 'List departments',
    module: 'organizations',
    params: [
      {
        name: 'is_active',
        label: 'Active Only',
        type: 'select',
        options: ['true', 'false'],
      },
      { name: 'degree_id', label: 'Degree ID', type: 'text', placeholder: 'UUID' },
    ],
  },
  {
    id: 'orgs-courses',
    method: 'GET',
    path: '/api/b2a/organizations/courses',
    description: 'List courses',
    module: 'organizations',
    params: [
      {
        name: 'is_active',
        label: 'Active Only',
        type: 'select',
        options: ['true', 'false'],
      },
    ],
  },
];

/** Fast O(1) lookup by endpoint ID */
export const B2A_ENDPOINT_MAP: Record<string, B2AEndpointDef> = Object.fromEntries(
  B2A_ENDPOINTS.map(e => [e.id, e])
);
