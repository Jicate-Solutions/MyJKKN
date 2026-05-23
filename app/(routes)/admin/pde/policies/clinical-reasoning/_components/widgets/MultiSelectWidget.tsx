'use client';

// MultiSelectWidget — renders a checkbox group for ui_widget='multi_select'.
// Stored as JSONB array of strings. Each ui_options entry becomes one checkbox.

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { UIDropdownOption } from '@/hooks/admin/use-clinical-reasoning-policies';

interface MultiSelectWidgetProps {
  value: unknown;
  options: UIDropdownOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

function coerceStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

export function MultiSelectWidget({
  value,
  options,
  onChange,
  disabled,
}: MultiSelectWidgetProps) {
  const current = coerceStringArray(value);

  function toggle(optValue: string) {
    if (current.includes(optValue)) {
      onChange(current.filter((v) => v !== optValue));
    } else {
      onChange([...current, optValue]);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">
        Selected: {current.length} of {options.length}
      </Label>
      <div className="flex flex-col gap-2 rounded-md border p-3">
        {options.map((opt) => {
          const checked = current.includes(opt.value);
          const id = `multi-${opt.value}`;
          return (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => toggle(opt.value)}
                disabled={disabled}
              />
              <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {opt.label}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
