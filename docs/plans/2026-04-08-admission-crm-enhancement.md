# Admission CRM Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Enhance the MyJKKN Admission CRM with 6 features inspired by NeoDove — improved post-call disposition, unified quick actions, campaign tags, inbound webhook, productivity dashboard, and mobile counselor screen.

**Architecture:** Extend existing admission module infrastructure (44 services, 77 hooks, 104 API routes). No new frameworks or libraries. All features use existing Supabase tables where possible, adding 2 new tables only for Feature 4 (integrations). Changes are additive — no refactoring of existing code.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (PostgreSQL + RLS), TanStack React Query, shadcn/ui, Tailwind CSS, Exotel (telephony)

---

## Dependency Map

```
Phase 1: Enhanced FloatingCallBar       → SEQUENTIAL (foundation — touches shared types)
Phase 2: Quick Actions Bar              → SEQUENTIAL (depends on Phase 1 disposition types)
Phase 3: Campaign Tags + Source Badges  → PARALLEL-ELIGIBLE (independent columns.tsx)
Phase 4: Inbound Webhook + Integrations → PARALLEL-ELIGIBLE (new tables, new route, new page)
Phase 5: Productivity Dashboard         → PARALLEL-ELIGIBLE (new page, new hook, read-only queries)
Phase 6: Mobile Counselor Screen        → SEQUENTIAL (depends on Phases 1-2 components)
```

---

## Phase 1: Log Call Dialog + Enhanced Disposition (8 tasks)

> **INTERVIEW CORRECTION:** Counselors call from personal phones and log manually. The primary surface is a "Log Call" dialog (new component), NOT the existing FloatingCallBar. FloatingCallBar is kept for rare Exotel calls.

### Task T01: Expand CallDisposition type + add new types

**Files:**
- Modify: `lib/services/telephony/telephony-service.ts:23`

**Step 1:** Update the CallDisposition type (line 23):

```typescript
// BEFORE:
export type CallDisposition = 'interested' | 'not_interested' | 'callback' | 'wrong_number' | 'not_reachable' | 'switched_off' | 'busy' | 'other';

// AFTER:
export type CallDisposition = 'interested' | 'not_interested' | 'callback' | 'wrong_number' | 'not_reachable' | 'switched_off' | 'busy' | 'voicemail' | 'number_changed' | 'connected_no_decision' | 'other';

export type CallOutcome = 'connected' | 'not_answered' | 'busy' | 'wrong_number' | 'voicemail' | 'number_changed';
export type InterestLevel = 'hot' | 'warm' | 'cold' | 'not_interested';
export type NextAction = 'send_brochure' | 'schedule_visit' | 'refer_hod' | 'follow_up' | 'no_action';
```

**Step 2:** Add the extended update input type near `UpdateCallNotesInput`:

```typescript
export interface EnhancedDispositionInput {
  call_id: string;
  call_outcome?: CallOutcome;
  interest_level?: InterestLevel;
  next_action?: NextAction;
  call_notes?: string;
  call_disposition?: CallDisposition;
  follow_up_date?: string | null;
  follow_up_time?: string | null;      // NEW: "14:30"
  suggested_stage?: string | null;      // NEW: stage to suggest
  accept_stage_change?: boolean;        // NEW: did counselor accept suggestion
  send_whatsapp_after?: boolean;        // NEW: open WA dialog after save
}
```

**Step 3:** Verify build:

Run: `cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit 2>&1 | head -20`
Expected: PASS (additive types, nothing broken)

**Step 4:** Commit:
```bash
git add lib/services/telephony/telephony-service.ts
git commit -m "feat(admission): expand call disposition types for enhanced post-call flow"
```

---

### Task T02: Extend updateCallNotes API to update lead fields

**Files:**
- Modify: `app/api/admission/calls/[id]/notes/route.ts`
- Modify: `lib/services/telephony/telephony-service.ts` (add `updateCallWithDisposition` method)

**Step 1:** Read the existing `app/api/admission/calls/[id]/notes/route.ts` to understand current shape.

**Step 2:** Add new service method `updateCallWithDisposition` in telephony-service.ts after the existing `updateCallNotes` method (~line 555):

