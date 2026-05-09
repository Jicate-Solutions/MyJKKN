// ============================================================================
// HR — Required Documents (T1.5a from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-09.
//
// Admin CRUD on the POLICY table `hr_required_documents`. Defines WHICH
// documents new staff MUST submit during onboarding (PAN, Aadhaar, certs)
// and which `employment_type` values each requirement applies to.
//
// Pattern: extends `lib/admin/policy-shell` (Shape C — LookupConfig). Cloned
// from `app/(routes)/admin/departments/page.tsx`. Substrate is PR #757.
//
// Standing rule (2026-04-29 Director): every policy decision = config-table
// row + super_admin UI that READS/WRITES the table. SQL functions read the
// table at runtime. This page IS that pattern.
//
// Schema (production-applied): id, hr_organization_id, document_name,
// document_code, category, is_mandatory, applies_to_employment_types text[],
// notes, valid_from, valid_until, superseded_by, audit cols.
//
// SCOPE: T1.5(a) — admin CRUD on the policy table. T1.5(b) (employee-side
// uploads + Supabase Storage bucket) is DEFERRED pending Q-locks.
//
// Permission gate: admin_or_super_admin (matches departments page; no
// dedicated `hr.required_documents.write` permission key exists yet).
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

// 5 employment types per types/hr.ts:68 (HREmploymentType union). Source of
// truth for the multi-select hint and validation. Do NOT add values here
// without updating the type union.
const EMPLOYMENT_TYPE_VALUES = [
  'full_time',
  'guest',
  'student_ta',
  'vendor_monitored',
  'unpaid_volunteer',
] as const;

// Mirror of types/hr.ts EMPLOYMENT_TYPE_LABELS — duplicated here to avoid
// pulling the full HR types module into a thin admin page bundle.
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time (Staff)',
  guest: 'Guest Lecturer',
  student_ta: 'Student TA',
  vendor_monitored: 'Vendor-Monitored',
  unpaid_volunteer: 'Volunteer',
};

// Categories match the seed values in features/hr/policies/registry.ts:194.
const CATEGORY_OPTIONS: ReadonlyArray<EnumOption> = [
  { value: 'identity', label: 'Identity' },
  { value: 'education', label: 'Education' },
  { value: 'experience', label: 'Experience' },
  { value: 'medical', label: 'Medical' },
  { value: 'other', label: 'Other' },
];

interface RequiredDocumentRow {
  id: string;
  hr_organization_id: string;
  organization_name: string;
  document_name: string;
  document_code: string;
  category: string | null;
  is_mandatory: boolean;
  applies_to_employment_types: string[];
  notes: string | null;
}

interface HROrgOption {
  id: string;
  name: string;
}

// Format an array as a comma-separated string with no spaces — what the form
// displays. Round-trips cleanly through parseEmploymentTypesCsv.
function formatEmploymentTypesCsv(values: string[]): string {
  return values.join(',');
}

