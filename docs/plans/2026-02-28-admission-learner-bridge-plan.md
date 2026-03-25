# Admission → Learner Bridge: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `first_name`/`last_name` to `admission_leads` and implement a one-click "Convert to Learner Enquiry" button on the application detail page that pre-fills a learner profile draft and redirects staff to complete it.

**Architecture:** Server-side API route (`POST /api/admission/bridge/convert`) using `createServiceRoleClient()` to atomically create a `learners_profiles` draft and update `admission_leads.learner_profile_id`. The `full_name` column becomes a PostgreSQL GENERATED ALWAYS AS STORED column so all existing read code is unaffected — only INSERT/UPDATE and the TypeScript type change.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + service role client), TypeScript, React Query, shadcn/ui, Anthropic SDK (claude-sonnet-4-5)

**Design doc:** `docs/plans/2026-02-28-admission-learner-bridge-design.md`

---

## PHASE 1 — DB Migration: `first_name` + `last_name` on `admission_leads`

### Task 1: Write and apply the SQL migration

**Files:**
- Create: `supabase/migrations/20260228_admission_leads_split_name.sql`

**Step 1: Create migration file**

```sql
-- supabase/migrations/20260228_admission_leads_split_name.sql
-- Split admission_leads.full_name into first_name + last_name.
-- full_name becomes a GENERATED ALWAYS AS STORED column so all existing
-- SELECT queries and ilike searches continue to work without any changes.

-- 1. Add new columns (nullable so existing rows don't fail)
ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- 2. Backfill from existing full_name
UPDATE public.admission_leads
SET
  first_name = TRIM(SPLIT_PART(COALESCE(full_name, ''), ' ', 1)),
  last_name  = NULLIF(
                 TRIM(SUBSTRING(COALESCE(full_name, '')
                      FROM POSITION(' ' IN COALESCE(full_name, ' ')) + 1)),
                 '');

-- 3. Set NOT NULL after backfill (first_name is required)
ALTER TABLE public.admission_leads
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN first_name SET DEFAULT '';

-- 4. Drop old full_name column
ALTER TABLE public.admission_leads
  DROP COLUMN IF EXISTS full_name;

-- 5. Re-add full_name as a generated column (backward compat for all SELECT/search)
ALTER TABLE public.admission_leads
  ADD COLUMN full_name TEXT GENERATED ALWAYS AS (
    first_name || COALESCE(' ' || NULLIF(TRIM(COALESCE(last_name, '')), ''), '')
  ) STORED;

-- 6. Indexes: keep search fast
CREATE INDEX IF NOT EXISTS idx_admission_leads_first_name
  ON public.admission_leads (institution_id, first_name);
CREATE INDEX IF NOT EXISTS idx_admission_leads_full_name
  ON public.admission_leads (institution_id, full_name);
```

**Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with the SQL above, or paste into the Supabase Dashboard SQL editor and run.

**Step 3: Verify in Supabase**

Run this SQL to confirm:
```sql
SELECT id, first_name, last_name, full_name
FROM admission_leads
LIMIT 5;
```
Expected: `full_name` column shows `first_name || ' ' || last_name` correctly.

**Step 4: Commit**
```bash
git add supabase/migrations/20260228_admission_leads_split_name.sql
git commit -m "feat(admission): split full_name into first_name + last_name on admission_leads"
```

---

## PHASE 2 — TypeScript Types

### Task 2: Update `AdmissionLead` interface

**Files:**
- Modify: `types/admission.ts`

**Step 1: Find the current `full_name` field**

In `types/admission.ts`, the `AdmissionLead` interface has:
```typescript
full_name: string;
```

**Step 2: Replace with `first_name` + `last_name`, keep `full_name` as computed readonly**

Replace the single `full_name` line with:
```typescript
first_name: string;
last_name: string | null;
// Generated column (computed in DB as first_name + ' ' + last_name)
// Still present on SELECT results — do not write this field on INSERT/UPDATE
readonly full_name: string;
```

**Step 3: Update `CreateLeadInput` / `UpdateLeadInput` interfaces (same file)**

Find these interfaces and replace `full_name?: string` with:
```typescript
first_name: string;
last_name?: string | null;
```

Also update `CreateApplicationInput` if it has `full_name`.

**Step 4: Verify TypeScript compilation**
```bash
cd D:/Projects/MyJKKN
npx tsc --noEmit 2>&1 | head -50
```
Expected: errors only in lead-create form (next task). All read-only usages of `full_name` still compile because the generated column is still returned by SELECT *.

**Step 5: Commit**
```bash
git add types/admission.ts
git commit -m "feat(admission): update AdmissionLead type to first_name + last_name"
```

---

## PHASE 3 — Lead Create / Edit Form

### Task 3: Update the leads create form

