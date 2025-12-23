/**
 * AI Query Tools Configuration
 * Complete registry of all AI query tools organized by module
 *
 * JKKN Terminology Applied:
 * - students → learners
 * - staff → learning facilitators (academic) / team members (non-academic)
 * - attendance → learning participation
 * - grades → learning assessments
 */

export type ToolCategory =
  | 'academic'
  | 'billing'
  | 'learners'
  | 'facilitators'
  | 'organization'
  | 'dashboard'
  | 'notifications'
  | 'actions';

export type ActionTier = 1 | 2 | 3 | 4;

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface AIQueryToolConfig {
  name: string;
  description: string;
  category: ToolCategory;
  permission: string;
  tier: ActionTier;
  parameters: ToolParameter[];
  rpcFunction: string;
  examples?: string[];
}

export interface ToolCategoryInfo {
  key: ToolCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}

// Category metadata with JKKN terminology
export const TOOL_CATEGORIES: ToolCategoryInfo[] = [
  {
    key: 'academic',
    label: 'Academic',
    description: 'Learning participation, timetables, and academic management',
    icon: 'GraduationCap',
    color: 'bg-blue-500',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Fees, bills, and financial records',
    icon: 'CreditCard',
    color: 'bg-green-500',
  },
  {
    key: 'learners',
    label: 'Learners',
    description: 'Learner records, search, and analytics',
    icon: 'Users',
    color: 'bg-purple-500',
  },
  {
    key: 'facilitators',
    label: 'Learning Facilitators',
    description: 'Learning facilitator management and records',
    icon: 'UserCog',
    color: 'bg-orange-500',
  },
  {
    key: 'organization',
    label: 'Organization',
    description: 'Institutions, departments, and hierarchy',
    icon: 'Building2',
    color: 'bg-indigo-500',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'KPIs, analytics, and summaries',
    icon: 'LayoutDashboard',
    color: 'bg-cyan-500',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'User notifications and alerts',
    icon: 'Bell',
    color: 'bg-yellow-500',
  },
  {
    key: 'actions',
    label: 'Actions',
    description: 'Export, send notifications, and other actions',
    icon: 'Zap',
    color: 'bg-red-500',
  },
];

