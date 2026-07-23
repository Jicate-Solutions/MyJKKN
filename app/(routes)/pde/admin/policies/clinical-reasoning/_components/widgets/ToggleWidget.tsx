'use client';

// ToggleWidget — renders <Switch> for ui_widget='toggle' policy rows.
// Stored as JSONB boolean.

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface ToggleWidgetProps {
  value: unknown;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function coerceBool(raw: unknown, fallback = false): boolean {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function ToggleWidget({ value, onChange, disabled }: ToggleWidgetProps) {
  const current = coerceBool(value, false);
  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={current}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <Label className="text-sm">{current ? 'Enabled' : 'Disabled'}</Label>
    </div>
  );
}