**Files:**
- Modify: `app/(routes)/admission/leads/new/page.tsx`

**Step 1: Find the `full_name` form field**

Search for `full_name` in `app/(routes)/admission/leads/new/page.tsx`. It will be a single `<Input>` or similar field with label "Full Name".

**Step 2: Replace with two fields side-by-side**

Replace the single full_name input block with:
```tsx
{/* Name row */}
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label htmlFor="first_name">First Name <span className="text-red-500">*</span></Label>
    <Input
      id="first_name"
      placeholder="First name"
      value={form.first_name || ''}
      onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
      required
    />
  </div>
  <div className="space-y-2">
    <Label htmlFor="last_name">Last Name</Label>
    <Input
      id="last_name"
      placeholder="Last name (optional)"
      value={form.last_name || ''}
      onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value || null }))}
    />
  </div>
</div>
```

**Step 3: Update form state initializer**

Find where the form state is initialized (e.g., `useState({ full_name: '', ... })`).
Replace `full_name: ''` with `first_name: '', last_name: null`.

**Step 4: Update form submit handler**

Find where the form data is passed to the service/mutation. Replace `full_name: form.full_name` with:
```typescript
first_name: form.first_name,
last_name: form.last_name ?? null,
```

**Step 5: Update form validation**

Find any validation like `if (!form.full_name)`. Replace with:
```typescript
if (!form.first_name?.trim()) {
  toast.error('First name is required');
  return;
}
```

**Step 6: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "leads/new"
```
Expected: no errors for this file.

**Step 7: Commit**
```bash
git add "app/(routes)/admission/leads/new/page.tsx"
git commit -m "feat(admission): use first_name + last_name in leads create form"
```

---

### Task 4: Update leads edit form (lead detail page)

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

**Step 1: Find the full_name edit input in the lead detail page**

Search for `full_name` in `app/(routes)/admission/leads/[id]/page.tsx`. There will be either a form field or an inline edit.

**Step 2: Replace with two fields**

Same pattern as Task 3 Step 2. Use `lead.first_name` and `lead.last_name` as initial values.

**Step 3: Update any display of the lead name**

Lines that show `{lead.full_name}` can remain as-is (generated column still returns the full name). No change needed for display-only uses.

**Step 4: Update mutation payload**

Find where the update mutation sends data. Replace `full_name: editForm.full_name` with:
```typescript
first_name: editForm.first_name,
last_name: editForm.last_name ?? null,
```

**Step 5: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "leads/\[id\]"
```

**Step 6: Commit**
```bash
git add "app/(routes)/admission/leads/[id]/page.tsx"
git commit -m "feat(admission): use first_name + last_name in lead detail edit form"
```

---

## PHASE 4 — Service Layer Updates

### Task 5: Update `lead-service.ts` INSERT/UPDATE

**Files:**
- Modify: `lib/services/admission/lead-service.ts`

**Step 1: Find INSERT operations**

Search for `.insert(` or `.update(` that include `full_name:`. These are the only operations that need changing. SELECT/display of `full_name` is fine as-is.

**Step 2: Replace `full_name` with `first_name` + `last_name` in insert/update objects**

For each insert/update payload that has `full_name: input.full_name`, replace with:
```typescript
first_name: input.first_name,
last_name: input.last_name ?? null,
```

**Step 3: Update method signatures**

If `createLead()` / `updateLead()` accept `{ full_name: string, ... }`, update to:
```typescript
{ first_name: string; last_name?: string | null; ... }
```

**Step 4: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "lead-service"
```

**Step 5: Commit**
```bash
git add lib/services/admission/lead-service.ts
git commit -m "feat(admission): update lead-service INSERT/UPDATE to first_name + last_name"
```

---

### Task 6: Update `application-service.ts` and API routes

**Files:**
- Modify: `lib/services/admission/application-service.ts`
- Modify: `app/api/admission/leads/route.ts`

**Step 1: Search for INSERT/UPDATE with `full_name` in application-service**

These are rare (applications service mostly reads leads, not creates them). Update any found the same way as Task 5.

**Step 2: Update `app/api/admission/leads/route.ts`**

This is the API route that creates/updates leads. Find the body parsing and any `full_name` field. Replace with `first_name` + `last_name`.

Example: if it does `const { full_name, phone, ... } = body`, change to:
```typescript
const { first_name, last_name, phone, ... } = body;
// ...
await LeadService.createLead({ first_name, last_name, phone, ... });
```

**Step 3: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep -E "application-service|leads/route"
```

**Step 4: Commit**
```bash
git add lib/services/admission/application-service.ts app/api/admission/leads/route.ts
git commit -m "feat(admission): update application-service and leads API route to first_name + last_name"
```

---

## PHASE 5 — Bridge API Route

### Task 7: Create the bridge API route

