'use client';

// DropdownWidget — renders <Select> for ui_widget='dropdown' policy rows.
// Reads ui_options as [{value, label}, ...]. Wraps current value in quotes
// only when stored as a JSON string; for typed primitives, uses value as-is.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { UIDropdownOption } from '@/hooks/admin/use-clinical-reasoning-policies';

interface DropdownWidgetProps {
  value: unknown;
  options: UIDropdownOption[];
  onChange: (next: string) => void;
  disabled?: boolean;
}

function coerceString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  return String(raw);
}

export function DropdownWidget({
  value,
  options,
  onChange,
  disabled,
}: DropdownWidgetProps) {
  const current = coerceString(value);

  // Radix Select rejects empty-string values — guard per silent-failure auditor.
  const safeOptions = options.filter((o) => o.value && o.value.length > 0);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Selection</Label>
      <Select
        value={current}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className="max-w-[320px]">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {safeOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
