# Admission Fees — Plan 6: Cutover & Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Predecessors:** Plan 1 ✅ · Plan 2 ✅ · Plan 3 ✅ · Plan 4 ✅ · Plan 5 ✅

**Goal:** Ship the feature. Make the per-institution feature flag (`admission_settings_per_institution.use_fee_structures`) actually gate the new flow end-to-end. Build a tiny admin settings page so admins can flip the flag without writing SQL. Close out the two Plan 3 deferrals (pre-submit confirmation dialog wiring; atomic adopt-structure RPC). Regenerate stale Supabase types. Run end-to-end integration verification. Mark the spec ✅ shipped.

**Architecture:** Feature flag is the gate for institution-wide rollout. Net-new enquiries in flag-on institutions default to `legacy_fee_mode=false` (matrix-driven); flag-off institutions keep the default `true` (legacy manual). The adopt-structure banner — currently shown on every `legacy_fee_mode=true` lead — becomes flag-gated so admins aren't tempted to migrate individual leads while the institution-wide flag is off. The Plan 3 deferrals close out: the pre-submit dialog (read `pre_submit_dialog_enabled` setting → open dialog → resolve fee_items via RPC → log activity → submit), and the atomic adopt-structure RPC (currently a service-level sequence — wrap in SECURITY DEFINER for transactional safety). Stale Supabase types regenerated. End-to-end smoke documented as a runbook.

**Tech Stack:** Same as prior plans.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260510100001_default_legacy_fee_mode_by_flag.sql` | Trigger / function: set `legacy_fee_mode` default based on institution's `use_fee_structures` flag for net-new learners |
| `supabase/migrations/20260510100002_register_admission_settings_manage_permission.sql` | `admission.settings.manage` JSONB permission grant (if not already registered) |
| `supabase/migrations/20260510100003_rpc_admission_adopt_structure_for_lead.sql` | Atomic SECURITY DEFINER RPC for the adopt-structure flow |
| `app/(routes)/admission/settings/general/page.tsx` | Settings page: flag toggle + required-docs editor |
| `app/(routes)/admission/settings/general/_components/feature-flag-card.tsx` | Per-institution `use_fee_structures` toggle with soft-warn |
| `app/(routes)/admission/settings/general/_components/required-docs-editor.tsx` | Editable list of required docs for status='account' transition |
| `docs/superpowers/runbooks/2026-05-05-admission-fees-end-to-end-smoke.md` | E2E smoke runbook (Task 8) |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/02_functions.sql` | Append the new trigger function + adopt-structure RPC |
| `supabase/setup/04_triggers.sql` | Append the legacy_fee_mode-default trigger binding |
| `lib/services/admission/admission-settings-service.ts` | Add `update` and `setRequiredDocuments` convenience methods |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/legacy-mode-banner.tsx` | Gate visibility on the institution's `use_fee_structures` flag |
| `app/(routes)/learners/enquiries/_components/form-sections/_fee/adopt-structure-dialog.tsx` | Refactor to call the new atomic adopt-structure RPC instead of the service-level sequence |
| `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` | Wire `<PreSubmitConfirmationDialog>` into the form submit handler (Plan 3 deferral) |
| `app/(routes)/admission/nav-config.ts` | Register the new `settings/general` sub-route |
| `types/supabase.ts` | **Regenerate** to include all Plans 1-5 tables/RPCs (Task 7) |

---

## Permission keys touched in this plan

| Key | Source | Notes |
|---|---|---|
| `admission.settings.manage` | Plan 1 RLS already references this; Plan 6 Task 3 ensures it's registered with sensible defaults | Required for the new settings UI |

---

## Activity log events touched in this plan

`enquiry.fee_resolved`, `enquiry.fee_match_failed`, `enquiry.legacy_fee_adopted` (existing from Plan 3) — Plan 6 wires the pre-submit dialog (Task 5) which emits the first two, and refactors the adopt-structure RPC (Task 6) to emit the third atomically. No new events registered.

---

## Pre-flight checks

```sql
SELECT
  (SELECT count(*) FROM public.admission_settings_per_institution
     WHERE use_fee_structures = true) AS institutions_already_flipped,
  (SELECT count(*) FROM public.learners_profiles WHERE legacy_fee_mode = false) AS non_legacy_count,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admission_adopt_structure_for_lead') AS adopt_rpc_exists,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('admission_fee_structures','admission_fee_adjustments','admission_fee_change_events',
                        'student_credit_balances','learner_admission_documents','quotas',
                        'community_categories','accommodation_types','admission_settings_per_institution',
                        'admission_fee_structure_items','admission_fee_change_event_lines')) AS tables_present;
