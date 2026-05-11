// ============================================================================
// HR — Shift Templates (T1.6 Phase 2a from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// Admin CRUD on `hr_shift_templates`. Defines master shift templates that HR
// officers can assign to staff via /hr/shifts. Templates can be GLOBAL
// (visible to all institutions) or institution-specific (institution row
// wins on duplicate template_code per Q-lock #4).
//
// Pattern: extends `lib/admin/policy-shell` (Shape C — LookupConfig). Cloned
// from `app/(routes)/admin/hr/required-documents/page.tsx` (T1.5a).
//
// Standing rule (2026-04-29 Director): every policy decision = config-table
// row + super_admin UI that READS/WRITES the table.
//
// Schema: id, template_code, template_name, start_time, end_time, is_global,
// institution_id, category, notes, is_active, valid_from, valid_until,
// superseded_by, audit cols.
//
// Permission gate: admin_or_super_admin (matches required-documents page; no
// dedicated `hr.shifts.manage` permission key exists yet).
// ============================================================================

'use client';

import {
  LookupTable,
  PolicyPageShell,
  type FieldSchema,
  type LookupConfig,
  type PolicyHandlers,
  type EnumOption,
} from '@/lib/admin/policy-shell';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ShiftService } from '@/lib/services/hr/shift-service';
import {
  SHIFT_CATEGORY_OPTIONS,
  type HRShiftTemplate,
} from '@/types/hr-shifts';

const CATEGORY_OPTIONS: ReadonlyArray<EnumOption> = SHIFT_CATEGORY_OPTIONS.map(
  (c) => ({ value: c.value, label: c.label }),
);