```typescript
static async updateCallWithDisposition(
  input: EnhancedDispositionInput,
  supabase: any
): Promise<{ call: CallLog; leadUpdated: boolean; reminderCreated: boolean }> {
  // 1. Update the call log record
  const callUpdate: Record<string, any> = {};
  if (input.call_notes !== undefined) callUpdate.call_notes = input.call_notes;
  if (input.call_disposition !== undefined) callUpdate.call_disposition = input.call_disposition;
  if (input.call_outcome) callUpdate.call_outcome = input.call_outcome;
  if (input.interest_level) callUpdate.interest_level = input.interest_level;
  if (input.next_action) callUpdate.next_action = input.next_action;
  if (input.follow_up_date) {
    const followUpDateTime = input.follow_up_time
      ? `${input.follow_up_date}T${input.follow_up_time}:00`
      : input.follow_up_date;
    callUpdate.follow_up_date = followUpDateTime;
  }

  const { data: call, error: callError } = await supabase
    .from('admission_call_logs')
    .update(callUpdate)
    .eq('id', input.call_id)
    .select('*, lead:admission_leads!lead_id(id, funnel_stage, full_name)')
    .single();

  if (callError) throw new Error(callError.message);

  // 2. Update the lead record
  let leadUpdated = false;
  if (call?.lead_id) {
    const leadUpdate: Record<string, any> = {
      last_contact_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Set follow-up on lead
    if (input.follow_up_date) {
      const followUpDateTime = input.follow_up_time
        ? `${input.follow_up_date}T${input.follow_up_time}:00`
        : `${input.follow_up_date}T09:00:00`;
      leadUpdate.next_followup_at = followUpDateTime;
    }

    // Update funnel stage if counselor accepted suggestion
    if (input.accept_stage_change && input.suggested_stage) {
      leadUpdate.funnel_stage = input.suggested_stage;
      leadUpdate.previous_stage = call.lead?.funnel_stage || 'new';
      leadUpdate.stage_changed_at = new Date().toISOString();
    }

    const { error: leadError } = await supabase
      .from('admission_leads')
      .update(leadUpdate)
      .eq('id', call.lead_id);

    if (!leadError) leadUpdated = true;
  }

  // 3. Log activity
  if (call?.lead_id) {
    await supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: call.lead_id,
        activity_type: 'call',
        subject: `Call ${input.call_outcome || 'completed'}`,
        description: [
          input.call_outcome ? `Outcome: ${input.call_outcome}` : null,
          input.interest_level ? `Interest: ${input.interest_level}` : null,
          input.next_action ? `Next: ${input.next_action.replace(/_/g, ' ')}` : null,
          input.call_notes || null,
        ].filter(Boolean).join(' | '),
        outcome: input.call_disposition || null,
        created_by: (await supabase.auth.getUser()).data?.user?.id || null,
      });
  }

  return { call, leadUpdated, reminderCreated: !!input.follow_up_date };
}
```

**Step 3:** Update the PUT handler in `app/api/admission/calls/[id]/notes/route.ts` to call the new method when enhanced fields are present. Keep backward compatibility — if only `call_notes`/`call_disposition`/`follow_up_date` are sent, use old path.

```typescript
// In the PUT handler, after parsing body:
const isEnhanced = body.call_outcome || body.interest_level || body.next_action || body.accept_stage_change !== undefined;

if (isEnhanced) {
  const result = await TelephonyService.updateCallWithDisposition(
    { call_id: callId, ...body },
    supabase
  );
  return NextResponse.json({ success: true, data: result });
} else {
  // Existing path — backward compatible
  const result = await TelephonyService.updateCallNotes(callId, body, supabase);
  return NextResponse.json({ success: true, data: result });
}
```

**Step 4:** Verify:
Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

**Step 5:** Commit:
```bash
git add app/api/admission/calls/[id]/notes/route.ts lib/services/telephony/telephony-service.ts
git commit -m "feat(admission): enhanced disposition API with lead auto-update"
```

---

### Task T03: Add stage suggestion logic

**Files:**
- Create: `lib/utils/admission/stage-suggestions.ts`

**Step 1:** Create the stage suggestion mapping:

```typescript
import type { CallOutcome, InterestLevel } from '@/lib/services/telephony/telephony-service';

interface StageSuggestion {
  suggestedStage: string;
  label: string;
  confidence: 'high' | 'medium';
}

/**
 * Given the current funnel stage, call outcome, and interest level,
 * suggest the next stage the lead should move to.
 * Returns null if no suggestion makes sense.
 */
export function getStageSuggestion(
  currentStage: string | null,
  outcome: CallOutcome | undefined,
  interest: InterestLevel | undefined
): StageSuggestion | null {
  const stage = currentStage || 'new';

  // Only suggest progression, never regression
  if (outcome === 'connected' && interest === 'hot') {
    if (stage === 'new') return { suggestedStage: 'interested', label: 'Interested', confidence: 'high' };
    if (stage === 'contacted') return { suggestedStage: 'interested', label: 'Interested', confidence: 'high' };
    if (stage === 'interested') return { suggestedStage: 'qualified', label: 'Qualified', confidence: 'medium' };
  }

  if (outcome === 'connected' && interest === 'warm') {
    if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
    if (stage === 'contacted') return { suggestedStage: 'follow_up_scheduled', label: 'Follow-up Scheduled', confidence: 'medium' };
  }

  if (outcome === 'connected' && interest === 'cold') {
    if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
  }

  if (outcome === 'connected' && interest === 'not_interested') {
    return { suggestedStage: 'lost', label: 'Lost', confidence: 'medium' };
  }

  if (outcome === 'not_answered' || outcome === 'busy') {
    if (stage === 'new') return { suggestedStage: 'not_reachable', label: 'Not Reachable', confidence: 'medium' };
  }

  if (outcome === 'wrong_number' || outcome === 'number_changed') {
    // Don't suggest — needs manual data correction
    return null;
  }

  // Default for connected with no interest set
  if (outcome === 'connected') {
    if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
  }

  return null;
}
```