**Files:**
- Create: `app/api/admission/bridge/convert/route.ts`

**Step 1: Create the directory**
```bash
mkdir -p "D:/Projects/MyJKKN/app/api/admission/bridge/convert"
```

**Step 2: Write the route**

```typescript
// app/api/admission/bridge/convert/route.ts
// Converts an admission application into a learners_profiles draft.
// Atomically: INSERT learners_profiles → UPDATE admission_leads.learner_profile_id

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[bridge/convert] Request received');

  // ── 1. Authenticate ─────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let leadId: string;
  let institutionId: string;
  try {
    const body = await request.json();
    leadId = body.leadId;
    institutionId = body.institutionId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!leadId || !institutionId) {
    return NextResponse.json({ error: 'leadId and institutionId are required' }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  // ── 3. Fetch lead ────────────────────────────────────────────────────────────
  const { data: lead, error: leadError } = await (svc as any)
    .from('admission_leads')
    .select('*')
    .eq('id', leadId)
    .eq('institution_id', institutionId)
    .single();

  if (leadError || !lead) {
    console.error('[bridge/convert] Lead not found:', leadError?.message);
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // ── 4. Guard: already converted ─────────────────────────────────────────────
  if (lead.learner_profile_id) {
    console.log('[bridge/convert] Already converted:', lead.learner_profile_id);
    return NextResponse.json(
      { error: 'Already converted', profileId: lead.learner_profile_id },
      { status: 409 }
    );
  }

  // ── 5. Map fields ────────────────────────────────────────────────────────────
  const profileData = {
    // Name
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    // Contact
    student_mobile: lead.phone || '',
    student_email: lead.email || '',
    // Personal
    date_of_birth: lead.date_of_birth || '',
    gender: lead.gender || '',
    // Address
    permanent_address_street: lead.address_line1 || '',
    permanent_address_state: lead.state || '',
    permanent_address_district: lead.district || '',
    permanent_address_pin_code: lead.pincode || '',
    // Academic
    institution_id: lead.institution_id,
    degree_id: lead.degree_id || null,
    department_id: lead.department_id || null,
    program_id: lead.program_id || null,
    // Parent (best-effort)
    father_name: lead.parent_name || '',
    father_mobile: lead.parent_phone || '',
    mother_name: '',
    mother_mobile: '',
    // Required fields with safe defaults
    lifecycle_status: 'enquiry',
    accommodation_type: 'DAY SCHOLAR',
    entry_type: 'FIRST YEAR',
    last_school: '',
    board_of_study: '',
    tenth_marks: {},
    twelfth_marks: {},
    religion: '',
    community: '',
    // Audit
    created_by: user.id,
  };

  // ── 6. Insert learner profile ────────────────────────────────────────────────
  const { data: profile, error: insertError } = await (svc as any)
    .from('learners_profiles')
    .insert(profileData)
    .select('id')
    .single();

  if (insertError || !profile) {
    console.error('[bridge/convert] Failed to create learner profile:', insertError?.message);
    return NextResponse.json(
      { error: `Failed to create learner profile: ${insertError?.message}` },
      { status: 500 }
    );
  }
  console.log('[bridge/convert] ✓ Created learner profile:', profile.id);

  // ── 7. Update admission_leads.learner_profile_id ─────────────────────────────
  const { error: updateError } = await (svc as any)
    .from('admission_leads')
    .update({ learner_profile_id: profile.id })
    .eq('id', leadId);

  if (updateError) {
    console.error('[bridge/convert] Failed to update lead FK — rolling back profile');
    // Compensating rollback: delete the profile we just created
    await (svc as any).from('learners_profiles').delete().eq('id', profile.id);
    return NextResponse.json(
      { error: `Failed to link profile to lead: ${updateError.message}` },
      { status: 500 }
    );
  }

  console.log('[bridge/convert] ✓ Linked profile to lead. Done.');
  return NextResponse.json({ profileId: profile.id });
}
```

**Step 3: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "bridge/convert"
```
Expected: no errors.

**Step 4: Commit**
```bash
git add app/api/admission/bridge/convert/route.ts
git commit -m "feat(admission): add bridge API route to convert application to learner enquiry draft"
```

---

## PHASE 6 — Application Detail Page UI

### Task 8: Add "Convert to Learner Enquiry" button

**Files:**
- Modify: `app/(routes)/admission/applications/[id]/page.tsx`

**Step 1: Read the application detail page**

Open `app/(routes)/admission/applications/[id]/page.tsx` and find:
- Where the lead data is loaded (likely via `useApplication(id)` or similar hook)
- The page actions area (top right, near existing buttons)
- Whether `learner_profile_id` is already fetched in the lead data

**Step 2: Add state and handler**

At the top of the component, add:
```typescript
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, ExternalLink } from 'lucide-react';

