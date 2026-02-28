# Admission CRM Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 critical gaps in the Admission CRM lead pipeline — data quality, auto-assignment, stage integrity, notifications, inbound API, and database security.

**Architecture:** All fixes are additive modifications to existing services. No new tables needed. Auto-assignment is implemented as a new method on `AssignmentRulesService` called from `createLead()`. The inbound webhook is a new Next.js route handler. RLS policy fixes go into `supabase/setup/03_policies.sql`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + RLS), React Query

**Status of each fix at analysis time (2026-02-27):**
- ✅ Fix #8 (Data model merge) — already done, skip
- ❌ Fix #1 (Auto-assignment) — not implemented
- ❌ Fix #2 (Duplicate phone) — not implemented
- ❌ Fix #3 (Stage transition validation) — not implemented
- ⚠️ Fix #4 (Phone validation) — frontend only, Indian format missing, no backend guard
- ⚠️ Fix #5 (Counselor notification) — activity logged, no notification table insert
- ❌ Fix #6 (Inbound webhook API) — route missing entirely
- ⚠️ Fix #7 (Score re-scoring) — expiry logic exists, no cron executor
- ❌ Fix #9 (Stage consolidation 26→8) — **DEFERRED** (requires DB migration, risky)

**Additional schema issues fixed here:**
- 6 tables with RLS enabled but zero policies (effectively locked to client queries)

---

## Task 1: Backend Phone Validation

**Files:**
- Modify: `lib/services/admission/lead-service.ts:219-221`

**What:** Add Indian phone number format validation in `createLead()` on the server side. The frontend already has a basic check but it only tests for 10 digits and can be bypassed via API. This backend guard is the authoritative check.

**Indian mobile number rules:** Must be 10 digits, first digit must be 6, 7, 8, or 9. May optionally be prefixed with `+91` or `0`. Strip whitespace, hyphens, parentheses before checking.

**Step 1: Locate the existing phone check**

Open `lib/services/admission/lead-service.ts` and find lines 219-221:
```typescript
if (!leadData.phone?.trim()) {
  throw new Error('Phone number is required');
}
```

**Step 2: Replace with validated check**

Replace those 3 lines with:
```typescript
if (!leadData.phone?.trim()) {
  throw new Error('Phone number is required');
}
// Validate Indian mobile number format (10 digits, first digit 6–9, optional +91/0 prefix)
const cleanPhone = leadData.phone.trim().replace(/[\s\-()]/g, '');
const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
if (!phoneRegex.test(cleanPhone)) {
  throw new Error('Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
}
```

**Step 3: Strengthen frontend validation (same file, different location)**

Open `app/(routes)/admission/leads/new/page.tsx`, find line 318:
```typescript
} else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
  newErrors.phone = 'Invalid phone number';
}
```

Replace with:
```typescript
} else {
  const cleaned = formData.phone.replace(/[\s\-()]/g, '');
  if (!/^(\+91|0)?[6-9]\d{9}$/.test(cleaned)) {
    newErrors.phone = 'Enter a valid 10-digit Indian mobile number (starting with 6–9)';
  }
}
```

**Step 4: Commit**
```bash
git add lib/services/admission/lead-service.ts app/\(routes\)/admission/leads/new/page.tsx
git commit -m "fix(admission): add Indian phone format validation to createLead and new lead form"
```

---

## Task 2: Duplicate Phone Detection

**Files:**
- Modify: `lib/services/admission/lead-service.ts` — inside `createLead()`, after line 224

**What:** Before inserting a new lead, query for an existing active lead with the same phone number in the same institution. If found, throw a descriptive error. Allow re-creation if the existing lead is in `lost` or `dormant` stage (re-engagement scenario).

**Step 1: Add duplicate check after validation block**

In `createLead()`, after the `if (!leadData.source)` check (line 224), add:

```typescript
// Check for existing lead with same phone (re-engagement exception: allow if prior lead is lost/dormant)
const normalizedPhone = leadData.phone.trim().replace(/[\s\-()]/g, '');
const { data: existing, error: dupError } = await (this.supabase as any)
  .from('admission_leads')
  .select('id, full_name, funnel_stage')
  .eq('institution_id', leadData.institution_id)
  .eq('phone', normalizedPhone)
  .not('funnel_stage', 'in', '("lost","dormant")')
  .limit(1);

if (!dupError && existing && existing.length > 0) {
  throw new Error(
    `Duplicate lead: a lead with this phone already exists — ${existing[0].full_name} (stage: ${existing[0].funnel_stage}). ` +
    `Update the existing lead or mark it as lost before creating a new one.`
  );
}
```

**Note on Supabase `.not('funnel_stage', 'in', ...)` syntax:** Supabase JS uses `not('col', 'in', '(val1,val2)')` with a Postgres-style literal. The exact call is:
```typescript
.not('funnel_stage', 'in', `("lost","dormant")`)
```

**Step 2: Test manually**
1. Create a lead with phone `9876543210`
2. Try to create another lead with the same phone in the same institution → should throw
3. Mark the first lead as `lost`, then retry → should succeed

**Step 3: Commit**
```bash
git add lib/services/admission/lead-service.ts
git commit -m "fix(admission): prevent duplicate leads with same phone number per institution"
```

---

## Task 3: Add executeRulesForLead() to AssignmentRulesService

**Files:**
- Modify: `lib/services/admission/assignment-rules-service.ts` — add 3 new static methods after line 280 (after `getAssignmentStats`)

**What:** The service can already fetch rules but has no evaluation logic. This task adds:
1. `executeRulesForLead()` — the public entry point
2. `matchesCriteria()` — private, evaluates a rule's criteria array against a lead
3. `executeAction()` — private, translates a matched rule's action into a counselor_id

**Step 1: Add the input type at the top of the file (after line 70, before the class)**

```typescript
export interface LeadDataForAssignment {
  institution_id: string;
  source?: string;
  interested_programs?: string[];
  city?: string;
  state?: string;
  score?: number;
}
```

**Step 2: Add the three methods to the class (after the `getAssignmentStats` method)**

Paste this block at the end of the class body, before the final closing `}`:

```typescript
// ============================================================================
// RULE EXECUTION
// ============================================================================

/**
 * Evaluate active rules against a new lead and return the counselor_id to assign.
 * Rules are evaluated in priority order (lowest number = highest priority).
 * Returns null if no rule matches, no counselors are available, or no rules exist.
 * This method is best-effort — callers should handle null gracefully.
 */
static async executeRulesForLead(lead: LeadDataForAssignment): Promise<string | null> {
  try {
    const rules = await this.getActiveAssignmentRules(lead.institution_id);
    if (rules.length === 0) return null;

    for (const rule of rules) {
      if (this.matchesCriteria(lead, rule.criteria)) {
        const counselorId = await this.executeAction(rule.action, lead.institution_id);
        if (counselorId) return counselorId;
        // If action couldn't resolve a counselor, continue to next rule
      }
    }
    return null;
  } catch (err) {
    console.warn('[admission/assignment-rules] executeRulesForLead failed (non-blocking):', err);
    return null;
  }
}

/**
 * Check if a lead matches ALL criteria in a rule (AND logic).
 * An empty criteria array matches every lead.
 */
private static matchesCriteria(lead: LeadDataForAssignment, criteria: AssignmentCriterion[]): boolean {
  if (!criteria || criteria.length === 0) return true;

  return criteria.every((criterion) => {
    const leadValue = (lead as Record<string, unknown>)[criterion.field];

    switch (criterion.operator) {
      case 'equals':
        return leadValue === criterion.value;

      case 'contains':
        if (Array.isArray(leadValue)) {
          return (leadValue as string[]).includes(criterion.value as string);
        }
        return String(leadValue ?? '').toLowerCase().includes(String(criterion.value).toLowerCase());

      case 'greater_than':
        return Number(leadValue) > Number(criterion.value);

      case 'less_than':
        return Number(leadValue) < Number(criterion.value);

      case 'in': {
        const allowedValues = Array.isArray(criterion.value) ? criterion.value : [criterion.value];
        if (Array.isArray(leadValue)) {
          return (leadValue as string[]).some((v) => allowedValues.includes(v as never));
        }
        return allowedValues.includes(leadValue as never);
      }

      default:
        return false;
    }
  });
}

/**
 * Execute the matched rule's action and return the counselor id to assign.
 * For round_robin: picks the active counselor with fewest current_leads (respects max_leads cap).
 * For assign_to_counselor: picks the first available active counselor in the list.
 */
private static async executeAction(action: AssignmentAction, institutionId: string): Promise<string | null> {
  if (!action?.counselor_ids || action.counselor_ids.length === 0) return null;

  if (action.type === 'assign_to_counselor') {
    const { data: counselor } = await this.supabase
      .from('admission_counselors')
      .select('id')
      .in('id', action.counselor_ids)
      .eq('is_active', true)
      .eq('institution_id', institutionId)
      .limit(1)
      .single();
    return counselor?.id ?? null;
  }

  if (action.type === 'round_robin') {
    // Pick active counselor with fewest leads who hasn't hit max_leads
    const { data: counselors } = await this.supabase
      .from('admission_counselors')
      .select('id, current_leads, max_leads')
      .in('id', action.counselor_ids)
      .eq('is_active', true)
      .eq('institution_id', institutionId)
      .order('current_leads', { ascending: true });

    if (!counselors || counselors.length === 0) return null;

    // Find first counselor who has capacity
    const available = (counselors as { id: string; current_leads: number; max_leads: number }[])
      .find((c) => c.current_leads < c.max_leads);
    return available?.id ?? null;
  }

  return null;
}
```