**Step 2:** Verify:
Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: PASS

**Step 3:** Commit:
```bash
git add lib/utils/admission/stage-suggestions.ts
git commit -m "feat(admission): stage suggestion engine for post-call disposition"
```

---

### Task T04: Expand useCallMutations hook

**Files:**
- Modify: `hooks/admission/use-call-mutations.ts`

**Step 1:** Import new types at the top:

```typescript
import type {
  CallDisposition,
  EnhancedDispositionInput,
  CallOutcome,
  InterestLevel,
  NextAction,
} from '@/lib/services/telephony/telephony-service';
```

**Step 2:** Add a new mutation alongside existing `updateCallNotes`:

```typescript
const saveEnhancedDisposition = useMutation({
  mutationFn: async (input: EnhancedDispositionInput) => {
    const { call_id, ...body } = input;
    const res = await fetch(`/api/admission/calls/${call_id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save disposition');
    }
    return res.json();
  },
  onSuccess: (data) => {
    toast.success('Call disposition saved');
    // Invalidate all related queries
    queryClient.invalidateQueries({ queryKey: ['call-logs'] });
    queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    queryClient.invalidateQueries({ queryKey: ['call-stats'] });
    queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to save disposition');
  },
});
```

**Step 3:** Export it:
```typescript
return {
  initiateCall,
  updateCallNotes,
  saveEnhancedDisposition, // NEW
  isInitiating: initiateCall.isPending,
  isUpdatingNotes: updateCallNotes.isPending,
  isSavingDisposition: saveEnhancedDisposition.isPending, // NEW
};
```

**Step 4:** Verify:
Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: PASS

**Step 5:** Commit:
```bash
git add hooks/admission/use-call-mutations.ts
git commit -m "feat(admission): add saveEnhancedDisposition mutation to useCallMutations"
```

---

### Task T05: Create LogCallDialog component (NEW — primary disposition surface)

**Files:**
- Create: `components/admission/log-call-dialog.tsx`

**Why new component instead of modifying FloatingCallBar:** FloatingCallBar is tied to Exotel's live call tracking (callLogId, status polling). The Log Call Dialog is a standalone form for manually logging personal phone calls — different trigger, different data flow, different UX.

**Step 1:** Create a new dialog component (~300 lines). Key design:

1. Opens as a **Sheet on mobile** (full screen bottom-up) or **Dialog on desktop**
2. **Outcome radio group** — 5 options as large tap targets (connected, not_answered, busy, wrong_number, voicemail)
3. **Conditional interest level** — only shown when outcome = connected (4 options as colored pills)
4. **Next action** dropdown (5 options)
5. **Notes** textarea (optional)
6. **Follow-up** date + time inputs side-by-side (optional)
7. **Stage suggestion** — computed via `getStageSuggestion()`, shown as pill with accept/dismiss
8. **Two save buttons:** "Save & Close" + "Save & Send WhatsApp"
9. **3-tap minimum path:** Connected → Hot → Save (everything else optional)

**Step 2:** Update imports at top:

```typescript
import { getStageSuggestion } from '@/lib/utils/admission/stage-suggestions';
import type { CallOutcome, InterestLevel, NextAction, EnhancedDispositionInput } from '@/lib/services/telephony/telephony-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

**Step 3:** Update props to include current lead stage and a WhatsApp callback:

```typescript
interface FloatingCallBarProps {
  callLogId: string | null;
  prospectName?: string;
  leadId?: string;
  currentStage?: string | null;        // NEW
  onDismiss: () => void;
  onSendWhatsApp?: (leadId: string) => void; // NEW
}
```

**Step 4:** Replace the expanded panel `{isTerminal && (...)}` block with the new structured disposition form:

