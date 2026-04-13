# AI Permission Debugger — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-powered Permission Debugger tab to the Permissions Audit Dashboard that answers natural language questions about permission issues by analyzing code permissions, Supabase RLS policies, and navigation access across all three layers, with the ability to run suggested SQL fixes directly.

**Architecture:** New 8th tab with a chat interface. Server-side API route auto-fetches full tri-layer permission context from existing audit APIs, builds a structured system prompt, and streams responses from Gemini 4. A separate endpoint runs AI-suggested SQL fixes via service_role with confirmation guards.

**Tech Stack:** Next.js 15 App Router, TypeScript, Gemini 4 API (Google Generative AI SDK with streaming), react-markdown + remark-gfm (already installed), Supabase service_role for SQL running, shadcn/ui.

---

## Phase Overview

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Install dependencies + add GEMINI_API_KEY to env |
| 2 | 3 | AI Debug API route (context fetching + Gemini streaming) |
| 3 | 4 | SQL running API route (with audit logging) |
| 4 | 5 | AI Debugger Tab UI (chat interface + streaming markdown) |
| 5 | 6-7 | Client Integration + database function |

---

## Phase 1: Setup

### Task 1: Install Google Generative AI SDK

**Step 1: Install the package**

Run: `npm install @google/generative-ai`

**Step 2: Check if AlertDialog component is installed**

Run: `ls app/(routes)/users/permissions-audit/ or check components/ui/alert-dialog.tsx`

If not present, run: `npx shadcn@latest add alert-dialog`

**Step 3: Commit**

Commit message: `chore: add @google/generative-ai for AI permission debugger`

---

### Task 2: Add Gemini API Key to Environment

Append to `.env.local`:

```
GEMINI_API_KEY=<user-will-provide-key>
```

Server-side only (no NEXT_PUBLIC prefix). Do NOT commit .env.local.

---

## Phase 2: AI Debug API Route

### Task 3: Create the AI Debug Streaming API

**Files:**
- Create: `app/api/users/permissions-audit/ai-debug/route.ts`

**Auth pattern:** Same cookie-based Supabase client + super admin check as all other audit routes (createServerClient from @supabase/ssr with cookies, await connection(), auth.getUser(), profiles check for is_super_admin or role=super_admin).

**Request body (POST):**
```
{
  query: string,
  roleKey?: string,        // Optional role hint
  conversationHistory?: { role: 'user' | 'assistant', content: string }[]
}
```

**Server-side flow:**

1. Auth + super admin check
2. Parse request body, validate query is not empty
3. Determine roleKey:
   - If provided in body, use it
   - Otherwise, fetch all custom_roles and match role name/key mentioned in the query text
4. Fetch context in parallel using internal fetch (forward cookies for auth):
   - If roleKey found: GET /api/users/permissions-audit/unified?roleKey={key} AND GET /api/users/permissions-audit/rls-policies
   - If no roleKey: GET /api/users/permissions-audit/matrix AND GET /api/users/permissions-audit/rls-policies
   - Use `request.nextUrl.origin` as base URL, forward `request.headers.get('cookie')` header
5. Build system prompt with context (see System Prompt below)
6. Call Gemini 4 using @google/generative-ai SDK:
   ```
   import { GoogleGenerativeAI } from '@google/generative-ai';
   const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
   const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
   ```
7. Use `model.generateContentStream()` with systemInstruction and contents
8. Return streaming response as SSE (text/event-stream):
   - For each chunk: `data: {"text":"chunk_text"}\n\n`
   - At end: `data: [DONE]\n\n`
   - Use ReadableStream + TextEncoder pattern

**System Prompt:**

