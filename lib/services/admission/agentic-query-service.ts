// lib/services/admission/agentic-query-service.ts
// Agentic Query Processing Service for natural language CRM queries

import { createClientSupabaseClient } from '@/lib/supabase/client';
import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface QueryIntent {
  type: 'count' | 'list' | 'aggregate' | 'compare' | 'trend' | 'filter';
  entities: string[];
  filters: QueryFilter[];
  timeRange?: TimeRange;
  groupBy?: string[];
  orderBy?: OrderBy;
  limit?: number;
  confidence: number;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
  value: string | number | string[] | [number, number];
}

export interface TimeRange {
  start?: string;
  end?: string;
  period?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year';
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryStep {
  id: string;
  name: 'understanding' | 'planning' | 'executing' | 'analyzing' | 'responding';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  details?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgenticQueryResult {
  success: boolean;
  query: string;
  intent: QueryIntent;
  steps: QueryStep[];
  data: any;
  summary: string;
  visualizationType?: 'table' | 'chart' | 'cards' | 'metric';
  error?: string;
  executionTimeMs: number;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  result: AgenticQueryResult;
  createdAt: string;
  userId: string;
  institutionId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA DEFINITIONS FOR AI
// ═══════════════════════════════════════════════════════════════════════════

const CRM_SCHEMA = {
  tables: {
    admission_leads: {
      description: 'Lead/prospect records for admissions',
      columns: {
        id: 'UUID primary key',
        institution_id: 'UUID - institution reference',
        full_name: 'Lead name',
        email: 'Email address',
        phone: 'Phone number',
        funnel_stage: 'Pipeline stage: new, contacted, qualified, application_started, application_submitted, documents_pending, documents_verified, interview_scheduled, interview_completed, offer_sent, offer_accepted, token_paid, enrolled, lost',
        // FIX: priority enum does not exist → use is_hot_lead and is_priority booleans
        is_hot_lead: 'Boolean flag for hot leads',
        is_priority: 'Boolean flag for priority leads',
        source: 'Lead source: website, walk_in, referral, social_media, newspaper, education_fair, agent, publisher, google_ads, facebook_ads, other',
        // FIX: program_interest does not exist → use interested_programs (text array)
        interested_programs: 'Array of interested program names',
        counselor_id: 'Assigned counselor UUID',
        score: 'Lead score (0-100)',
        score_category: 'Score category label',
        created_at: 'Timestamp',
        updated_at: 'Timestamp',
        // FIX: next_followup_at does not exist; last_contacted_at → last_contact_at
        last_contact_at: 'Last contact date',
        last_activity_at: 'Last activity date',
        tags: 'Array of tags',
        preferred_campus: 'Preferred campus location',
        preferred_channel: 'Preferred communication channel',
      },
    },
    admission_counselors: {
      description: 'Counselor/sales rep records',
      columns: {
        id: 'UUID primary key',
        user_id: 'User account UUID',
        institution_id: 'Institution UUID',
        name: 'Counselor name',
        email: 'Email',
        phone: 'Phone',
        is_active: 'Active status',
        max_leads: 'Maximum leads capacity',
        current_leads: 'Current lead count',
        specializations: 'Array of specializations',
      },
    },
    admission_activities: {
      description: 'Lead activity/interaction logs',
      columns: {
        id: 'UUID primary key',
        lead_id: 'Lead UUID',
        type: 'Activity type: call, email, meeting, note, task, stage_change, etc.',
        description: 'Activity description',
        created_at: 'Timestamp',
        created_by: 'User UUID',
      },
    },
    admissions: {
      description: 'Admission applications',
      columns: {
        id: 'UUID primary key',
        institution_id: 'Institution UUID',
        lead_id: 'Lead UUID (if converted from lead)',
        application_id: 'Application number',
        full_name: 'Applicant name',
        email: 'Email',
        phone: 'Phone',
        status: 'Status: pending, approved, rejected, waitlisted, enrolled',
        program_id: 'Program UUID',
        department_id: 'Department UUID',
        created_at: 'Application date',
        district: 'District/location',
        state: 'State',
        community: 'Community category',
        reference_type: 'Referrer type: CONSULTANT, STAFF, DIRECT, etc.',
        reference_name: 'Referrer name',
      },
    },
  },
  relationships: [
    'admission_leads.counselor_id -> admission_counselors.id',
    'admission_activities.lead_id -> admission_leads.id',
    'admissions.lead_id -> admission_leads.id',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AgenticQueryService {
  private static supabase = createClientSupabaseClient();
  private static anthropic: Anthropic | null = null;

  /**
   * Initialize Anthropic client
   */
  private static getClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('CLAUDE_API_KEY or ANTHROPIC_API_KEY is not configured');
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  /**
   * Main entry point - Process a natural language query
   */
  static async processQuery(
    query: string,
    institutionId: string,
    onProgress?: (step: QueryStep) => void
  ): Promise<AgenticQueryResult> {
    const startTime = Date.now();
    const steps: QueryStep[] = [];

    const updateStep = (step: QueryStep) => {
      const existingIndex = steps.findIndex(s => s.id === step.id);
      if (existingIndex >= 0) {
        steps[existingIndex] = step;
      } else {
        steps.push(step);
      }
      onProgress?.(step);
    };

    try {
      // Step 1: Understanding
      const understandingStep: QueryStep = {
        id: 'understanding',
        name: 'understanding',
        status: 'in_progress',
        message: 'Analyzing your query...',
        startedAt: new Date().toISOString(),
      };
      updateStep(understandingStep);

      const intent = await this.parseQueryIntent(query);

      updateStep({
        ...understandingStep,
        status: 'completed',
        message: `Understood: ${intent.type} query for ${intent.entities.join(', ')}`,
        details: `Confidence: ${(intent.confidence * 100).toFixed(0)}%`,
        completedAt: new Date().toISOString(),
      });

      // Step 2: Planning
      const planningStep: QueryStep = {
        id: 'planning',
        name: 'planning',
        status: 'in_progress',
        message: 'Planning data retrieval...',
        startedAt: new Date().toISOString(),
      };
      updateStep(planningStep);

      const dbQuery = await this.buildDatabaseQuery(intent, institutionId);

      updateStep({
        ...planningStep,
        status: 'completed',
        message: `Prepared query for ${intent.entities[0] || 'data'}`,
        details: `Filters: ${intent.filters.length}, Group by: ${intent.groupBy?.join(', ') || 'none'}`,
        completedAt: new Date().toISOString(),
      });

      // Step 3: Executing
      const executingStep: QueryStep = {
        id: 'executing',
        name: 'executing',
        status: 'in_progress',
        message: 'Fetching data...',
        startedAt: new Date().toISOString(),
      };
      updateStep(executingStep);

      const rawData = await this.executeQuery(dbQuery);

      updateStep({
        ...executingStep,
        status: 'completed',
        message: `Retrieved ${Array.isArray(rawData) ? rawData.length : 1} records`,
        completedAt: new Date().toISOString(),
      });

      // Step 4: Analyzing
      const analyzingStep: QueryStep = {
        id: 'analyzing',
        name: 'analyzing',
        status: 'in_progress',
        message: 'Analyzing results...',
        startedAt: new Date().toISOString(),
      };
      updateStep(analyzingStep);

      const processedData = this.processResults(rawData, intent);

      updateStep({
        ...analyzingStep,
        status: 'completed',
        message: 'Analysis complete',
        completedAt: new Date().toISOString(),
      });

      // Step 5: Responding
      const respondingStep: QueryStep = {
        id: 'responding',
        name: 'responding',
        status: 'in_progress',
        message: 'Generating response...',
        startedAt: new Date().toISOString(),
      };
      updateStep(respondingStep);

      const response = await this.formatResponse(processedData, query, intent);

      updateStep({
        ...respondingStep,
        status: 'completed',
        message: 'Response ready',
        completedAt: new Date().toISOString(),
      });

      return {
        success: true,
        query,
        intent,
        steps,
        data: processedData,
        summary: response.summary,
        visualizationType: response.visualizationType,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[AgenticQueryService] Error processing query:', error);

      return {
        success: false,
        query,
        intent: {
          type: 'list',
          entities: [],
          filters: [],
          confidence: 0,
        },
        steps,
        data: null,
        summary: 'Failed to process query. Please try rephrasing your question.',
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse natural language query to extract intent and entities
   */
  static async parseQueryIntent(query: string): Promise<QueryIntent> {
    const client = this.getClient();

    const systemPrompt = `You are a query parser for a CRM system. Parse the user's natural language query and extract structured intent.

Available schema:
${JSON.stringify(CRM_SCHEMA, null, 2)}

Return a JSON object with:
- type: 'count' | 'list' | 'aggregate' | 'compare' | 'trend' | 'filter'
- entities: array of table names to query (e.g., ['admission_leads'])
- filters: array of {field, operator, value} objects
- timeRange: optional {start, end, period} for date filtering
- groupBy: optional array of fields to group by
- orderBy: optional {field, direction}
- limit: optional number
- confidence: 0-1 confidence score

Examples:
- "How many leads from Google Ads this month?" -> type: 'count', entities: ['admission_leads'], filters: [{field: 'source', operator: 'eq', value: 'google_ads'}], timeRange: {period: 'this_month'}
- "Top 5 counselors by conversion" -> type: 'aggregate', entities: ['admission_leads', 'admission_counselors'], groupBy: ['counselor_id'], orderBy: {field: 'count', direction: 'desc'}, limit: 5

Return ONLY valid JSON, no explanation.`;

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: query }
      ],
      system: systemPrompt,
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No response from AI');
    }

    try {
      // Extract JSON from response
      let jsonStr = textContent.text.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const intent = JSON.parse(jsonStr) as QueryIntent;
      return {
        ...intent,
        confidence: intent.confidence || 0.8,
      };
    } catch (parseError) {
      console.error('[AgenticQueryService] Failed to parse intent:', parseError);
      // Return default intent for simple queries
      return {
        type: 'list',
        entities: ['admission_leads'],
        filters: [],
        confidence: 0.5,
      };
    }
  }

  /**
   * Build database query from parsed intent
   */
  static async buildDatabaseQuery(
    intent: QueryIntent,
    institutionId: string
  ): Promise<{ table: string; query: any; aggregation?: string }> {
    const primaryEntity = intent.entities[0] || 'admission_leads';

    // Start building query
    let query: any = (this.supabase as any).from(primaryEntity).select('*', { count: 'exact' });

    // Always filter by institution
    query = query.eq('institution_id', institutionId);

    // Apply filters
    for (const filter of intent.filters) {
      switch (filter.operator) {
        case 'eq':
          query = query.eq(filter.field, filter.value);
          break;
        case 'neq':
          query = query.neq(filter.field, filter.value);
          break;
        case 'gt':
          query = query.gt(filter.field, filter.value);
          break;
        case 'gte':
          query = query.gte(filter.field, filter.value);
          break;
        case 'lt':
          query = query.lt(filter.field, filter.value);
          break;
        case 'lte':
          query = query.lte(filter.field, filter.value);
          break;
        case 'like':
          query = query.ilike(filter.field, `%${filter.value}%`);
          break;
        case 'in':
          query = query.in(filter.field, filter.value as string[]);
          break;
        case 'between':
          const [min, max] = filter.value as [number, number];
          query = query.gte(filter.field, min).lte(filter.field, max);
          break;
      }
    }

    // Apply time range
    if (intent.timeRange) {
      const { start, end } = this.resolveTimeRange(intent.timeRange);
      if (start) {
        query = query.gte('created_at', start);
      }
      if (end) {
        query = query.lte('created_at', end);
      }
    }

    // Apply ordering
    if (intent.orderBy) {
      query = query.order(intent.orderBy.field, { ascending: intent.orderBy.direction === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Apply limit
    if (intent.limit) {
      query = query.limit(intent.limit);
    } else if (intent.type === 'list') {
      query = query.limit(100); // Default limit for list queries
    }

    return {
      table: primaryEntity,
      query,
      aggregation: intent.groupBy ? intent.groupBy.join(',') : undefined,
    };
  }

  /**
   * Resolve time range to actual dates
   */
  private static resolveTimeRange(timeRange: TimeRange): { start?: string; end?: string } {
    if (timeRange.start && timeRange.end) {
      return { start: timeRange.start, end: timeRange.end };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeRange.period) {
      case 'today':
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          start: yesterday.toISOString(),
          end: today.toISOString(),
        };
      case 'this_week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return {
          start: weekStart.toISOString(),
          end: now.toISOString(),
        };
      case 'last_week':
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(today.getDate() - today.getDay());
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 7);
        return {
          start: lastWeekStart.toISOString(),
          end: lastWeekEnd.toISOString(),
        };
      case 'this_month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: monthStart.toISOString(),
          end: now.toISOString(),
        };
      case 'last_month':
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return {
          start: lastMonthStart.toISOString(),
          end: lastMonthEnd.toISOString(),
        };
      case 'this_quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
        return {
          start: quarterStart.toISOString(),
          end: now.toISOString(),
        };
      case 'this_year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return {
          start: yearStart.toISOString(),
          end: now.toISOString(),
        };
      default:
        return {};
    }
  }

  /**
   * Execute the database query
   */
  static async executeQuery(dbQuery: { table: string; query: any; aggregation?: string }): Promise<any> {
    const { data, error, count } = await dbQuery.query;

    if (error) {
      console.error('[AgenticQueryService] Query error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      records: data || [],
      totalCount: count || (data?.length || 0),
    };
  }

  /**
   * Process and aggregate results based on intent
   */
  private static processResults(rawData: { records: any[]; totalCount: number }, intent: QueryIntent): any {
    const { records, totalCount } = rawData;

    // For count queries, return the count
    if (intent.type === 'count') {
      return {
        count: totalCount,
        records: records.slice(0, 10), // Include sample records
      };
    }

    // For aggregate queries with groupBy
    if (intent.type === 'aggregate' && intent.groupBy && intent.groupBy.length > 0) {
      const grouped = this.groupByFields(records, intent.groupBy);
      return {
        groups: grouped,
        totalCount,
      };
    }

    // For trend queries
    if (intent.type === 'trend') {
      const trends = this.calculateTrends(records);
      return {
        trends,
        totalCount,
      };
    }

    // Default: return records
    return {
      records,
      totalCount,
    };
  }

  /**
   * Group records by specified fields
   */
  private static groupByFields(records: any[], fields: string[]): Record<string, { count: number; records: any[] }> {
    const grouped: Record<string, { count: number; records: any[] }> = {};

    for (const record of records) {
      const key = fields.map(f => record[f] || 'unknown').join('|');
      if (!grouped[key]) {
        grouped[key] = { count: 0, records: [] };
      }
      grouped[key].count++;
      grouped[key].records.push(record);
    }

    // Sort by count descending
    const sorted = Object.entries(grouped)
      .sort((a, b) => b[1].count - a[1].count)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, { count: number; records: any[] }>);

    return sorted;
  }

  /**
   * Calculate trends from time-series data
   */
  private static calculateTrends(records: any[]): { date: string; count: number }[] {
    const byDate: Record<string, number> = {};

    for (const record of records) {
      const date = record.created_at?.split('T')[0] || 'unknown';
      byDate[date] = (byDate[date] || 0) + 1;
    }

    return Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Format results into human-readable response
   */
  static async formatResponse(
    data: any,
    query: string,
    intent: QueryIntent
  ): Promise<{ summary: string; visualizationType: 'table' | 'chart' | 'cards' | 'metric' }> {
    const client = this.getClient();

    // Determine visualization type
    let visualizationType: 'table' | 'chart' | 'cards' | 'metric' = 'table';
    if (intent.type === 'count') {
      visualizationType = 'metric';
    } else if (intent.type === 'trend') {
      visualizationType = 'chart';
    } else if (intent.type === 'aggregate' && intent.groupBy) {
      visualizationType = 'chart';
    } else if (data.records && data.records.length <= 5) {
      visualizationType = 'cards';
    }

    // Generate natural language summary
    const systemPrompt = `You are a CRM analyst. Generate a brief, helpful summary of the query results.
Be concise (2-3 sentences max). Include key numbers and insights.
Use professional but friendly tone.`;

    const dataPreview = JSON.stringify(data, null, 2).slice(0, 2000);

    try {
      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 256,
        messages: [
          { role: 'user', content: `Query: "${query}"\n\nResults:\n${dataPreview}\n\nProvide a brief summary.` }
        ],
        system: systemPrompt,
      });

      const textContent = response.content.find(c => c.type === 'text');
      const summary = textContent?.type === 'text' ? textContent.text : 'Results retrieved successfully.';

      return { summary, visualizationType };
    } catch (error) {
      // Fallback summary if AI fails
      let summary = 'Results retrieved successfully.';
      if (data.totalCount !== undefined) {
        summary = `Found ${data.totalCount} matching records.`;
      } else if (data.count !== undefined) {
        summary = `Count: ${data.count}`;
      }
      return { summary, visualizationType };
    }
  }

  /**
   * Get query history for a user
   */
  static async getQueryHistory(
    userId: string,
    institutionId: string,
    limit: number = 10
  ): Promise<QueryHistoryEntry[]> {
    const { data, error } = await (this.supabase as any)
      .from('admission_query_history')
      .select('*')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AgenticQueryService] Error fetching query history:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      query: row.query,
      result: row.result,
      createdAt: row.created_at,
      userId: row.user_id,
      institutionId: row.institution_id,
    }));
  }

  /**
   * Save query to history
   */
  static async saveQueryToHistory(
    userId: string,
    institutionId: string,
    query: string,
    result: AgenticQueryResult
  ): Promise<void> {
    try {
      await (this.supabase as any)
        .from('admission_query_history')
        .insert({
          user_id: userId,
          institution_id: institutionId,
          query,
          result,
        });
    } catch (error) {
      console.error('[AgenticQueryService] Error saving query history:', error);
      // Don't throw - history is optional
    }
  }

  /**
   * Get suggested queries based on context
   */
  static getSuggestedQueries(): string[] {
    return [
      'How many leads came from Google Ads this month?',
      'Who are the top 5 counselors by conversion?',
      'Show leads interested in MBA who visited 3+ times',
      'What is our conversion rate this quarter?',
      'List hot leads that need follow-up today',
      'Compare lead sources by performance',
      'Show trend of new leads over the past month',
      'Which programs have the most applications?',
    ];
  }
}
