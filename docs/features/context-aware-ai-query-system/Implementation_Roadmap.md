# Implementation Roadmap: MyJKKN AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **Target Deadline** | December 5, 2025 (soft) |
| **Total Phases** | 5 |

---

## Executive Summary

This roadmap provides a phased implementation plan for the Context-Aware AI Query System. The plan is designed to meet the December 5th soft deadline with a working MVP, followed by iterative enhancements.

---

## Phase Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION PHASES                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1: Foundation (Day 1-2)                                              │
│  ├── Database schema (tables, core RPC functions)                           │
│  ├── Type definitions                                                        │
│  └── Basic service layer setup                                              │
│                                                                              │
│  Phase 2: MCP Server (Day 2-3)                                              │
│  ├── Supabase Edge Function setup                                           │
│  ├── Core MCP tools (attendance, billing, students)                         │
│  └── Permission validation                                                   │
│                                                                              │
│  Phase 3: API Layer (Day 3-4)                                               │
│  ├── Next.js API route                                                      │
│  ├── Claude integration                                                     │
│  ├── Streaming response                                                     │
│  └── Context builder                                                        │
│                                                                              │
│  Phase 4: Frontend (Day 4-5)                                                │
│  ├── /ai-query page                                                         │
│  ├── Chat components                                                        │
│  ├── Result tables                                                          │
│  └── Action buttons                                                         │
│                                                                              │
│  Phase 5: Polish & Deploy (Day 5-6)                                         │
│  ├── Remaining MCP tools                                                    │
│  ├── Action confirmations                                                   │
│  ├── Error handling                                                         │
│  └── Testing & deployment                                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Day 1-2)

### 1.1 Database Schema

**Files to Create/Update:**
- `supabase/setup/01_tables.sql` - Add new tables
- `supabase/setup/02_functions.sql` - Add RPC functions

**Tasks:**

| Task | Description | Priority |
|------|-------------|----------|
| 1.1.1 | Create `ai_query_logs` table | P0 |
| 1.1.2 | Create `ai_query_rate_limits` table | P0 |
| 1.1.3 | Create `check_ai_query_rate_limit` function | P0 |
| 1.1.4 | Create `ai_rpc_user_context` function | P0 |
| 1.1.5 | Create `ai_rpc_validate_permission` function | P0 |
| 1.1.6 | Add RLS policies for new tables | P0 |
| 1.1.7 | Grant execute permissions | P0 |

**SQL Template:**
```sql
-- ai_query_logs table
CREATE TABLE IF NOT EXISTS public.ai_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  query_text TEXT NOT NULL,
  query_type TEXT,
  tools_called JSONB DEFAULT '[]'::jsonb,
  response_summary TEXT,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ai_query_rate_limits table
CREATE TABLE IF NOT EXISTS public.ai_query_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  query_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.2 TypeScript Types

**Files to Create:**
- `types/ai-query.ts`

**Types:**
```typescript
// Core types for AI Query system
export interface AIQueryRequest {
  query: string;
  conversation_id?: string;
}

export interface AIQueryResponse {
  type: 'text_delta' | 'tool_call' | 'result';
  content?: string;
  data?: QueryResultData;
  actions?: ActionDefinition[];
}

export interface UserContext {
  user_id: string;
  role: string;
  institution_id: string;
  department_id: string | null;
  permissions: string[];
  accessible_institutions: string[];
  current_academic_year: string;
  is_super_admin: boolean;
}

export interface QueryResultData {
  type: 'table' | 'text' | 'chart';
  columns?: string[];
  rows?: any[][];
  summary?: string;
  total_count?: number;
}

export interface ActionDefinition {
  id: string;
  label: string;
  tier: 1 | 2 | 3 | 4;
  parameters_required?: string[];
  confirmation_message?: string;
}

export interface MCPToolResponse {
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
```

### 1.3 Service Layer Setup

**Files to Create:**
- `lib/services/ai-query/index.ts`
- `lib/services/ai-query/context-builder.ts`
- `lib/services/ai-query/rate-limiter.ts`

---

## Phase 2: MCP Server (Day 2-3)

### 2.1 Supabase Edge Function

**Files to Create:**
- `supabase/functions/ai-mcp-server/index.ts`
- `supabase/functions/ai-mcp-server/tools/index.ts`
- `supabase/functions/ai-mcp-server/tools/attendance.ts`
- `supabase/functions/ai-mcp-server/tools/billing.ts`
- `supabase/functions/ai-mcp-server/tools/students.ts`

**Tasks:**

| Task | Description | Priority |
|------|-------------|----------|
| 2.1.1 | Create Edge Function boilerplate | P0 |
| 2.1.2 | Implement tool registry | P0 |
| 2.1.3 | Implement permission validation | P0 |
| 2.1.4 | Create attendance tools | P0 |
| 2.1.5 | Create billing tools | P0 |
| 2.1.6 | Create students tools | P0 |
| 2.1.7 | Deploy to Supabase | P0 |

**Edge Function Template:**
```typescript
// supabase/functions/ai-mcp-server/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from '@supabase/supabase-js';
import { toolRegistry } from './tools/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tool_name, parameters, user_context } = await req.json();

