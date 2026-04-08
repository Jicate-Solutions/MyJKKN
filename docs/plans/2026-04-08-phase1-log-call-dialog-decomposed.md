# Phase 1: Log Call Dialog — Decomposed Tasks

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Create a prominent "Log Call" dialog on the lead detail page that lets counselors log personal phone call outcomes in 3 taps (outcome → interest → save), with auto-update of lead fields.

**Architecture:** New `LogCallDialog` component + new API handler + extended types. Does NOT modify FloatingCallBar (that stays for Exotel calls).

**Tech Stack:** shadcn/ui Sheet (mobile) + Dialog (desktop), React Hook Form not needed (simple state), existing `useCallMutations` hook extended.

---

## Pre-flight Checks

### PF-1: Verify build is clean
Run: `cd /Users/omm/PROJECTS/MyJKKN && npm run build 2>&1 | tail -3`
Expected: Build passes. If not, fix before proceeding.

### PF-2: Verify existing types
Run: `grep -n "CallDisposition" lib/services/telephony/telephony-service.ts | head -5`
Expected: Line ~23 shows the type definition.

### PF-3: Verify existing call notes API
Run: `cat app/api/admission/calls/\[id\]/notes/route.ts | head -30`
Expected: PUT handler exists.

---

## Batch A: Types & Utility (4 micro-tasks, ~10 min)

### A1: Add new type aliases to telephony service

**File:** `lib/services/telephony/telephony-service.ts`
**Action:** Add 4 new types AFTER line 23 (after existing `CallDisposition`). Do NOT modify `CallDisposition` itself — keep backward compat.

**Add:**
```typescript
export type CallOutcome = 'connected' | 'not_answered' | 'busy' | 'wrong_number' | 'voicemail';
export type InterestLevel = 'hot' | 'warm' | 'cold' | 'not_interested';
export type NextAction = 'send_brochure' | 'schedule_visit' | 'refer_hod' | 'follow_up' | 'no_action';
```

**Verify:** `npx tsc --noEmit 2>&1 | head -5` → no new errors
**Commit:** `git commit -m "feat(admission): add CallOutcome, InterestLevel, NextAction types"`

---

### A2: Add LogCallInput interface to telephony service

**File:** `lib/services/telephony/telephony-service.ts`
**Action:** Add interface after the new types from A1:

```typescript
export interface LogCallInput {
  lead_id: string;
  institution_id: string;
  counselor_id?: string;
  phone_called: string;
  call_outcome: CallOutcome;
  interest_level?: InterestLevel;
  next_action?: NextAction;
  call_notes?: string;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  suggested_stage?: string | null;
  accept_stage_change?: boolean;
}
```

**Verify:** `npx tsc --noEmit 2>&1 | head -5` → no new errors
**Commit:** `git commit -m "feat(admission): add LogCallInput interface"`

---

### A3: Create stage suggestion utility

**File:** Create `lib/utils/admission/stage-suggestions.ts`
**Action:** Create the file with the `getStageSuggestion()` function.

This is a pure function — takes (currentStage, outcome, interest) and returns a suggestion or null. Rules:

| Current Stage | Outcome | Interest | Suggestion |
|---|---|---|---|
| new | connected | hot | → interested |
| new | connected | warm | → contacted |
| new | connected | cold | → contacted |
| new | connected | not_interested | → lost |
| new | not_answered/busy | any | → not_reachable |
| contacted | connected | hot | → interested |
| contacted | connected | warm | → follow_up_scheduled |
| interested | connected | hot | → qualified |
| any | connected | not_interested | → lost |
| any | wrong_number | any | null (needs manual fix) |

**Verify:** `npx tsc --noEmit 2>&1 | head -5` → no new errors
**Commit:** `git commit -m "feat(admission): stage suggestion engine for call disposition"`

---

### A4: Create outcome-to-disposition mapper utility

**File:** Add to `lib/utils/admission/stage-suggestions.ts`
**Action:** Add function that maps new types to legacy `CallDisposition` for backward compat:

```typescript
export function mapOutcomeToDisposition(
  outcome: CallOutcome,
  interest?: InterestLevel
): CallDisposition {
  if (outcome === 'not_answered') return 'not_reachable';
  if (outcome === 'busy') return 'busy';
  if (outcome === 'wrong_number') return 'wrong_number';
  if (outcome === 'voicemail') return 'not_reachable';
  // connected
  if (interest === 'hot' || interest === 'warm') return 'interested';
  if (interest === 'not_interested') return 'not_interested';
  if (interest === 'cold') return 'callback';
  return 'other';
}
```