// Inside component:
const router = useRouter();
const [isConverting, setIsConverting] = useState(false);

const handleConvertToLearner = async () => {
  if (!lead?.id || !institutionId) return;
  setIsConverting(true);
  try {
    const res = await fetch('/api/admission/bridge/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, institutionId }),
    });
    const json = await res.json();
    if (!res.ok) {
      // If already converted (409), redirect to the existing profile
      if (res.status === 409 && json.profileId) {
        router.push(`/learners/enquiries/${json.profileId}/edit`);
        return;
      }
      throw new Error(json.error || 'Conversion failed');
    }
    toast.success('Learner enquiry created — redirecting...');
    router.push(`/learners/enquiries/${json.profileId}/edit`);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Conversion failed');
  } finally {
    setIsConverting(false);
  }
};
```

**Step 3: Add the button in the actions area**

Find the page header actions section (where other buttons like "Update Status" live). Add:

```tsx
{/* If already converted → View Learner Profile link */}
{lead?.learner_profile_id ? (
  <Button
    variant="outline"
    size="sm"
    asChild
  >
    <a href={`/learners/profiles/${lead.learner_profile_id}`}>
      <ExternalLink className="h-4 w-4 mr-2" />
      View Learner Profile
    </a>
  </Button>
) : (
  /* Not yet converted → Convert button */
  <Button
    variant="default"
    size="sm"
    onClick={handleConvertToLearner}
    disabled={isConverting}
    className="bg-purple-600 hover:bg-purple-700"
  >
    <UserPlus className={`h-4 w-4 mr-2 ${isConverting ? 'animate-pulse' : ''}`} />
    {isConverting ? 'Converting...' : 'Convert to Learner Enquiry'}
  </Button>
)}
```

**Step 4: Ensure `learner_profile_id` is included in the application data query**

In `application-service.ts`, `getApplication()` does `select('*', ...)` which already includes all columns — `learner_profile_id` is returned automatically.

Verify in the component: `lead?.learner_profile_id` resolves to `string | null`. If TypeScript complains, add it to the `AdmissionLead` type (it is already defined in the DB schema and type — check `types/admission.ts`):
```typescript
learner_profile_id?: string | null;
```

**Step 5: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "applications/\[id\]"
```

**Step 6: Commit**
```bash
git add "app/(routes)/admission/applications/[id]/page.tsx"
git commit -m "feat(admission): add Convert to Learner Enquiry button on application detail page"
```

---

## PHASE 7 — Final Verification & Push

### Task 9: Full TypeScript check + push

**Step 1: Run full type check**
```bash
cd D:/Projects/MyJKKN
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -60
```
Expected: 0 errors (or only pre-existing errors unrelated to this feature).

**Step 2: Fix any remaining `full_name` INSERT/UPDATE references**

If tsc reports errors in any service file attempting to INSERT `full_name` directly:
- Replace `full_name: value` in insert/update payloads with `first_name: firstName, last_name: lastName`
- Do NOT remove `full_name` from SELECT queries — it is a generated column and will still be returned

**Step 3: Push to remote**
```bash
git push origin main
```

---

## Field Reference Quick-Look

| `admission_leads` | → | `learners_profiles` |
|---|---|---|
| `first_name` | direct | `first_name` |
| `last_name` | direct | `last_name` |
| `phone` | direct | `student_mobile` |
| `email` | direct | `student_email` |
| `date_of_birth` | direct | `date_of_birth` |
| `gender` | direct | `gender` |
| `address_line1` | direct | `permanent_address_street` |
| `state` | direct | `permanent_address_state` |
| `district` | direct | `permanent_address_district` |
| `pincode` | direct | `permanent_address_pin_code` |
| `institution_id` | direct | `institution_id` |
| `degree_id` | direct | `degree_id` |
| `department_id` | direct | `department_id` |
| `program_id` | direct | `program_id` |
| `parent_name` | best-effort | `father_name` |
| `parent_phone` | best-effort | `father_mobile` |
| — | default `'enquiry'` | `lifecycle_status` |
| — | default `'DAY SCHOLAR'` | `accommodation_type` |
| — | default `'FIRST YEAR'` | `entry_type` |

## Task Checklist

- [ ] Task 1: DB migration — `first_name` + `last_name` + generated `full_name`
- [ ] Task 2: Update `AdmissionLead` TypeScript type
- [ ] Task 3: Update leads create form (`/leads/new`)
- [ ] Task 4: Update lead detail edit form (`/leads/[id]`)
- [ ] Task 5: Update `lead-service.ts` INSERT/UPDATE
- [ ] Task 6: Update `application-service.ts` + leads API route
- [ ] Task 7: Create bridge API route (`/api/admission/bridge/convert`)
- [ ] Task 8: Add Convert button to application detail page
- [ ] Task 9: Full TypeScript check + push