```
You are an AI Permission Debugger for the MyJKKN education management platform.

Your job is to analyze permission issues across THREE layers of access control and provide specific, actionable diagnoses.

## The Three Permission Layers

1. **CODE PERMISSIONS** - Stored as JSONB in custom_roles.permissions table. Keys follow module.action pattern (e.g., admission.leads.view). Checked by usePermissions() hook in the frontend.

2. **DATABASE RLS (Row Level Security)** - Supabase policies on each table. These control actual data access at the database level. Common patterns:
   - Role-based: get_current_user_role() IN ('admin', 'super_admin')
   - Permission-based: user_has_permission('staff.create')
   - Institution-scoped: institution_id = get_current_user_institution_id()
   - Self-only: user_id = auth.uid()

3. **NAVIGATION** - MENU_PERMISSIONS in sidebarMenuLink.ts maps routes to required permission keys. Controls which pages are visible in the sidebar.

## Analysis Rules

- Always check ALL THREE layers - a permission issue could be in any one
- The most common root cause is a mismatch between layers (e.g., code grants access but RLS blocks it)
- When suggesting SQL fixes, always wrap them in sql code blocks (triple backtick sql)
- Be specific: name exact permission keys, table names, policy names
- For RLS fixes, use CREATE POLICY or CREATE OR REPLACE FUNCTION with full definitions
- Consider institution scoping - some roles like admission have NULL institution_id which breaks institution-scoped RLS policies
- When suggesting code permission changes, specify the exact JSONB key to toggle

## Response Format

- Start with a brief summary of what you found
- Use checkmarks for layers that are properly configured
- Use warnings for layers with issues
- Use crosses for layers that are blocking access
- End with a clear Root Cause and Suggested Fix section
- If the fix involves SQL, provide the complete SQL statement ready to run

## Current Context

{context_here}
```

**Context injection depends on what was fetched:**

For role-specific queries (roleKey found):
- Role metadata (name, key, userCount, isSystem)
- Code permissions grouped by module (granted ones)
- RLS policies on tables for relevant modules (with parsed access types)
- Navigation routes accessible to this role
- Detected cross-layer conflicts

For general queries (no roleKey):
- All roles with permission counts
- Permission matrix summary

**Error handling:**
- If Gemini API key missing: return 500 with "GEMINI_API_KEY not configured"
- If Gemini fails: return 500 with error message
- If context fetch fails: still try with limited context, note the limitation in system prompt

**Commit:** `feat(permissions-audit): add AI debug streaming API with Gemini 4 integration`

---

## Phase 3: SQL Running API Route

### Task 4: Create SQL Running Endpoint

**Files:**
- Create: `app/api/users/permissions-audit/ai-debug/run-sql/route.ts`

**Auth:** Same super admin check pattern.

**Request body (POST):**
```
{ sql: string }
```

**Flow:**
1. Auth + super admin check
2. Validate SQL is not empty
3. Safety check: reject if SQL contains dangerous patterns (case-insensitive):
   - DROP DATABASE
   - DROP SCHEMA
   - TRUNCATE (without specific table context is fine, but warn)
   If rejected, return 400 with explanation
4. Create service_role client:
   ```
   const serviceClient = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!,
     { auth: { autoRefreshToken: false, persistSession: false } }
   );
   ```
5. Call `serviceClient.rpc('exec_sql_safe', { query: sql })`
6. Log the action: `console.log(JSON.stringify({ event: 'ai_debug_sql', userId: user.id, sql: sql.substring(0, 500), success: true/false, timestamp: new Date().toISOString() }))`
7. Return result

**Response:**
```
Success: { success: true, message: 'SQL ran successfully' }
Error: { success: false, error: 'error message', code: 'SQLSTATE' }
```

**Commit:** `feat(permissions-audit): add SQL running endpoint for AI-suggested fixes`

---

## Phase 4: AI Debugger Tab UI

### Task 5: Create the AI Debugger Tab Component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/ai-debugger-tab.tsx`

**Component: AIDebuggerTab (named export, 'use client')**

**State:**
- messages: Array of { id: string, role: 'user' | 'assistant', content: string }
- input: string (current input text)
- isStreaming: boolean
- roleHint: string (empty = auto-detect)
- roles: array of { roleKey, roleName } (fetched on mount)
- executingSql: string | null (SQL being confirmed)
- sqlResult: { success: boolean, message?: string, error?: string } | null

**On mount:** Fetch roles from GET /api/users/permissions-audit/matrix, extract role list from json.roles and json.roleMeta

**Quick question templates (show when no messages):**
- "Why cant {role} access {module}?" (ShieldAlert icon)
- "What permissions does {role} have?" (Shield icon)
- "Which roles can edit billing?" (Key icon)
- "Show all conflicts for {role}" (AlertTriangle icon)
- "Compare admin vs faculty access" (GitCompare icon)
- "Which tables have no RLS policies?" (Database icon)

When clicked: if roleHint is set, replace {role} with role name, otherwise insert template text with placeholders into input.