**Verify:** `npx tsc --noEmit` → pass
**Commit:** `git commit -m "feat(admission): outcome-to-disposition mapper"`

---

## Batch B: API Layer (3 micro-tasks, ~10 min)

### B1: Add `logManualCall` method to telephony service

**File:** `lib/services/telephony/telephony-service.ts`
**Action:** Add a new static method AFTER `updateCallNotes` (~line 555):

```typescript
static async logManualCall(input: LogCallInput, supabase: any): Promise<{
  callLog: any;
  leadUpdated: boolean;
}> {
  const disposition = mapOutcomeToDisposition(input.call_outcome, input.interest_level);
  
  // 1. Create call log entry
  const followUpDateTime = input.follow_up_date
    ? input.follow_up_time
      ? `${input.follow_up_date}T${input.follow_up_time}:00`
      : `${input.follow_up_date}T09:00:00`
    : null;

  const { data: callLog, error: callError } = await supabase
    .from('admission_call_logs')
    .insert({
      institution_id: input.institution_id,
      lead_id: input.lead_id,
      counselor_id: input.counselor_id || null,
      direction: 'outbound',
      status: 'completed',
      call_disposition: disposition,
      from_number: 'manual',
      to_number: input.phone_called,
      duration_seconds: 0,
      call_notes: input.call_notes || null,
      follow_up_date: followUpDateTime,
      is_admission_call: true,
    })
    .select()
    .single();

  if (callError) throw new Error(`Failed to log call: ${callError.message}`);

  // 2. Update lead record
  const leadUpdate: Record<string, any> = {
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (followUpDateTime) {
    leadUpdate.next_followup_at = followUpDateTime;
  }

  if (input.accept_stage_change && input.suggested_stage) {
    leadUpdate.previous_stage = undefined; // Will be set from current value
    leadUpdate.funnel_stage = input.suggested_stage;
    leadUpdate.stage_changed_at = new Date().toISOString();
  }

  // Get current stage for previous_stage tracking
  if (input.accept_stage_change && input.suggested_stage) {
    const { data: currentLead } = await supabase
      .from('admission_leads')
      .select('funnel_stage')
      .eq('id', input.lead_id)
      .single();
    if (currentLead) {
      leadUpdate.previous_stage = currentLead.funnel_stage;
    }
  }

  const { error: leadError } = await supabase
    .from('admission_leads')
    .update(leadUpdate)
    .eq('id', input.lead_id);

  // 3. Log activity
  await supabase
    .from('admission_lead_activities')
    .insert({
      lead_id: input.lead_id,
      activity_type: 'call',
      subject: `Call ${input.call_outcome}`,
      description: [
        `Outcome: ${input.call_outcome}`,
        input.interest_level ? `Interest: ${input.interest_level}` : null,
        input.next_action ? `Next: ${input.next_action.replace(/_/g, ' ')}` : null,
        input.call_notes || null,
      ].filter(Boolean).join(' | '),
      outcome: disposition,
      created_by: input.counselor_id || null,
    });

  return { callLog, leadUpdated: !leadError };
}
```

**Import needed at top of file:**
```typescript
import { mapOutcomeToDisposition } from '@/lib/utils/admission/stage-suggestions';
```

**Verify:** `npx tsc --noEmit` → pass
**Commit:** `git commit -m "feat(admission): logManualCall service method"`

---

### B2: Create API route for manual call logging

