# Permissions Audit v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a non-developer governance layer on top of the existing Permissions Audit Dashboard — natural language search, plain-English health cards, activity timeline, see-as-user preview, compliance report PDF, and impact preview on role edits.

**Architecture:** Extends PR #146 (base dashboard) and PR #148 (sub-module filter). New tabs/UI components leverage existing API endpoints where possible (especially the AI Debugger). Only F2 requires database changes.

**Tech Stack:** Next.js 15 App Router, shadcn/ui, Gemini 4 (already integrated for AI Debugger), Supabase (triggers + JSONB for audit log), @react-pdf/renderer (for F5).

**Spec:** `docs/SPEC-permissions-audit-v2.md`

---

## Phase 1 — Quick Wins (1 day, 1 PR)

### Task 1.1: Extend AI Debug API to accept question-mode params

**Files:**
- Modify: `app/api/users/permissions-audit/ai-debug/route.ts`

**Step 1: Read the existing file**

Read the current AI debug route to understand its structure and the Gemini integration.

**Step 2: Add new request params**

Accept these optional fields in the POST body:
```typescript
{
  question: string;              // user's plain-English question
  mode?: 'debug' | 'who-can-do'; // default 'debug' (existing behavior)
  includeUsers?: boolean;        // if true, query affected users from DB
}
```

**Step 3: Add branching logic for `mode === 'who-can-do'`**

When mode is 'who-can-do':
1. Call Gemini with a different system prompt (see code below)
2. Parse the interpreted permission keys from Gemini response
3. Query affected users from `user_roles` joined with `custom_roles` joined with `profiles`
4. Return structured response with `groupedUsers` array

**Step 4: System prompt for 'who-can-do' mode**

```
You are a permission system interpreter for MyJKKN.

Given a plain-English question about who can perform an action,
identify the relevant permission key(s) from this list:
[inject PERMISSION_CATEGORIES JSON here]

Response format (JSON only, no markdown):
{
  "interpretedPermissions": ["module.action.key"],
  "summary": "One sentence plain-English answer",
  "technicalNote": "Optional: explain the underlying permission mapping"
}

If the question is ambiguous, return:
{ "error": "ambiguous", "suggestions": ["rephrase 1", "rephrase 2"] }
```

**Step 5: Query affected users after AI returns**

```typescript
// For each interpretedPermission, find roles that have it = true
const matchingRoles = await supabase
  .from('custom_roles')
  .select('id, role_key, role_name, permissions')
  .contains('permissions', { [interpretedPermission]: true });

// For each matching role, get users
const groupedUsers = await Promise.all(
  matchingRoles.data.map(async (role) => {
    const { data: users } = await supabase
      .from('user_roles')
      .select('profiles!inner(id, full_name, email)')
      .eq('role_id', role.id);
    return {
      role: role.role_key,
      roleDisplayName: role.role_name,
      users: users.map(u => u.profiles)
    };
  })
);

// Also include super admins (they bypass all permissions)
const { data: superAdmins } = await supabase
  .from('profiles')
  .select('id, full_name, email')
  .or('is_super_admin.eq.true,role.eq.super_admin');
```

**Step 6: Commit**

```bash
git commit -m "feat(permissions-audit): extend ai-debug API with who-can-do mode"
```

---

### Task 1.2: Create the `/api/users/permissions-audit/ask` wrapper route

**Files:**
- Create: `app/api/users/permissions-audit/ask/route.ts`

**Step 1: Create a thin wrapper around ai-debug**