**Step 3: Verify TypeScript compiles**
```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | grep assignment-rules
```
Expected: no errors for this file.

**Step 4: Commit**
```bash
git add lib/services/admission/assignment-rules-service.ts
git commit -m "feat(admission): add executeRulesForLead() to AssignmentRulesService with criteria matching and round-robin support"
```

---

## Task 4: Wire Auto-Assignment into createLead()

**Files:**
- Modify: `lib/services/admission/lead-service.ts`
  - Add import at top
  - Add auto-assignment call after line 281 (after `logStageHistory`)

**What:** After a lead is created and stage history is logged, call `AssignmentRulesService.executeRulesForLead()`. If a counselor is returned, update the lead's `counselor_id` and `assigned_at`. Also increment the counselor's `current_leads` counter. This entire block is best-effort — if it fails the lead is still created.

**Step 1: Add import at the top of lead-service.ts**

Find the existing imports block (first few lines of the file) and add:
```typescript
import { AssignmentRulesService, type LeadDataForAssignment } from './assignment-rules-service';
```

**Step 2: Add auto-assignment block after line 281**

After:
```typescript
await this.logStageHistory(data.id, null, 'new', user?.id);
```

Insert:
```typescript
// Auto-assign via rules — best-effort, never blocks lead creation
try {
  const assignInput: LeadDataForAssignment = {
    institution_id: data.institution_id,
    source: data.source,
    interested_programs: data.interested_programs ?? [],
    city: data.city ?? undefined,
    state: data.state ?? undefined,
    score: data.score ?? 0,
  };
  const counselorId = await AssignmentRulesService.executeRulesForLead(assignInput);
  if (counselorId) {
    await (this.supabase as any)
      .from('admission_leads')
      .update({ counselor_id: counselorId, assigned_at: new Date().toISOString() })
      .eq('id', data.id);

    // Increment counselor's current_leads count (best-effort, no lock needed for soft counter)
    await (this.supabase as any)
      .from('admission_counselors')
      .update({ current_leads: (data as any)._counselorCurrentLeads + 1 })
      .eq('id', counselorId);

    // Reflect assignment in the returned object without re-fetching
    data.counselor_id = counselorId;
    data.assigned_at = new Date().toISOString();
  }
} catch (assignErr) {
  console.warn('[LeadService] Auto-assignment skipped (lead created successfully):', assignErr);
}
```

**Note on counselor current_leads increment:** The above uses a placeholder `(data as any)._counselorCurrentLeads`. Replace the increment update with a simpler safe approach using Postgres:
```typescript
// Safer: use SQL to increment atomically — avoids read-modify-write race
await (this.supabase as any).rpc('admission_increment_counselor_leads', { p_counselor_id: counselorId });
```

This requires the DB function from Task 4a below.

**Step 4a: Create the increment function in supabase/setup/02_functions.sql**

