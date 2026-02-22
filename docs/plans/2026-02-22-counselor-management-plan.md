# Counselor Management (Profiles-Driven) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Source counselor dropdowns from `profiles WHERE role='counselor'` (Option A bridge — no separate management UI), and expose a counselor picker on the lead creation + lead detail pages.

**Architecture:** Two new service methods on `CounselorDailyViewService` handle profile fetching and bridge-creation of `admission_counselors` rows. A new React Query hook wraps the service. The lead new form and lead detail assign dialog both use the hook; the detail page's raw `useEffect` fetch is replaced.

**Tech Stack:** Next.js 15, Supabase client, React Query (`@tanstack/react-query`), TypeScript

---

## Task 1: Add service methods — getCounselorProfiles + resolveOrCreateCounselor

**Files:**
- Modify: `lib/services/admission/counselor-daily-view-service.ts` (append before closing `}` of class, after line 534)

**What to add** — two static methods inside `CounselorDailyViewService`:

```typescript
/**
 * Fetch active profiles with role='counselor' for an institution.
 * This is the primary source of truth for counselor dropdowns.
 */
static async getCounselorProfiles(institutionId: string): Promise<Array<{
  profile_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
}>> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, email, phone_number, designation')
    .eq('role', 'counselor')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('full_name');

  if (error) {
    console.error('[counselor] Failed to fetch counselor profiles:', error);
    throw new Error('Failed to fetch counselors');
  }

  return (data || []).map((p: any) => ({
    profile_id: p.id,
    name: p.full_name || '',
    email: p.email || null,
    phone: p.phone_number || null,
    designation: p.designation || null,
  }));
}

/**
 * Bridge method (Option A): Ensure an admission_counselors record exists for a
 * given profiles.id. Returns the admission_counselors.id for use as counselor_id on leads.
 * Creates the record automatically from profile data if it doesn't exist yet.
 */
static async resolveOrCreateCounselor(profileId: string): Promise<string> {
  const supabase = createClientSupabaseClient();

  // Check if already bridged
  const { data: existing } = await (supabase as any)
    .from('admission_counselors')
    .select('id')
    .eq('user_id', profileId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Fetch profile to seed the counselor record
  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('full_name, email, phone_number, designation, institution_id')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    throw new Error('Profile not found');
  }

  const { data: newCounselor, error } = await (supabase as any)
    .from('admission_counselors')
    .insert({
      user_id: profileId,
      name: profile.full_name || '',
      email: profile.email || null,
      phone: profile.phone_number || null,
      designation: profile.designation || null,
      institution_id: profile.institution_id || null,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[counselor] Failed to create bridge counselor record:', error);
    throw new Error('Failed to create counselor');
  }

  return newCounselor.id;
}
```

**How to test:** In the browser console on any admission page:
```js
import('@/lib/services/admission/counselor-daily-view-service').then(m =>
  m.CounselorDailyViewService.getCounselorProfiles('YOUR_INSTITUTION_ID').then(console.log)
)
```
Expected: array of `{ profile_id, name, email, phone, designation }` for users with role='counselor'.

**Commit:**
```bash
git add lib/services/admission/counselor-daily-view-service.ts
git commit -m "feat(admission): add getCounselorProfiles + resolveOrCreateCounselor to service"
```

---

## Task 2: Add useCounselorProfiles hook

**Files:**
- Modify: `hooks/admission/use-counselor-daily-view.ts` (append after the existing `useCounselorsList` export)

**Step 1: Export the new hook**

Add this function at the bottom of the file (before the final closing):

```typescript
/**
 * Fetch counselors from profiles (role='counselor') for a given institution.
 * Use this for all counselor picker dropdowns — no admission_counselors management needed.
 */
export function useCounselorProfiles(institutionId: string | undefined) {
  return useQuery({
    queryKey: [...counselorDailyViewKeys.counselors(institutionId || ''), 'profiles'],
    queryFn: () => CounselorDailyViewService.getCounselorProfiles(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000, // 5-minute cache — counselor list changes infrequently
  });
}
```

**Verify:** TypeScript should compile with no errors:
```bash
npx tsc --noEmit 2>&1 | grep "use-counselor-daily-view"
```
Expected: no output (no errors).

**Commit:**
```bash
git add hooks/admission/use-counselor-daily-view.ts
git commit -m "feat(admission): add useCounselorProfiles hook sourced from profiles table"
```

---

## Task 3: Add counselor picker to lead creation form

**Files:**
- Modify: `app/(routes)/admission/leads/new/page.tsx`

### Step 1: Add imports at top of file

After the existing hook imports (around line 45), add:
```typescript
import { useCounselorProfiles } from '@/hooks/admission/use-counselor-daily-view';
import { CounselorDailyViewService } from '@/lib/services/admission/counselor-daily-view-service';
import { LeadService } from '@/lib/services/admission/lead-service';
```

### Step 2: Add state inside NewLeadPageContent (after line 113)

```typescript
// Counselor assignment (optional at creation time)
const [selectedCounselorProfileId, setSelectedCounselorProfileId] = useState<string>('');
```

### Step 3: Add hook (after the existing `useLeadMutations` line)

```typescript
const { data: counselorProfiles } = useCounselorProfiles(institutionId || undefined);
```

### Step 4: Update handleSubmit — assign counselor after lead creation

Replace the `onSuccess` callback inside `createLeadWithProfile.mutate(...)` (currently lines 363–366):