```

Expected before Plan 6: `institutions_already_flipped = 0` (still off after Plan 1-5), `non_legacy_count = 0`-ish (a couple of test rows possibly), `adopt_rpc_exists = false`, `tables_present = 11`.

---

# PHASE A — Feature flag enforcement

## Task 1: Migration — Default `legacy_fee_mode` based on institution flag

**Files:**
- Create: `supabase/migrations/20260510100001_default_legacy_fee_mode_by_flag.sql`
- Modify: `supabase/setup/02_functions.sql`, `supabase/setup/04_triggers.sql`

When a new `learners_profiles` row is INSERTED, set `legacy_fee_mode` based on the institution's `use_fee_structures` flag:
- Flag ON → new lead starts `legacy_fee_mode = false` (matrix-driven from the start)
- Flag OFF → keep `legacy_fee_mode = true` (legacy manual entry)

The column already has DEFAULT true at the DDL level. We override via a BEFORE INSERT trigger.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260510100001 — Default legacy_fee_mode based on institution flag
-- ============================================================================
-- BEFORE INSERT trigger sets legacy_fee_mode based on
-- admission_settings_per_institution.use_fee_structures for the row's
-- institution_id. Flag ON → false (matrix-driven). Flag OFF → keeps DDL
-- default of true (legacy manual).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_legacy_fee_mode_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_use_fee_structures boolean;
BEGIN
    IF NEW.institution_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT use_fee_structures INTO v_use_fee_structures
      FROM public.admission_settings_per_institution
     WHERE institution_id = NEW.institution_id;

    IF v_use_fee_structures = true THEN
        NEW.legacy_fee_mode := false;
    END IF;
    -- Flag false or missing → keep whatever was passed (defaults to true via DDL)

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_legacy_fee_mode_default() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_set_legacy_fee_mode_default ON public.learners_profiles;
CREATE TRIGGER trg_set_legacy_fee_mode_default
    BEFORE INSERT ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_legacy_fee_mode_default();
```

- [ ] **Step 2: Append function to `02_functions.sql` + trigger binding to `04_triggers.sql`** (idempotent).

- [ ] **Step 3: Apply via `mcp__supabase__apply_migration`** with name `20260510100001_default_legacy_fee_mode_by_flag`.

- [ ] **Step 4: Verify trigger exists**
```sql
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.learners_profiles'::regclass
   AND tgname = 'trg_set_legacy_fee_mode_default';
-- Expected: 1 row.
```

- [ ] **Step 5: Smoke-verify behavior** (DRY-RUN — no actual insert):
```sql
-- Pick a flag-off institution
SELECT id FROM public.admission_settings_per_institution WHERE use_fee_structures = false LIMIT 1;
-- Calling the trigger function directly with NEW={institution_id: <flag-off-id>, legacy_fee_mode: true} should leave legacy_fee_mode=true.
-- A real INSERT into learners_profiles is too risky for this verification; trust the function body and verify in Plan 6 Task 8 smoke.
```

- [ ] **Step 6: Commit** referencing Spec §12.1 + Plan Task 1.

---

