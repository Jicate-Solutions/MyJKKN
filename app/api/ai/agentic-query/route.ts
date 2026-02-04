/**
 * Agentic Query API Route
 * Processes natural language queries with streaming progress updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const getAnthropicClient = () => {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY or ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface QueryIntent {
  type: 'count' | 'list' | 'aggregate' | 'compare' | 'trend' | 'filter';
  entities: string[];
  filters: QueryFilter[];
  timeRange?: TimeRange;
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  confidence: number;
}

interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
  value: string | number | string[] | [number, number];
}

interface TimeRange {
  start?: string;
  end?: string;
  period?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year';
}

interface QueryStep {
  id: string;
  name: 'understanding' | 'planning' | 'executing' | 'analyzing' | 'responding';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  details?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA FOR AI
// ═══════════════════════════════════════════════════════════════════════════

const CRM_SCHEMA = {
  tables: {
    admission_leads: {
      description: 'Lead/prospect records',
      columns: {
        id: 'UUID',
        institution_id: 'UUID',
        full_name: 'Name',
        email: 'Email',
        phone: 'Phone',
        funnel_stage: 'new|contacted|qualified|application_started|application_submitted|documents_pending|documents_verified|interview_scheduled|interview_completed|offer_sent|offer_accepted|token_paid|enrolled|lost',
        priority: 'hot|warm|cold',
        source: 'website|walk_in|referral|social_media|newspaper|education_fair|agent|publisher|google_ads|facebook_ads|other',
        program_interest: 'Program',
        counselor_id: 'UUID',
        score: 'Number 0-100',
        created_at: 'Timestamp',
        next_followup_at: 'Date',
        tags: 'Array',
      },
    },
    admission_counselors: {
      description: 'Counselors',
      columns: {
        id: 'UUID',
        name: 'Name',
        email: 'Email',
        is_active: 'Boolean',
        current_leads: 'Number',
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function resolveTimeRange(timeRange: TimeRange): { start?: string; end?: string } {
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
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { start: yesterday.toISOString(), end: today.toISOString() };
    }
    case 'this_week': {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart.toISOString(), end: now.toISOString() };
    }
    case 'last_week': {
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - today.getDay());
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 7);
      return { start: lastWeekStart.toISOString(), end: lastWeekEnd.toISOString() };
    }
    case 'this_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart.toISOString(), end: now.toISOString() };
    }
    case 'last_month': {
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: lastMonthStart.toISOString(), end: lastMonthEnd.toISOString() };
    }
    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
      return { start: quarterStart.toISOString(), end: now.toISOString() };
    }
    case 'this_year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart.toISOString(), end: now.toISOString() };
    }
    default:
      return {};
  }
}

async function parseQueryIntent(query: string, anthropic: Anthropic): Promise<QueryIntent> {
  const systemPrompt = `You are a query parser for a CRM system. Parse the user's natural language query and extract structured intent.

Available schema:
${JSON.stringify(CRM_SCHEMA, null, 2)}

Return a JSON object with:
- type: 'count' | 'list' | 'aggregate' | 'compare' | 'trend' | 'filter'
- entities: array of table names (e.g., ['admission_leads'])
- filters: array of {field, operator, value} objects
  - operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between'
- timeRange: optional {start, end, period}
  - period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year'
- groupBy: optional array of fields
- orderBy: optional {field, direction}
- limit: optional number
- confidence: 0-1

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: query }],
    system: systemPrompt,
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No response from AI');
  }

  try {
    let jsonStr = textContent.text.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    const intent = JSON.parse(jsonStr) as QueryIntent;
    return { ...intent, confidence: intent.confidence || 0.8 };
  } catch {
    return {
      type: 'list',
      entities: ['admission_leads'],
      filters: [],
      confidence: 0.5,
    };
  }
}

function groupByFields(records: any[], fields: string[]): Record<string, { count: number; records: any[] }> {
  const grouped: Record<string, { count: number; records: any[] }> = {};

  for (const record of records) {
    const key = fields.map(f => record[f] || 'unknown').join('|');
    if (!grouped[key]) {
      grouped[key] = { count: 0, records: [] };
    }
    grouped[key].count++;
    grouped[key].records.push(record);
  }

  return Object.fromEntries(
    Object.entries(grouped).sort((a, b) => b[1].count - a[1].count)
  );
}

function calculateTrends(records: any[]): { date: string; count: number }[] {
  const byDate: Record<string, number> = {};
  for (const record of records) {
    const date = record.created_at?.split('T')[0] || 'unknown';
    byDate[date] = (byDate[date] || 0) + 1;
  }
  return Object.entries(byDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 }
      );
    }

    // Parse request
    const body = await request.json();
    const { query, institutionId, stream = false } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Query is required' } },
        { status: 400 }
      );
    }

    if (!institutionId) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Institution ID is required' } },
        { status: 400 }
      );
    }

    // For streaming responses
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const sendStep = (step: QueryStep) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'step', step })}\n\n`));
          };

          try {
            const anthropic = getAnthropicClient();
            const steps: QueryStep[] = [];

            // Step 1: Understanding
            sendStep({ id: 'understanding', name: 'understanding', status: 'in_progress', message: 'Analyzing your query...' });

            const intent = await parseQueryIntent(query, anthropic);

            sendStep({
              id: 'understanding',
              name: 'understanding',
              status: 'completed',
              message: `Understood: ${intent.type} query for ${intent.entities.join(', ')}`,
              details: `Confidence: ${(intent.confidence * 100).toFixed(0)}%`,
            });

            // Step 2: Planning
            sendStep({ id: 'planning', name: 'planning', status: 'in_progress', message: 'Planning data retrieval...' });

            const primaryEntity = intent.entities[0] || 'admission_leads';

            sendStep({
              id: 'planning',
              name: 'planning',
              status: 'completed',
              message: `Prepared query for ${primaryEntity}`,
              details: `Filters: ${intent.filters.length}`,
            });

            // Step 3: Executing
            sendStep({ id: 'executing', name: 'executing', status: 'in_progress', message: 'Fetching data...' });

            // Build query
            let dbQuery: any = supabase.from(primaryEntity).select('*', { count: 'exact' });
            dbQuery = dbQuery.eq('institution_id', institutionId);

            // Apply filters
            for (const filter of intent.filters) {
              switch (filter.operator) {
                case 'eq': dbQuery = dbQuery.eq(filter.field, filter.value); break;
                case 'neq': dbQuery = dbQuery.neq(filter.field, filter.value); break;
                case 'gt': dbQuery = dbQuery.gt(filter.field, filter.value); break;
                case 'gte': dbQuery = dbQuery.gte(filter.field, filter.value); break;
                case 'lt': dbQuery = dbQuery.lt(filter.field, filter.value); break;
                case 'lte': dbQuery = dbQuery.lte(filter.field, filter.value); break;
                case 'like': dbQuery = dbQuery.ilike(filter.field, `%${filter.value}%`); break;
                case 'in': dbQuery = dbQuery.in(filter.field, filter.value as string[]); break;
                case 'between': {
                  const [min, max] = filter.value as [number, number];
                  dbQuery = dbQuery.gte(filter.field, min).lte(filter.field, max);
                  break;
                }
              }
            }

            // Apply time range
            if (intent.timeRange) {
              const { start, end } = resolveTimeRange(intent.timeRange);
              if (start) dbQuery = dbQuery.gte('created_at', start);
              if (end) dbQuery = dbQuery.lte('created_at', end);
            }

            // Apply ordering and limit
            if (intent.orderBy) {
              dbQuery = dbQuery.order(intent.orderBy.field, { ascending: intent.orderBy.direction === 'asc' });
            } else {
              dbQuery = dbQuery.order('created_at', { ascending: false });
            }

            dbQuery = dbQuery.limit(intent.limit || 100);

            const { data: records, error: queryError, count } = await dbQuery;

            if (queryError) throw new Error(`Database error: ${queryError.message}`);

            sendStep({
              id: 'executing',
              name: 'executing',
              status: 'completed',
              message: `Retrieved ${records?.length || 0} records`,
            });

            // Step 4: Analyzing
            sendStep({ id: 'analyzing', name: 'analyzing', status: 'in_progress', message: 'Analyzing results...' });

            let processedData: any;
            if (intent.type === 'count') {
              processedData = { count: count || records?.length || 0, records: (records || []).slice(0, 10) };
            } else if (intent.type === 'aggregate' && intent.groupBy?.length) {
              processedData = { groups: groupByFields(records || [], intent.groupBy), totalCount: count };
            } else if (intent.type === 'trend') {
              processedData = { trends: calculateTrends(records || []), totalCount: count };
            } else {
              processedData = { records: records || [], totalCount: count };
            }

            sendStep({ id: 'analyzing', name: 'analyzing', status: 'completed', message: 'Analysis complete' });

            // Step 5: Responding
            sendStep({ id: 'responding', name: 'responding', status: 'in_progress', message: 'Generating response...' });

            // Determine visualization type
            let visualizationType: 'table' | 'chart' | 'cards' | 'metric' = 'table';
            if (intent.type === 'count') visualizationType = 'metric';
            else if (intent.type === 'trend') visualizationType = 'chart';
            else if (intent.type === 'aggregate' && intent.groupBy) visualizationType = 'chart';
            else if (processedData.records?.length <= 5) visualizationType = 'cards';

            // Generate summary
            let summary = 'Results retrieved successfully.';
            try {
              const dataPreview = JSON.stringify(processedData, null, 2).slice(0, 2000);
              const summaryResponse = await anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 256,
                messages: [{ role: 'user', content: `Query: "${query}"\n\nResults:\n${dataPreview}\n\nProvide a brief summary (2-3 sentences).` }],
                system: 'You are a CRM analyst. Generate a brief, helpful summary of the query results.',
              });
              const textContent = summaryResponse.content.find(c => c.type === 'text');
              if (textContent?.type === 'text') summary = textContent.text;
            } catch {
              if (processedData.count !== undefined) summary = `Count: ${processedData.count}`;
              else if (processedData.totalCount !== undefined) summary = `Found ${processedData.totalCount} records.`;
            }

            sendStep({ id: 'responding', name: 'responding', status: 'completed', message: 'Response ready' });

            // Send final result
            const result = {
              success: true,
              query,
              intent,
              data: processedData,
              summary,
              visualizationType,
              executionTimeMs: Date.now() - startTime,
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', result })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();

          } catch (error) {
            console.error('[agentic-query] Stream error:', error);
            const errorResult = {
              success: false,
              query,
              error: error instanceof Error ? error.message : 'Unknown error',
              executionTimeMs: Date.now() - startTime,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorResult })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const anthropic = getAnthropicClient();

    // Parse intent
    const intent = await parseQueryIntent(query, anthropic);

    // Build and execute query
    const primaryEntity = intent.entities[0] || 'admission_leads';
    let dbQuery: any = supabase.from(primaryEntity).select('*', { count: 'exact' });
    dbQuery = dbQuery.eq('institution_id', institutionId);

    for (const filter of intent.filters) {
      switch (filter.operator) {
        case 'eq': dbQuery = dbQuery.eq(filter.field, filter.value); break;
        case 'neq': dbQuery = dbQuery.neq(filter.field, filter.value); break;
        case 'gt': dbQuery = dbQuery.gt(filter.field, filter.value); break;
        case 'gte': dbQuery = dbQuery.gte(filter.field, filter.value); break;
        case 'lt': dbQuery = dbQuery.lt(filter.field, filter.value); break;
        case 'lte': dbQuery = dbQuery.lte(filter.field, filter.value); break;
        case 'like': dbQuery = dbQuery.ilike(filter.field, `%${filter.value}%`); break;
        case 'in': dbQuery = dbQuery.in(filter.field, filter.value as string[]); break;
      }
    }

    if (intent.timeRange) {
      const { start, end } = resolveTimeRange(intent.timeRange);
      if (start) dbQuery = dbQuery.gte('created_at', start);
      if (end) dbQuery = dbQuery.lte('created_at', end);
    }

    if (intent.orderBy) {
      dbQuery = dbQuery.order(intent.orderBy.field, { ascending: intent.orderBy.direction === 'asc' });
    } else {
      dbQuery = dbQuery.order('created_at', { ascending: false });
    }

    dbQuery = dbQuery.limit(intent.limit || 100);

    const { data: records, error: queryError, count } = await dbQuery;

    if (queryError) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: queryError.message } },
        { status: 500 }
      );
    }

    // Process results
    let processedData: any;
    if (intent.type === 'count') {
      processedData = { count: count || records?.length || 0, records: (records || []).slice(0, 10) };
    } else if (intent.type === 'aggregate' && intent.groupBy?.length) {
      processedData = { groups: groupByFields(records || [], intent.groupBy), totalCount: count };
    } else if (intent.type === 'trend') {
      processedData = { trends: calculateTrends(records || []), totalCount: count };
    } else {
      processedData = { records: records || [], totalCount: count };
    }

    // Determine visualization
    let visualizationType: 'table' | 'chart' | 'cards' | 'metric' = 'table';
    if (intent.type === 'count') visualizationType = 'metric';
    else if (intent.type === 'trend') visualizationType = 'chart';
    else if (intent.type === 'aggregate' && intent.groupBy) visualizationType = 'chart';
    else if (processedData.records?.length <= 5) visualizationType = 'cards';

    // Generate summary
    let summary = processedData.count !== undefined
      ? `Count: ${processedData.count}`
      : `Found ${processedData.totalCount || processedData.records?.length || 0} records.`;

    return NextResponse.json({
      success: true,
      query,
      intent,
      data: processedData,
      summary,
      visualizationType,
      executionTimeMs: Date.now() - startTime,
    });

  } catch (error) {
    console.error('[agentic-query] Error:', error);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    );
  }
}

// GET endpoint for suggested queries
export async function GET() {
  return NextResponse.json({
    suggestions: [
      'How many leads came from Google Ads this month?',
      'Who are the top 5 counselors by conversion?',
      'Show leads interested in MBA who visited 3+ times',
      'What is our conversion rate this quarter?',
      'List hot leads that need follow-up today',
      'Compare lead sources by performance',
      'Show trend of new leads over the past month',
      'Which programs have the most applications?',
    ],
  });
}