**File:** Create `app/api/admission/calls/log/route.ts`
**Action:** POST handler that calls `TelephonyService.logManualCall()`.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAuthSession } from '@/lib/auth/session';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import type { LogCallInput } from '@/lib/services/telephony/telephony-service';

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  
  // Validate required fields
  if (!body.lead_id || !body.institution_id || !body.call_outcome || !body.phone_called) {
    return NextResponse.json(
      { error: 'lead_id, institution_id, call_outcome, and phone_called are required' },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  try {
    const input: LogCallInput = {
      lead_id: body.lead_id,
      institution_id: body.institution_id,
      counselor_id: session.user.id,
      phone_called: body.phone_called,
      call_outcome: body.call_outcome,
      interest_level: body.interest_level,
      next_action: body.next_action,
      call_notes: body.call_notes,
      follow_up_date: body.follow_up_date,
      follow_up_time: body.follow_up_time,
      suggested_stage: body.suggested_stage,
      accept_stage_change: body.accept_stage_change,
    };

    const result = await TelephonyService.logManualCall(input, supabase);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to log call' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
```

**Verify:** `npx tsc --noEmit` → pass
**Commit:** `git commit -m "feat(admission): POST /api/admission/calls/log for manual call logging"`

---

### B3: Add `logManualCall` mutation to useCallMutations hook

**File:** `hooks/admission/use-call-mutations.ts`
**Action:** Add new mutation alongside existing ones:

```typescript
const logManualCall = useMutation({
  mutationFn: async (input: LogCallInput) => {
    const res = await fetch('/api/admission/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to log call');
    }
    return res.json();
  },
  onSuccess: () => {
    toast.success('Call logged');
    queryClient.invalidateQueries({ queryKey: ['call-logs'] });
    queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
    queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
    queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
    queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    queryClient.invalidateQueries({ queryKey: ['call-stats'] });
    queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to log call');
  },
});
```

**Add to imports:**
```typescript
import type { LogCallInput } from '@/lib/services/telephony/telephony-service';
```

**Add to return object:**
```typescript
return {
  initiateCall,
  updateCallNotes,
  logManualCall, // NEW
  isInitiating: initiateCall.isPending,
  isUpdatingNotes: updateCallNotes.isPending,
  isLoggingCall: logManualCall.isPending, // NEW
};
```

**Verify:** `npx tsc --noEmit` → pass
**Commit:** `git commit -m "feat(admission): add logManualCall to useCallMutations hook"`

---

## Batch C: UI Component (5 micro-tasks, ~20 min)

### C1: Create LogCallDialog shell — open/close + header

**File:** Create `components/admission/log-call-dialog.tsx`
**Action:** Start with the shell — a responsive dialog that's a Sheet on mobile, Dialog on desktop.

```typescript
'use client';

import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query'; // check if this exists, else use window.innerWidth
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Phone } from 'lucide-react';

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    funnel_stage: string | null;
    institution_id?: string;
  } | null;
  onSendWhatsApp?: () => void;
}

export function LogCallDialog({ open, onOpenChange, lead, onSendWhatsApp }: LogCallDialogProps) {
  if (!lead) return null;

  // TODO: Check if useMediaQuery hook exists. If not, use a simple check.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const content = (
    <LogCallForm
      lead={lead}
      onClose={() => onOpenChange(false)}
      onSendWhatsApp={onSendWhatsApp}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Log Call — {lead.full_name || 'Unknown'}
            </SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Log Call — {lead.full_name || 'Unknown'}
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// Placeholder — built in C2-C5
function LogCallForm({ lead, onClose, onSendWhatsApp }: {
  lead: LogCallDialogProps['lead'] & {};
  onClose: () => void;
  onSendWhatsApp?: () => void;
}) {
  return <div className="py-4 text-muted-foreground">Form coming next...</div>;
}
```

**Verify:** `npx tsc --noEmit` → pass (placeholder is fine)
**Commit:** `git commit -m "feat(admission): LogCallDialog shell with responsive sheet/dialog"`

---

### C2: Add outcome selection to LogCallForm

**File:** `components/admission/log-call-dialog.tsx`
**Action:** Replace the placeholder `LogCallForm` with the first section — outcome radio buttons as large, tappable cards:

```typescript
function LogCallForm({ lead, onClose, onSendWhatsApp }: { ... }) {
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  // ... more state in C3-C5

  const OUTCOMES: { value: CallOutcome; label: string; icon: string }[] = [
    { value: 'connected', label: 'Connected', icon: '✅' },
    { value: 'not_answered', label: 'Not Answered', icon: '❌' },
    { value: 'busy', label: 'Busy', icon: '📵' },
    { value: 'wrong_number', label: 'Wrong Number', icon: '❓' },
    { value: 'voicemail', label: 'Voicemail', icon: '📞' },
  ];

  return (
    <div className="space-y-4 py-4">
      <div>
        <p className="text-sm font-medium mb-2">Did they pick up?</p>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                outcome === o.value
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-border hover:bg-muted'
              )}
            >
              <span>{o.icon}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Interest level, next action, notes, follow-up — added in C3-C5 */}
    </div>
  );
}
```

**Verify:** `npm run build` → pass
**Commit:** `git commit -m "feat(admission): LogCallDialog outcome selection UI"`

---

### C3: Add interest level + next action sections

**File:** `components/admission/log-call-dialog.tsx`
**Action:** Add BELOW the outcome grid, conditionally shown when `outcome === 'connected'`:

- Interest level: 4 colored pills (Hot=red, Warm=orange, Cold=blue, Not Interested=gray)
- Next action: Select dropdown (5 options)

**Verify:** `npm run build` → pass
**Commit:** `git commit -m "feat(admission): LogCallDialog interest level + next action"`

---

### C4: Add notes + follow-up + stage suggestion sections

**File:** `components/admission/log-call-dialog.tsx`
**Action:** Add below interest level:

- Notes textarea (optional, 3 rows)
- Follow-up: date input + time input side-by-side (optional)
- Stage suggestion: Computed via `getStageSuggestion(lead.funnel_stage, outcome, interest)`. If non-null, show: `[Current: New] → [Suggested: Contacted] [Accept ✓] [Keep]`

**Verify:** `npm run build` → pass
**Commit:** `git commit -m "feat(admission): LogCallDialog notes, follow-up, stage suggestion"`

---

### C5: Add save handlers and wire to hook

**File:** `components/admission/log-call-dialog.tsx`
**Action:** Add two buttons at bottom:

- "Save & Close" → calls `logManualCall.mutate(input)` → `onClose()`
- "Save & Send WhatsApp" → calls `logManualCall.mutate(input)` → `onClose()` → `onSendWhatsApp()`

Wire the `useCallMutations()` hook inside LogCallForm:

```typescript
const { logManualCall, isLoggingCall } = useCallMutations();
const { profile } = useAuth();
const { selectedInstitutionId } = useUserInstitutionAccess();