**Before:**
```typescript
onSuccess: (lead) => {
  toast.success('Lead created successfully');
  router.push(`/admission/leads/${lead.id}`);
},
```

**After:**
```typescript
onSuccess: async (lead) => {
  // Best-effort counselor assignment — does not block navigation
  if (selectedCounselorProfileId) {
    try {
      const counselorId = await CounselorDailyViewService.resolveOrCreateCounselor(
        selectedCounselorProfileId
      );
      await LeadService.assignCounselor(lead.id, counselorId);
    } catch (e) {
      console.warn('[leads/new] Could not assign counselor (best-effort):', e);
    }
  }
  toast.success('Lead created successfully');
  router.push(`/admission/leads/${lead.id}`);
},
```

### Step 5: Add Counselor card in sidebar

In the sidebar section, insert a new Card **between** the Assessment card and the Actions card (after line 896, before line 898):

```tsx
{/* Assign Counselor */}
<Card>
  <CardHeader>
    <CardTitle>Assign Counselor</CardTitle>
    <CardDescription>Optional — assign on creation</CardDescription>
  </CardHeader>
  <CardContent>
    <Select
      value={selectedCounselorProfileId}
      onValueChange={setSelectedCounselorProfileId}
      disabled={!institutionId}
    >
      <SelectTrigger>
        <SelectValue placeholder={institutionId ? 'Select counselor' : 'Select institution first'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">No counselor</SelectItem>
        {(counselorProfiles || []).map((c) => (
          <SelectItem key={c.profile_id} value={c.profile_id}>
            {c.name}{c.designation ? ` (${c.designation})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </CardContent>
</Card>
```

**Verify:** Navigate to `/admission/leads/new`, select an institution — counselor dropdown should populate with `role=counselor` users for that institution.

**Commit:**
```bash
git add app/(routes)/admission/leads/new/page.tsx
git commit -m "feat(admission): add profiles-based counselor picker to lead creation form"
```

---

## Task 4: Update lead detail page assign counselor dialog

**Files:**
- Modify: `app/(routes)/admission/leads/[id]/page.tsx`

### Step 1: Add imports (top of file, with other imports)

```typescript
import { useCounselorProfiles } from '@/hooks/admission/use-counselor-daily-view';
import { CounselorDailyViewService } from '@/lib/services/admission/counselor-daily-view-service';
```

### Step 2: Replace the raw useEffect counselor fetch

**Remove lines 470–495** (the `useState` + `useEffect` that fetches from `admission_counselors`):
```typescript
// DELETE these lines:
const [counselors, setCounselors] = useState<...>([]);
const [counselorsLoading, setCounselorsLoading] = useState(false);
useEffect(() => {
  // ... raw supabase fetch from admission_counselors ...
}, [lead?.institution_id]);
```

**Replace with:**
```typescript
// Counselors from profiles (role='counselor') — institution-scoped
const { data: counselorProfiles, isLoading: counselorsLoading } = useCounselorProfiles(
  lead?.institution_id ?? undefined
);
const counselors = counselorProfiles || [];
```

> Note: The variable names `counselors` and `counselorsLoading` are kept intentionally — the dialog UI at line 1474 uses these names and requires no UI changes.

### Step 3: Update handleAssignCounselor to resolve profile → counselor bridge

**Replace** the existing `handleAssignCounselor` function (lines 682–697):

```typescript
const handleAssignCounselor = async () => {
  if (!selectedCounselorId) {
    toast.error('Please select a counselor');
    return;
  }
  try {
    // Resolve (or auto-create) the admission_counselors bridge record
    const counselorId = await CounselorDailyViewService.resolveOrCreateCounselor(
      selectedCounselorId // this is now a profiles.id
    );
    assignCounselor.mutate(
      { leadId, counselorId },
      {
        onSuccess: () => {
          setSelectedCounselorId('');
          setShowAssignCounselorDialog(false);
          refetch();
        },
      }
    );
  } catch {
    toast.error('Failed to resolve counselor. Please try again.');
  }
};
```

### Step 4: Update dialog SelectItem to use profile_id as value

In the dialog (around line 1480), the `counselors.map(...)` currently uses `c.id`. With profiles data, the shape changes to `{ profile_id, name, designation, phone }`:

**Before:**
```tsx
counselors.map((c) => (
  <SelectItem key={c.id} value={c.id}>
    {c.name}{c.designation ? ` (${c.designation})` : ''}{c.phone ? ` - ${c.phone}` : ''}
  </SelectItem>
))
```

**After:**
```tsx
counselors.map((c) => (
  <SelectItem key={c.profile_id} value={c.profile_id}>
    {c.name}{c.designation ? ` (${c.designation})` : ''}
  </SelectItem>
))
```

**Verify:** Open any lead detail page → click "Assign Counselor" → dropdown should show `role=counselor` profiles for that lead's institution → selecting one and clicking Assign should work.

**Commit:**
```bash
git add app/(routes)/admission/leads/[id]/page.tsx
git commit -m "feat(admission): update lead detail assign counselor dialog to use profiles source"
```

---

## Final verification

1. Create a user in Users module with `role=counselor` for an institution
2. Go to `/admission/leads/new` → select that institution → Counselor dropdown should show the user
3. Create the lead with counselor selected → lead detail page should show the assigned counselor
4. On an existing lead → Assign Counselor dialog → same counselor appears → assign works
5. Confirm `admission_counselors` gets a bridge row auto-created (check Supabase table editor)