// Complete tools registry with JKKN terminology
export const AI_QUERY_TOOLS_REGISTRY: AIQueryToolConfig[] = [
  // Academic Tools
  {
    name: 'get_attendance',
    description: 'Get learner learning participation records with optional filters by learner, section, department, or date range',
    category: 'academic',
    permission: 'academic.attendance.view',
    tier: 1,
    rpcFunction: 'ai_rpc_attendance',
    parameters: [
      { name: 'student_id', type: 'string', description: 'Filter by specific learner UUID' },
      { name: 'section_id', type: 'string', description: 'Filter by section UUID' },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'date_from', type: 'string', description: 'Start date (YYYY-MM-DD)' },
      { name: 'date_to', type: 'string', description: 'End date (YYYY-MM-DD)' },
      { name: 'threshold', type: 'number', description: 'Learning participation percentage threshold' },
    ],
    examples: [
      'Show learning participation for CSE department',
      'List learners with participation below 75%',
      'Get learning participation from January to March 2025',
    ],
  },
  {
    name: 'get_attendance_defaulters',
    description: 'Get list of learners with learning participation below a threshold (default 75%)',
    category: 'academic',
    permission: 'academic.attendance.view',
    tier: 1,
    rpcFunction: 'ai_rpc_attendance_defaulters',
    parameters: [
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'threshold', type: 'number', description: 'Learning participation percentage threshold (default 75)' },
      { name: 'semester', type: 'string', description: 'Learning period filter', enum: ['current', 'previous', 'all'] },
    ],
    examples: [
      'Show learners with participation below 75%',
      'List participation defaulters in Mechanical department',
    ],
  },

  // Billing Tools
  {
    name: 'get_student_bills',
    description: 'Get learner billing records with optional filters',
    category: 'billing',
    permission: 'billing.bills.view',
    tier: 1,
    rpcFunction: 'ai_rpc_student_bills',
    parameters: [
      { name: 'student_id', type: 'string', description: 'Filter by specific learner UUID' },
      { name: 'section_id', type: 'string', description: 'Filter by section UUID' },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'status', type: 'string', description: 'Bill status', enum: ['paid', 'unpaid', 'overdue', 'partially_paid'] },
    ],
    examples: [
      'Show unpaid bills for all learners',
      'Get billing records for learner John Doe',
    ],
  },
  {
    name: 'get_fee_defaulters',
    description: 'Get list of learners with unpaid or overdue fees',
    category: 'billing',
    permission: 'billing.bills.view',
    tier: 1,
    rpcFunction: 'ai_rpc_fee_defaulters',
    parameters: [
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'status', type: 'string', description: 'Fee status', enum: ['unpaid', 'overdue', 'partially_paid'] },
      { name: 'min_amount', type: 'number', description: 'Minimum pending amount filter' },
      { name: 'due_before', type: 'string', description: 'Filter fees due before this date (YYYY-MM-DD)' },
    ],
    examples: [
      'List all fee defaulters',
      'Show learners with overdue fees above ₹10000',
    ],
  },

  // Learner Tools (JKKN: students → learners)
  {
    name: 'get_students',
    description: 'Get list of learners with optional filters by department, program, section, status, or search term',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_students',
    parameters: [
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'program_id', type: 'string', description: 'Filter by program UUID' },
      { name: 'semester_id', type: 'string', description: 'Filter by learning period UUID' },
      { name: 'section_id', type: 'string', description: 'Filter by section UUID' },
      { name: 'status', type: 'string', description: 'Learner status', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
      { name: 'search', type: 'string', description: 'Search by name, roll number, or email' },
    ],
    examples: [
      'Show all active learners',
      'List learners in CSE department',
      'Get learners from Section A',
    ],
  },
  {
    name: 'get_student_details',
    description: 'Get detailed information about a specific learner including personal, academic, and contact details',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_student_details',
    parameters: [
      { name: 'student_id', type: 'string', description: 'Learner UUID', required: true },
    ],
    examples: [
      'Show details for learner with roll number 12345',
      'Get complete profile of John Doe',
    ],
  },
  {
    name: 'search_students',
    description: 'Advanced learner search - find learners by name, roll number, email, mobile, learning partner name, or other fields',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_student_search',
    parameters: [
      { name: 'search_query', type: 'string', description: 'The search term to look for', required: true },
      { name: 'search_fields', type: 'array', description: 'Fields to search in: name, roll_number, email, mobile, application_id, aadhar, father_name, mother_name' },
      { name: 'status', type: 'string', description: 'Filter by learner status', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'exact_match', type: 'boolean', description: 'If true, performs exact match instead of partial match' },
    ],
    examples: [
      'Find learner named BOOBALAN',
      'Search for learner with email john@example.com',
      'Look up learner by roll number 792604008',
    ],
  },
  {
    name: 'get_students_by_department',
    description: 'Get learner counts grouped by department with status breakdown',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_students_by_department',
    parameters: [
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
      { name: 'status', type: 'string', description: 'Filter by learner status', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
    ],
    examples: [
      'Show learner count by department',
      'Get department-wise distribution of active learners',
    ],
  },
  {
    name: 'get_students_summary',
    description: 'Get summary statistics for learners including total counts, status breakdown, gender distribution, accommodation types',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_students_summary',
    parameters: [
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
    ],
    examples: [
      'Show learner statistics',
      'Get gender-wise learner distribution',
      'How many hostel learners are there?',
    ],
  },
  {
    name: 'get_learners_by_location',
    description: 'Comprehensive location-based learner search - searches across permanent address district, bus pickup location, street address, and taluk fields. Returns learners from specific areas with location statistics, distribution data, and indicates which field matched.',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_learners_by_location',
    parameters: [
      { name: 'district', type: 'string', description: 'Filter by district name (e.g., Erode, Salem, Coimbatore) - searches in district, bus pickup location, street, and taluk fields' },
      { name: 'state', type: 'string', description: 'Filter by state name (e.g., Tamil Nadu, Kerala)' },
      { name: 'taluk', type: 'string', description: 'Filter by taluk/sub-district name - also searches bus pickup location' },
      { name: 'city', type: 'string', description: 'Filter by city name - searches in district, bus pickup location, and street fields' },
      { name: 'status', type: 'string', description: 'Learner status filter', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'include_stats', type: 'boolean', description: 'Include location statistics with bus pickup locations (default: true)' },
    ],
    examples: [
      'How many learners are from Erode district?',
      'Show learners from Tamil Nadu',
      'List learners from Salem district',
      'Get district-wise learner distribution',
      'Which districts do our learners come from?',
      'Show learners who take bus from Erode',
      'List all bus pickup locations',
    ],
  },
  {
    name: 'get_learners_comprehensive',
    description: 'MOST POWERFUL learner search - searches ALL learner data across ALL institutions. Supports filtering by demographics (gender, religion, community, caste), accommodation (hostel, day scholar, bus), academic hierarchy, admission details (quota, category, first graduate), location, and education background. Returns comprehensive statistics breakdown.',
    category: 'learners',
    permission: 'learners.view',
    tier: 1,
    rpcFunction: 'ai_rpc_learners_comprehensive',
    parameters: [
      { name: 'search', type: 'string', description: 'Free text search across name, roll number, email, mobile, parent names, bus location, district, school' },
      { name: 'status', type: 'string', description: 'Learner status', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
      { name: 'gender', type: 'string', description: 'Filter by gender (male/female, case-insensitive)' },
      { name: 'religion', type: 'string', description: 'Filter by religion (Hindu, Muslim, Christian, etc.)' },
      { name: 'community', type: 'string', description: 'Filter by community (BC, MBC, SC, ST, OC, OBC, BCM, SCA, DNC, etc.)' },
      { name: 'caste', type: 'string', description: 'Filter by caste' },
      { name: 'accommodation_type', type: 'string', description: 'Accommodation type (hostel, dayscholar)' },
      { name: 'hostel_type', type: 'string', description: 'Hostel type (AC HOSTEL, etc.)' },
      { name: 'bus_required', type: 'boolean', description: 'Filter learners requiring bus transport' },
      { name: 'bus_route', type: 'string', description: 'Filter by bus route' },
      { name: 'bus_pickup_location', type: 'string', description: 'Filter by bus pickup location' },
      { name: 'food_type', type: 'string', description: 'Food preference (veg/non-veg)' },
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'program_id', type: 'string', description: 'Filter by program UUID' },
      { name: 'degree_id', type: 'string', description: 'Filter by degree UUID' },
      { name: 'semester_id', type: 'string', description: 'Filter by semester UUID' },
      { name: 'section_id', type: 'string', description: 'Filter by section UUID' },
      { name: 'entry_type', type: 'string', description: 'Entry type (FIRST YEAR, LATERAL)' },
      { name: 'quota', type: 'string', description: 'Admission quota (GOVERNMENT, MANAGEMENT)' },
      { name: 'category', type: 'string', description: 'Admission category' },
      { name: 'first_graduate', type: 'boolean', description: 'First-generation graduate (first in family to attend college)' },
      { name: 'counseling_applied', type: 'boolean', description: 'Applied through counseling' },
      { name: 'district', type: 'string', description: 'Filter by district (comprehensive search)' },
      { name: 'state', type: 'string', description: 'Filter by state' },
      { name: 'taluk', type: 'string', description: 'Filter by taluk/sub-district' },
      { name: 'board_of_study', type: 'string', description: 'Board of study (STATE BOARD, CBSE, ICSE)' },
      { name: 'last_school', type: 'string', description: 'Previous school name' },
      { name: 'include_stats', type: 'boolean', description: 'Include statistics breakdown (default: true)' },
    ],
    examples: [
      'How many female learners do we have?',
      'Show MBC community learners',
      'List learners who need bus transport',
      'Get hostel learners count',
      'Show learners from SC community',
      'How many first-generation graduates?',
      'List learners from government quota',
      'Show gender-wise distribution',
      'Get community-wise breakdown',
      'How many learners in each institution?',
      'Show BC community learners who require bus',
      'List day scholar female learners',
    ],
  },

  // Learning Facilitator Tools (JKKN: staff → learning facilitators/team members)
  {
    name: 'get_staff',
    description: 'Get list of learning facilitators and team members with optional filters',
    category: 'facilitators',
    permission: 'staff.view',
    tier: 1,
    rpcFunction: 'ai_rpc_staff',
    parameters: [
      { name: 'department_id', type: 'string', description: 'Filter by department UUID' },
      { name: 'employment_category_id', type: 'string', description: 'Filter by employment category UUID' },
      { name: 'status', type: 'string', description: 'Team member status', enum: ['active', 'inactive'] },
      { name: 'search', type: 'string', description: 'Search by name, employee ID, or email' },
    ],
    examples: [
      'List all learning facilitators',
      'Show team members in CSE department',
    ],
  },

  // Organization Tools
  {
    name: 'get_hierarchy_summary',
    description: 'Get a summary of the organizational hierarchy (institutions, departments, programs, etc.)',
    category: 'organization',
    permission: 'organizations.view',
    tier: 1,
    rpcFunction: 'ai_rpc_hierarchy_summary',
    parameters: [
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
    ],
    examples: [
      'Show organizational structure',
      'How many departments do we have?',
    ],
  },
  {
    name: 'get_departments',
    description: 'Get list of departments',
    category: 'organization',
    permission: 'organizations.departments.view',
    tier: 1,
    rpcFunction: 'ai_rpc_departments',
    parameters: [
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
    ],
    examples: [
      'List all departments',
      'Show departments in Engineering college',
    ],
  },

  // Dashboard Tools
  {
    name: 'get_kpi_summary',
    description: 'Get key performance indicators summary (total learners, team members, pending fees, learning participation today, etc.)',
    category: 'dashboard',
    permission: 'analytics.view',
    tier: 1,
    rpcFunction: 'ai_rpc_kpi_summary',
    parameters: [
      { name: 'institution_id', type: 'string', description: 'Filter by institution UUID' },
    ],
    examples: [
      'Show today\'s KPIs',
      'What is the current learning participation rate?',
    ],
  },
  {
    name: 'get_analytics_overview',
    description: 'Get analytics overview including learning participation trends, fee collection, and learner status breakdown',
    category: 'dashboard',
    permission: 'analytics.view',
    tier: 1,
    rpcFunction: 'ai_rpc_analytics_overview',
    parameters: [
      { name: 'date_from', type: 'string', description: 'Start date (YYYY-MM-DD)' },
      { name: 'date_to', type: 'string', description: 'End date (YYYY-MM-DD)' },
    ],
    examples: [
      'Show analytics for this month',
      'Get fee collection trends',
    ],
  },

  // Notification Tools
  {
    name: 'get_notifications',
    description: 'Get user notifications with optional filters',
    category: 'notifications',
    permission: 'notifications.view',
    tier: 1,
    rpcFunction: 'ai_rpc_notifications',
    parameters: [
      { name: 'is_read', type: 'boolean', description: 'Filter by read status' },
      { name: 'type', type: 'string', description: 'Filter by notification type' },
    ],
    examples: [
      'Show unread notifications',
      'List all notifications from today',
    ],
  },

  // Action Tools
  {
    name: 'export_csv',
    description: 'Export data to CSV format. Available sources: learners, team_members, participation_defaulters, fee_defaulters',
    category: 'actions',
    permission: 'DYNAMIC',
    tier: 1,
    rpcFunction: 'ai_rpc_export_data',
    parameters: [
      { name: 'data_source', type: 'string', description: 'The data source to export', required: true, enum: ['students', 'staff', 'attendance_defaulters', 'fee_defaulters'] },
      { name: 'filters', type: 'object', description: 'Optional filters for the export' },
    ],
    examples: [
      'Export learner list to CSV',
      'Download fee defaulters as CSV',
    ],
  },
  {
    name: 'send_notification',
    description: 'Send a notification to specified recipients (max 50 recipients)',
    category: 'actions',
    permission: 'notifications.send',
    tier: 2,
    rpcFunction: 'ai_rpc_send_notification',
    parameters: [
      { name: 'recipient_ids', type: 'array', description: 'Array of recipient user UUIDs', required: true },
      { name: 'title', type: 'string', description: 'Notification title', required: true },
      { name: 'message', type: 'string', description: 'Notification message', required: true },
      { name: 'type', type: 'string', description: 'Notification type', enum: ['info', 'warning', 'success', 'error'] },
      { name: 'priority', type: 'string', description: 'Notification priority', enum: ['low', 'normal', 'high'] },
    ],
    examples: [
      'Send reminder to all fee defaulters',
      'Notify learners about upcoming learning assessment',
    ],
  },
];