const handleSave = (sendWhatsApp = false) => {
  if (!outcome) return;
  logManualCall.mutate({
    lead_id: lead.id,
    institution_id: lead.institution_id || selectedInstitutionId || '',
    counselor_id: profile?.id,
    phone_called: lead.phone,
    call_outcome: outcome,
    interest_level: outcome === 'connected' ? interest || undefined : undefined,
    next_action: nextAction || undefined,
    call_notes: notes || undefined,
    follow_up_date: followUpDate || null,
    follow_up_time: followUpTime || null,
    suggested_stage: stageSuggestion?.suggestedStage || null,
    accept_stage_change: acceptStage,
  }, {
    onSuccess: () => {
      onClose();
      if (sendWhatsApp && onSendWhatsApp) onSendWhatsApp();
    },
  });
};
```

**Verify:** `npm run build` → pass
**Commit:** `git commit -m "feat(admission): LogCallDialog save handlers wired to API"`

---

## Batch D: Integration & Polish (3 micro-tasks, ~10 min)

### D1: Mount LogCallDialog on lead detail page

**File:** `app/(routes)/admission/leads/[id]/page.tsx`
**Action:**

1. Add import: `import { LogCallDialog } from '@/components/admission/log-call-dialog';`
2. Add state: `const [showLogCall, setShowLogCall] = useState(false);`
3. Add prominent button BEFORE the existing Quick Actions card (find the first Card after breadcrumb):
```typescript
<Button 
  size="lg" 
  className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white mb-4"
  onClick={() => setShowLogCall(true)}
>
  <Phone className="h-5 w-5" /> I Just Called — Log It
</Button>
```
4. Mount dialog at end of component:
```typescript
<LogCallDialog
  open={showLogCall}
  onOpenChange={setShowLogCall}
  lead={lead}
  onSendWhatsApp={() => { setShowLogCall(false); setPersonalMsgOpen(true); }}
/>
```

**Verify:** `npm run build` → pass
**Commit:** `git commit -m "feat(admission): mount Log Call dialog on lead detail page as #1 action"`

---

### D2: Add DB columns for new call fields (if needed)

**File:** Supabase migration via MCP
**Action:** Check if `admission_call_logs` already has `call_outcome`, `interest_level`, `next_action` columns. If not, add them:

```sql
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS next_action text;
```

**Verify:** Query the table to confirm columns exist.
**Commit:** migration file.

---

### D3: Full Phase 1 verification

**Step 1:** `npm run build` → must pass
**Step 2:** `npx tsc --noEmit` → must pass
**Step 3:** Browser test: Open a lead → see "I Just Called — Log It" button → click → dialog opens → select Connected → select Hot → Save → verify lead's `last_contact_at` updated in DB

---

## Summary

| Batch | Tasks | Total Steps | Files Touched |
|-------|-------|-------------|---------------|
| A: Types & Utility | A1-A4 | 4 | 2 files (telephony-service.ts, stage-suggestions.ts) |
| B: API Layer | B1-B3 | 3 | 3 files (telephony-service.ts, route.ts, hook.ts) |
| C: UI Component | C1-C5 | 5 | 1 file (log-call-dialog.tsx) built incrementally |
| D: Integration | D1-D3 | 3 | 2 files (lead detail page, migration) |
| **Total** | **15 tasks** | **15 commits** | **~6 files** |

**Dependency chain:** A → B → C → D (strictly sequential)

**Critical path:** The LogCallForm (C2-C5) is the most UI-intensive part. Each sub-task adds one section to the form, so if any section has issues, it doesn't block the others.