**Chat message rendering:**
- User messages: right-aligned, primary background, simple text
- AI messages: left-aligned, muted background with border, rendered with ReactMarkdown + remarkGfm
- Use similar markdown component styling as components/ai-query/MessageBubble.tsx (headings with accent bars, styled tables, code blocks)
- CRITICAL: Custom code block renderer that detects language-sql blocks and adds "Run this fix" button (amber colored, Play icon)

**Streaming implementation:**
- POST to /api/users/permissions-audit/ai-debug with { query, roleKey, conversationHistory }
- Read response body as stream using reader.read() loop
- Parse SSE lines (data: {json}\n\n format)
- Append text chunks to the assistant message in state
- On [DONE], set isStreaming=false
- Auto-scroll to bottom on new content (useEffect on messages + ref on scroll container)

**SQL confirmation dialog (AlertDialog):**
- Opens when executingSql is set (user clicked "Run this fix")
- Shows SQL in a pre block for review
- Cancel and Run buttons
- On confirm: POST to /api/users/permissions-audit/ai-debug/run-sql with { sql }
- Show result (success/error) inline in the dialog
- Toast notification on result

**Layout structure:**
```
Card (flex flex-col, min-h-[600px]):
  CardHeader (flex-shrink-0):
    Left: Sparkles icon + "AI Permission Debugger" title
    Right: Role hint Select (w-48) + Clear chat Button (Trash2 icon)
  
  CardContent (flex-1, flex flex-col, overflow-hidden):
    Messages area (flex-1, overflow-y-auto, ScrollArea or div with ref):
      If no messages: Quick question grid (grid-cols-2 lg:grid-cols-3, clickable cards)
      Messages list with alternating user/AI bubbles
    
    Input area (flex-shrink-0, border-t, pt-3):
      flex row: Input + Send Button (disabled during streaming)
      Helper text below: "Analyzes code permissions, RLS policies, and navigation access"
```

**Imports needed:**
- react-markdown, remark-gfm
- shadcn: Card, CardContent, CardHeader, CardTitle, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge, ScrollArea, AlertDialog + sub-components, Alert, AlertDescription
- lucide: AlertCircle, AlertTriangle, Bot, Check, Database, GitCompare, Key, Loader2, Play, Send, Shield, ShieldAlert, Sparkles, Trash2, User
- sonner: toast

**Commit:** `feat(permissions-audit): add AI Debugger tab with streaming chat and SQL running`

---

## Phase 5: Client Integration

### Task 6: Wire the 8th Tab

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx`

**Changes:**
1. Add import: `import { AIDebuggerTab } from './ai-debugger-tab';`
2. Update TabsList grid class: change `lg:grid-cols-7` to `lg:grid-cols-8`
3. Add TabsTrigger at the end: `<TabsTrigger value="ai-debug">AI Debugger</TabsTrigger>`
4. Add TabsContent:
   ```
   <TabsContent value="ai-debug">
     <AIDebuggerTab />
   </TabsContent>
   ```

**Commit:** `feat(permissions-audit): integrate AI Debugger as 8th tab`

---

### Task 7: Create and Apply exec_sql_safe Database Function

**Two actions:**

**A. Apply to live database via Supabase MCP:**
```sql
CREATE OR REPLACE FUNCTION exec_sql_safe(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('success', true, 'message', 'SQL ran successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
```

**B. Append to supabase/setup/02_functions.sql** for consistency.

**Commit:** `feat(permissions-audit): add exec_sql_safe database function`

---

## Verification Checklist

1. AI Debug tab visible as 8th tab in the dashboard
2. Quick question templates appear when chat is empty
3. Typing a question and pressing Send triggers streaming response
4. AI response renders with markdown formatting (headings, tables, code blocks)
5. SQL code blocks in AI response have "Run this fix" button
6. Clicking "Run this fix" opens confirmation dialog with SQL preview
7. Confirming runs the SQL and shows success/error result
8. Follow-up questions maintain conversation context
9. Role hint selector changes the context the AI receives
10. Clear chat button resets the conversation
11. Error states handled gracefully (no API key, network error, Gemini rate limit)

## Dependencies

- @google/generative-ai: New install
- react-markdown: Already installed (^10.1.0)
- remark-gfm: Already installed (^4.0.1)
- GEMINI_API_KEY: User provides
- shadcn AlertDialog: May need installation
- exec_sql_safe: Database function to apply