    // Validate tool exists
    const tool = toolRegistry.get(tool_name);
    if (!tool) {
      return new Response(JSON.stringify({
        error: { code: 'TOOL_NOT_FOUND', message: 'Tool not found' }
      }), { status: 404, headers: corsHeaders });
    }

    // Validate permissions
    const hasPermission = await validatePermission(
      user_context.user_id,
      tool.required_permission
    );
    if (!hasPermission) {
      return new Response(JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'This information is only available to authorized personnel.' }
      }), { status: 403, headers: corsHeaders });
    }

    // Execute tool
    const result = await tool.execute(parameters, user_context);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: error.message }
    }), { status: 500, headers: corsHeaders });
  }
});
```

### 2.2 Core RPC Functions

**Add to `supabase/setup/02_functions.sql`:**

| Function | Description | Priority |
|----------|-------------|----------|
| ai_rpc_attendance | Get attendance records | P0 |
| ai_rpc_attendance_defaulters | Get below-threshold students | P0 |
| ai_rpc_student_bills | Get student billing | P0 |
| ai_rpc_fee_defaulters | Get fee defaulters | P0 |
| ai_rpc_students | Get student list | P0 |
| ai_rpc_student_details | Get student details | P0 |

---

## Phase 3: API Layer (Day 3-4)

### 3.1 API Routes

**Files to Create:**
- `app/api/ai-query/route.ts`
- `app/api/ai-query/context/route.ts`
- `app/api/ai-query/action/route.ts`

**Tasks:**

| Task | Description | Priority |
|------|-------------|----------|
| 3.1.1 | Create main query route with streaming | P0 |
| 3.1.2 | Create context endpoint | P0 |
| 3.1.3 | Integrate Claude API | P0 |
| 3.1.4 | Implement MCP tool calling | P0 |
| 3.1.5 | Create action execution endpoint | P1 |
| 3.1.6 | Add rate limiting | P0 |

**Main API Route Template:**
```typescript
// app/api/ai-query/route.ts
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createApiSupabaseClient } from '@/lib/supabase/api';
import { buildUserContext } from '@/lib/services/ai-query/context-builder';
import { checkRateLimit } from '@/lib/services/ai-query/rate-limiter';
import { getMCPToolDefinitions, executeMCPTool } from '@/lib/services/ai-query/mcp-tools';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  const supabase = await createApiSupabaseClient();

  // 1. Validate session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // 2. Check rate limit
  const rateLimitResult = await checkRateLimit(user.id);
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({
      error: 'Rate limited',
      retry_after: rateLimitResult.retry_after
    }), { status: 429 });
  }

  // 3. Get request body
  const { query } = await request.json();
  if (!query) {
    return new Response(JSON.stringify({ error: 'Query required' }), { status: 400 });
  }

  // 4. Build user context
  const userContext = await buildUserContext(user.id);

  // 5. Create Claude stream with MCP tools
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Start Claude stream in background
  (async () => {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: buildSystemPrompt(userContext),
        messages: [{ role: 'user', content: query }],
        tools: getMCPToolDefinitions(),
        stream: true,
      });

      for await (const event of response) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'text_delta',
            content: event.delta.text
          })}\n\n`));
        }

        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          // Execute MCP tool
          const toolResult = await executeMCPTool(
            event.content_block.name,
            event.content_block.input,
            userContext
          );

          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'result',
            data: toolResult.data,
            actions: toolResult.actions_available
          })}\n\n`));
        }
      }
    } catch (error) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        content: 'An error occurred processing your query'
      })}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function buildSystemPrompt(context: UserContext): string {
  return `You are an AI assistant for MyJKKN, an education management system.

User Context:
- User ID: ${context.user_id}
- Role: ${context.role}
- Institution: ${context.institution_id}
- Department: ${context.department_id || 'All'}
- Is Super Admin: ${context.is_super_admin}

Rules:
1. Only query data the user has permission to access
2. NEVER reveal that data exists if the user is unauthorized - use generic "not available" messages
3. Format results as structured tables when returning multiple records
4. Suggest relevant actions based on the query results
5. Be concise and helpful
6. If the query is ambiguous, ask for clarification
7. Always respect the user's role-based access level`;
}
```

---

## Phase 4: Frontend (Day 4-5)

### 4.1 Page and Components

**Files to Create:**
- `app/(routes)/ai-query/page.tsx`
- `app/(routes)/ai-query/_components/AIQueryContainer.tsx`
- `app/(routes)/ai-query/_components/ContextBanner.tsx`
- `app/(routes)/ai-query/_components/MessageThread.tsx`
- `app/(routes)/ai-query/_components/MessageBubble.tsx`
- `app/(routes)/ai-query/_components/QueryResultTable.tsx`
- `app/(routes)/ai-query/_components/ActionButtons.tsx`
- `app/(routes)/ai-query/_components/SuggestedQueries.tsx`
- `app/(routes)/ai-query/_components/QueryInput.tsx`
- `hooks/use-ai-query.ts`

**Tasks:**

| Task | Description | Priority |
|------|-------------|----------|
| 4.1.1 | Create page.tsx server component | P0 |
| 4.1.2 | Create AIQueryContainer | P0 |
| 4.1.3 | Create MessageThread | P0 |
| 4.1.4 | Create MessageBubble | P0 |
| 4.1.5 | Create QueryResultTable | P0 |
| 4.1.6 | Create QueryInput | P0 |
| 4.1.7 | Create useAIQuery hook | P0 |
| 4.1.8 | Create ContextBanner | P1 |
| 4.1.9 | Create ActionButtons | P1 |
| 4.1.10 | Create SuggestedQueries | P1 |

### 4.2 Add to Sidebar Menu

**Update `lib/sidebarMenuLink.ts`:**
```typescript
{
  title: 'AI Query',
  path: '/ai-query',
  icon: Bot,
  permission: 'ai_query.view',
  order: 99 // Near bottom
}
```

---

## Phase 5: Polish & Deploy (Day 5-6)

### 5.1 Remaining MCP Tools

**Add remaining tools for all modules:**
- Staff tools
- Admissions tools
- Resource management tools
- Organization tools
- User management tools
- Notifications tools

### 5.2 Action System

**Files to Create/Update:**
- `app/(routes)/ai-query/_components/ActionConfirmModal.tsx`
- `app/api/ai-query/action/route.ts` (update)

**Tasks:**

| Task | Description | Priority |
|------|-------------|----------|
| 5.2.1 | Create ActionConfirmModal | P0 |
| 5.2.2 | Implement export_csv action | P0 |
| 5.2.3 | Implement send_notification action | P1 |
| 5.2.4 | Implement create_complaint action | P1 |
| 5.2.5 | Add tier-based confirmation logic | P0 |

### 5.3 Error Handling & Polish

| Task | Description | Priority |
|------|-------------|----------|
| 5.3.1 | Add error boundaries | P0 |
| 5.3.2 | Add loading states | P0 |
| 5.3.3 | Add empty states | P0 |
| 5.3.4 | Implement rate limit UI feedback | P1 |
| 5.3.5 | Add query logging | P1 |

### 5.4 Testing & Deployment

| Task | Description | Priority |
|------|-------------|----------|
| 5.4.1 | Test with different roles | P0 |
| 5.4.2 | Test permission boundaries | P0 |
| 5.4.3 | Test streaming performance | P0 |
| 5.4.4 | Deploy Edge Function | P0 |
| 5.4.5 | Deploy to production | P0 |

---

## Environment Variables Required

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-...

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Dependencies to Install

```bash
npm install @anthropic-ai/sdk
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude API rate limits | Implement user-level rate limiting |
| Slow response times | Use streaming for immediate feedback |
| Permission leaks | Triple-layer validation (API + MCP + RLS) |
| Cost overruns | Monitor API usage, implement daily limits |
| Edge Function timeouts | Optimize RPC queries, paginate results |

---

## Success Criteria (MVP)

- [ ] User can submit natural language queries
- [ ] Results filtered by user role and permissions
- [ ] Response time < 3 seconds for 80% of queries
- [ ] Export to CSV works for all query results
- [ ] No permission boundary violations
- [ ] Works on mobile and desktop

---

## Post-MVP Enhancements (v1.1)

1. Query history and favorites
2. Suggested queries based on recent activity
3. Voice input
4. More action types (scheduled reports, dashboard widgets)
5. Analytics dashboard for query patterns
6. Multi-language support