Why a separate endpoint? Cleaner separation — the UI calls `/ask`, which internally calls `/ai-debug` with the right params. This way, the dashboard's "Ask" tab doesn't know about the AI Debugger's internal complexity.

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    // Auth: super admin or administrator
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_super_admin && profile.role !== 'super_admin' && profile.role !== 'administrator')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { question } = body;

    if (!question || typeof question !== 'string' || question.length < 5) {
      return NextResponse.json({ error: 'Question must be at least 5 characters' }, { status: 400 });
    }

    // Forward to ai-debug with who-can-do mode
    const aiRes = await fetch(`${request.nextUrl.origin}/api/users/permissions-audit/ai-debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || ''
      },
      body: JSON.stringify({
        question,
        mode: 'who-can-do',
        includeUsers: true
      })
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return NextResponse.json({ error: `AI service error: ${err}` }, { status: 500 });
    }

    const data = await aiRes.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[permissions-audit/ask] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git commit -m "feat(permissions-audit): add /ask wrapper endpoint for natural language queries"
```

---

### Task 1.3: Build the "Ask" tab UI

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/ask-tab.tsx`

**Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BeatLoader } from 'react-spinners';
import { Search, Shield, Users, Sparkles, AlertCircle, Download } from 'lucide-react';

interface GroupedUser {
  id: string;
  full_name: string;
  email: string;
}

interface AskResponse {
  interpretedPermissions: string[];
  summary: string;
  groupedUsers: {
    role: string;
    roleDisplayName: string;
    users: GroupedUser[];
  }[];
  technicalNote?: string;
  error?: string;
  suggestions?: string[];
}

const EXAMPLE_QUESTIONS = [
  'Who can delete student records?',
  'Can students see other students\' grades?',
  'Who has access to billing data?',
  'Which roles can create new users?',
  'Who can mark attendance?',
  'Who can approve leave requests?',
];

export function AskTab() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    if (q.length < 5) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/users/permissions-audit/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      const data: AskResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Box */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Ask anything about permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Who can delete student records?"
                className="pl-10"
                disabled={loading}
              />
            </div>
            <Button type="submit" disabled={loading || question.length < 5}>
              {loading ? <BeatLoader size={6} color="#fff" /> : 'Ask'}
            </Button>
          </form>

          {!result && !loading && (
            <div className="pt-2">
              <div className="text-sm text-muted-foreground mb-2">Try asking:</div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuestion(q);
                      ask(q);
                    }}
                    className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <BeatLoader size={10} color="#6366f1" />
            <div className="text-sm text-muted-foreground">Interpreting your question…</div>
          </CardContent>
        </Card>
      )}

      {/* Ambiguous */}
      {result?.error === 'ambiguous' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">I couldn't interpret that question precisely.</div>
            <div className="text-sm mb-2">Try one of these:</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {result.suggestions?.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => {
                      setQuestion(s);
                      ask(s);
                    }}
                    className="text-indigo-600 hover:underline"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Result */}
      {result && !result.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Question: &ldquo;{question}&rdquo;
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-indigo-50 rounded-md">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">
                Answer
              </div>
              <div className="text-sm">{result.summary}</div>
            </div>

            {result.groupedUsers.map((group) => (
              <div key={group.role} className="border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {group.role === 'super_admin' ? (
                      <Shield className="h-4 w-4 text-purple-500" />
                    ) : (
                      <Users className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="font-medium">{group.roleDisplayName}</span>
                    <Badge variant="secondary">{group.users.length}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  {group.users.slice(0, 10).map((u) => (
                    <div key={u.id} className="text-sm flex justify-between py-1 px-2 hover:bg-slate-50 rounded">
                      <span>{u.full_name || '—'}</span>
                      <span className="text-muted-foreground">{u.email}</span>
                    </div>
                  ))}
                  {group.users.length > 10 && (
                    <div className="text-xs text-muted-foreground pt-1">
                      + {group.users.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            ))}

            {result.technicalNote && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                <span className="font-medium">Technical:</span> {result.technicalNote}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setQuestion('');
                }}
              >
                New Question
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export (coming soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git commit -m "feat(permissions-audit): add Ask tab with natural language search UI"
```

---

### Task 1.4: Wire the "Ask" tab into the dashboard

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx`

**Step 1: Add import**

```typescript
import { AskTab } from './ask-tab';
```

**Step 2: Add the new tab trigger and content**

Find the existing `<TabsList>` and `<TabsContent>` sections. Add:
- A new `<TabsTrigger value="ask">` — make it the FIRST tab since it's the primary entry point for non-developers
- A new `<TabsContent value="ask">` wrapping `<AskTab />`

The grid column count on `TabsList` needs to increase from 8 to 9 (since we now have 9 tabs). Use `grid-cols-3 md:grid-cols-9` or similar responsive approach.

**Step 3: Update default tab**

Change `defaultValue="health"` to `defaultValue="ask"` so non-developers land on the friendly tab first.

**Step 4: Test build**

```bash
npx next build 2>&1 | grep -E "error|Error|ask" | head -5
```

Expected: No errors, `/users/permissions-audit` route compiles.

**Step 5: Commit**

```bash
git commit -m "feat(permissions-audit): wire Ask tab into dashboard as default tab"
```

---

### Task 3.1: Build the Plain-English Health Cards component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/plain-health-cards.tsx`

**Step 1: Create component with 4 card variants**

Accepts the existing health API response shape. Renders 4 cards based on data state:

```typescript
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, AlertCircle, Shield } from 'lucide-react';

interface HealthData {
  totals: {
    users: number;
    orphans: number;
    mismatches: number;
    roles: number;
    superAdmins: number;
  };
  permissionHealth?: { flagged: boolean }[];
}

export function PlainHealthCards({ data, onAction }: {
  data: HealthData;
  onAction: (action: 'show-orphans' | 'show-mismatches' | 'show-super-admins' | 'show-tables') => void;
}) {
  const { orphans, mismatches, superAdmins, roles, users } = data.totals;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Card 1: Orphan users */}
      <Card className={orphans > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            {orphans > 0 ? (
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">
                {orphans > 0
                  ? `${orphans.toLocaleString()} people can't use the system`
                  : 'Everyone has a role assigned ✓'}
              </div>
              {orphans > 0 && (
                <>
                  <div className="text-xs text-slate-700 mb-2">
                    They log in, see an empty app, and don't know why.
                    Reason: They have accounts but no role was assigned.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onAction('show-orphans')}>
                    Show list →
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Mismatches */}
      <Card className={mismatches > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            {mismatches > 0 ? (
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">
                {mismatches > 0
                  ? `${mismatches.toLocaleString()} people see a broken menu`
                  : 'Displayed roles match actual permissions ✓'}
              </div>
              {mismatches > 0 && (
                <>
                  <div className="text-xs text-slate-700 mb-2">
                    Their displayed role and actual permissions don't match.
                    They click menu items that do nothing — or miss items they need.
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onAction('show-mismatches')}>
                    Show list →
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Data protection (always green if we're here) */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">Data is protected</div>
              <div className="text-xs text-slate-700 mb-2">
                All tables require permission to read.
                Security rules are active across the system.
              </div>
              <Button size="sm" variant="outline" onClick={() => onAction('show-tables')}>
                View RLS audit →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Super admin count */}
      <Card className={superAdmins > 5 ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            {superAdmins > 5 ? (
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            ) : (
              <Shield className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">
                {superAdmins} {superAdmins === 1 ? 'person has' : 'people have'} Super Admin access
              </div>
              <div className="text-xs text-slate-700 mb-2">
                {superAdmins > 5
                  ? 'Best practice is 2–5. Consider reviewing who needs this level.'
                  : `${users.toLocaleString()} total users across ${roles} roles. This count is healthy.`}
              </div>
              <Button size="sm" variant="outline" onClick={() => onAction('show-super-admins')}>
                Review list →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Task 3.2: Replace stat tiles in System Health tab

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/system-health-tab.tsx`

**Step 1: Import PlainHealthCards**

```typescript
import { PlainHealthCards } from './plain-health-cards';
```

**Step 2: Add a toggle between "Plain English" and "Technical" views**

Add state: `const [view, setView] = useState<'plain' | 'technical'>('plain');`

Add toggle button at the top of the component:
```typescript
<div className="flex justify-end mb-2">
  <div className="inline-flex rounded-md border">
    <button
      onClick={() => setView('plain')}
      className={`px-3 py-1 text-xs ${view === 'plain' ? 'bg-slate-900 text-white' : 'bg-white'}`}
    >
      Plain English
    </button>
    <button
      onClick={() => setView('technical')}
      className={`px-3 py-1 text-xs ${view === 'technical' ? 'bg-slate-900 text-white' : 'bg-white'}`}
    >
      Technical
    </button>
  </div>
</div>
```

**Step 3: Replace the existing stat-tile section**

Replace the stat cards (4 existing tiles) with conditional rendering:

```typescript
{view === 'plain' ? (
  <PlainHealthCards
    data={data}
    onAction={(action) => {
      // Route to appropriate filter/tab
      // For now, just scroll to the relevant section below
      // Future: switch tabs based on action
    }}
  />
) : (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* Existing stat tiles stay as-is */}
  </div>
)}
```

**Step 4: Test**

```bash
npx next build 2>&1 | grep -E "system-health|plain-health" | head -5
```

**Step 5: Commit Task 3.1 + 3.2 together**

```bash
git commit -m "feat(permissions-audit): add plain-English health cards with toggle"
```

---

### Task 1.5: Ship Phase 1

**Step 1: Verify all Phase 1 changes are committed**

```bash
git status --short
# Should show no uncommitted changes
```

**Step 2: Create PR**

```bash
git push jicate ship/permissions-audit-v2-phase1 -u

gh pr create \
  --repo Jicate-Solutions/MyJKKN \
  --base main \
  --head ship/permissions-audit-v2-phase1 \
  --title "feat(permissions-audit): v2 Phase 1 — Ask tab + plain-English health cards" \
  --body "..."
```

**Step 3: Browser test after merge + deploy**

- Navigate to `/users/permissions-audit`
- Verify "Ask" tab is the first and default tab
- Type "who can delete student records" → verify grouped result
- Click example questions → verify they auto-submit
- Switch to System Health tab
- Toggle "Plain English" view → verify 4 friendly cards
- Toggle "Technical" view → verify original tiles still work

---

## Phase 2 — Follow-up (3 PRs, ~3 days)

_Detailed tasks to be expanded after Phase 1 validates. High-level task list:_

### PR #2 — F2 Activity Timeline (~1 day)

| Task | Description |
|------|-------------|
| 2.1 | Create migration `role_audit_log` table + indexes |
| 2.2 | Create `log_role_change()` SQL helper function |
| 2.3 | Add AFTER INSERT/UPDATE/DELETE triggers on `custom_roles` |
| 2.4 | Add AFTER INSERT/UPDATE/DELETE triggers on `user_roles` |
| 2.5 | Add AFTER INSERT/UPDATE/DELETE triggers on `user_institution_access` |
| 2.6 | Create `/api/users/permissions-audit/activity` GET endpoint |
| 2.7 | Create `activity-timeline-tab.tsx` UI (reverse chrono feed) |
| 2.8 | Wire tab into dashboard |
| 2.9 | Apply migration to staging DB, test triggers fire correctly |
| 2.10 | Ship — PR to production |

### PR #3 — F4 See As User Preview (~1 day, security-sensitive)

| Task | Description |
|------|-------------|
| 3.1 | Extend `middleware.ts` with `X-Preview-As` header handling |
| 3.2 | Create `/api/users/permissions-audit/preview-token` endpoint (mint JWT) |
| 3.3 | Create `see-as-user-modal.tsx` confirmation modal |
| 3.4 | Add "See as" button to User Resolver tab user cards |
| 3.5 | Implement preview banner component (sticky top of page in preview mode) |
| 3.6 | Add audit log entry on preview initiation + each request |
| 3.7 | Write security review notes (token expiry, mutation blocking, logging) |
| 3.8 | Browser test: verify mutations blocked, banner shows, 15-min expiry |
| 3.9 | Ship — request review from boobalan before merge (security critical) |

### PR #4 — F5 Compliance Report + F6 Impact Preview (~1 day)

| Task | Description |
|------|-------------|
| 4.1 | Install `@react-pdf/renderer` if not already present |
| 4.2 | Create `compliance-report.pdf.tsx` (React PDF components) |
| 4.3 | Create `/api/users/permissions-audit/compliance-report` POST endpoint |
| 4.4 | Add "Generate Compliance Report" button to Export tab |
| 4.5 | Create `impact-preview-modal.tsx` component |
| 4.6 | Add client-side diff logic (old vs new permissions JSONB) |
| 4.7 | Integrate modal into Role Management edit flow |
| 4.8 | Compute affected route list from `MENU_PERMISSIONS` map |
| 4.9 | Ship — PR to production |

---

## Dependency Graph

```
Phase 1 (parallel-safe after 1.1):
    1.1 (API extension) ──┐
                          ├─> 1.2 (ask wrapper) ──> 1.3 (ask UI) ──> 1.4 (wire tab)
                          │                                          │
                          └─> 3.1 (plain cards) ──> 3.2 (system health toggle) ──┤
                                                                                 │
                                                                         1.5 (ship PR)

Phase 2 (must happen AFTER Phase 1 validates):
    PR #2 (F2) — independent
    PR #3 (F4) — independent
    PR #4 (F5 + F6) — independent
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Gemini misinterprets question → wrong users shown | Medium | Always show `technicalNote` explaining interpretation; let user correct via re-ask |
| AI endpoint rate-limited during demo | Low | Cache recent questions in memory for 5 min |
| User types question → 500+ users match → UI freezes | Medium | Paginate (show top 10 per role), lazy-load rest |
| F4 preview token leaks | Low | 15-min expiry + logged + bound to originator |
| F2 audit log grows too large | Low | Index by created_at DESC; add retention policy in Phase 3 |
| F5 PDF generation slow for big systems | Low | Phase 1 is synchronous; move to job queue only if > 3s |
| Role Management "Save" without impact modal = silent blast | **High** | F6 is the critical safety feature; don't skip even if user "doesn't want modals" |

---

## Files Changed Summary (Phase 1 Only)

| File | Change | Lines |
|------|--------|-------|
| `app/api/users/permissions-audit/ai-debug/route.ts` | Add who-can-do mode + user query | ~80 |
| `app/api/users/permissions-audit/ask/route.ts` | **NEW** wrapper endpoint | ~70 |
| `app/(routes)/users/permissions-audit/_components/ask-tab.tsx` | **NEW** UI component | ~220 |
| `app/(routes)/users/permissions-audit/_components/plain-health-cards.tsx` | **NEW** | ~140 |
| `app/(routes)/users/permissions-audit/_components/system-health-tab.tsx` | Add toggle + cards | ~30 |
| `app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx` | Add "Ask" tab | ~10 |

**Total:** 6 files, ~550 lines (4 new files, 2 modified).