## Task 2: Gate adopt-structure banner on the institution flag

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/form-sections/_fee/legacy-mode-banner.tsx`

Currently the banner appears on EVERY `legacy_fee_mode=true` row. Plan 6 makes it appear ONLY when the institution's `use_fee_structures = true` (i.e. admin has signaled they're ready to migrate).

- [ ] **Step 1: Read the current banner component** end-to-end. Note its props, where it loads the institution_id from, and the current visibility condition.

- [ ] **Step 2: Add a flag check**. The banner now:
1. Reads the learner's `institution_id` from props or by fetching the learner record
2. Calls `AdmissionSettingsService.isFeeStructuresEnabled(institutionId)` (Plan 1 method)
3. Renders only when both `legacy_fee_mode=true` AND `isFeeStructuresEnabled=true`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';

interface Props {
  learnerId: string;
  institutionId: string;
  onAdopted?: () => void;
}

export function LegacyModeBanner({ learnerId, institutionId, onAdopted }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    AdmissionSettingsService.isFeeStructuresEnabled(institutionId).then(setEnabled);
  }, [institutionId]);

  // Don't render until we know
  if (enabled !== true) return null;

  return (
    <div className="rounded border-2 border-amber-300 bg-amber-50 p-3 text-sm">
      <strong>Legacy fees:</strong> this lead uses manual fee entry.{' '}
      <button className="underline" onClick={() => setAdoptOpen(true)}>Migrate to fee structure</button>
      {adoptOpen && (
        <AdoptStructureDialog
          open={adoptOpen}
          onOpenChange={setAdoptOpen}
          learnerId={learnerId}
          onAdopted={() => { setAdoptOpen(false); onAdopted?.(); }}
        />
      )}
    </div>
  );
}
```

(The `<AdoptStructureDialog>` import is from the same `_fee/` folder — already created in Plan 3 Task 12.)

- [ ] **Step 3: Update `finance-details.tsx`** to pass `institutionId` prop to the banner. Read the parent `enquiry-form.tsx` to understand where institution_id is available — likely via `form.getValues('institution_id')` or from the loaded learner record.

- [ ] **Step 4: Verify per-file syntax** for both files.

- [ ] **Step 5: Commit** referencing Spec §12.1 + Plan Task 2.

---

# PHASE B — Settings admin UI

## Task 3: Migration — Register `admission.settings.manage` permission

**Files:**
- Create: `supabase/migrations/20260510100002_register_admission_settings_manage_permission.sql`

Plan 1's RLS policies already reference `admission.settings.manage` as the write-gate for `admission_settings_per_institution`. This migration just ensures the permission key is granted to admin-tier roles.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260510100002 — Register admission.settings.manage permission
-- ============================================================================
-- Grants 'admission.settings.manage' (referenced by Plan 1 RLS) to admin-tier
-- roles. Idempotent: skip if already granted.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.settings.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission.settings.manage','false') <> 'true';
```

- [ ] **Step 2: Apply.**

- [ ] **Step 3: Verify**
```sql
SELECT role_key, (permissions ? 'admission.settings.manage') AS has_perm
  FROM public.custom_roles
 WHERE role_key IN ('administrator','super_admin')
 ORDER BY 1;
-- Expected: 2 rows, has_perm=true on both.
```

- [ ] **Step 4: Commit** referencing Spec §10.1 + Plan Task 3.

---

## Task 4: Settings admin UI

**Files:**
- Create: `app/(routes)/admission/settings/general/page.tsx`
- Create: `app/(routes)/admission/settings/general/_components/feature-flag-card.tsx`
- Create: `app/(routes)/admission/settings/general/_components/required-docs-editor.tsx`
- Modify: `lib/services/admission/admission-settings-service.ts`
- Modify: `app/(routes)/admission/nav-config.ts`

The page lives at `/admission/settings/general`. It contains:
1. Institution selector at top (using `useInstitutionsWithAccess` per project convention)
2. Feature-flag card: `use_fee_structures` toggle. Soft-warn when flipping ON if `admission_fee_structures` count = 0 for that institution
3. Required-docs editor: comma-separated list (or chip list) of required `doc_type` values for the account-transition checklist
4. (v1.5 deferred) Pre-submit / status-change dialog enabled toggles — show but disabled with tooltip "Configurable in v1.5"

- [ ] **Step 1: Extend `admission-settings-service.ts`** with these methods:

```typescript
// Add to AdmissionSettingsService class:

static async setUseFeeStructures(institutionId: string, enabled: boolean): Promise<void> {
  await this.upsert({ institution_id: institutionId, use_fee_structures: enabled });
}

static async setRequiredDocuments(institutionId: string, docs: string[]): Promise<void> {
  await this.upsert({ institution_id: institutionId, required_documents_for_account_transition: docs });
}