- Outcome radio group (6 options, grid-cols-2)
- If outcome === 'connected': Interest level radio group (4 options)
- Next action dropdown (5 options)
- Notes textarea (keep as-is)
- Follow-up: date + time inputs side-by-side
- Stage suggestion: computed via `getStageSuggestion()`, shown as "[Current: X] → [Suggested: Y]" with [Accept]/[Keep Current] buttons
- Action buttons: [Skip] [Save & Close] [Save & Send WhatsApp]

**Step 5:** Replace `handleSave` with the enhanced version:

```typescript
const handleSave = useCallback((sendWhatsApp = false) => {
  if (!callLogId) return;

  const input: EnhancedDispositionInput = {
    call_id: callLogId,
    call_outcome: outcome || undefined,
    interest_level: outcome === 'connected' ? interestLevel || undefined : undefined,
    next_action: nextAction || undefined,
    call_notes: notes || undefined,
    call_disposition: mapOutcomeToDisposition(outcome, interestLevel),
    follow_up_date: followUpDate || null,
    follow_up_time: followUpTime || null,
    suggested_stage: stageSuggestion?.suggestedStage || null,
    accept_stage_change: acceptStage,
    send_whatsapp_after: sendWhatsApp,
  };

  saveEnhancedDisposition.mutate(input, {
    onSuccess: () => {
      if (sendWhatsApp && leadId && onSendWhatsApp) {
        onSendWhatsApp(leadId);
      }
      onDismiss();
    },
  });
}, [callLogId, outcome, interestLevel, nextAction, notes, followUpDate, followUpTime, stageSuggestion, acceptStage, leadId]);
```

**Step 6:** Add helper to map outcome+interest to legacy disposition:

```typescript
function mapOutcomeToDisposition(
  outcome: CallOutcome | '',
  interest: InterestLevel | ''
): CallDisposition | undefined {
  if (!outcome) return undefined;
  if (outcome === 'not_answered') return 'not_reachable';
  if (outcome === 'busy') return 'busy';
  if (outcome === 'wrong_number') return 'wrong_number';
  if (outcome === 'voicemail') return 'not_reachable';
  if (outcome === 'number_changed') return 'number_changed';
  if (outcome === 'connected') {
    if (interest === 'hot' || interest === 'warm') return 'interested';
    if (interest === 'not_interested') return 'not_interested';
    if (interest === 'cold') return 'callback';
    return 'connected_no_decision';
  }
  return 'other';
}
```

**Step 7:** Verify:
Run: `npm run build 2>&1 | tail -5`
Expected: Build passes

**Step 8:** Commit:
```bash
git add components/admission/floating-call-bar.tsx
git commit -m "feat(admission): enhanced floating call bar with structured disposition"
```

---

### Task T06: Mount LogCallDialog on lead detail page as #1 action

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

**Step 1:** Import `LogCallDialog` and add state: `const [showLogCall, setShowLogCall] = useState(false);`

**Step 2:** Add a prominent "Log Call" button as the PRIMARY action on the page — above the existing Quick Actions card, large and visually prominent:

```typescript
<Button 
  size="lg" 
  className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
  onClick={() => setShowLogCall(true)}
>
  <Phone className="h-5 w-5" /> I Just Called This Lead — Log It
</Button>
```

**Step 3:** Mount the dialog:
```typescript
<LogCallDialog
  open={showLogCall}
  onOpenChange={setShowLogCall}
  lead={lead}
  onSendWhatsApp={() => { setShowLogCall(false); setPersonalMsgOpen(true); }}
/>
```

**Step 4:** The lead detail page already has `personalMsgOpen` state and a `SendPersonalMessageDialog`. The `onSendWhatsApp` callback closes LogCallDialog and opens the WA dialog.

**Step 5:** Verify:
Run: `npm run build 2>&1 | tail -5`
Expected: PASS

**Step 6:** Commit:
```bash
git add app/(routes)/admission/leads/[id]/page.tsx
git commit -m "feat(admission): mount Log Call dialog as #1 action on lead detail"
```

---

### Task T07: Add DB columns for enhanced disposition fields

**Files:**
- Create: Supabase migration via MCP

**Step 1:** Add columns to `admission_call_logs` table:

```sql
-- Enhanced disposition fields for admission_call_logs
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS next_action text;

-- Add comment for documentation
COMMENT ON COLUMN admission_call_logs.call_outcome IS 'connected|not_answered|busy|wrong_number|voicemail|number_changed';
COMMENT ON COLUMN admission_call_logs.interest_level IS 'hot|warm|cold|not_interested - only when outcome=connected';
COMMENT ON COLUMN admission_call_logs.next_action IS 'send_brochure|schedule_visit|refer_hod|follow_up|no_action';
```