Open `supabase/setup/02_functions.sql` and append at the end:

```sql
-- Updated: 2026-02-27 — Auto-assignment: atomic counselor lead count increment
CREATE OR REPLACE FUNCTION admission_increment_counselor_leads(p_counselor_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE admission_counselors
  SET current_leads = current_leads + 1,
      updated_at = now()
  WHERE id = p_counselor_id;
$$;
```

Run this in Supabase SQL editor to deploy it.

**Step 4b: Update the counselor increment line in lead-service.ts**

Replace the draft increment update with the RPC call:
```typescript
await (this.supabase as any).rpc('admission_increment_counselor_leads', { p_counselor_id: counselorId });
```

**Step 5: Verify TypeScript compiles**
```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | grep lead-service
```

**Step 6: Manual smoke test**
1. Create an assignment rule in the UI (`/admission/assignment-rules`) with action `round_robin` pointing to a test counselor
2. Create a new lead via `/admission/leads/new`
3. Check the lead detail — `counselor_id` should be populated immediately
4. Check the counselor in `/admission/counselors` — `current_leads` should increment

**Step 7: Commit**
```bash
git add lib/services/admission/lead-service.ts supabase/setup/02_functions.sql
git commit -m "feat(admission): auto-assign counselor on lead creation via assignment rules"
```

---

## Task 5: Stage Transition Validation

**Files:**
- Modify: `lib/services/admission/lead-service.ts:370` — `updateStage()` method

**What:** Add a transition map that defines which stage-to-stage moves are allowed. If the requested transition is not in the map, throw a descriptive error. Super-admin bypass is supported via an optional `force` parameter.

**Step 1: Add the transition map constant above the class (or at top of the STAGE MANAGEMENT section)**

Add this constant after the imports, before the `LeadService` class definition (or at the top of the file near other constants):

```typescript
// ────────────────────────────────────────────────────────────────────────────
// Stage Transition Rules
// Each entry lists the stages a lead may move TO from the key stage.
// 'lost' and 'dormant' are always allowed as exits from any active stage.
// ────────────────────────────────────────────────────────────────────────────
export const ALLOWED_STAGE_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  new:                    ['contacted', 'not_reachable', 'lost', 'dormant'],
  contacted:              ['interested', 'not_reachable', 'follow_up_scheduled', 'lost', 'dormant'],
  not_reachable:          ['contacted', 'follow_up_scheduled', 'lost', 'dormant'],
  interested:             ['engaged', 'qualified', 'follow_up_scheduled', 'not_reachable', 'lost', 'dormant'],
  follow_up_scheduled:    ['contacted', 'not_reachable', 'interested', 'lost', 'dormant'],
  engaged:                ['qualified', 'interested', 'follow_up_scheduled', 'lost', 'dormant'],
  qualified:              ['application_started', 'applied', 'follow_up_scheduled', 'lost', 'dormant'],
  application_started:    ['application_submitted', 'documents_pending', 'lost', 'dormant'],
  application_submitted:  ['documents_pending', 'documents_verified', 'lost', 'dormant'],
  documents_pending:      ['documents_verified', 'application_submitted', 'lost', 'dormant'],
  documents_verified:     ['interview_scheduled', 'offer_sent', 'lost', 'dormant'],
  interview_scheduled:    ['interview_completed', 'documents_pending', 'lost', 'dormant'],
  interview_completed:    ['offer_sent', 'interviewed', 'lost', 'dormant'],
  offer_sent:             ['offer_accepted', 'declined', 'lost', 'dormant'],
  offer_accepted:         ['token_paid', 'confirmed', 'declined', 'lost', 'dormant'],
  token_paid:             ['confirmed', 'enrolled', 'lost', 'dormant'],
  applied:                ['interviewed', 'documents_pending', 'lost', 'dormant'],
  interviewed:            ['offered', 'declined', 'lost', 'dormant'],
  offered:                ['confirmed', 'declined', 'withdrew', 'lost', 'dormant'],
  confirmed:              ['enrolled', 'withdrew', 'lost', 'dormant'],
  enrolled:               ['lost', 'dormant'],
  declined:               ['new', 'lost', 'dormant'],
  withdrew:               ['new', 'lost', 'dormant'],
  expired:                ['new', 'lost', 'dormant'],
  lost:                   ['new', 'contacted', 'dormant'],
  dormant:                ['new', 'contacted', 'lost'],
};
```

