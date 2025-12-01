# Technical Specification: MyJKKN Context-Aware AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **Created** | December 1, 2025 |
| **Status** | Design Approved |
| **Deadline** | December 5, 2025 (soft) |

---

## 1. Executive Summary

This document provides the complete technical specification for the MyJKKN Context-Aware AI Query System. The system enables users to query institutional data using natural language, with results automatically filtered based on user role, department, and permissions.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **UI Position** | Dedicated `/ai-query` page | Clean, focused interface |
| **MCP Communication** | Hybrid RPC functions | Optimized performance with security |
| **MCP Hosting** | Supabase Edge Functions | Serverless, auto-scaling |
| **Architecture** | Direct Claude-to-RPC | MVP-friendly, meets deadline |
| **Action System** | MCP tool confirmation | Structured data + frontend modals |
| **Tools Scope** | 60+ tools across 12 modules | Full system access |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MyJKKN Frontend                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    /ai-query Page                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐          │   │
│  │  │ Query Input  │→ │ Message List │→ │ Action Modals    │          │   │
│  │  │ (with ctx)   │  │ (streaming)  │  │ (confirmations)  │          │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ POST /api/ai-query
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Next.js API Route                                        │
│  • Validates user session                                                   │
│  • Builds user context object                                               │
│  • Calls Claude API with MCP tools                                          │
│  • Streams response back to frontend                                        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ Claude API + MCP
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function (MCP Server)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐             │
│  │ Query Tools │  │Action Tools │  │ Context Tools           │             │
│  │ attendance  │  │ export_csv  │  │ get_user_permissions    │             │
│  │ billing     │  │ send_sms    │  │ get_accessible_data     │             │
│  │ students    │  │ create_ticket│ │ validate_access         │             │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘             │
└─────────┼────────────────┼─────────────────────┼────────────────────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                                      │
│  • RPC Functions (ai_get_attendance, ai_get_billing, etc.)                 │
│  • RLS Policies enforce access                                              │
│  • Views for optimized queries                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15, React, TypeScript | UI Components |
| **State Management** | React Query | Server state, caching |
| **API Layer** | Next.js API Routes | Request handling, streaming |
| **AI** | Claude API (Anthropic) | Natural language understanding |
| **Tool Protocol** | MCP (Model Context Protocol) | Tool calling interface |
| **MCP Server** | Supabase Edge Functions | Serverless tool execution |
| **Database** | PostgreSQL (Supabase) | Data storage, RPC functions |
| **Auth** | Supabase Auth SSR | Session management |

---

## 4. Data Flow

### 4.1 Query Processing Flow

```
1. User submits natural language query
2. Frontend sends POST /api/ai-query with query text
3. API route:
   a. Validates user session
   b. Builds user context (role, department, permissions)
   c. Checks rate limits
   d. Calls Claude API with MCP tools
4. Claude interprets query and calls appropriate MCP tools
5. MCP server (Edge Function):
   a. Validates tool permissions
   b. Executes Supabase RPC function
   c. Returns filtered results
6. Claude formats response with action suggestions
7. Response streamed back to frontend
8. Frontend renders results with action buttons
```

### 4.2 User Context Object

```typescript
interface UserContext {
  user_id: string;
  role: 'learner' | 'faculty' | 'hod' | 'principal' | 'admin' | 'super_admin';
  institution_id: string;
  department_id: string | null;
  permissions: string[];
  accessible_institutions: string[];
  current_academic_year: string;
  current_semester: 'odd' | 'even';
  is_super_admin: boolean;
}
```

---

## 5. API Specification

### 5.1 Main Query Endpoint

```
POST /api/ai-query

Request:
{
  "query": "Show me learners with attendance below 75%",
  "conversation_id": "uuid" (optional - for multi-turn)
}

Response (Streaming):
{
  "type": "text_delta" | "tool_call" | "result",
  "content": "...",
  "data": { ... },  // For result type
  "actions": [...]  // Available actions
}
```

### 5.2 Action Execution Endpoint

```
POST /api/ai-query/action

Request:
{
  "action_id": "send_sms",
  "parameters": {
    "recipient_ids": ["uuid1", "uuid2"],
    "message": "Attendance warning"
  },
  "confirmation": true
}

Response:
{
  "success": true,
  "message": "SMS sent to 12 recipients",
  "details": { ... }
}
```

---

## 6. Security Architecture

### 6.1 Five-Layer Security Model

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **1** | Next.js Middleware | JWT validation, session check |
| **2** | API Route | Rate limiting, context building |
| **3** | MCP Server | Permission validation per tool |
| **4** | RPC Functions | Role-based data filtering |
| **5** | RLS Policies | Database-level enforcement |

### 6.2 Role-Based Access Matrix

| Role | Data Scope |
|------|------------|
| learner | Own data only |
| faculty | Own + assigned courses/sections |
| hod | Own + entire department |
| principal | Own + entire institution |
| admin | All accessible institutions |
| super_admin | Everything |

### 6.3 Action Tiers

| Tier | Actions | Permission | Confirmation |
|------|---------|------------|--------------|
| 1 | export_csv, create_complaint | [module].view | None (auto) |
| 2 | send_notification (<50) | notifications.send | One-click modal |
| 3 | bulk_notification (≥50) | notifications.bulk | Type "SEND TO ALL" |
| 4 | delete, financial | BLOCKED | "Contact admin" |

---

## 7. Rate Limiting

```typescript
const RATE_LIMITS = {
  queries_per_5_minutes: 30,
  max_results_display: 100,
  max_results_export: 10000,
  bulk_action_daily_limit: 500
};
```

---

## 8. Error Handling

### 8.1 Error Responses

| Code | Type | User Message |
|------|------|--------------|
| 401 | Unauthorized | "Please log in to continue" |
| 403 | Forbidden | "This information is only available to authorized personnel" |
| 429 | Rate Limited | "Too many queries. Please wait 60 seconds" |
| 500 | Server Error | "Something went wrong. Please try again" |

### 8.2 Security Rule

**NEVER reveal that data exists if user is unauthorized.** Always use generic "not available" messages.

---

## 9. Performance Requirements

| Metric | Target |
|--------|--------|
| Time to first token | < 500ms |
| Total response time | < 3 seconds |
| Query success rate | > 85% |
| Concurrent users | 100+ |

---

## 10. Monitoring & Analytics

### 10.1 Metrics to Track

- `ai_query_submitted` - Query submitted
- `ai_query_understood` - Successfully interpreted
- `ai_query_failed` - Failed to understand
- `ai_query_response_time` - Latency
- `ai_action_executed` - Action performed
- `ai_query_feedback` - User thumbs up/down

### 10.2 Logging

All queries logged to `ai_query_logs` table:
- user_id
- query_text
- tools_called
- response_time_ms
- success
- created_at

---

## 11. Related Documents

- [PRD_MyJKKN_AI_Query_System.md](./PRD_MyJKKN_AI_Query_System.md) - Product requirements
- [MCP_Tools_Catalog.md](./MCP_Tools_Catalog.md) - Complete tools list
- [Database_Schema.md](./Database_Schema.md) - RPC functions
- [UI_Components.md](./UI_Components.md) - Component design
- [Security_Design.md](./Security_Design.md) - Security details
- [Implementation_Roadmap.md](./Implementation_Roadmap.md) - Build plan