**Step 2:** Apply via Supabase MCP `apply_migration`:
Name: `add_enhanced_call_disposition_columns`

**Step 3:** Verify columns exist:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'admission_call_logs' AND column_name IN ('call_outcome', 'interest_level', 'next_action');
```
Expected: 3 rows

**Step 4:** Commit migration file.

---

### Task T08: Phase 1 verification

**Step 1:** Full build: `npm run build`
**Step 2:** Type check: `npx tsc --noEmit`
**Step 3:** Verify the complete flow:
- Open lead detail → Click call → FloatingCallBar appears
- Call ends → Enhanced disposition panel auto-expands
- Select outcome → Interest level appears (if connected)
- Set follow-up with time → Save
- Verify lead's `last_contact_at` updated
- Verify lead's `next_followup_at` updated
- Verify stage suggestion shown and accepted

---

## Phase 2: Unified Quick Actions Bar (6 tasks)

### Task T09: Create QuickActionsBar component

**Files:**
- Create: `app/(routes)/admission/leads/[id]/_components/quick-actions-bar.tsx`

**Step 1:** Create a sticky action bar component:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, MessageSquare, Mail, Paperclip, StickyNote, CalendarClock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface QuickActionsBarProps {
  lead: {
    id: string;
    phone: string;
    alternate_phone?: string | null;
    parent_phone?: string | null;
    parent_name?: string | null;
    email?: string | null;
    full_name?: string | null;
  };
  onCall: (phone: string) => void;
  onWhatsApp: () => void;
  onSMS: () => void;
  onEmail: () => void;
  onAttach: () => void;
  onNote: () => void;
  onFollowUp: () => void;
  isWAConnected?: boolean;
}

export function QuickActionsBar({ lead, onCall, onWhatsApp, onSMS, onEmail, onAttach, onNote, onFollowUp, isWAConnected }: QuickActionsBarProps) {
  const phones = [
    lead.phone && { label: 'Primary', number: lead.phone },
    lead.alternate_phone && { label: 'Alternate', number: lead.alternate_phone },
    lead.parent_phone && { label: `Parent${lead.parent_name ? ` (${lead.parent_name})` : ''}`, number: lead.parent_phone },
  ].filter(Boolean) as { label: string; number: string }[];

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Call with phone picker */}
        {phones.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Phone className="h-4 w-4" /> Call
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {phones.map((p) => (
                <DropdownMenuItem key={p.number} onClick={() => onCall(p.number)}>
                  {p.label}: {p.number}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCall(lead.phone)}>
            <Phone className="h-4 w-4" /> Call
          </Button>
        )}

        {/* WhatsApp */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onWhatsApp}
                disabled={!isWAConnected}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </TooltipTrigger>
            {!isWAConnected && (
              <TooltipContent>Connect Personal WhatsApp in Settings</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* SMS */}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onSMS}>
          <MessageSquare className="h-4 w-4" /> SMS
        </Button>

        {/* Email */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onEmail}
                disabled={!lead.email}
              >
                <Mail className="h-4 w-4" /> Email
              </Button>
            </TooltipTrigger>
            {!lead.email && (
              <TooltipContent>No email address — add one first</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <div className="h-4 border-l mx-1" />

        {/* Attach */}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onAttach}>
          <Paperclip className="h-4 w-4" /> Attach
        </Button>

        {/* Note */}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onNote}>
          <StickyNote className="h-4 w-4" /> Note
        </Button>

        {/* Follow-up */}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onFollowUp}>
          <CalendarClock className="h-4 w-4" /> Follow-up
        </Button>
      </div>
    </div>
  );
}
```

**Step 2:** Verify: `npx tsc --noEmit`
**Step 3:** Commit.

---

### Task T10: Mount QuickActionsBar on lead detail page

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

**Step 1:** Import `QuickActionsBar` and mount it after breadcrumb, before the tabs/content area.

**Step 2:** Wire the callbacks:
- `onCall` → existing `initiateCall.mutate(...)` from `useCallMutations()`
- `onWhatsApp` → `setPersonalMsgOpen(true)` (already exists)
- `onSMS` → `setShowSendMsg(true); setSendChannel('sms')` (already exists)
- `onEmail` → `setShowEmailDialog(true)` (new state, new dialog — Task T11)
- `onNote` → `setShowActivityDialog(true); setActivityType('note')` (already exists)
- `onFollowUp` → `setShowFollowupDialog(true)` (already exists)
- `onAttach` → `setShowAttachDialog(true)` (new state — Task T12)
- `isWAConnected` → from `usePersonalWhatsAppStatus` (already fetched)

**Step 3:** Verify build passes.
**Step 4:** Commit.

---

### Task T11: Add Quick Email dialog