// Helper functions
export function getToolsByCategory(category: ToolCategory): AIQueryToolConfig[] {
  return AI_QUERY_TOOLS_REGISTRY.filter((tool) => tool.category === category);
}

export function getToolByName(name: string): AIQueryToolConfig | undefined {
  return AI_QUERY_TOOLS_REGISTRY.find((tool) => tool.name === name);
}

export function getCategoryInfo(category: ToolCategory): ToolCategoryInfo | undefined {
  return TOOL_CATEGORIES.find((cat) => cat.key === category);
}

export function getToolsCount(): { total: number; byCategory: Record<ToolCategory, number> } {
  const byCategory = AI_QUERY_TOOLS_REGISTRY.reduce((acc, tool) => {
    acc[tool.category] = (acc[tool.category] || 0) + 1;
    return acc;
  }, {} as Record<ToolCategory, number>);

  return {
    total: AI_QUERY_TOOLS_REGISTRY.length,
    byCategory,
  };
}

export function getTierLabel(tier: ActionTier): string {
  const labels: Record<ActionTier, string> = {
    1: 'Read-Only',
    2: 'Requires Confirmation',
    3: 'Bulk Action',
    4: 'Blocked',
  };
  return labels[tier];
}

export function getTierColor(tier: ActionTier): string {
  const colors: Record<ActionTier, string> = {
    1: 'bg-green-100 text-green-800',
    2: 'bg-yellow-100 text-yellow-800',
    3: 'bg-orange-100 text-orange-800',
    4: 'bg-red-100 text-red-800',
  };
  return colors[tier];
}
