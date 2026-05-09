// ============================================================================
// HR — Shift Assignments (T1.6 Phase 2a from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// HR officer / admin CRUD on `hr_shift_assignments`. HR officers pick a staff
// member, a template (or freeform override), an effective_from date — and the
// assignment is active until effective_until is set.
//
// Pattern: extends `lib/admin/policy-shell` (Shape C — LookupConfig). Cloned
// from `app/(routes)/admin/hr/required-documents/page.tsx` + the HYBRID model
// per Q-lock #1: template provides defaults; per-employee override stored on
// the assignment row.
//
// PHASE 2a SCOPE: only single-week assignments (rotation_weeks=1) are
// surfaced. The rotation_pattern jsonb input is hidden — it's stored in DB
// for Phase 2b without rendering UI yet (per Q-lock #3).
//
// Permission gate: admin_or_super_admin.
// ============================================================================

'use client';

import {
  LookupTable,
  PolicyPageShell,
  type FieldSchema,
  type LookupConfig,
  type PolicyHandlers,
} from '@/lib/admin/policy-shell';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ShiftService } from '@/lib/services/hr/shift-service';
import type {
  HRShiftAssignmentWithTemplate,
  HRShiftTemplate,
} from '@/types/hr-shifts';

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------
function buildFormSchema(
  editing: HRShiftAssignmentWithTemplate | null,
  templates: ReadonlyArray<HRShiftTemplate>,
): ReadonlyArray<FieldSchema> {
  void editing;

  const templateOptions = templates
    .filter((t) => t.is_active)
    .map((t) => ({
      value: t.id,
      label: `${t.template_name} (${t.start_time.slice(0, 5)}–${t.end_time.slice(0, 5)})${
        t.is_global ? ' · global' : ''
      }`,
    }));

  return [
    {
      name: 'staff_id',
      kind: 'text',
      englishLabel: 'Staff ID (UUID)',
      englishHint:
        'Paste the staff member UUID. The picker UI is coming in Phase 2b — for now use the staff list page to copy the ID.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      required: true,
    },
    {
      name: 'template_id',
      kind: 'enum',
      englishLabel: 'Shift template',
      englishHint:
        'Pick a template defined under Admin → HR → Shift Templates. Hours come from the template. Leave blank ONLY if you want to set freeform start/end times below.',
      options: templateOptions,
    },
    {
      name: 'start_time_override',
      kind: 'text',
      englishLabel: 'Start time override (optional)',
      englishHint:
        'Leave blank to inherit from the template. Set HH:MM here to override (e.g. this employee starts at 07:30 instead of 08:00). Required if no template is picked.',
      placeholder: '07:30',
    },
    {
      name: 'end_time_override',
      kind: 'text',
      englishLabel: 'End time override (optional)',
      englishHint: 'Pair with the override above. Leave blank to inherit from template. Required if no template is picked.',
      placeholder: '16:30',
    },
    {
      name: 'effective_from',
      kind: 'text',
      englishLabel: 'Effective from',
      englishHint: 'Date this assignment starts (YYYY-MM-DD). Past dates are allowed for backfill.',
      placeholder: '2026-05-10',
      required: true,
    },
    {
      name: 'effective_until',
      kind: 'text',
      englishLabel: 'Effective until (optional)',
      englishHint:
        'Leave blank for ongoing. Set a date to close the assignment (the next assignment for this staff takes over from there).',
      placeholder: '2026-12-31',
    },
    {
      name: 'rotation_weeks',
      kind: 'number',
      englishLabel: 'Rotation weeks',
      englishHint:
        'How many weeks the shift cycle spans. Phase 2a supports single-week (1) only — multi-week rotation UI lands in Phase 2b. Storage is ready now.',
      min: 1,
      step: 1,
    },
    {
      name: 'notes',
      kind: 'textarea',
      englishLabel: 'Notes',
      englishHint: 'Optional context — why the override, special arrangements, handover instructions.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Lookup config (built per-render so it can include the templates list)
// ---------------------------------------------------------------------------
function buildConfig(
  templates: ReadonlyArray<HRShiftTemplate>,
): LookupConfig<HRShiftAssignmentWithTemplate> {
  return {
    title: 'HR — Shift Assignments',
    explainer: (
      <>
        <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
        <p>
          Each row binds one staff member to a shift — either by picking a
          template (Admin → HR → Shift Templates) or by setting freeform
          start/end times. The HYBRID model: template provides the default
          hours; the override boxes win when set.
        </p>
        <p className="mt-2">
          Use <strong>Effective from</strong> + <strong>Effective until</strong>{' '}
          to roll an assignment forward without deleting history. Phase 2a
          surfaces single-week assignments only — multi-week rotation UI ships
          in Phase 2b.
        </p>
      </>
    ),
    columns: [
      {
        header: 'Staff',
        cell: (row) => (
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              {row.staff_name ?? '—'}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.staff_no ?? row.staff_id.slice(0, 8) + '…'}
            </div>
          </div>
        ),
      },
      {
        header: 'Template',
        widthClass: 'w-48',
        cell: (row) => (
          <span className="text-sm">
            {row.template?.template_name ?? (
              <span className="italic text-muted-foreground">Freeform</span>
            )}
          </span>
        ),
      },
      {
        header: 'Effective hours',
        widthClass: 'w-44',
        cell: (row) => (
          <span className="text-xs font-mono">
            {row.effective.start_time.slice(0, 5)} –{' '}
            {row.effective.end_time.slice(0, 5)}
            {row.effective.source !== 'template' && (
              <span className="ml-1 text-muted-foreground">
                ({row.effective.source})
              </span>
            )}
          </span>
        ),
      },
      {
        header: 'From',
        widthClass: 'w-28',
        cell: (row) => (
          <span className="text-xs">{row.effective_from}</span>
        ),
      },
      {
        header: 'Until',
        widthClass: 'w-28',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.effective_until ?? 'Ongoing'}
          </span>
        ),
      },
      {
        header: 'Rotation',
        widthClass: 'w-24',
        cell: (row) => (
          <span className="text-xs">
            {row.rotation_weeks === 1
              ? 'Single-week'
              : `${row.rotation_weeks}-week`}
          </span>
        ),
      },
    ],
    rowHint: (row) =>
      row.rotation_weeks > 1
        ? 'Multi-week rotation — UI surface arrives in Phase 2b. Pattern stored in rotation_pattern.'
        : !row.template_id
        ? 'Freeform assignment (no template). Both override times must stay set.'
        : null,
    formSchema: (editing) => buildFormSchema(editing, templates),
    addLabel: 'Assign Shift',
    emptyMessage:
      'No assignments yet. Click "Assign Shift" to bind a staff member to a template (or freeform hours).',
    entityNoun: 'Shift Assignment',
    deleteConfirmText: (row) =>
      `Permanently delete ${row.staff_name ? `${row.staff_name}'s` : "this"} assignment? Use "Effective until" to close it cleanly instead — that preserves history.`,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HRShiftAssignmentsPage() {
  const supabase = createClientSupabaseClient();

  const handlers: PolicyHandlers<HRShiftAssignmentWithTemplate> = {
    onLoad: async () => {
      // Two queries upfront — assignments + templates. We keep templates in
      // module scope of this render so the form schema can show the dropdown.
      const [assignments, templates] = await Promise.all([
        ShiftService.listAssignmentsForInstitution(supabase, {}),
        ShiftService.listTemplates(supabase, { activeOnly: true }),
      ]);
      // Stash templates on a window-level cache the form factory can read.
      // Cleaner alternative would be a context provider; this single page
      // doesn't justify that overhead.
      (globalThis as { __hr_shift_templates?: HRShiftTemplate[] }).__hr_shift_templates = templates;
      return assignments;
    },
    onSave: async (values, editing) => {
      const requireText = (raw: unknown, label: string): string => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) throw new Error(`${label} is required.`);
        return v;
      };
      const optionalText = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const optionalUuid = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const normaliseTimeOptional = (raw: unknown, label: string): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) return null;
        if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
        if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
        throw new Error(`${label} must be in HH:MM format (e.g. 08:00, 22:30).`);
      };
      const requireDate = (raw: unknown, label: string): string => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          throw new Error(`${label} must be in YYYY-MM-DD format.`);
        }
        return v;
      };
      const optionalDate = (raw: unknown, label: string): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          throw new Error(`${label} must be in YYYY-MM-DD format.`);
        }
        return v;
      };

      const staffId = requireText(values.staff_id, 'Staff ID');
      const templateId = optionalUuid(values.template_id);
      const startOverride = normaliseTimeOptional(values.start_time_override, 'Start time override');
      const endOverride = normaliseTimeOptional(values.end_time_override, 'End time override');
      const effectiveFrom = requireDate(values.effective_from, 'Effective from');
      const effectiveUntil = optionalDate(values.effective_until, 'Effective until');
      const rotationWeeksRaw = values.rotation_weeks;
      const rotationWeeks = (() => {
        if (rotationWeeksRaw == null || rotationWeeksRaw === '') return 1;
        const n = typeof rotationWeeksRaw === 'number' ? rotationWeeksRaw : parseInt(String(rotationWeeksRaw), 10);
        return Number.isFinite(n) ? n : 1;
      })();
      if (rotationWeeks < 1 || rotationWeeks > 4) {
        throw new Error('Rotation weeks must be between 1 and 4.');
      }

      // Either template OR both overrides — DB CHECK enforces too, fail fast here.
      const hasFreeform = startOverride && endOverride;
      if (!templateId && !hasFreeform) {
        throw new Error(
          'Either pick a template OR set both start/end time overrides.'
        );
      }

      const payload = {
        staff_id: staffId,
        template_id: templateId,
        start_time_override: startOverride,
        end_time_override: endOverride,
        effective_from: effectiveFrom,
        effective_until: effectiveUntil,
        rotation_weeks: rotationWeeks,
        notes: optionalText(values.notes),
      };

      if (editing) {
        const updated = await ShiftService.updateAssignment(supabase, editing.id, payload);
        // Rebuild the joined shape; the LookupTable handler returns whatever shape onLoad does.
        // Simplest: ask service for the freshly active row.
        const refreshed = await ShiftService.getMyShiftAssignment(supabase, updated.staff_id);
        return refreshed ?? { ...updated, template: editing.template, effective: editing.effective };
      }

      const created = await ShiftService.assignShift(supabase, payload);
      const refreshed = await ShiftService.getMyShiftAssignment(supabase, created.staff_id);
      return refreshed ?? { ...created, template: null, effective: { start_time: created.start_time_override ?? '00:00:00', end_time: created.end_time_override ?? '00:00:00', source: 'override' } };
    },
    onDelete: async (row) => {
      await ShiftService.deleteAssignment(supabase, row.id);
    },
  };

  // Build config once with whatever templates are in the cache (set by onLoad
  // on first render). Empty array first paint is fine — template dropdown
  // populates after onLoad resolves.
  const cachedTemplates =
    (globalThis as { __hr_shift_templates?: HRShiftTemplate[] }).__hr_shift_templates ?? [];
  const config = buildConfig(cachedTemplates);

  const newRowDefaults = {
    staff_id: '',
    template_id: '',
    start_time_override: '',
    end_time_override: '',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_until: '',
    rotation_weeks: 1,
    notes: '',
  };

  const rowToFormValues = (row: HRShiftAssignmentWithTemplate) => ({
    staff_id: row.staff_id,
    template_id: row.template_id ?? '',
    start_time_override: row.start_time_override?.slice(0, 5) ?? '',
    end_time_override: row.end_time_override?.slice(0, 5) ?? '',
    effective_from: row.effective_from,
    effective_until: row.effective_until ?? '',
    rotation_weeks: row.rotation_weeks,
    notes: row.notes ?? '',
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<HRShiftAssignmentWithTemplate>
        config={config}
        handlers={handlers}
        newRowDefaults={newRowDefaults}
        rowToFormValues={rowToFormValues}
      />
    </PolicyPageShell>
  );
}