**Files:**
- Create: `app/(routes)/admission/leads/[id]/_components/send-email-dialog.tsx`

**Step 1:** Create a dialog with: To (pre-filled from lead.email), Subject input, Template picker (from `useActiveTemplates(institutionId, 'email')`), Body textarea, Send button.

**Step 2:** Send via existing `/api/admission/email/send` endpoint.

**Step 3:** Verify + Commit.

---

### Task T12: Add document attach capability

**Files:**
- Create: `app/(routes)/admission/leads/[id]/_components/attach-document-dialog.tsx`

**Step 1:** Create file upload dialog → Supabase Storage bucket `admission-lead-documents`.

**Step 2:** Store reference in `admission_lead_activities` with `activity_type: 'note'` and attachment URL in `description`.

**Step 3:** Verify + Commit.

---

### Task T13: Phase 2 build verification

Run: `npm run build && npx tsc --noEmit`

---

### Task T14: Phase 2 commit

```bash
git add -A
git commit -m "feat(admission): unified quick actions bar on lead detail page"
```

---

## Phase 3: Campaign Tags & Source Badges (4 tasks)

### Task T15: Create source badge utility

**Files:**
- Create: `app/(routes)/admission/leads/_components/source-badge.tsx`

```typescript
import { Badge } from '@/components/ui/badge';

const SOURCE_COLORS: Record<string, string> = {
  facebook_ads: 'bg-blue-100 text-blue-800 border-blue-200',
  google_ads: 'bg-red-100 text-red-800 border-red-200',
  referral: 'bg-green-100 text-green-800 border-green-200',
  walk_in: 'bg-orange-100 text-orange-800 border-orange-200',
  education_fair: 'bg-purple-100 text-purple-800 border-purple-200',
  social_media: 'bg-pink-100 text-pink-800 border-pink-200',
  website: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  newspaper: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  agent: 'bg-teal-100 text-teal-800 border-teal-200',
  publisher: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

const SOURCE_LABELS: Record<string, string> = {
  facebook_ads: 'Facebook',
  google_ads: 'Google',
  referral: 'Referral',
  walk_in: 'Walk-in',
  education_fair: 'Edu Fair',
  social_media: 'Social',
  website: 'Website',
  newspaper: 'Press',
  agent: 'Agent',
  publisher: 'Publisher',
  other: 'Other',
};

export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  return (
    <Badge variant="outline" className={`text-[10px] ${SOURCE_COLORS[source] || SOURCE_COLORS.other}`}>
      {SOURCE_LABELS[source] || source}
    </Badge>
  );
}
```

---

### Task T16: Add source badges and follow-up indicator to lead columns

**Files:**
- Modify: `app/(routes)/admission/leads/_components/columns.tsx`

**Step 1:** Import `SourceBadge` and add it to the `full_name` column cell, below the lead name link.

**Step 2:** Add overdue follow-up indicator:
```typescript
// Inside the full_name column cell:
{lead.next_followup_at && new Date(lead.next_followup_at) < new Date() && (
  <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
    Overdue
  </Badge>
)}
```

**Step 3:** Verify + Commit:
```bash
git commit -m "feat(admission): source badges and overdue indicators on lead list"
```

---

### Task T17: Add campaign badge to lead row (query campaign_queue)

**Files:**
- Modify: `app/(routes)/admission/leads/_components/columns.tsx`
- Modify: `app/(routes)/admission/leads/_components/leads-data-table.tsx`

**Step 1:** In `fetchData` (leads-data-table), join or batch-query `admission_campaign_queue` to get active campaign names per lead. Or: add a lightweight API call after leads load.

**Step 2:** Show campaign name badge on lead rows where applicable.

**Step 3:** Verify + Commit.

---

### Task T18: Phase 3 build verification + commit

Run: `npm run build`

---

## Phase 4: Generic Inbound Webhook + Integration Dashboard (8 tasks)

### Task T19: Create DB tables for integrations

**Files:**
- Supabase migration via MCP

**SQL:**
```sql
-- Integration source tracking for admission leads
CREATE TABLE IF NOT EXISTS admission_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('facebook_ads', 'google_sheets', 'webhook', 'justdial', 'indiamart', 'shiksha', 'collegedunia', 'custom_api')),
  config jsonb NOT NULL DEFAULT '{}',
  field_mapping jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  total_leads integer NOT NULL DEFAULT 0,
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admission_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES admission_integrations(id) ON DELETE SET NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES admission_leads(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('success', 'duplicate', 'validation_error', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_admission_integrations_institution ON admission_integrations(institution_id);
CREATE INDEX idx_admission_integration_logs_integration ON admission_integration_logs(integration_id);
CREATE INDEX idx_admission_integration_logs_created ON admission_integration_logs(created_at DESC);

-- RLS
ALTER TABLE admission_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their institution integrations"
  ON admission_integrations FOR SELECT
  USING (institution_id = auth.jwt() ->> 'institution_id' OR auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Admins can manage their institution integrations"
  ON admission_integrations FOR ALL
  USING (institution_id = auth.jwt() ->> 'institution_id' OR auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Users can view their institution integration logs"
  ON admission_integration_logs FOR SELECT
  USING (institution_id = auth.jwt() ->> 'institution_id' OR auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "System can insert integration logs"
  ON admission_integration_logs FOR INSERT
  WITH CHECK (true);
```

