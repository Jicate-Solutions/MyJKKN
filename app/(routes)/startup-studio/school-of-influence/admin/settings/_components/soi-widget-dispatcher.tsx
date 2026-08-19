'use client';

// ===========================================================================
// SoiWidgetDispatcher — ui_widget -> input control.
//
// REUSES the five widget components the PDE Clinical Reasoning and RCLTP policy
// editors already share, so every Director-facing policy screen in the platform
// renders the same controls:
//   app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/*
//
// Nothing here knows a single `soi.*` key. The control is chosen from the row's
// own `ui_widget` column and its options from `ui_options` / `enum_options`,
// so a policy row added in SQL renders here with no code change.
// ===========================================================================

import { DropdownWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/DropdownWidget';
import { MultiSelectWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/MultiSelectWidget';
import { NumberWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/NumberWidget';
import { TextareaWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/TextareaWidget';
import { ToggleWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/ToggleWidget';

import {
  normaliseWidget,
  resolveOptions,
  type SoiPolicyRow,
} from '../_lib/soi-policies-service';

interface Props {
  row: SoiPolicyRow;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}

export function SoiWidgetDispatcher({ row, value, onChange, disabled }: Props) {
  const widget = normaliseWidget(row.ui_widget);
  const options = resolveOptions(row);

  switch (widget) {
    case 'number':
      return <NumberWidget value={value} onChange={onChange} disabled={disabled} />;

    case 'toggle':
      return <ToggleWidget value={value} onChange={onChange} disabled={disabled} />;

    case 'dropdown':
      return (
        <DropdownWidget
          value={value}
          options={options}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case 'multi_select':
      return (
        <MultiSelectWidget
          value={value}
          options={options}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case 'text':
    case 'textarea':
    case 'json':
      return <TextareaWidget value={value} onChange={onChange} disabled={disabled} />;

    default:
      // Explicit, not silent. An unrenderable row must say so — otherwise a
      // Director reads a card with no control and assumes the setting does not
      // exist.
      return (
        <div className="rounded-md border border-dashed border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This setting cannot be edited on screen yet: it is stored with an
          unrecognised control type (<code>{row.ui_widget ?? 'none'}</code>).
          Nothing is broken — the saved value is still in force. Contact the
          MyJKKN team to add a control for it.
        </div>
      );
  }
}