// Parse the comma-sep text input back to a clean string[]. Strips whitespace
// and empty tokens. Does NOT validate against EMPLOYMENT_TYPE_VALUES — that
// happens in onSave so the user gets a single error toast.
function parseEmploymentTypesCsv(input: unknown): string[] {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function RequiredDocumentsPage() {
  const supabase = createClientSupabaseClient();
  const [orgOptions, setOrgOptions] = useState<ReadonlyArray<HROrgOption>>([]);

  // Pre-load HR organizations once. Used for the org column display + the
  // create-form scope picker. Edit form locks org (matches the convention
  // that scope is set at create-time, not flipped after).
  useEffect(() => {
    let active = true;
    (async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from('hr_organizations')
        .select('id, name')
        .order('name');
      if (!active) return;
      if (error) {
        toast.error(`Could not load HR organizations: ${error.message}`);
        return;
      }
      setOrgOptions(
        (data ?? []).map((r: any) => ({ id: r.id, name: r.name ?? '—' })),
      );
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const buildFormSchema = (
    editing: RequiredDocumentRow | null,
  ): ReadonlyArray<FieldSchema> => {
    const orgEnum: EnumOption[] = orgOptions.map((o) => ({
      value: o.id,
      label: o.name,
    }));

    return [
      {
        name: 'hr_organization_id',
        kind: 'enum',
        englishLabel: 'HR Organization',
        englishHint: editing
          ? 'Locked. Org cannot be changed after a policy row is created.'
          : 'Pick the organization this document requirement applies to.',
        options:
          orgEnum.length === 0
            ? [{ value: '__none__', label: '— No organizations available —' }]
            : orgEnum,
        required: true,
        disabled: Boolean(editing),
      },
      {
        name: 'document_code',
        kind: 'text',
        englishLabel: 'Code',
        englishHint:
          'Short uppercase identifier. Examples: PAN, AADHAAR, MASTERS_CERT.',
        required: true,
        placeholder: 'PAN',
      },
      {
        name: 'document_name',
        kind: 'text',
        englishLabel: 'Document Name',
        englishHint:
          'Human-readable name shown to staff during onboarding (e.g. "PAN Card", "Master’s Degree Certificate").',
        required: true,
        placeholder: 'PAN Card',
      },
      {
        name: 'category',
        kind: 'enum',
        englishLabel: 'Category',
        englishHint:
          'Optional grouping used to organize the onboarding checklist.',
        options: [
          { value: '__none__', label: '— None —' },
          ...CATEGORY_OPTIONS,
        ],
        required: false,
      },
      {
        name: 'is_mandatory',
        kind: 'toggle',
        englishLabel: 'Mandatory',
        englishHint:
          'If on, employees cannot complete onboarding without submitting this document. If off, they can skip it.',
        required: false,
      },
      {
        name: 'applies_to_employment_types',
        kind: 'text',
        englishLabel: 'Applies to (comma-separated employment types)',
        englishHint:
          'Comma-separated list. Valid values: full_time, guest, student_ta, vendor_monitored, unpaid_volunteer. Example: full_time,guest',
        required: true,
        placeholder: 'full_time',
      },
      {
        name: 'notes',
        kind: 'textarea',
        englishLabel: 'Notes',
        englishHint:
          'Optional notes for HR officers (where to send originals, expected file format, etc.).',
        required: false,
      },
    ];
  };

  const config: LookupConfig<RequiredDocumentRow> = {
    title: 'HR — Required Documents',
    explainer: (
      <>
        <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
        <p>
          Defines which documents new employees MUST submit during onboarding
          (PAN, Aadhaar, certificates, etc.) and which employment types each
          requirement applies to. HR officers see this list as the document
          checklist when onboarding a new joinee.
        </p>
        <p className="mt-2">
          Each row is scoped to one HR organization. Toggle{' '}
          <strong>Mandatory</strong> off for nice-to-have documents. Use{' '}
          <strong>Applies to</strong> to scope a requirement (e.g. degree
          certificate only required for full_time, not for vendor_monitored).
        </p>
      </>
    ),
    columns: [
      {
        header: 'Organization',
        widthClass: 'w-48',
        cell: (row) => (
          <span className="text-sm text-muted-foreground">
            {row.organization_name}
          </span>
        ),
      },
      {
        header: 'Code',
        widthClass: 'w-32',
        cell: (row) => (
          <span className="font-mono text-xs">{row.document_code}</span>
        ),
      },
      {
        header: 'Document Name',
        cell: (row) => (
          <span className="text-sm font-medium">{row.document_name}</span>
        ),
      },
      {
        header: 'Category',
        widthClass: 'w-32',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.category ?? '—'}
          </span>
        ),
      },
      {
        header: 'Mandatory?',
        widthClass: 'w-24',
        cell: (row) =>
          row.is_mandatory ? (
            <span className="text-sm">Yes</span>
          ) : (
            <span className="text-sm italic text-muted-foreground">
              Optional
            </span>
          ),
      },
      {
        header: 'Applies to',
        cell: (row) => (
          <span className="text-xs">
            {row.applies_to_employment_types
              .map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t)
              .join(', ')}
          </span>
        ),
      },
    ],
    formSchema: buildFormSchema,
    emptyMessage:
      'No required-document policies configured. Click “Add Required Document” to create one.',
    entityNoun: 'Required Document',
    addLabel: 'Add Required Document',
  };

  const handlers: PolicyHandlers<RequiredDocumentRow> = {
    onLoad: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from('hr_required_documents')
        .select(
          `
          id,
          hr_organization_id,
          document_name,
          document_code,
          category,
          is_mandatory,
          applies_to_employment_types,
          notes,
          hr_organizations!inner(name)
        `,
        )
        .is('valid_until', null) // active versions only
        .order('document_name');

      if (error) {
        throw new Error(`Failed to load required documents: ${error.message}`);
      }

      return (data ?? []).map((d: any): RequiredDocumentRow => ({
        id: d.id,
        hr_organization_id: d.hr_organization_id,
        organization_name: d.hr_organizations?.name ?? '—',
        document_name: d.document_name,
        document_code: d.document_code,
        category: d.category ?? null,
        is_mandatory: Boolean(d.is_mandatory),
        applies_to_employment_types: Array.isArray(
          d.applies_to_employment_types,
        )
          ? d.applies_to_employment_types
          : [],
        notes: d.notes ?? null,
      }));
    },
    onSave: async (values, editing) => {
      // Validate applies_to_employment_types — at least one valid value.
      const types = parseEmploymentTypesCsv(values.applies_to_employment_types);
      if (types.length === 0) {
        throw new Error(
          'Applies to must include at least one employment type.',
        );
      }
      const valid: string[] = [...EMPLOYMENT_TYPE_VALUES];
      const invalid = types.filter((t) => !valid.includes(t));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid employment type(s): ${invalid.join(', ')}. Valid values: ${valid.join(', ')}.`,
        );
      }

      // Translate category sentinel back to NULL.
      const rawCategory = values.category;
      const category =
        typeof rawCategory === 'string' &&
        rawCategory.length > 0 &&
        rawCategory !== '__none__'
          ? rawCategory
          : null;

      const documentCode =
        typeof values.document_code === 'string'
          ? values.document_code.trim()
          : '';
      const documentName =
        typeof values.document_name === 'string'
          ? values.document_name.trim()
          : '';

      if (!documentCode) throw new Error('Code is required.');
      if (!documentName) throw new Error('Document Name is required.');

      const notes =
        typeof values.notes === 'string' && values.notes.trim().length > 0
          ? values.notes.trim()
          : null;

      const isMandatory = Boolean(values.is_mandatory);

      // TODO(T1.5a follow-up): When a Director Q-lock confirms the versioning
      // UX, replace in-place UPDATE with supersede-on-edit (set valid_until
      // on old row + INSERT new row with superseded_by). For now we update
      // in place to match other policy-shell consumers (departments,
      // counselors/rule-types) which all do plain UPDATE. The valid_from /
      // valid_until / superseded_by columns remain available for future
      // backfill.
      if (editing) {
        const sb = supabase as any;
        const { error } = await sb
          .from('hr_required_documents')
          .update({
            document_code: documentCode,
            document_name: documentName,
            category,
            is_mandatory: isMandatory,
            applies_to_employment_types: types,
            notes,
          })
          .eq('id', editing.id);
        if (error) {
          throw new Error(`Could not update required document: ${error.message}`);
        }
        const orgName =
          orgOptions.find((o) => o.id === editing.hr_organization_id)?.name ??
          editing.organization_name;
        return {
          ...editing,
          document_code: documentCode,
          document_name: documentName,
          category,
          is_mandatory: isMandatory,
          applies_to_employment_types: types,
          notes,
          organization_name: orgName,
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

      const sb = supabase as any;
      const { data, error } = await sb
        .from('hr_required_documents')
        .insert({
          hr_organization_id: rawOrgId,
          document_code: documentCode,
          document_name: documentName,
          category,
          is_mandatory: isMandatory,
          applies_to_employment_types: types,
          notes,
        })
        .select('id')
        .single();
      if (error) {
        throw new Error(`Could not create required document: ${error.message}`);
      }
      const orgName =
        orgOptions.find((o) => o.id === rawOrgId)?.name ?? '—';
      return {
        id: data.id,
        hr_organization_id: rawOrgId,
        organization_name: orgName,
        document_code: documentCode,
        document_name: documentName,
        category,
        is_mandatory: isMandatory,
        applies_to_employment_types: types,
        notes,
      };
    },
    onDelete: async (row) => {
      // Hard delete. The valid_until column is reserved for future
      // supersede-on-edit semantics; explicit removal of a policy row
      // means "this requirement no longer applies, period."
      const sb = supabase as any;
      const { error } = await sb
        .from('hr_required_documents')
        .delete()
        .eq('id', row.id);
      if (error) {
        throw new Error(`Could not delete required document: ${error.message}`);
      }
    },
  };

  // Map a row to form values. Critical: applies_to_employment_types is text[]
  // in the DB but rendered as a comma-sep `text` field here.
  const rowToFormValues = (row: RequiredDocumentRow) => ({
    hr_organization_id: row.hr_organization_id,
    document_code: row.document_code,
    document_name: row.document_name,
    category: row.category ?? '__none__',
    is_mandatory: row.is_mandatory,
    applies_to_employment_types: formatEmploymentTypesCsv(
      row.applies_to_employment_types,
    ),
    notes: row.notes ?? '',
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<RequiredDocumentRow>
        config={config}
        handlers={handlers}
        rowToFormValues={rowToFormValues}
        readOnly={false}
      />
    </PolicyPageShell>
  );
}