**Step 2: Update updateStage() signature to accept a force flag**

Find line 370:
```typescript
static async updateStage(leadId: string, newStage: FunnelStage, notes?: string): Promise<AdmissionLead> {
```

Change to:
```typescript
static async updateStage(leadId: string, newStage: FunnelStage, notes?: string, force = false): Promise<AdmissionLead> {
```

**Step 3: Add validation block after fetching current stage**

After line 374 (after the `.single()` call that fetches current), insert:

```typescript
// Validate stage transition (skip validation if force=true for super admin overrides)
const currentStage = current?.funnel_stage as FunnelStage | undefined;
if (!force && currentStage && currentStage !== newStage) {
  const allowed = ALLOWED_STAGE_TRANSITIONS[currentStage] ?? [];
  if (!allowed.includes(newStage)) {
    throw new Error(
      `Invalid stage transition: cannot move from "${currentStage}" to "${newStage}". ` +
      `Allowed next stages: ${allowed.join(', ')}.`
    );
  }
}
```

**Step 4: Verify TypeScript compiles**
```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | grep lead-service
```

**Step 5: Manual smoke test**
1. Create a lead (stage: `new`)
2. Try to update stage to `enrolled` directly — should throw with clear message
3. Update stage to `contacted` — should succeed
4. Call `updateStage(id, 'enrolled', undefined, true)` (force) — should succeed (super admin bypass)

**Step 6: Commit**
```bash
git add lib/services/admission/lead-service.ts
git commit -m "feat(admission): add stage transition validation with allowed transitions map"
```

---

## Task 6: Counselor Notification on Assignment

**Files:**
- Modify: `lib/services/admission/lead-service.ts:613-615` — inside `assignCounselor()`, after activity log

**What:** After a counselor is successfully assigned and the activity is logged, insert a notification record for the counselor's user account. Uses the same `notifications` table pattern as `activity-alert-service.ts`. Best-effort — if notification fails, assignment still succeeds.

**Step 1: Add notification insert after line 611 (after the activity insert try block)**

Find the block ending at ~line 615:
```typescript
if (activityError) {
  console.warn('[LeadService] Could not log counselor assignment activity:', activityError);
}
```

Immediately after that closing `}`, add:

```typescript
// Notify the assigned counselor (best-effort)
try {
  // Look up the counselor's user_id (links to auth profiles)
  const { data: counselorProfile } = await (this.supabase as any)
    .from('admission_counselors')
    .select('user_id, name')
    .eq('id', counselorId)
    .single();

  if (counselorProfile?.user_id) {
    await (this.supabase as any)
      .from('notifications')
      .insert({
        user_id: counselorProfile.user_id,
        type: 'info',
        category: 'admission',
        priority: 'normal',
        title: 'New Lead Assigned to You',
        message: `A lead has been assigned to you. Tap to view and follow up.`,
        metadata: {
          event_type: 'lead_assigned',
          lead_id: leadId,
        },
        action_url: `/admission/leads/${leadId}`,
        action_label: 'View Lead',
        channels: ['in_app'],
      });
  }
} catch (notifErr) {
  console.warn('[LeadService] Could not send counselor assignment notification:', notifErr);
}
```

**Step 2: Commit**
```bash
git add lib/services/admission/lead-service.ts
git commit -m "feat(admission): notify counselor via notifications table on lead assignment"
```

---

## Task 7: Inbound Lead Capture Webhook API

**Files:**
- Create: `app/api/admission/leads/route.ts`

**What:** A public POST endpoint that allows external systems (website forms, Google Ads, Facebook Ads) to push leads directly into the CRM. Authentication uses an `X-API-Key` header validated against a per-institution environment variable. The handler reuses `LeadService.createLead()` so duplicate detection, phone validation, and auto-assignment all apply automatically.

**Authentication design:** For V1, use a simple shared secret. Add `ADMISSION_WEBHOOK_API_KEY` to `.env.local`. A future iteration can store per-institution keys in a DB table.

**Step 1: Add env variable to .env.local**

