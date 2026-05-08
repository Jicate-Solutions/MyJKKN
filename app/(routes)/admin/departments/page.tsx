// ============================================================================
// DEPARTMENTS — HoD Assignment admin UI.
// Created: 2026-05-07 (Coordination PR Phase 0).
//
// Lets HR officers / institution admins assign a Head of Department per
// department. Used by SAMS appraisal routing (one HoD per dept).
//
// Composes the policy-shell substrate (PR #757):
//   - PolicyPageShell (gate + header + explainer banner)
//   - LookupTable (Shape C — FROM=department → TO=hod profile)
//
// Permission gate: admin_or_super_admin (HR officers must edit; super-admin
// can override). Specific permission: 'admin.departments.hod.write'.
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

interface DepartmentRow {
  id: string;
  department_name: string;
  department_code: string | null;
  institution_id: string;
  institution_name: string;
  head_of_department_id: string | null;
  hod_name: string | null;
}

interface HoDCandidate {
  profile_id: string;
  full_name: string | null;
  institution_id: string;
  institution_name: string;
}

export default function DepartmentsHoDPage() {
  const supabase = createClientSupabaseClient();
  const [hodOptions, setHodOptions] = useState<ReadonlyArray<HoDCandidate>>([]);

  // Pre-load HoD candidates once. Re-loaded only on manual refresh of the table.
  // ~40 staff have role_key='hod' across 8 institutions today (verified 2026-05-08
  // against prod). Cheap one-shot fetch.
  //
  // Note: role_key lives on `staff`, NOT on `profiles`. The original Coordination
  // PR (#767) wired this query against `profiles.role_key` which doesn't exist —
  // surfacing zero candidates regardless of state. Fixed in this PR.
  // departments.head_of_department_id references profiles(id), so we resolve
  // staff.profile_id and skip any staff rows without a linked profile (cannot
  // receive notifications / permissions without a profile).
  useEffect(() => {
    let active = true;
    (async () => {
      // TODO(Phase 0A): drop `as any` cast after Supabase TS client typing
      // tolerates the institutions!inner relation join cleanly.
      const sb = supabase as any;
      const { data, error } = await sb
        .from('staff')
        .select(
          'profile_id, first_name, last_name, institution_id, institutions!inner(name), role_key, is_active',
        )
        .eq('role_key', 'hod')
        .eq('is_active', true);
      if (!active) return;
      if (error) {
        toast.error(`Could not load HoD candidates: ${error.message}`);
        return;
      }
      const candidates: HoDCandidate[] = (data ?? [])
        .filter((row: any) => row.profile_id)
        .map((row: any) => {
          const fullName = [row.first_name, row.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();
          return {
            profile_id: row.profile_id,
            full_name: fullName || '(unnamed)',
            institution_id: row.institution_id,
            institution_name: row.institutions?.name ?? '—',
          };
        });
      setHodOptions(candidates);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Build form schema dynamically — enum options scoped to the editing row's
  // institution so the dropdown only shows HoD candidates from that college.
  const buildFormSchema = (
    editing: DepartmentRow | null,
  ): ReadonlyArray<FieldSchema> => {
    const scopedOptions: EnumOption[] = editing
      ? hodOptions
          .filter((h) => h.institution_id === editing.institution_id)
          .map((h) => ({
            value: h.profile_id,
            label: h.full_name ?? '(unnamed)',
          }))
      : [];

    return [
      {
        name: 'head_of_department_id',
        kind: 'enum',
        englishLabel: 'Head of Department',
        englishHint:
          scopedOptions.length === 0
            ? 'No staff with role_key=hod found in this institution. Assign role_key=hod to a staff member first.'
            : 'Pick the staff member who acts as HoD. Used by SAMS appraisal routing.',
        options: scopedOptions.length === 0
          ? [{ value: '', label: '— No HoD candidates available —' }]
          : [{ value: '', label: '— Unassigned —' }, ...scopedOptions],
        required: false,
      },
    ];
  };

  const config: LookupConfig<DepartmentRow> = {
    title: 'Departments — HoD Assignment',
    explainer: (
      <>
        <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
        <p>
          Assign one Head of Department per department. The chosen staff member
          receives appraisal review responsibilities (SAMS) and approves
          attendance regularizations for their department.
        </p>
        <p className="mt-2">
          When you change a department&apos;s HoD, in-flight appraisals stay
          with the previous HoD; new appraisals route to the new HoD on the
          next cycle.
        </p>
      </>
    ),
    columns: [
      {
        header: 'Institution',
        widthClass: 'w-48',
        cell: (row) => (
          <span className="text-sm text-muted-foreground">
            {row.institution_name}
          </span>
        ),
      },
      {
        header: 'Department',
        cell: (row) => (
          <span className="text-sm font-medium">{row.department_name}</span>
        ),
      },
      {
        header: 'Code',
        widthClass: 'w-24',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.department_code ?? '—'}
          </span>
        ),
      },
      {
        header: 'Head of Department',
        cell: (row) =>
          row.hod_name ? (
            <span className="text-sm">{row.hod_name}</span>
          ) : (
            <span className="text-sm italic text-muted-foreground">
              — Unassigned —
            </span>
          ),
      },
    ],
    rowHint: (row) =>
      row.hod_name
        ? null
        : 'No HoD assigned. SAMS appraisals from this department have no review target until assigned.',
    formSchema: buildFormSchema,
    emptyMessage: 'No departments configured.',
    entityNoun: 'Department',
  };

  const handlers: PolicyHandlers<DepartmentRow> = {
    onLoad: async () => {
      // TODO(Phase 0A): drop `as any` cast after types/supabase.ts regenerates
      // post-migration. Joined-relation typing exceeds Supabase TS recursion.
      const sb = supabase as any;
      const { data, error } = await sb
        .from('departments')
        .select(
          `
          id,
          department_name,
          department_code,
          institution_id,
          head_of_department_id,
          institutions!inner(name),
          head:profiles!departments_head_of_department_id_fkey(full_name)
        `,
        )
        .order('institution_id')
        .order('department_name');

      if (error) {
        throw new Error(`Failed to load departments: ${error.message}`);
      }

      return (data ?? []).map((d: any): DepartmentRow => ({
        id: d.id,
        department_name: d.department_name,
        department_code: d.department_code ?? null,
        institution_id: d.institution_id,
        institution_name: d.institutions?.name ?? '—',
        head_of_department_id: d.head_of_department_id ?? null,
        hod_name: d.head?.full_name ?? null,
      }));
    },
    onSave: async (values, editing) => {
      if (!editing) {
        throw new Error(
          'Departments are managed elsewhere. This page only assigns HoDs.',
        );
      }
      const raw = values.head_of_department_id;
      const hodId = typeof raw === 'string' && raw.length > 0 ? raw : null;

      // TODO(Phase 0A): drop `as any` after types/supabase.ts regenerates with
      // departments.head_of_department_id field; current snapshot predates DDL.
      const { error } = await supabase
        .from('departments')
        .update({ head_of_department_id: hodId } as any)
        .eq('id', editing.id);

      if (error) {
        throw new Error(`Could not update HoD: ${error.message}`);
      }

      // Resolve the new HoD's name for the optimistic row return; LookupTable
      // calls onLoad() on success so the canonical state comes from the server.
      const newHod = hodOptions.find((h) => h.profile_id === hodId);
      return {
        ...editing,
        head_of_department_id: hodId,
        hod_name: newHod?.full_name ?? null,
      };
    },
  };

  const rowToFormValues = (row: DepartmentRow) => ({
    head_of_department_id: row.head_of_department_id ?? '',
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<DepartmentRow>
        config={config}
        handlers={handlers}
        rowToFormValues={rowToFormValues}
        readOnly={false}
      />
    </PolicyPageShell>
  );
}
