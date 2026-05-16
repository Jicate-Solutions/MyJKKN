// ============================================================================
// ASSIGNMENT RULE TYPES — admin registry, Director-grade UX via policy-shell.
// Created: 2026-05-07. Migrated to policy-shell substrate 2026-05-07 (PR #TBD).
//
// Was: bespoke 277-line table + 273-line form dialog with raw rule_type_key
// shown to Director, migration filename in empty state, "System" badge, etc.
//
// Now: declarative LookupConfig + LookupTable. The substrate handles labels,
// confirm dialog, system-row protection, and form rendering. See
// docs/architecture/policy-page-pattern.md.
// ============================================================================

'use client';

import {
  LookupTable,
  PolicyPageShell,
  type FieldSchema,
  type LookupConfig,
  type PolicyHandlers,
} from '@/lib/admin/policy-shell';
import { getRuleTypeIcon } from '@/components/shared/assignment-rules-crud/columns';
import { Badge } from '@/components/ui/badge';
import {
  RuleTypeRegistryService,
  type AssignmentRuleTypeRow,
} from '@/lib/services/admission/rule-type-registry-service';

export const navMeta = { label: 'Rule Types', icon: 'ListChecks' } as const;

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

// ----------------------------------------------------------------------------
// Form schema — computed per form-open so the key field can be locked when
// editing a system row (changing the key would orphan existing assignment
// rules whose virtual `type` resolves to this string).
// ----------------------------------------------------------------------------
function buildFormSchema(
  editing: AssignmentRuleTypeRow | null,
): ReadonlyArray<FieldSchema> {
  const isSystem = !!editing?.is_system;

  return [
    {
      name: 'rule_type_key',
      kind: 'text',
      englishLabel: 'Internal name (snake_case)',
      englishHint: isSystem
        ? 'System rows cannot be re-named. Changing the name would break existing assignment rules that reference it.'
        : 'Lowercase letters, numbers, and underscores only. 2–64 characters. Example: weighted_random.',
      placeholder: 'e.g. weighted_random',
      required: true,
      disabled: isSystem,
    },
    {
      name: 'display_label',
      kind: 'text',
      englishLabel: 'Display name (shown to counselors)',
      englishHint: 'How counselors will see this rule type in the picker dropdown.',
      placeholder: 'e.g. Weighted Random',
      required: true,
    },
    {
      name: 'description',
      kind: 'textarea',
      englishLabel: 'Description (optional)',
      englishHint: 'A one-line explanation that helps counselors choose the right rule type.',
      placeholder: 'What does this strategy do? Helps the counselor pick the right one.',
    },
    {
      name: 'icon_name',
      kind: 'text',
      englishLabel: 'Icon name (optional)',
      englishHint: 'Lucide icon name (e.g. Shuffle, Target, Users). Leave blank for the default icon.',
      placeholder: 'e.g. Shuffle',
    },
    {
      name: 'sort_order',
      kind: 'number',
      englishLabel: 'Display position',
      englishHint: 'Lower numbers appear higher in the picker. Use 0 for default.',
      step: 1,
    },
    {
      name: 'is_active',
      kind: 'toggle',
      englishLabel: 'Show this in the picker?',
      englishHint:
        'When off, this rule type is hidden from new assignment rules but existing rules keep working.',
    },
  ];
}