Open `.env.local` and add:
```
# Admission CRM inbound webhook secret (used by /api/admission/leads POST)
ADMISSION_WEBHOOK_API_KEY=your-secret-key-here
```

Also add to `.env.example` (if it exists):
```
ADMISSION_WEBHOOK_API_KEY=
```

**Step 2: Create the route file**

Create `app/api/admission/leads/route.ts` with:

```typescript
// app/api/admission/leads/route.ts
// Public webhook endpoint for inbound lead capture from external systems.
// Auth: X-API-Key header must match ADMISSION_WEBHOOK_API_KEY env variable.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LeadService } from '@/lib/services/admission/lead-service';

interface WebhookLeadPayload {
  institution_id: string;
  full_name: string;
  phone: string;
  email?: string;
  source?: string;
  interested_programs?: string[];
  utm_source?: string;
  utm_campaign?: string;
  notes?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate API key
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.ADMISSION_WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse and validate body
  let body: WebhookLeadPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { institution_id, full_name, phone, email, source, interested_programs, utm_source, utm_campaign, notes } = body;

  if (!institution_id || !full_name || !phone) {
    return NextResponse.json(
      { error: 'Missing required fields: institution_id, full_name, phone' },
      { status: 422 }
    );
  }

  // 3. Build notes with UTM data if provided
  const enrichedNotes = [
    notes,
    utm_source ? `utm_source: ${utm_source}` : null,
    utm_campaign ? `utm_campaign: ${utm_campaign}` : null,
  ]
    .filter(Boolean)
    .join(' | ') || undefined;

  // 4. Create lead via LeadService (inherits duplicate check, phone validation, auto-assignment)
  try {
    // Webhook uses service-role client — bypasses RLS to allow unauthenticated creates
    const supabase = await createServerSupabaseClient();
    LeadService.setSupabaseClient(supabase);

    const lead = await LeadService.createLead({
      institution_id,
      full_name: full_name.trim(),
      phone,
      email: email || undefined,
      source: (source as any) || 'website',
      interested_programs: interested_programs || [],
      notes: enrichedNotes,
    });

    return NextResponse.json({ id: lead.id, status: 'created' }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create lead';

    // Duplicate lead is a 409 Conflict, not a 500
    if (message.startsWith('Duplicate lead:')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error('[webhook/leads] Failed to create lead:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Important note on `LeadService.setSupabaseClient()`:** Check if `LeadService` supports injecting a custom Supabase client (needed for server-side use with service role). If not, add a static setter method:

In `lead-service.ts`, add to the class:
```typescript
// Allow server-side routes to inject a different supabase client (e.g. service role)
static setSupabaseClient(client: any): void {
  this.supabase = client;
}
```

**Step 3: Test the endpoint**

```bash
curl -X POST http://localhost:3000/api/admission/leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key-here" \
  -d '{
    "institution_id": "your-institution-uuid",
    "full_name": "Test Student",
    "phone": "9876543210",
    "source": "google_ads",
    "utm_source": "google",
    "utm_campaign": "mba-2026"
  }'
```

Expected response: `{ "id": "uuid", "status": "created" }` with HTTP 201.

Test duplicate: send same phone again → HTTP 409 with duplicate message.

**Step 4: Commit**
```bash
git add app/api/admission/leads/route.ts .env.example lib/services/admission/lead-service.ts
git commit -m "feat(admission): add inbound lead capture webhook POST /api/admission/leads"
```

---

## Task 8: Fix RLS Policies on 6 Locked Tables

**Files:**
- Modify: `supabase/setup/03_policies.sql` — append new policy blocks

**What:** Six tables have RLS enabled but no policies, making them inaccessible to client-side queries. Add institution-scoped access policies matching the pattern used by other admission tables.

**Affected tables:**
1. `admission_lead_scores`
2. `admission_tasks`
3. `admission_call_logs`
4. `admission_ai_insights`
5. `admission_daily_briefings`
6. `admission_workflow_configs`

**Step 1: Append to supabase/setup/03_policies.sql**

Add at the end of the file:

```sql
-- Updated: 2026-02-27 — Add missing RLS policies for 6 locked admission tables