static async getFeeStructureCountForInstitution(institutionId: string): Promise<number> {
  // Lazy import to avoid circular dep
  const { FeeStructureService } = await import('./fee-structure-service');
  const list = await FeeStructureService.list(institutionId);
  return list.length;
}
```

- [ ] **Step 2: Write `page.tsx`** following the standard admission-settings shell (PermissionGuard with `admission.settings.manage`, ContentLayout, Breadcrumb, AdmissionErrorBoundary).

- [ ] **Step 3: Write `feature-flag-card.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import toast from 'react-hot-toast';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';

interface Props { institutionId: string; }

export function FeatureFlagCard({ institutionId }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [structureCount, setStructureCount] = useState<number>(0);

  useEffect(() => {
    if (!institutionId) return;
    AdmissionSettingsService.getByInstitution(institutionId).then((s) => setEnabled(s?.use_fee_structures ?? false));
    AdmissionSettingsService.getFeeStructureCountForInstitution(institutionId).then(setStructureCount);
  }, [institutionId]);

  const handleToggle = (next: boolean) => {
    if (next && structureCount === 0) {
      setConfirming(true);
      return;
    }
    commit(next);
  };

  const commit = async (next: boolean) => {
    try {
      await AdmissionSettingsService.setUseFeeStructures(institutionId, next);
      setEnabled(next);
      toast.success(next ? 'Fee structures enabled' : 'Fee structures disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update flag');
    }
  };

  if (enabled === null) return <p>Loading…</p>;

  return (
    <div className="rounded border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Use Fee Structures</div>
          <div className="text-sm text-muted-foreground">
            Enable matrix-driven fee resolution for net-new enquiries in this institution.
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      <div className="text-xs text-muted-foreground">
        {structureCount} fee structure{structureCount !== 1 ? 's' : ''} configured.
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable with zero structures configured?</AlertDialogTitle>
            <AlertDialogDescription>
              No fee structures exist for this institution yet. Enabling now means new enquiries will hit the no-match empty state until you configure structures via{' '}
              <code>/admission/settings/fees-structure</code>. Continue anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { commit(true); setConfirming(false); }}>Enable anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Write `required-docs-editor.tsx`** — chip-list editor backed by `Input` for adding new doc_type values. Save calls `AdmissionSettingsService.setRequiredDocuments`.

- [ ] **Step 5: Update `nav-config.ts`** — register `settings/general` sub-route under admission settings.

- [ ] **Step 6: Verify per-file syntax** for all new files via the temp-tsconfig technique from Plans 2-5.

- [ ] **Step 7: Commit** as one commit referencing Spec §12.1 + Plan Task 4.

---

# PHASE C — Plan 3 deferrals

## Task 5: Wire pre-submit confirmation dialog into enquiry form

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/enquiry-form.tsx`

The `<PreSubmitConfirmationDialog>` component was created in Plan 3 Task 13 but never wired into the parent form. Plan 6 closes this out.

- [ ] **Step 1: Read `enquiry-form.tsx`** to find the submit handler (likely `handleSubmit` or `onSubmit`).

- [ ] **Step 2: Inject the dialog flow**:

```tsx
// Add state at top:
const [preSubmitOpen, setPreSubmitOpen] = useState(false);
const [pendingFormData, setPendingFormData] = useState<EnquiryFormData | null>(null);

// Replace existing onSubmit with two-stage:
const onSubmit = async (data: EnquiryFormData) => {
  // Read the institution's pre_submit_dialog_enabled setting
  const settings = data.institution_id
    ? await AdmissionSettingsService.getByInstitution(data.institution_id)
    : null;
  const dialogEnabled = settings?.pre_submit_dialog_enabled ?? true;

  if (dialogEnabled) {
    setPendingFormData(data);
    setPreSubmitOpen(true);
    return;  // wait for user confirmation
  }
  await commitSubmit(data);
};

const commitSubmit = async (data: EnquiryFormData) => {
  // existing submit logic — saves the lead, returns learnerId
  const learnerId = await /* existing save */;

  // After save: resolve fee_items via RPC + log activity
  if (learnerId) {
    try {
      const result = await FeeResolutionService.resolveForLearner(learnerId);
      if (result.matched) {
        await logActivityForCurrentUser({
          actionType: 'enquiry.fee_resolved',
          resourceType: 'learner', resourceId: learnerId,
          description: AdmissionFeesActivityTemplates.enquiry.fee_resolved(result.items.length, result.total),
          metadata: { learner_id: learnerId, count: result.items.length, total: result.total },
        });
      } else {
        await logActivityForCurrentUser({
          actionType: 'enquiry.fee_match_failed',
          resourceType: 'learner', resourceId: learnerId,
          description: AdmissionFeesActivityTemplates.enquiry.fee_match_failed(),
          metadata: { learner_id: learnerId },
        });
      }
    } catch { /* best-effort */ }
  }
};

// In the JSX, render the dialog:
<PreSubmitConfirmationDialog
  open={preSubmitOpen}
  onOpenChange={setPreSubmitOpen}
  leadName={pendingFormData ? `${pendingFormData.first_name} ${pendingFormData.last_name}` : ''}
  matchedStructureName={/* derived from FeeStructureService.findByDimensions if institution flag is on */}
  resolvedItems={/* same lookup */}
  total={/* sum of resolvedItems */}
  onConfirm={async () => {
    if (pendingFormData) await commitSubmit(pendingFormData);
    setPreSubmitOpen(false);
  }}
/>
```

The `matchedStructureName` / `resolvedItems` / `total` need to be computed from the form's current dim values. Since the form is pre-save, use `FeeResolutionService.previewMatchByDimensions(dims)` rather than the resolve RPC (which requires a learner_id).

- [ ] **Step 3: Verify per-file syntax.**

- [ ] **Step 4: Commit** referencing Spec §9.3 + Plan Task 5.

---

## Task 6: Atomic adopt-structure RPC

**Files:**
- Create: `supabase/migrations/20260510100003_rpc_admission_adopt_structure_for_lead.sql`
- Modify: `app/(routes)/learners/enquiries/_components/form-sections/_fee/adopt-structure-dialog.tsx`
- Modify: `supabase/setup/02_functions.sql`

The adopt-structure flow currently does flag flip + RPC + log as a service-level sequence. Plan 6 wraps in a SECURITY DEFINER RPC for true transactional atomicity.

- [ ] **Step 1: Write the RPC migration**

```sql
-- ============================================================================
-- 20260510100003 — admission_adopt_structure_for_lead RPC
-- ============================================================================
-- Atomically: flip legacy_fee_mode=false, resolve fee_items via the existing
-- resolution RPC, persist resolved items. Any RAISE EXCEPTION rolls back.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_adopt_structure_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resolved jsonb;
    v_caller   uuid := auth.uid();
BEGIN
    IF NOT public.user_has_permission('admission_fees.manage_adjustments') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.manage_adjustments required'
            USING ERRCODE = '42501';
    END IF;

    -- Flip the flag
    UPDATE public.learners_profiles
       SET legacy_fee_mode = false,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolve fee_items (this also writes them back to the row)
    v_resolved := public.admission_resolve_fee_items_for_lead(p_learner_id);

    -- Hard fail if no match — adoption shouldn't succeed silently into empty fees
    IF jsonb_array_length(v_resolved) = 0 THEN
        RAISE EXCEPTION 'adopt_structure_no_match: 8-dim lookup found no fee structure';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'fee_items', v_resolved,
        'item_count', jsonb_array_length(v_resolved)
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_adopt_structure_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_adopt_structure_for_lead(uuid) TO authenticated;
```

- [ ] **Step 2: Append to `02_functions.sql`**.

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Refactor `adopt-structure-dialog.tsx`** to call the new RPC instead of the sequential service calls:

```tsx
// Replace the existing flip-flag + resolve + log sequence with:
const handleConfirm = async () => {
  setSubmitting(true);
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_adopt_structure_for_lead', { p_learner_id: learnerId });
    if (error) throw error;

    const result = data as { success: boolean; item_count: number; fee_items: unknown[] };

    // Activity log from caller's session
    await logActivityForCurrentUser({
      actionType: 'enquiry.legacy_fee_adopted',
      resourceType: 'learner', resourceId: learnerId,
      description: AdmissionFeesActivityTemplates.enquiry.legacy_fee_adopted(
        result.item_count,
        (result.fee_items as { amount?: number }[]).reduce((s, it) => s + (it.amount ?? 0), 0),
      ),
      metadata: { learner_id: learnerId, item_count: result.item_count },
    });

    toast.success(`Adopted: ${result.item_count} fee items`);
    onAdopted?.();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Adopt failed');
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **Step 5: Verify per-file syntax** for both files.

- [ ] **Step 6: Commit** as one commit referencing Plan Task 6.

---

# PHASE D — Codebase hygiene

## Task 7: Regenerate Supabase generated types

**Files:**
- Modify: `types/supabase.ts` (regenerate)

`types/supabase.ts` is stale — none of Plans 1-5's new tables (`admission_fee_structures`, `admission_fee_adjustments`, `admission_fee_change_events`, `admission_fee_change_event_lines`, `admission_fee_structure_items`, `admission_settings_per_institution`, `student_credit_balances`, `learner_admission_documents`, `quotas`, `community_categories`, `accommodation_types`) are present. 59+ pre-existing TS errors across admission services come from this gap.

- [ ] **Step 1: Run the generator**

```bash
npx supabase gen types typescript --linked > types/supabase.ts
```

If `--linked` doesn't work (no linked project), use the project ID:
```bash
npx supabase gen types typescript --project-id <project-ref> > types/supabase.ts
```

- [ ] **Step 2: Verify the file grew** (was ~Xk lines; should be ~X+2k after the new tables land).

- [ ] **Step 3: Run `npx tsc --noEmit -p tsconfig.json`** — this might still hang per Plans 1-5 retrospectives; if so, run via the temp-tsconfig technique scoped to the admission service files. Verify the previously-pre-existing 59 errors are resolved.

- [ ] **Step 4: Commit** referencing Plan Task 7.

```bash
git add types/supabase.ts
git commit -m "chore(admission-fees): regenerate Supabase types after Plans 1-5 schema additions

Stale types caused 59+ pre-existing TS errors across admission services
(documented in Plans 2-5 retrospectives). Regeneration includes all the
new tables: fee_structures, fee_adjustments, fee_change_events + lines,
fee_structure_items, settings_per_institution, credit_balances,
admission_documents, quotas, community_categories, accommodation_types.

Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-06-cutover-adoption.md Task 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# PHASE E — Verification + ship

## Task 8: End-to-end smoke runbook

**Files:**
- Create: `docs/superpowers/runbooks/2026-05-05-admission-fees-end-to-end-smoke.md`

A documented runbook the QA / accounts team follows to verify the full flow. Not automated tests — a manual checklist with SQL verification queries between steps.

- [ ] **Step 1: Write the runbook**

```markdown
# Admission Fees — End-to-End Smoke Runbook

## Prerequisites

- One test institution with `use_fee_structures = false` (default state) — let's call it INST_A.
- Admin user with `super_admin` role.

## Phase 1 — Configure & flip flag

1. As admin, visit `/admission/settings/lookups/quotas`. Confirm 8 canonical seeds.
2. Visit `/admission/settings/lookups/community-categories`. Confirm 9 seeds.
3. Visit `/admission/settings/lookups/accommodation-types`. Pick INST_A. Confirm 4 starter rows.
4. Visit `/admission/settings/lookups/data-quality`. Note count of pending DQR rows; map any obvious aliases.
5. Visit `/admission/settings/fees-structure`. Drill into INST_A → some degree → department → programme → quota=Govt → community=OC → accommodation=Hostel → year 2026-27. Click + New Fee Structure.
6. Add 3 line items: Tuition (₹50000), Hostel (₹30000), Library (₹2000). Save.
7. Visit `/admission/settings/general`. Pick INST_A. Toggle "Use Fee Structures" ON. Confirm soft-warn dialog if you didn't configure structures elsewhere — accept and proceed.

**Verify:**
```sql
SELECT use_fee_structures FROM admission_settings_per_institution WHERE institution_id = '<INST_A_id>';
-- Expected: true.
```

## Phase 2 — Net-new enquiry (matrix-driven)

8. Create a new enquiry in INST_A with the dims matching the structure. Course Selection + Accommodation tabs filled in.
9. Open the Finance tab. Expected: structure rows auto-populated, no manual repeater, Resolved Total = 82,000.
10. Add an adjustment: scholarship_merit, -5000 against Tuition. Resolved Total drops to 77,000.
11. Final-submit. Pre-submit dialog opens (read-only summary). Confirm. Lead saved.

**Verify:**
```sql
SELECT legacy_fee_mode, jsonb_array_length(fee_items) FROM learners_profiles WHERE id = '<new_lead_id>';
-- Expected: legacy_fee_mode=false, fee_items count = 4 (3 structure rows + 1 global adjustment OR 3 rows with the Tuition row carrying the delta — depends on adjustment shape).
```

## Phase 3 — Status='account' transition

12. From admission/leads, find the new lead. Move funnel_stage to documents_verified or later (per Plan 4 Task 11 eligibility).
13. Click "Move to Account". Dialog opens with fee summary + documents checklist.
14. Tick all required docs (PAN, Aadhaar, parent_id, agreement_form). Pick received_via for each. Confirm.

**Verify:**
```sql
SELECT lifecycle_status FROM learners_profiles WHERE id = '<new_lead_id>';
-- Expected: 'account'.

SELECT count(*) FROM billing_student_bills WHERE student_id = '<new_lead_id>';
-- Expected: ≥ 3 (one per fee_items entry).

SELECT count(*) FROM learner_admission_documents WHERE learner_id = '<new_lead_id>';
-- Expected: 4 (one per required doc).
```

## Phase 4 — Fee-change reconciliation

15. Update the lead's program_id to a different programme in INST_A (one that DOES have a different fee structure configured).

**Verify:** the trigger fires:
```sql
SELECT id, status, trigger_field FROM admission_fee_change_events
 WHERE learner_id = '<new_lead_id>' ORDER BY requested_at DESC LIMIT 1;
-- Expected: 1 row, status='pending_review', trigger_field='program_id'.

SELECT count(*) FROM admission_fee_change_event_lines
 WHERE event_id = '<event_id>';
-- Expected: ≥ 3 (categories from old + new structures).
```

16. Visit `/billing/onboarding`. Notification bell shows badge "1". Click. Side panel shows the event. Click event.
17. Per-event review modal: pick decisions for each line (e.g. apply_supplemental for tuition, reallocate_payment for hostel). Approve.

**Verify:**
```sql
SELECT status FROM admission_fee_change_events WHERE id = '<event_id>';
-- Expected: 'approved'.

SELECT status, COUNT(*) FROM billing_student_bills
 WHERE student_id = '<new_lead_id>' GROUP BY status;
-- Expected: mixture of 'unpaid', 'superseded' depending on decisions.

SELECT count(*) FROM billing_receipt_items
 WHERE bill_id IN (SELECT id FROM billing_student_bills WHERE student_id = '<new_lead_id>')
   AND allocation_reason = 'fee_structure_change_reallocation';
-- Expected: ≥ 1 if any reallocate decision was made.
```

## Phase 5 — Activation gate

18. Try to activate the lead before approving the event. Expected: error toast "Cannot activate: a pending fee-change event must be resolved first".
19. After approval, retry activation. Expected: still blocked if balance > 0; activates if all bills paid.

## Phase 6 — Legacy adoption

20. Pick a flag-on institution lead with `legacy_fee_mode=true` (a row from before the flag flip). Visit its Finance tab.
21. Banner shows: "Legacy fees: this lead uses manual fee entry. Migrate to fee structure".
22. Click Migrate. Preview shows old vs structure-derived. Confirm.

**Verify:**
```sql
SELECT legacy_fee_mode, jsonb_array_length(fee_items) FROM learners_profiles WHERE id = '<adopted_lead_id>';
-- Expected: legacy_fee_mode=false, fee_items populated.
```

## Phase 7 — Activity log audit

23. Query the activity log:

```sql
SELECT action_type, COUNT(*) FROM user_activity_logs
 WHERE created_at > now() - interval '1 hour'
   AND action_type LIKE 'fee_%' OR action_type LIKE 'enquiry.fee_%'
        OR action_type LIKE 'lifecycle.account_transition'
        OR action_type LIKE 'documents.received'
        OR action_type LIKE 'bill.%'
        OR action_type LIKE 'student_credit_balance.%'
 GROUP BY 1 ORDER BY 1;
```

Expected entries (from this smoke):
- `enquiry.fee_resolved` (Phase 2)
- `lifecycle.account_transition` (Phase 3)
- `documents.received` (Phase 3, ×4)
- `bill.auto_generated` (Phase 3)
- `fee_change_event.approved` (Phase 4)
- `bill.superseded` (Phase 4)
- `receipt_item.reallocated` (Phase 4)
- `student_credit_balance.created` (Phase 4)
- `enquiry.legacy_fee_adopted` (Phase 6)

## Pass criteria

All SQL verifications match expected. Notification bell badge updates within 30s. Pre-submit dialog gates submission. Status-change dialog gates Confirm until docs ticked. Activation blocks while pending event exists.
```

- [ ] **Step 2: Commit** referencing Plan Task 8.

---

## Task 9: Final roadmap update + ship

**Files:**
- Modify: `docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md`

- [ ] **Step 1: Mark Plan 6 ✅ in roadmap** with retrospective covering: feature flag enforcement strategy (BEFORE INSERT trigger sets default), the two Plan 3 deferrals closed (pre-submit wiring + atomic adopt RPC), Supabase types regenerated, end-to-end runbook documented, any v1.5 deferrals remaining.

- [ ] **Step 2: Update roadmap top-level** — add a "✅ Spec shipped" banner / note. The roadmap was the durable artifact across the entire build; now it's the durable proof of completion.

- [ ] **Step 3: Commit + push.**

```bash
git add docs/superpowers/plans/2026-05-05-admission-fees-roadmap.md
git commit -m "docs(admission-fees): mark Plan 6 (Cutover & Adoption) complete — spec shipped

[retrospective]
"
git push origin main
```

---

## Plan-6 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §12.1 feature flag enforcement | Tasks 1, 2 |
| §10.1 admission.settings.manage permission | Task 3 |
| §12.1 admin settings UI for flag flip | Task 4 |
| §9.3 pre-submit confirmation dialog wired (Plan 3 deferral) | Task 5 |
| §12.1 atomic adopt-structure RPC (Plan 3 deferral) | Task 6 |
| (cross-plan) Supabase types regen | Task 7 |
| (cross-plan) end-to-end smoke runbook | Task 8 |
| Spec sign-off | Task 9 |

---

## Open Items / Risks

- **Net-new enquiry default flip** (Task 1): the trigger fires on every INSERT. If `admission_settings_per_institution` doesn't have a row for the institution_id (shouldn't happen — Plan 1 seeded one per institution), `v_use_fee_structures` is NULL → DDL default `true` is preserved. Fail-closed behavior.
- **Pre-submit dialog wiring (Task 5)**: the parent `enquiry-form.tsx` is large and might have multiple submit paths. Read end-to-end first; if there are multiple submit handlers (e.g. save-as-draft, save-and-continue), wire the dialog into the FINAL-submit path only.
- **`FeeResolutionService.previewMatchByDimensions`** is the right call for the pre-submit dialog (returns the matched structure + items for display). The actual `resolveForLearner` requires a learner_id which doesn't exist pre-save.
- **Adopt-structure RPC permission**: Plan 6 uses `admission_fees.manage_adjustments`. Could argue for a stricter `admission_fees.override` (super_admin only). v1 keeps it broader for usability — admin assistants can adopt; flip the gate via SQL if needed.
- **Supabase types regeneration** (Task 7) requires the `--linked` Supabase project or explicit project ID. If the running session doesn't have credentials, defer to a developer with access. The codebase will function at runtime regardless; only static type-checking benefits.
- **Smoke runbook is manual, not automated.** v1.5 polish: convert into a Playwright e2e suite. v1 assumes QA / accounts team runs through manually after each plan deploys.
- **Notification bell `institutionId={undefined}`** (Plan 5 retrospective): currently global view. v1.5 polish: wire to a per-institution context if onboarding adds an institution selector.
- **Three v1.5 deferrals NOT addressed in Plan 6** (intentional — they're polish, not ship-blockers):
  - Credit balance consumption flow at receipt creation (Plan 5)
  - Refund automation (Plan 5)
  - Tree-rail compression in fee-structure builder (Plan 2)

---

## Spec sign-off (after Task 9 commit lands)

✅ All six plans executed
✅ All migrations applied
✅ Net-new flow live for flag-on institutions
✅ Legacy flow preserved for flag-off institutions
✅ Adoption banner gated on flag
✅ End-to-end runbook documented
✅ Supabase types regenerated

The spec at `docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md` is FULFILLED.