// ---------------------------------------------------------------------------
// Form schema — same fields for create + edit. Per Q-lock #4: a template is
// EITHER global OR institution-scoped (CHECK constraint enforces this in DB).
// The form's "is_global" toggle drives whether institution_id is required.
// ---------------------------------------------------------------------------
function buildFormSchema(
  editing: HRShiftTemplate | null,
): ReadonlyArray<FieldSchema> {
  void editing; // create + edit share the schema; schema doesn't depend on row state

  return [
    {
      name: 'template_code',
      kind: 'text',
      englishLabel: 'Template code',
      englishHint:
        'Stable machine identifier. Use ALL_CAPS_WITH_UNDERSCORES (e.g. MORNING_8_5, NIGHT_10_6). Codes can repeat across global + institution rows — the institution row wins on assign.',
      placeholder: 'MORNING_8_5',
      required: true,
    },
    {
      name: 'template_name',
      kind: 'text',
      englishLabel: 'Template name',
      englishHint: 'How the shift appears in the assignment dropdown (e.g. "Morning 8am-5pm").',
      placeholder: 'Morning 8am-5pm',
      required: true,
    },
    {
      name: 'start_time',
      kind: 'text',
      englishLabel: 'Start time (24h)',
      englishHint: 'Format: HH:MM (e.g. 08:00, 22:00). If end < start, the shift spans midnight.',
      placeholder: '08:00',
      required: true,
    },
    {
      name: 'end_time',
      kind: 'text',
      englishLabel: 'End time (24h)',
      englishHint: 'Format: HH:MM. Use 06:00 with start 22:00 for a "10pm to 6am next day" night shift.',
      placeholder: '17:00',
      required: true,
    },
    {
      name: 'is_global',
      kind: 'toggle',
      englishLabel: 'Global (visible to all institutions)',
      englishHint:
        'When on, this template is available to every institution. When off, it applies only to the institution you set below — and overrides any global template that shares the same code for that institution.',
    },
    {
      name: 'institution_id',
      kind: 'text',
      englishLabel: 'Institution ID',
      englishHint:
        'Required when "Global" is OFF. Paste the institution UUID. Leave blank when Global is ON.',
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: 'category',
      kind: 'enum',
      englishLabel: 'Category (optional)',
      englishHint:
        'Optional grouping for filtering on the assignment page. Free-form — HR officers can also pick "General".',
      options: CATEGORY_OPTIONS,
    },
    {
      name: 'notes',
      kind: 'textarea',
      englishLabel: 'Notes (internal)',
      englishHint:
        'Internal notes — when this template applies, who uses it, exceptions. Not shown to staff.',
      placeholder: 'Used by hostel wardens. Includes 30-min handover at start.',
    },
    {
      name: 'is_active',
      kind: 'toggle',
      englishLabel: 'Active',
      englishHint:
        'When off, this template is hidden from the assignment dropdown but historical assignments keep working. Use instead of delete for audit trail.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Lookup config
// ---------------------------------------------------------------------------
const config: LookupConfig<HRShiftTemplate> = {
  title: 'HR — Shift Templates',
  explainer: (
    <>
      <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
      <p>
        Shift templates are the named hour patterns HR officers pick when
        assigning shifts to staff. Each row defines a start/end time and a
        scope.
      </p>
      <p className="mt-2">
        Toggle <strong>Global</strong> on to make a template available to
        every institution. Leave it off to scope it to one institution — that
        row will <strong>override</strong> any global template that shares the
        same code, for staff at that institution only.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Phase 2a (T1.6): templates + assignments. Swap workflow + multi-week
        rotation UI ship in Phase 2b.
      </p>
    </>
  ),
  columns: [
    {
      header: 'Template',
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{row.template_name}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.template_code}</div>
        </div>
      ),
    },
    {
      header: 'Hours',
      widthClass: 'w-32',
      cell: (row) => (
        <span className="text-sm font-mono">
          {row.start_time.slice(0, 5)} – {row.end_time.slice(0, 5)}
        </span>
      ),
    },
    {
      header: 'Scope',
      widthClass: 'w-44',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.is_global ? (
            <span className="font-medium text-foreground">All institutions</span>
          ) : (
            <span title={row.institution_id ?? undefined}>
              Institution: {row.institution_id ? row.institution_id.slice(0, 8) + '…' : '—'}
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Category',
      widthClass: 'w-28',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.category ?? '—'}
        </span>
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
      ? 'Inactive — hidden from the assignment dropdown. Historical assignments keep working.'
      : null,
  formSchema: buildFormSchema,
  addLabel: 'Add Shift Template',
  emptyMessage:
    'No shift templates yet. Click "Add Shift Template" to create your first one — start with global defaults like "Morning 8am-5pm", "Evening 2pm-10pm", "Night 10pm-6am".',
  entityNoun: 'Shift Template',
  deleteConfirmText: (row) =>
    `Permanently delete "${row.template_name}" (${row.template_code})? Assignments still pointing at this template will fall back to their override times if any, otherwise they'll fail to render. Use the "Active" toggle for soft-archive.`,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AdminShiftTemplatesPage() {
  const supabase = createClientSupabaseClient();

  const handlers: PolicyHandlers<HRShiftTemplate> = {
    onLoad: async () => {
      // Show ALL templates (active + inactive) to admins; they manage history.
      return ShiftService.listTemplates(supabase, { activeOnly: false });
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
      const normaliseTime = (raw: unknown, label: string): string => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        if (!v) throw new Error(`${label} is required.`);
        // Accept HH:MM or HH:MM:SS; pad to HH:MM:SS for Postgres.
        if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
        if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
        throw new Error(`${label} must be in HH:MM format (e.g. 08:00, 22:30).`);
      };

      const templateCode = requireText(values.template_code, 'Template code');
      const templateName = requireText(values.template_name, 'Template name');
      const startTime = normaliseTime(values.start_time, 'Start time');
      const endTime = normaliseTime(values.end_time, 'End time');
      const isGlobal = Boolean(values.is_global);
      const institutionId = optionalUuid(values.institution_id);

      if (isGlobal && institutionId) {
        throw new Error('Global templates cannot have an institution ID. Turn "Global" off OR clear the institution ID.');
      }
      if (!isGlobal && !institutionId) {
        throw new Error('Institution-specific templates require an institution ID. Turn "Global" on OR fill the institution ID.');
      }

      if (editing) {
        return ShiftService.updateTemplate(supabase, editing.id, {
          template_code: templateCode,
          template_name: templateName,
          start_time: startTime,
          end_time: endTime,
          is_global: isGlobal,
          institution_id: isGlobal ? null : institutionId,
          category: optionalText(values.category),
          notes: optionalText(values.notes),
          is_active: Boolean(values.is_active),
        });
      }

      return ShiftService.createTemplate(supabase, {
        template_code: templateCode,
        template_name: templateName,
        start_time: startTime,
        end_time: endTime,
        is_global: isGlobal,
        institution_id: isGlobal ? null : institutionId,
        category: optionalText(values.category),
        notes: optionalText(values.notes),
        is_active: Boolean(values.is_active),
      });
    },
    onDelete: async (row) => {
      await ShiftService.deleteTemplate(supabase, row.id);
    },
  };

  const newRowDefaults = {
    template_code: '',
    template_name: '',
    start_time: '09:00',
    end_time: '17:00',
    is_global: true,
    institution_id: '',
    category: '',
    notes: '',
    is_active: true,
  };

  const rowToFormValues = (row: HRShiftTemplate) => ({
    template_code: row.template_code,
    template_name: row.template_name,
    // Trim seconds for the form (DB stores HH:MM:SS).
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
    is_global: row.is_global,
    institution_id: row.institution_id ?? '',
    category: row.category ?? '',
    notes: row.notes ?? '',
    is_active: row.is_active,
  });

  return (
    <PolicyPageShell
      title={config.title}
      explainer={config.explainer}
      permission="admin_or_super_admin"
    >
      <LookupTable<HRShiftTemplate>
        config={config}
        handlers={handlers}
        newRowDefaults={newRowDefaults}
        rowToFormValues={rowToFormValues}
      />
    </PolicyPageShell>
  );
}