-- admission_lead_scores
CREATE POLICY "admission_lead_scores_institution_access"
  ON admission_lead_scores FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- admission_tasks
CREATE POLICY "admission_tasks_institution_access"
  ON admission_tasks FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- admission_call_logs
CREATE POLICY "admission_call_logs_institution_access"
  ON admission_call_logs FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- admission_ai_insights
CREATE POLICY "admission_ai_insights_institution_access"
  ON admission_ai_insights FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- admission_daily_briefings
CREATE POLICY "admission_daily_briefings_institution_access"
  ON admission_daily_briefings FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- admission_workflow_configs
CREATE POLICY "admission_workflow_configs_institution_access"
  ON admission_workflow_configs FOR ALL TO authenticated
  USING (
    institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

**Step 2: Run in Supabase SQL Editor**

Copy the SQL above and run it in the Supabase dashboard SQL Editor. Verify no errors.

**Step 3: Verify with a test query**

In Supabase, switch to anon/user role and test:
```sql
SELECT count(*) FROM admission_lead_scores;
-- Before: ERROR 42501 permission denied
-- After: Returns a count (0 or more)
```

**Step 4: Commit**
```bash
git add supabase/setup/03_policies.sql
git commit -m "fix(admission): add RLS policies to 6 tables that were enabled but had no policies"
```

---

## Task 9: Remove Score Expiry (Simplest Fix for Fix #7)

**Files:**
- Modify: `lib/services/admission/lead-scoring-engine-service.ts:730-746`

**What:** Score expiry currently sets a 7-day deadline but nothing ever re-calculates expired scores — they silently go stale. The simplest fix is to remove the expiry concept entirely. Scores already update on lead activity (the scoring engine is called on activity events). Removing expiry means scores are always "fresh as of last activity" rather than timing out.

**Step 1: Find the expiry block at lines 730-746**

```typescript
// Set expiration to 7 days from now (configurable)
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 7);

const scoreData = {
  ...
  expires_at: expiresAt.toISOString(),
};
```

**Step 2: Remove the expiry lines**

Remove the `expiresAt` calculation and the `expires_at` field from `scoreData`:

```typescript
const scoreData = {
  lead_id: leadId,
  institution_id: institutionId,
  total_score: result.totalScore,
  engagement_score: result.engagementScore,
  quality_score: result.qualityScore,
  score_breakdown: result.breakdown,
  factors: result.factors,
  score_category: result.category,
  recommended_action: result.recommendedAction,
  scoring_rule_id: scoringRuleId,
  calculated_at: new Date().toISOString(),
  // expires_at removed: scores are refreshed on activity, not on time
};
```

**Step 3: Commit**
```bash
git add lib/services/admission/lead-scoring-engine-service.ts
git commit -m "fix(admission): remove score expiry — scores refresh on activity, not on 7-day timer"
```

---

## DEFERRED: Fix #9 — Stage Consolidation (26 → 8)

**Why deferred:** Consolidating 26 stages to 8 requires:
1. DB migration to alter the `funnel_stage` enum
2. Data migration to remap existing lead records to new stages
3. Updates to all UI components, filters, kanban boards, reports that reference stage names
4. Backward compatibility for stage_history records

This is a large, risky change that should be planned in a separate initiative with UAT before execution.

---

## Summary: Execution Order

| Task | Fix | Effort | Risk |
|------|-----|--------|------|
| 1 | Phone validation (backend + frontend) | 15 min | Very low |
| 2 | Duplicate phone detection | 20 min | Low |
| 3 | executeRulesForLead() method | 45 min | Low |
| 4 | Wire auto-assignment into createLead() | 30 min | Low |
| 5 | Stage transition validation | 30 min | Medium (breaks invalid workflows) |
| 6 | Counselor notification | 20 min | Very low |
| 7 | Webhook API endpoint | 45 min | Low |
| 8 | RLS policies for 6 tables | 15 min | Low |
| 9 | Remove score expiry | 10 min | Very low |

**Total estimated implementation time:** ~4 hours

**Recommended execution order:** Tasks 1, 2, 8, 9 first (safest, no behavior change for existing users) → Tasks 3, 4 (new feature) → Task 5 (validate after confirming all stage transitions in use) → Tasks 6, 7 (notifications and webhook).
