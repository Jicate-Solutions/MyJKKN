/**
 * B2A Phase 6 — MCP-style tool manifest.
 *
 * GET /api/b2a/manifest
 *
 * Returns a machine-readable manifest of every B2A endpoint as an MCP tool
 * definition. Designed to be consumed by:
 *   - A standalone MCP server (future thin Node wrapper per handoff §8)
 *   - Claude Code / Cowork via direct manifest fetch
 *   - Agent frameworks that build tool definitions from a discovery URL
 *
 * Per HANDOFF-B2A-Transformation.md §8.1.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';

interface ToolDefinition {
  name: string;                          // e.g. 'myjkkn_morning_brief'
  description: string;
  endpoint: string;                      // REST path
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  module: string;                        // matches VALID_MODULES key
  scope: 'institution' | 'global' | 'agent';
  input_schema: Record<string, unknown>;
  requires_permission: { read?: boolean; write?: boolean };
}

const BASE_URL_NOTE = 'Prepend the MyJKKN deploy URL (e.g. https://www.jkkn.ai) to each endpoint.';

const TOOLS: ToolDefinition[] = [
  // ─── Aggregations ──────────────────────────────────────────────
  {
    name: 'myjkkn_morning_brief',
    description: 'Single 5-module aggregation: admission + attendance + billing + grievance + okr snapshot for today.',
    endpoint: '/api/b2a/morning-brief', method: 'GET', module: 'morning-brief', scope: 'institution',
    input_schema: { type: 'object', properties: { institutionId: { type: 'string', format: 'uuid' } } },
    requires_permission: { read: true },
  },
  // ─── Core modules (read) ───────────────────────────────────────
  ...[
    ['admission',           'List admission leads / applications.'],
    ['attendance',          'List today\'s attendance records.'],
    ['billing',             'List invoices and outstanding bills.'],
    ['grievance',           'List grievance tickets with SLA status.'],
    ['okr',                 'List OKR objectives and progress.'],
    ['learners',            'List learner profiles.'],
    ['staff',               'List staff records.'],
    ['organizations',       'Organization tree: institutions / departments / courses.'],
    ['campus-living',       'Hostel occupancy & dining.'],
    ['solutions',           'JICATE Solutions Hub roster.'],
    ['learners-council',    'Council announcements / events / polls.'],
    ['academic',            'Academic years / batches / regulations.'],
    ['competency',          'Competency catalog and proficiency levels.'],
    ['learning-paths',      'PDE quests / learning path enrollments.'],
    ['alumni',              'Alumni tracking records (platform-scope).'],
    ['facilitator',         'Faculty / mentor staff subset.'],
    ['industry',            'Industry partnership records.'],
    ['parent-portal',       'Parent contact records from learner profiles.'],
    ['vac',                 'Value-Added Courses (VAC).'],
    ['maturity-assessment', 'Audit cycles (institutional maturity audits).'],
    ['process-excellence',  'Audit attestations (process improvement).'],
    ['notifications',       'Notification records (platform-scope).'],
    ['resource-management', 'Event resource bundles.'],
    ['bug-reports',         'Bug reports (platform-scope, not institution-scoped).'],
    ['stakeholder-nps',     'Stakeholder NPS (STUB — schema pending).'],
    ['audit-trail',         'Platform-wide audit logs (sh_audit_logs).'],
    ['social-media',        'Social media events (STUB — schema pending).'],
    ['service_request',     'Instasolver service requests (STUB — DDL pending).'],
    ['requirement',         'Instasolver requirement track (STUB — DDL pending).'],
  ].map<ToolDefinition>(([module, description]) => ({
    name: `myjkkn_query_${module.replace(/-/g, '_')}`,
    description,
    endpoint: `/api/b2a/${module}`,
    method: 'GET',
    module,
    scope: 'institution',
    input_schema: {
      type: 'object',
      properties: {
        institutionId: { type: 'string', format: 'uuid' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    },
    requires_permission: { read: true },
  })),
  // ─── Agent memory ──────────────────────────────────────────────
  {
    name: 'myjkkn_memory_list',
    description: 'List memory entries owned by this API key (filter by type / tags / importance).',
    endpoint: '/api/b2a/memory', method: 'GET', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['decision', 'observation', 'pattern', 'changelog', 'preference', 'context'] },
        tags: { type: 'string', description: 'Comma-separated tag list' },
        min_importance: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    requires_permission: { read: true },
  },
  {
    name: 'myjkkn_memory_create',
    description: 'Store a memory entry (decision / observation / pattern / changelog / preference / context).',
    endpoint: '/api/b2a/memory', method: 'POST', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      required: ['memory_type', 'title'],
      properties: {
        memory_type: { type: 'string', enum: ['decision', 'observation', 'pattern', 'changelog', 'preference', 'context'] },
        title: { type: 'string', maxLength: 500 },
        content: { type: 'object' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        expires_at: { type: 'string', format: 'date-time' },
      },
    },
    requires_permission: { write: true },
  },
  {
    name: 'myjkkn_memory_update',
    description: 'Update a memory entry by id.',
    endpoint: '/api/b2a/memory/:id', method: 'PATCH', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'object' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    requires_permission: { write: true },
  },
  {
    name: 'myjkkn_memory_delete',
    description: 'Soft-delete a memory entry (sets expires_at = now).',
    endpoint: '/api/b2a/memory/:id', method: 'DELETE', module: 'memory', scope: 'agent',
    input_schema: { type: 'object' },
    requires_permission: { write: true },
  },
  {
    name: 'myjkkn_memory_search',
    description: 'Full-text search across memory titles + content.',
    endpoint: '/api/b2a/memory/search', method: 'GET', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      required: ['q'],
      properties: {
        q: { type: 'string', minLength: 2 },
        type: { type: 'string' },
        tags: { type: 'string' },
      },
    },
    requires_permission: { read: true },
  },
  {
    name: 'myjkkn_log_decision',
    description: 'Log a structured decision with context, options considered, and rationale.',
    endpoint: '/api/b2a/memory/decisions', method: 'POST', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      required: ['decision_title', 'decision_made', 'rationale', 'decided_by'],
      properties: {
        decision_title: { type: 'string', maxLength: 500 },
        context: { type: 'object' },
        options_considered: { type: 'array' },
        decision_made: { type: 'string' },
        rationale: { type: 'string' },
        modules_involved: { type: 'array', items: { type: 'string' } },
        decided_by: { type: 'string', enum: ['agent', 'human', 'human_via_agent'] },
      },
    },
    requires_permission: { write: true },
  },
  {
    name: 'myjkkn_decision_list',
    description: 'List logged decisions (filter by decided_by, modules, date range).',
    endpoint: '/api/b2a/memory/decisions', method: 'GET', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      properties: {
        decided_by: { type: 'string' },
        modules: { type: 'string' },
        date_from: { type: 'string', format: 'date' },
        date_to: { type: 'string', format: 'date' },
      },
    },
    requires_permission: { read: true },
  },
  {
    name: 'myjkkn_decision_update_outcome',
    description: 'Fill in the outcome of a previously-logged decision.',
    endpoint: '/api/b2a/memory/decisions/:id', method: 'PATCH', module: 'memory', scope: 'agent',
    input_schema: {
      type: 'object',
      properties: {
        outcome: { type: 'object' },
        decision_made: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    requires_permission: { write: true },
  },
];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  return NextResponse.json(
    {
      schema_version: 'b2a-mcp-manifest-v1',
      generated_at: new Date().toISOString(),
      base_url_note: BASE_URL_NOTE,
      auth: {
        type: 'bearer',
        header: 'Authorization',
        format: 'Bearer jkkn_<api-key>',
        note: 'Keys are created via /admin/api-keys (Director-only). Keys may be institution-scoped or platform-wide.',
      },
      rate_limit: {
        window_seconds: 60,
        max_requests: 60,
        headers: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
      },
      modules_total: 30,
      tools: TOOLS,
      tools_count: TOOLS.length,
    },
    {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    }
  );
}