// ----------------------------------------------------------------------------
// Lookup config — declarative description of the table.
// ----------------------------------------------------------------------------
const config: LookupConfig<AssignmentRuleTypeRow> = {
  title: 'Rule Types',
  explainer: (
    <>
      <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
      <p>
        This is the catalog of assignment-rule strategies counselors can pick when they
        create assignment rules. The list below is what they see in the picker dropdown.
        System rows (the original 6) cannot be removed — turn them off instead. Custom
        rows you add can be removed freely.
      </p>
    </>
  ),
  columns: [
    {
      header: 'Icon',
      widthClass: 'w-12',
      cell: (row) => getRuleTypeIcon(row.rule_type_key, row.icon_name),
    },
    {
      header: 'Display name',
      cell: (row) => (
        <span className="text-sm font-medium">{row.display_label}</span>
      ),
    },
    {
      header: 'Description',
      cell: (row) => (
        <span className="text-sm text-muted-foreground line-clamp-2">
          {row.description ?? <span className="italic">—</span>}
        </span>
      ),
    },
    {
      header: 'Position',
      widthClass: 'w-20',
      cell: (row) => <span className="text-xs">{row.sort_order}</span>,
    },
    {
      header: 'Type',
      widthClass: 'w-24',
      cell: (row) =>
        row.is_system ? (
          <Badge variant="outline" className="text-xs">
            Built-in
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Custom</span>
        ),
    },
    {
      header: 'Visible',
      widthClass: 'w-24',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.is_active ? 'Shown' : 'Hidden'}
        </span>
      ),
    },
  ],
  rowHint: (row) =>
    row.is_active
      ? null
      : `Currently hidden from the picker. Existing rules using "${row.display_label}" still work.`,
  formSchema: buildFormSchema,
  addLabel: 'Add Rule Type',
  emptyMessage:
    'No rule types yet. Click "Add Rule Type" to create one, or restore the built-in defaults.',
  entityNoun: 'Rule Type',
  canDelete: (row) =>
    row.is_system
      ? 'Built-in rule type — turn off (Hidden) instead of removing. Removing would orphan any existing rule that uses it.'
      : null,
  deleteConfirmText: (row) =>
    `The custom rule type "${row.display_label}" will be removed from the picker. Existing assignment rules that use it will fall back to a generic icon, but their behavior is unchanged.`,
};

// ----------------------------------------------------------------------------
// Page — handlers wire the substrate into the existing service.
// ----------------------------------------------------------------------------
export default function CounselorRuleTypesPage() {
  const handlers: PolicyHandlers<AssignmentRuleTypeRow> = {
    onLoad: () => RuleTypeRegistryService.getAllRuleTypes(),
    onSave: async (values, editing) => {
      const sortOrderRaw = values.sort_order;
      const sort_order =
        typeof sortOrderRaw === 'string'
          ? parseInt(sortOrderRaw, 10)
          : Number(sortOrderRaw ?? 0);
      if (!Number.isInteger(sort_order)) {
        throw new Error('Display position must be a whole number');
      }

      const rule_type_key = String(values.rule_type_key ?? '').trim();
      const display_label = String(values.display_label ?? '').trim();
      const description = String(values.description ?? '').trim() || null;
      const icon_name = String(values.icon_name ?? '').trim() || null;
      const is_active = Boolean(values.is_active);

      // Validate key shape unless editing a system row (where it's locked anyway).
      if (!editing || !editing.is_system) {
        if (!KEY_PATTERN.test(rule_type_key)) {
          throw new Error(
            'Internal name must use snake_case: lowercase letters, numbers, and underscores only (2–64 chars).',
          );
        }
      }

      if (!display_label) {
        throw new Error('Display name is required.');
      }

      if (editing) {
        // System rows: don't include rule_type_key in update payload (locked).
        const basePayload = {
          display_label,
          description,
          icon_name,
          sort_order,
          is_active,
        };
        return RuleTypeRegistryService.updateRuleType(
          editing.id,
          editing.is_system ? basePayload : { ...basePayload, rule_type_key },
        );
      }

      return RuleTypeRegistryService.createRuleType({
        rule_type_key,
        display_label,
        description,
        icon_name,
        sort_order,
        is_active,
      });
    },
    onDelete: (row) => RuleTypeRegistryService.deleteRuleType(row.id),
    onToggle: async (row, _field, next) => {
      await RuleTypeRegistryService.toggleActive(row.id, next);
    },
  };

  const newRowDefaults = {
    rule_type_key: '',
    display_label: '',
    description: '',
    icon_name: '',
    sort_order: 100,
    is_active: true,
  };

  const rowToFormValues = (row: AssignmentRuleTypeRow) => ({
    rule_type_key: row.rule_type_key,
    display_label: row.display_label,
    description: row.description ?? '',
    icon_name: row.icon_name ?? '',
    sort_order: row.sort_order,
    is_active: row.is_active,
  });

  return (
    <PolicyPageShell title={config.title} explainer={config.explainer}>
      <LookupTable
        config={config}
        handlers={handlers}
        newRowDefaults={newRowDefaults}
        rowToFormValues={rowToFormValues}
      />
    </PolicyPageShell>
  );
}
