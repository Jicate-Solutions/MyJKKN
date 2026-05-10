// ============================================================================
// HR — Onboarding Checklists (T3.1 from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// Admin CRUD on `hr_onboarding_checklists`. Defines the onboarding STEPS a
// new joinee in a given (HR organization × cadre) is expected to complete
// (ID card, email setup, HOD intro, probation check-in, …).
//
// Pattern: extends `lib/admin/policy-shell` (Shape C — LookupConfig). Cloned
// from `app/(routes)/admin/hr/shift-templates/page.tsx` (T1.6 Phase 2a).
//
// Standing rule (2026-04-29 Director): every policy decision = config-table
// row + super_admin UI that READS/WRITES the table.
//
// Schema (production-applied): id, hr_organization_id, applies_to_cadre_id
// (nullable = "applies to all cadres"), checklist_name, steps jsonb,
// is_active, audit cols.
//
// SCOPE: T3.1 — admin CRUD on the per-cadre TEMPLATE table. Per-staff
// instance tracking (one row per joinee × step with completed_at) is a
// Phase 2 gap — needs a new `hr_staff_onboarding_progress` table.
//
// Permission gate: admin_or_super_admin (matches required-documents +
// shift-templates pages; no dedicated `hr.onboarding.*` permission key).
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import {
  LookupTable,
  PolicyPageShell,
  type FieldSchema,
  type LookupConfig,
  type PolicyHandlers,
  type EnumOption,
} from '@/lib/admin/policy-shell';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OnboardingService } from '@/lib/services/hr/onboarding-service';
import {
  formatStepsText,
  parseStepsText,
  type HROnboardingChecklistView,
} from '@/types/hr-onboarding';

const ALL_CADRES_VALUE = '__all_cadres__';

interface HROrgOption {
  id: string;
  name: string;
}

interface HRCadreOption {
  id: string;
  name: string;
  code: string;
  hr_organization_id: string;
}