---

### Task T20: Create integration service

**Files:**
- Create: `lib/services/admission/integration-service.ts`

Methods:
- `getIntegrations(institutionId)` → list all for institution
- `createIntegration(input)` → create new
- `updateIntegration(id, input)` → update
- `deleteIntegration(id)` → delete
- `processInboundLead(integrationId, payload)` → deduplicate, map fields, create lead, log
- `getIntegrationLogs(integrationId, pagination)` → paginated logs

---

### Task T21: Create inbound webhook API route

**Files:**
- Create: `app/api/admission/leads/inbound/route.ts`

**Auth:** API key via `withAuth` with `allowApiKey: true`.

**POST handler:**
1. Parse body
2. Find matching integration by API key's `organization_id`
3. Call `IntegrationService.processInboundLead()`
4. Return `{ success, lead_id, is_duplicate }`

---

### Task T22: Create integration hooks

**Files:**
- Create: `hooks/admission/use-integrations.ts`

Hooks:
- `useIntegrations(institutionId)` — list
- `useIntegrationMutations()` — create, update, delete
- `useIntegrationLogs(integrationId)` — paginated logs

---

### Task T23: Create Integration Dashboard settings page

**Files:**
- Create: `app/(routes)/admission/settings/integrations/page.tsx`
- Create: `app/(routes)/admission/settings/integrations/_components/integration-card.tsx`
- Create: `app/(routes)/admission/settings/integrations/_components/add-integration-dialog.tsx`

UI: Table of integrations + "Add New" card grid showing available types.

---

### Task T24: Create API routes for integration CRUD

**Files:**
- Create: `app/api/admission/integrations/route.ts` (GET, POST)
- Create: `app/api/admission/integrations/[id]/route.ts` (GET, PUT, DELETE)
- Create: `app/api/admission/integrations/[id]/logs/route.ts` (GET)

---

### Task T25: Create Agent Referral Form (public, no auth)

**Files:**
- Create: `app/(routes)/refer/page.tsx` (public route — outside of auth-protected layout)
- Create: `app/api/admission/leads/refer/route.ts` (public API — rate limited)

**Step 1:** Create a simple, mobile-optimized form at `/refer`:
- Fields: Student Name, Phone* (required), Email, Program (dropdown from institutions), Agent Name* (required), Agent Phone* (required), Notes
- No login required — public page
- Branded with JKKN logo and "Refer a Student" header
- Success state shows reference number

**Step 2:** Create API route that:
1. Rate limits by IP (10/hour)
2. Validates phone (required, Indian format), agent name (required), agent phone (required)
3. Deduplicates by phone in `admission_leads`
4. Creates lead with `source: 'agent'`, `referral_type: 'consultant'`, `referred_by_name`, `referred_by_id` (if agent found in `education_consultants` table by phone)
5. Applies assignment rules
6. Logs to `admission_integration_logs`
7. Returns `{ success: true, reference: 'JKKN-REF-00234' }`

**Step 3:** Verify + Commit.

---

### Task T25b: Add sidebar link for integrations

**Files:**
- Modify: `lib/sidebarMenuLink.ts` (add integrations under admission settings)

---

### Task T26: Phase 4 build verification + commit

Run: `npm run build`

---

## Phase 5: Counselor Productivity Dashboard (6 tasks)

### Task T27: Create productivity service

**Files:**
- Create: `lib/services/admission/counselor-productivity-service.ts`

Methods:
- `getTeamProductivityKPIs(institutionId, date)` → aggregate KPI cards
- `getCounselorProductivityTable(institutionId, date)` → per-counselor rows
- `getHourlyActivityHeatmap(institutionId, date)` → hourly bucketed activity

Data sources (all existing tables):
- `admission_call_logs` → calls attempted, connected, duration
- `wa_conversations`/`wa_messages` → WhatsApp sent count
- `admission_leads` → stage changes (count where stage_changed_at is today)
- `admission_leads` → response time (first activity after assigned_at)

---

### Task T28: Create productivity hooks

