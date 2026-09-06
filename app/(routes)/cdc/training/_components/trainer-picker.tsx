'use client';

// Reusable Trainer field for CDC training — replaces the old free-text input.
// Internal trainer  -> SearchableSelect of MyJKKN staff (institution-scoped via
//                      /api/cdc/pickers/staff); emits { trainerStaffId, trainerName }
//                      where trainerName is a clean display snapshot of the staff name.
// External trainer  -> plain text input; emits { trainerStaffId: null, trainerName }.
//
// Used by the per-semester "Add semester" dialog AND the programme Create / Edit
// forms, so "no free text for data MyJKKN already holds" is consistent everywhere.

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useStaffForPicker } from '@/hooks/cdc/use-cdc-pickers';

export interface TrainerValue {
  trainerStaffId: string | null;
  trainerName: string | null;
}

interface TrainerPickerProps {
  value: TrainerValue;
  onChange: (next: TrainerValue) => void;
  /** Pass true when rendered inside a Radix Dialog (the semester dialog) so the
   *  combobox popover portals INTO the dialog and clicks aren't eaten. */
  modal?: boolean;
  /** id applied to the active control for label association. */
  id?: string;
  disabled?: boolean;
}

// "Muthazhahan D (STF00123)" -> "Muthazhahan D" for the stored display snapshot.
function cleanStaffLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

export function TrainerPicker({ value, onChange, modal = false, id, disabled }: TrainerPickerProps) {
  const { data: staffOptions = [], isLoading } = useStaffForPicker();

  // Derive the mode from the value by default (robust to async form population),
  // but let an explicit toggle pin it. A row with a name but no staff link is an
  // external/legacy trainer; otherwise default to the staff picker.
  const [manualMode, setManualMode] = useState<'staff' | 'external' | null>(null);
  const external =
    manualMode !== null
      ? manualMode === 'external'
      : !value.trainerStaffId && !!value.trainerName;

  function toInternal() {
    setManualMode('staff');
    onChange({ trainerStaffId: null, trainerName: null });
  }
  function toExternal() {
    setManualMode('external');
    onChange({ trainerStaffId: null, trainerName: value.trainerName ?? null });
  }

  if (external) {
    return (
      <div className="space-y-1">
        <Input
          id={id}
          value={value.trainerName ?? ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ trainerStaffId: null, trainerName: e.target.value || null })
          }
          placeholder="External / vendor trainer name"
        />
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={toInternal}
        >
          Pick from staff instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <SearchableSelect
        value={value.trainerStaffId ?? ''}
        onValueChange={(v) => {
          const opt = staffOptions.find((o) => o.value === v);
          onChange({
            trainerStaffId: v || null,
            trainerName: opt ? cleanStaffLabel(opt.label) : null,
          });
        }}
        options={staffOptions}
        placeholder="Select trainer (staff)…"
        searchPlaceholder="Search by name or staff ID…"
        emptyMessage="No matching staff"
        loading={isLoading}
        disabled={disabled}
        modal={modal}
        className="w-full"
      />
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={toExternal}
      >
        External trainer (not on staff)
      </button>
    </div>
  );
}
