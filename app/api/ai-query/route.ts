/**
 * AI Query API Route
 * Handles natural language queries using Claude with MCP tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIQueryService } from '@/lib/services/ai-query-service';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AIQueryRequest,
  AIUserContext,
  ToolResponse,
  TOOL_PERMISSIONS,
  AI_ERROR_MESSAGES
} from '@/types/ai-query';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY!,
});

// Tool definitions for Claude (JKKN Terminology: students→learners, staff→facilitators, attendance→learning participation)
const AI_TOOLS: Anthropic.Tool[] = [
  // Academic Tools
  {
    name: 'get_attendance',
    description: 'Get learner learning participation records with optional filters by learner, section, department, or date range',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_id: { type: 'string', description: 'Filter by specific learner UUID' },
        section_id: { type: 'string', description: 'Filter by section UUID' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
        date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        threshold: { type: 'number', description: 'Learning participation percentage threshold' },
      },
    },
  },
  {
    name: 'get_attendance_defaulters',
    description: 'Get list of learners with learning participation below a threshold (default 75%)',
    input_schema: {
      type: 'object' as const,
      properties: {
        department_id: { type: 'string', description: 'Filter by department UUID' },
        threshold: { type: 'number', description: 'Learning participation percentage threshold (default 75)' },
        semester: { type: 'string', enum: ['current', 'previous', 'all'], description: 'Learning period filter' },
      },
    },
  },
  // Billing Tools
  {
    name: 'get_student_bills',
    description: 'Get learner billing records with optional filters',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_id: { type: 'string', description: 'Filter by specific learner UUID' },
        section_id: { type: 'string', description: 'Filter by section UUID' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
        status: { type: 'string', enum: ['paid', 'unpaid', 'overdue', 'partially_paid'] },
      },
    },
  },
  {
    name: 'get_fee_defaulters',
    description: 'Get list of learners with unpaid or overdue fees',
    input_schema: {
      type: 'object' as const,
      properties: {
        department_id: { type: 'string', description: 'Filter by department UUID' },
        status: { type: 'string', enum: ['unpaid', 'overdue', 'partially_paid'] },
        min_amount: { type: 'number', description: 'Minimum pending amount filter' },
        due_before: { type: 'string', description: 'Filter fees due before this date (YYYY-MM-DD)' },
      },
    },
  },
  // Learner Tools (JKKN: students → learners)
  {
    name: 'get_students',
    description: 'Get list of learners with optional filters by department, program, section, status, or search term',
    input_schema: {
      type: 'object' as const,
      properties: {
        department_id: { type: 'string', description: 'Filter by department UUID' },
        program_id: { type: 'string', description: 'Filter by program UUID' },
        semester_id: { type: 'string', description: 'Filter by learning period UUID' },
        section_id: { type: 'string', description: 'Filter by section UUID' },
        status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'] },
        search: { type: 'string', description: 'Search by name, roll number, or email' },
      },
    },
  },
  {
    name: 'get_student_details',
    description: 'Get detailed information about a specific learner including personal, academic, and contact details',
    input_schema: {
      type: 'object' as const,
      properties: {
        student_id: { type: 'string', description: 'Learner UUID' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'search_students',
    description: 'Advanced learner search - find learners by name, roll number, email, mobile, learning partner name, or other fields. Use this when looking for specific learners.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search_query: { type: 'string', description: 'The search term to look for (e.g., learner name, roll number, email)' },
        search_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to search in: name, roll_number, email, mobile, application_id, aadhar, father_name, mother_name. Defaults to [name, roll_number, email, mobile]'
        },
        status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'], description: 'Filter by learner status' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
        exact_match: { type: 'boolean', description: 'If true, performs exact match instead of partial match. Defaults to false' },
      },
      required: ['search_query'],
    },
  },
  {
    name: 'get_students_by_department',
    description: 'Get learner counts grouped by department with status breakdown (active, inactive, graduated, exited)',
    input_schema: {
      type: 'object' as const,
      properties: {
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
        status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'], description: 'Filter by learner status' },
      },
    },
  },
  {
    name: 'get_students_summary',
    description: 'Get summary statistics for learners including total counts, status breakdown, gender distribution, accommodation types, and profile completion status',
    input_schema: {
      type: 'object' as const,
      properties: {
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
      },
    },
  },
  {
    name: 'get_learners_by_location',
    description: 'Comprehensive location-based learner search - searches across permanent address district, bus pickup location, street address, and taluk fields. Returns learners from specific geographic areas with location statistics and indicates which field matched. Use this when asked about learners from a specific district, city, state, bus pickup point, or region.',
    input_schema: {
      type: 'object' as const,
      properties: {
        district: { type: 'string', description: 'Filter by district name (e.g., Erode, Salem, Coimbatore) - searches in district, bus pickup location, street, and taluk fields' },
        state: { type: 'string', description: 'Filter by state name (e.g., Tamil Nadu, Kerala)' },
        taluk: { type: 'string', description: 'Filter by taluk/sub-district name - also searches bus pickup location' },
        city: { type: 'string', description: 'Filter by city name - searches in district, bus pickup location, and street fields' },
        status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'], description: 'Filter by learner status' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
        include_stats: { type: 'boolean', description: 'Include location statistics with bus pickup locations (district/state distribution). Default: true' },
      },
    },
  },
  {
    name: 'get_learners_comprehensive',
    description: 'MOST POWERFUL learner search tool - searches ALL learner data across ALL institutions. Use this for: demographics (gender, religion, community, caste), accommodation (hostel, day scholar, bus), academic filters, admission details (quota, category, first graduate), location, and education background. Returns statistics breakdown. Always use this tool when user asks about specific learner characteristics or wants comprehensive data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        // Text search
        search: { type: 'string', description: 'Free text search across name, roll number, email, mobile, father/mother name, bus pickup location, district, school' },
        // Identity filters
        status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'exited', 'pending'], description: 'Learner status' },
        gender: { type: 'string', enum: ['male', 'female'], description: 'Filter by gender (case-insensitive)' },
        // Demographic filters
        religion: { type: 'string', description: 'Filter by religion (e.g., Hindu, Muslim, Christian)' },
        community: { type: 'string', description: 'Filter by community (e.g., BC, MBC, SC, ST, OC, OBC, BCM, SCA, DNC)' },
        caste: { type: 'string', description: 'Filter by caste' },
        // Accommodation filters
        accommodation_type: { type: 'string', description: 'Filter by accommodation type (hostel, dayscholar, day scholar)' },
        hostel_type: { type: 'string', description: 'Filter by hostel type (e.g., AC HOSTEL)' },
        bus_required: { type: 'boolean', description: 'Filter learners who require bus transport' },
        bus_route: { type: 'string', description: 'Filter by bus route' },
        bus_pickup_location: { type: 'string', description: 'Filter by bus pickup location' },
        food_type: { type: 'string', description: 'Filter by food preference (veg/non-veg)' },
        // Academic filters
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
        department_id: { type: 'string', description: 'Filter by department UUID' },
        program_id: { type: 'string', description: 'Filter by program UUID' },
        degree_id: { type: 'string', description: 'Filter by degree UUID' },
        semester_id: { type: 'string', description: 'Filter by semester UUID' },
        section_id: { type: 'string', description: 'Filter by section UUID' },
        // Admission filters
        entry_type: { type: 'string', description: 'Filter by entry type (e.g., FIRST YEAR, LATERAL)' },
        quota: { type: 'string', description: 'Filter by admission quota (e.g., GOVERNMENT, MANAGEMENT)' },
        category: { type: 'string', description: 'Filter by admission category' },
        first_graduate: { type: 'boolean', description: 'Filter first-generation graduates (first in family to attend college)' },
        counseling_applied: { type: 'boolean', description: 'Filter learners who applied through counseling' },
        // Location filters
        district: { type: 'string', description: 'Filter by district (searches district, bus pickup, street, taluk)' },
        state: { type: 'string', description: 'Filter by state' },
        taluk: { type: 'string', description: 'Filter by taluk/sub-district' },
        // Education background
        board_of_study: { type: 'string', description: 'Filter by board of study (e.g., STATE BOARD, CBSE, ICSE)' },
        last_school: { type: 'string', description: 'Filter by previous school name' },
        // Options
        include_stats: { type: 'boolean', description: 'Include statistics breakdown (gender, community, accommodation, institution). Default: true' },
      },
    },
  },
  // Learning Facilitator Tools (JKKN: staff → learning facilitators/team members)
  {
    name: 'get_staff',
    description: 'Get list of learning facilitators and team members with optional filters',
    input_schema: {
      type: 'object' as const,
      properties: {
        department_id: { type: 'string', description: 'Filter by department UUID' },
        employment_category_id: { type: 'string', description: 'Filter by employment category UUID' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        search: { type: 'string', description: 'Search by name, employee ID, or email' },
      },
    },
  },
  // Organization Tools
  {
    name: 'get_hierarchy_summary',
    description: 'Get a summary of the organizational hierarchy (institutions, departments, programs, etc.)',
    input_schema: {
      type: 'object' as const,
      properties: {
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
      },
    },
  },
  {
    name: 'get_departments',
    description: 'Get list of departments',
    input_schema: {
      type: 'object' as const,
      properties: {
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
      },
    },
  },
  // Dashboard Tools
  {
    name: 'get_kpi_summary',
    description: 'Get key performance indicators summary (total learners, team members, pending fees, learning participation today, etc.)',
    input_schema: {
      type: 'object' as const,
      properties: {
        institution_id: { type: 'string', description: 'Filter by institution UUID' },
      },
    },
  },
  {
    name: 'get_analytics_overview',
    description: 'Get analytics overview including learning participation trends, fee collection, and learner status breakdown',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
    },
  },
  // Notification Tools
  {
    name: 'get_notifications',
    description: 'Get user notifications with optional filters',
    input_schema: {
      type: 'object' as const,
      properties: {
        is_read: { type: 'boolean', description: 'Filter by read status' },
        type: { type: 'string', description: 'Filter by notification type' },
      },
    },
  },
  // Action Tools
  {
    name: 'export_csv',
    description: 'Export data to CSV format. Available sources: learners, team_members, participation_defaulters, fee_defaulters',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_source: {
          type: 'string',
          enum: ['students', 'staff', 'attendance_defaulters', 'fee_defaulters'],
          description: 'The data source to export (learners, team_members, participation_defaulters, fee_defaulters)'
        },
        filters: { type: 'object', description: 'Optional filters for the export' },
      },
      required: ['data_source'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send a notification to specified recipients (max 50 recipients)',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipient_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of recipient user UUIDs'
        },
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message' },
        type: { type: 'string', enum: ['info', 'warning', 'success', 'error'], description: 'Notification type' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Notification priority' },
      },
      required: ['recipient_ids', 'title', 'message'],
    },
  },
];

// Build system prompt with user context (JKKN Terminology enforced)
function buildSystemPrompt(context: AIUserContext): string {
  return `You are an AI assistant for MyJKKN, an educational institution management system following JKKN terminology standards. You help users query and analyze data about learners, learning facilitators, learning participation, billing, and more.

## JKKN Terminology Standards (MANDATORY)
You MUST use these terms in ALL responses:
- **Learners** (NOT students, pupils, kids, children)
- **Learning Facilitators** (NOT teachers, faculty, professors) - for academic/teaching roles
- **Team Members** (NOT staff, employees, workers) - for non-academic roles
- **Learning Partners** (NOT parents, guardians) - for family members
- **Learning Studios** (NOT classrooms, rooms)
- **Learning Participation** (NOT attendance)
- **Learning Assessments** (NOT grades, marks, scores, tests, exams)
- **Learning Period** (NOT semester, term, quarter)
- **Learning Pathway** (NOT syllabus, course outline)
- **Learning Framework** (NOT curriculum)
- **Achieved Learning Outcomes** (NOT passed)
- **Did Not Meet Learning Outcomes** (NOT failed)
- **Independent Learning Activities** (NOT homework)
- **Learning Tasks** (NOT assignments)

## Current User Context
- Name: ${context.full_name}
- Role: ${context.role}
- Email: ${context.email}
${context.is_super_admin ? '- Access Level: Super Admin (full access)' : ''}
${context.academic_context?.institution_name ? `- Institution: ${context.academic_context.institution_name}` : ''}
${context.academic_context?.current_academic_year_name ? `- Learning Year: ${context.academic_context.current_academic_year_name}` : ''}

## Guidelines
1. Always use the available tools to fetch real data - never make up information
2. Present data in a clear, organized manner using tables when appropriate
3. When showing lists, limit to 10-20 items unless the user asks for more
4. For actions like sending notifications, always confirm with the user first
5. Respect data access boundaries - the system will automatically filter data based on user permissions
6. If a query returns no results, explain possible reasons and suggest alternatives
7. Format numbers appropriately (currency with ₹ symbol, percentages with %)
8. For dates, use readable formats like "January 15, 2025"
9. **ALWAYS use JKKN terminology** even if the user uses traditional terms - translate in your response

## Available Actions
- **Tier 1 (Auto-execute)**: Export to CSV, mark notifications read
- **Tier 2 (Requires confirmation)**: Send notification (up to 50 recipients)
- **Tier 3 (Requires explicit confirmation)**: Bulk notifications (50+ recipients)
- **Tier 4 (Blocked)**: Delete records, financial transactions - direct users to appropriate modules

## Response Format
- Be concise but informative
- Use markdown formatting for better readability
- Include relevant statistics and summaries
- Suggest related queries or actions when appropriate
- Always use JKKN terminology in headings, labels, and explanations`;
}

// Execute a tool call
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string
): Promise<ToolResponse> {
  switch (toolName) {
    case 'get_attendance':
      return AIQueryService.getAttendance(userId, {
        studentId: toolInput.student_id as string,
        sectionId: toolInput.section_id as string,
        departmentId: toolInput.department_id as string,
        dateFrom: toolInput.date_from as string,
        dateTo: toolInput.date_to as string,
        threshold: toolInput.threshold as number,
      });

    case 'get_attendance_defaulters':
      return AIQueryService.getAttendanceDefaulters(userId, {
        departmentId: toolInput.department_id as string,
        threshold: toolInput.threshold as number,
        semester: toolInput.semester as string,
      });

    case 'get_student_bills':
      return AIQueryService.getStudentBills(userId, {
        studentId: toolInput.student_id as string,
        sectionId: toolInput.section_id as string,
        departmentId: toolInput.department_id as string,
        status: toolInput.status as string,
      });

    case 'get_fee_defaulters':
      return AIQueryService.getFeeDefaulters(userId, {
        departmentId: toolInput.department_id as string,
        status: toolInput.status as string,
        minAmount: toolInput.min_amount as number,
        dueBefore: toolInput.due_before as string,
      });

    case 'get_students':
      return AIQueryService.getStudents(userId, {
        departmentId: toolInput.department_id as string,
        programId: toolInput.program_id as string,
        semesterId: toolInput.semester_id as string,
        sectionId: toolInput.section_id as string,
        status: toolInput.status as string,
        search: toolInput.search as string,
      });

    case 'get_student_details':
      return AIQueryService.getStudentDetails(userId, toolInput.student_id as string);

    case 'search_students':
      return AIQueryService.searchStudents(userId, {
        searchQuery: toolInput.search_query as string,
        searchFields: toolInput.search_fields as string[],
        status: toolInput.status as string,
        departmentId: toolInput.department_id as string,
        exactMatch: toolInput.exact_match as boolean,
      });

    case 'get_students_by_department':
      return AIQueryService.getStudentsByDepartment(userId, {
        institutionId: toolInput.institution_id as string,
        status: toolInput.status as string,
      });

    case 'get_students_summary':
      return AIQueryService.getStudentsSummary(userId, {
        institutionId: toolInput.institution_id as string,
        departmentId: toolInput.department_id as string,
      });

    case 'get_learners_by_location':
      return AIQueryService.getLearnersByLocation(userId, {
        district: toolInput.district as string,
        state: toolInput.state as string,
        taluk: toolInput.taluk as string,
        city: toolInput.city as string,
        status: toolInput.status as string,
        departmentId: toolInput.department_id as string,
        includeStats: toolInput.include_stats as boolean,
      });

    case 'get_learners_comprehensive':
      return AIQueryService.getLearnersComprehensive(userId, {
        search: toolInput.search as string,
        status: toolInput.status as string,
        gender: toolInput.gender as string,
        religion: toolInput.religion as string,
        community: toolInput.community as string,
        caste: toolInput.caste as string,
        accommodationType: toolInput.accommodation_type as string,
        hostelType: toolInput.hostel_type as string,
        busRequired: toolInput.bus_required as boolean,
        busRoute: toolInput.bus_route as string,
        busPickupLocation: toolInput.bus_pickup_location as string,
        foodType: toolInput.food_type as string,
        institutionId: toolInput.institution_id as string,
        departmentId: toolInput.department_id as string,
        programId: toolInput.program_id as string,
        degreeId: toolInput.degree_id as string,
        semesterId: toolInput.semester_id as string,
        sectionId: toolInput.section_id as string,
        entryType: toolInput.entry_type as string,
        quota: toolInput.quota as string,
        category: toolInput.category as string,
        firstGraduate: toolInput.first_graduate as boolean,
        counselingApplied: toolInput.counseling_applied as boolean,
        district: toolInput.district as string,
        state: toolInput.state as string,
        taluk: toolInput.taluk as string,
        boardOfStudy: toolInput.board_of_study as string,
        lastSchool: toolInput.last_school as string,
        includeStats: toolInput.include_stats as boolean,
      });

    case 'get_staff':
      return AIQueryService.getStaff(userId, {
        departmentId: toolInput.department_id as string,
        employmentCategoryId: toolInput.employment_category_id as string,
        status: toolInput.status as string,
        search: toolInput.search as string,
      });

    case 'get_hierarchy_summary':
      return AIQueryService.getHierarchySummary(userId, toolInput.institution_id as string);

    case 'get_departments':
      return AIQueryService.getDepartments(userId, {
        institutionId: toolInput.institution_id as string,
      });

    case 'get_kpi_summary':
      return AIQueryService.getKPISummary(userId, toolInput.institution_id as string);

    case 'get_analytics_overview':
      return AIQueryService.getAnalyticsOverview(userId, {
        dateFrom: toolInput.date_from as string,
        dateTo: toolInput.date_to as string,
      });

    case 'get_notifications':
      return AIQueryService.getNotifications(userId, {
        isRead: toolInput.is_read as boolean,
        type: toolInput.type as string,
      });

    case 'export_csv':
      return AIQueryService.exportData(userId, {
        dataSource: toolInput.data_source as string,
        filters: toolInput.filters as Record<string, unknown>,
      });

    default:
      return {
        success: false,
        data: null,
        metadata: {
          total_count: 0,
          returned_count: 0,
          has_more: false,
          filters_applied: {},
        },
        actions_available: [],
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Unknown tool: ${toolName}`,
        },
      };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const toolsCalled: string[] = [];

  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 }
      );
    }

    // Initialize AIQueryService with the server-side Supabase client
    AIQueryService.initialize(supabase);

    // Parse request body
    const body: AIQueryRequest = await request.json();
    const { message, conversation_id } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Message is required' } },
        { status: 400 }
      );
    }

    // Check rate limit
    const rateLimit = await AIQueryService.checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment.',
            reset_at: rateLimit.reset_at
          }
        },
        { status: 429 }
      );
    }

    // Get user context
    const userContext = await AIQueryService.getUserContext(user.id);
    if (!userContext) {
      return NextResponse.json(
        { error: { code: 'CONTEXT_ERROR', message: 'Failed to get user context' } },
        { status: 500 }
      );
    }

    // Increment query count
    await AIQueryService.incrementQueryCount(user.id);

    // Build messages for Claude
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: message }
    ];

    // Call Claude with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(userContext),
      tools: AI_TOOLS,
      messages,
    });

    // Process tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.MessageParam = {
        role: 'user',
        content: await Promise.all(
          toolUseBlocks.map(async (toolUse) => {
            toolsCalled.push(toolUse.name);
            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              user.id
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          })
        ),
      };

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push(toolResults);

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: buildSystemPrompt(userContext),
        tools: AI_TOOLS,
        messages,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const responseText = textBlocks.map(b => b.text).join('\n');

    // Log the query
    const responseTime = Date.now() - startTime;
    await AIQueryService.logQuery({
      userId: user.id,
      institutionId: userContext.institution_ids?.[0],
      queryText: message,
      queryType: 'data_query',
      toolsCalled,
      responseTimeMs: responseTime,
      success: true,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // Return response
    return NextResponse.json({
      conversation_id: conversation_id || crypto.randomUUID(),
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
        toolCalls: toolsCalled.map(name => ({ name, status: 'completed' })),
      },
      suggestions: [
        'Show me learning participation defaulters',
        'List fee defaulters',
        'Get KPI summary',
        'Show department-wise learner count',
      ],
      rate_limit: rateLimit,
    });

  } catch (error) {
    console.error('[ai-query] API error:', error);

    // Log failed query
    const responseTime = Date.now() - startTime;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await AIQueryService.logQuery({
          userId: user.id,
          queryText: 'error',
          responseTimeMs: responseTime,
          success: false,
          errorCode: 'SERVER_ERROR',
        });
      }
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    );
  }
}