**Files:**
- Create: `hooks/admission/use-counselor-productivity.ts`

Hooks with 60-second refetchInterval:
- `useTeamProductivityKPIs(institutionId, date)`
- `useCounselorProductivityTable(institutionId, date)`
- `useHourlyActivityHeatmap(institutionId, date)`

---

### Task T29: Create productivity API routes

**Files:**
- Create: `app/api/admission/counselors/productivity/route.ts` (GET — returns KPIs + table)
- Create: `app/api/admission/counselors/productivity/heatmap/route.ts` (GET — returns hourly data)

---

### Task T30: Create productivity dashboard page

**Files:**
- Create: `app/(routes)/admission/counselors/productivity/page.tsx`
- Create: `app/(routes)/admission/counselors/productivity/_components/kpi-cards.tsx`
- Create: `app/(routes)/admission/counselors/productivity/_components/counselor-table.tsx`
- Create: `app/(routes)/admission/counselors/productivity/_components/activity-heatmap.tsx`

Page layout:
1. Date picker (defaults to today) + auto-refresh indicator
2. KPI cards row (7 cards)
3. Per-counselor data table (sortable)
4. Hourly heatmap (grid with colored cells)

---

### Task T31: Add sidebar link for productivity

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

Add "Productivity" under Admission > Counselors.

---

### Task T32: Phase 5 build verification + commit

Run: `npm run build`

---

## Phase 6: Mobile Counselor Calling Screen (7 tasks)

### Task T33: Create smart lead queue hook

**Files:**
- Create: `hooks/admission/use-lead-work-queue.ts`

Returns counselor's assigned leads ordered by:
1. Overdue follow-ups (past `next_followup_at`)
2. Hot leads without recent contact (>4 hours since `last_contact_at`)
3. New leads (most recent first)
4. Other assigned leads

Includes navigation: `currentIndex`, `next()`, `prev()`, `skip()`.

---

### Task T34: Create mobile lead card component

**Files:**
- Create: `app/(routes)/admission/leads/work/_components/lead-card.tsx`

Shows: name, score, phone, program interest, source badge, last contact, follow-up, overdue indicator.

---

### Task T35: Create mobile quick actions component

**Files:**
- Create: `app/(routes)/admission/leads/work/_components/mobile-actions.tsx`

Grid of 4 buttons: Call, WhatsApp, SMS, Notes.

---

### Task T36: Create mobile timeline snippet component

**Files:**
- Create: `app/(routes)/admission/leads/work/_components/timeline-snippet.tsx`

Shows last 3 timeline entries with "See full history →" link.

---

### Task T37: Create mobile work page

**Files:**
- Create: `app/(routes)/admission/leads/work/page.tsx`

Assembles: header (back + count), lead card, quick actions, timeline snippet, prev/next navigation, bottom nav.

Uses touch gestures via CSS scroll-snap or React swipeable.

---

### Task T38: Add bottom navigation for counselor mobile

**Files:**
- Create: `app/(routes)/admission/leads/work/_components/bottom-nav.tsx`

4 tabs: Today, Leads, Call, Tasks. Uses existing `mobile-bottom-navbar` pattern.

---

### Task T39: Phase 6 build verification + final commit

Run: `npm run build`

Final commit:
```bash
git commit -m "feat(admission): mobile counselor calling screen with smart lead queue"
```

---

## Verification Checklist (End of All Phases)

| Check | Command | Expected |
|-------|---------|----------|
| Build | `npm run build` | PASS |
| Types | `npx tsc --noEmit` | PASS |
| FloatingCallBar | Browser test on lead detail | Disposition panel shows after call |
| Quick Actions | Browser test on lead detail | All 7 buttons functional |
| Source Badges | Browser test on lead list | Colored badges on each lead row |
| Inbound Webhook | `curl -X POST /api/admission/leads/inbound` | Returns lead_id |
| Productivity | Browse `/admission/counselors/productivity` | KPI cards + table render |
| Mobile | Browse `/admission/leads/work` on mobile viewport | Card stack + actions work |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| FloatingCallBar not mounted on lead detail (may be in layout) | Search for existing mount point; add if missing |
| `admission_call_logs` might not have `lead_id` for all calls | Filter to admission calls only (`is_admission_call = true`) |
| RLS policies may block enhanced API calls | Use service role client for cross-table updates in API routes |
| Campaign queue table structure may differ from expected | Verify via `SELECT * FROM admission_campaign_queue LIMIT 1` before building Feature 3 |
| Mobile touch gestures may conflict with scroll | Use `scroll-snap` CSS, not JS gesture library |
| Productivity queries may be slow on large datasets | Add date-scoped indexes; limit to today by default |