export default function OnboardingChecklistsPage() {
  const supabase = createClientSupabaseClient();
  const [orgOptions, setOrgOptions] = useState<ReadonlyArray<HROrgOption>>([]);
  const [cadreOptions, setCadreOptions] = useState<ReadonlyArray<HRCadreOption>>(
    [],
  );

  // Pre-load HR organizations + cadres once. Used for the org column display
  // + create-form scope pickers. Edit form locks org (matches the convention
  // that scope is set at create-time, not flipped after).
  useEffect(() => {
    let active = true;
    (async () => {
      const sb = supabase as unknown as ReturnType<typeof createClientSupabaseClient>;

      const orgRes = await sb
        .from('hr_organizations')
        .select('id, name')
        .order('name');
      if (!active) return;
      if (orgRes.error) {
        toast.error(
          `Could not load HR organizations: ${orgRes.error.message}`,
        );
      } else {
        setOrgOptions(
          (orgRes.data ?? []).map((r) => ({
            id: (r as { id: string }).id,
            name: (r as { name: string | null }).name ?? '—',
          })),
        );
      }

      const cadreRes = await sb
        .from('hr_cadres')
        .select('id, name, code, hr_organization_id')
        .eq('is_active', true)
        .order('display_order')
        .order('name');
      if (!active) return;
      if (cadreRes.error) {
        toast.error(`Could not load cadres: ${cadreRes.error.message}`);
      } else {
        setCadreOptions(
          (cadreRes.data ?? []).map((r) => {
            const row = r as {
              id: string;
              name: string | null;
              code: string | null;
              hr_organization_id: string;
            };
            return {
              id: row.id,
              name: row.name ?? '—',
              code: row.code ?? '',
              hr_organization_id: row.hr_organization_id,
            };
          }),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Build the form schema. Cadre dropdown filters by the currently-selected
  // org. Edit mode locks the org (matches required-documents convention).
  const buildFormSchema = (
    editing: HROnboardingChecklistView | null,
  ): ReadonlyArray<FieldSchema> => {
    const orgEnum: EnumOption[] = orgOptions.map((o) => ({
      value: o.id,
      label: o.name,
    }));

    // For create: show all cadres. For edit: only show cadres in the same
    // org as the row being edited (so we don't accidentally cross-link).
    const cadreScopeOrg = editing?.hr_organization_id ?? null;
    const filteredCadres = cadreScopeOrg
      ? cadreOptions.filter((c) => c.hr_organization_id === cadreScopeOrg)
      : cadreOptions;

    const cadreEnum: EnumOption[] = [
      {
        value: ALL_CADRES_VALUE,
        label: '— Applies to all cadres —',
        hint: 'Catch-all default. Used when no cadre-specific checklist exists.',
      },
      ...filteredCadres.map((c) => ({
        value: c.id,
        label: c.code ? `${c.name} (${c.code})` : c.name,
      })),
    ];

    return [
      {
        name: 'hr_organization_id',
        kind: 'enum',
        englishLabel: 'HR Organization',
        englishHint: editing
          ? 'Locked. Org cannot be changed after a checklist is created.'
          : 'Pick the organization (institution) this onboarding checklist applies to.',
        options:
          orgEnum.length === 0
            ? [{ value: '__none__', label: '— No organizations available —' }]
            : orgEnum,
        required: true,
        disabled: Boolean(editing),
      },
      {
        name: 'applies_to_cadre_id',
        kind: 'enum',
        englishLabel: 'Cadre',
        englishHint:
          'Which cadre does this checklist apply to? Pick "Applies to all cadres" for the org-wide default; pick a specific cadre to override the default for that role family.',
        options: cadreEnum,
        required: false,
      },
      {
        name: 'checklist_name',
        kind: 'text',
        englishLabel: 'Checklist name',
        englishHint:
          'How HR sees this checklist in the admin list. Examples: "Standard Onboarding — Teaching", "Hostel Warden Onboarding".',
        placeholder: 'Standard Onboarding — Teaching',
        required: true,
      },
      {
        name: 'steps_text',
        kind: 'textarea',
        englishLabel: 'Steps (one per line)',
        englishHint:
          'One step per line. Optional "(by day N)" suffix sets when the step is expected to complete. Example:\n1. ID card issued (by day 1)\n2. JKKN email setup (by day 2)\n3. HOD intro meeting (by day 3)\n4. 30-day probation check-in (by day 30)',
        placeholder:
          '1. ID card issued (by day 1)\n2. JKKN email setup (by day 2)\n3. HOD intro meeting (by day 3)',
        required: true,
      },
      {
        name: 'is_active',
        kind: 'toggle',
        englishLabel: 'Active',
        englishHint:
          'When off, this checklist is hidden from new-joinee onboarding flows but historical records keep working. Use instead of delete for audit trail.',
      },
    ];
  };

  const config: LookupConfig<HROnboardingChecklistView> = {
    title: 'HR — Onboarding Checklists',
    explainer: (
      <>
        <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
        <p>
          Defines the onboarding steps a new staff member is expected to
          complete during their first weeks (ID card, email setup, HOD intro,
          probation check-in, …). Each row is scoped to one HR organization
          and optionally to one cadre.
        </p>
        <p className="mt-2">
          Leave <strong>Cadre</strong> as &quot;Applies to all cadres&quot; for
          the organization-wide default. Pick a specific cadre to override the
          default for that role family (e.g. Teaching gets a longer checklist
          than Supporting).
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Phase 1 (T3.1): admin CRUD on the per-cadre TEMPLATE table. Per-
          staff progress tracking (one row per joinee × step with completion
          state) is Phase 2 — needs a new <code>hr_staff_onboarding_progress</code>
          {' '}table.
        </p>
      </>
    ),
    columns: [
      {
        header: 'Organization',
        widthClass: 'w-48',
        cell: (row) => (
          <span className="text-sm text-muted-foreground">
            {row.organization_name ?? '—'}
          </span>
        ),
      },
      {
        header: 'Cadre',
        widthClass: 'w-44',
        cell: (row) => (
          <span className="text-sm">
            {row.cadre_name ? (
              <>
                {row.cadre_name}
                {row.cadre_code ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {row.cadre_code}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="italic text-muted-foreground">All cadres</span>
            )}
          </span>
        ),
      },
      {
        header: 'Checklist',
        cell: (row) => (
          <span className="text-sm font-medium">{row.checklist_name}</span>
        ),
      },
      {
        header: 'Steps',
        widthClass: 'w-20',
        cell: (row) => (
          <span className="text-sm tabular-nums">{row.steps.length}</span>
        ),
      },
      {
        header: 'Active',
        widthClass: 'w-20',
        cell: (row) => (
          <span className="text-xs">{row.is_active ? 'Yes' : 'No'}</span>
        ),
      },
    ],
    rowHint: (row) =>
      !row.is_active
        ? 'Inactive — hidden from new-joinee flows. Historical records keep working.'
        : null,
    formSchema: buildFormSchema,
    addLabel: 'Add Onboarding Checklist',
    emptyMessage:
      'No onboarding checklists configured. Click "Add Onboarding Checklist" to create your first one.',
    entityNoun: 'Onboarding Checklist',
    deleteConfirmText: (row) =>
      `Permanently delete "${row.checklist_name}"? This removes the per-cadre onboarding template for ${
        row.cadre_name ?? 'all cadres'
      } in ${row.organization_name ?? 'this organization'}. Use the "Active" toggle for soft-archive.`,
  };

  const handlers: PolicyHandlers<HROnboardingChecklistView> = {
    onLoad: async () => {
      // Show ALL templates (active + inactive) to admins; they manage history.
      return OnboardingService.listChecklists(supabase, { activeOnly: false });
    },
    onSave: async (values, editing) => {
      const requireText = (raw: unknown, label: string): string => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) throw new Error(`${label} is required.`);
        return v;
      };

      const checklistName = requireText(values.checklist_name, 'Checklist name');
      const steps = parseStepsText(values.steps_text);
      const isActive = Boolean(values.is_active);

      // Translate the "all cadres" sentinel back to NULL.
      const rawCadre = values.applies_to_cadre_id;
      const appliesToCadreId =
        typeof rawCadre === 'string' &&
        rawCadre.length > 0 &&
        rawCadre !== ALL_CADRES_VALUE
          ? rawCadre
          : null;

      if (editing) {
        const updated = await OnboardingService.updateChecklist(
          supabase,
          editing.id,
          {
            checklist_name: checklistName,
            applies_to_cadre_id: appliesToCadreId,
            steps,
            is_active: isActive,
          },
        );
        // Re-derive the denormalized view fields from cached options. The
        // server-side response only has FK ids; we look up display names
        // locally so the table refreshes without a re-fetch round-trip.
        const cadre = appliesToCadreId
          ? cadreOptions.find((c) => c.id === appliesToCadreId)
          : null;
        return {
          ...updated,
          steps,
          organization_name: editing.organization_name,
          cadre_name: cadre?.name ?? null,
          cadre_code: cadre?.code ?? null,
        };
      }

      // Create
      const rawOrgId = values.hr_organization_id;
      if (
        typeof rawOrgId !== 'string' ||
        rawOrgId.length === 0 ||
        rawOrgId === '__none__'
      ) {
        throw new Error('HR Organization is required.');
      }
      // Sanity: cadre (if set) must belong to the chosen org.
      if (appliesToCadreId) {
        const cadre = cadreOptions.find((c) => c.id === appliesToCadreId);
        if (cadre && cadre.hr_organization_id !== rawOrgId) {
          throw new Error(
            'Selected cadre does not belong to the chosen organization.',
          );
        }
      }

      const created = await OnboardingService.createChecklist(supabase, {
        hr_organization_id: rawOrgId,
        applies_to_cadre_id: appliesToCadreId,
        checklist_name: checklistName,
        steps,
        is_active: isActive,
      });

      const orgName =
        orgOptions.find((o) => o.id === rawOrgId)?.name ?? null;
      const cadre = appliesToCadreId
        ? cadreOptions.find((c) => c.id === appliesToCadreId)
        : null;
      return {
        ...created,
        steps,
        organization_name: orgName,
        cadre_name: cadre?.name ?? null,
        cadre_code: cadre?.code ?? null,
      };
    },
    onDelete: async (row) => {
      await OnboardingService.deleteChecklist(supabase, row.id);
    },
  };

  const newRowDefaults = {
    hr_organization_id: '',
    applies_to_cadre_id: ALL_CADRES_VALUE,
    checklist_name: '',
    steps_text:
      '1. ID card issued (by day 1)\n2. JKKN email setup (by day 2)\n3. Welcome meeting with HOD (by day 3)\n4. HR policies handbook acknowledged (by day 5)\n5. 30-day probation check-in (by day 30)',
    is_active: true,
  };

  const rowToFormValues = (row: HROnboardingChecklistView) => ({
    hr_organization_id: row.hr_organization_id,
    applies_to_cadre_id: row.applies_to_cadre_id ?? ALL_CADRES_VALUE,
    checklist_name: row.checklist_name,
    steps_text: formatStepsText(row.steps),
    is_active: row.is_active,
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<HROnboardingChecklistView>
        config={config}
        handlers={handlers}
        newRowDefaults={newRowDefaults}
        rowToFormValues={rowToFormValues}
      />
    </PolicyPageShell>
  );
}
