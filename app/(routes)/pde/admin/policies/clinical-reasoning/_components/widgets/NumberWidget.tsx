'use client';

// NumberWidget — renders a number input for ui_widget='number' policy rows.
// Coerces blank/invalid input to 0. Caller supplies the unknown-typed value
// and we narrow defensively.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NumberWidgetProps {
  value: unknown;
  onChange: (next: number) => void;
  disabled?: boolean;
}

function coerceNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function NumberWidget({ value, onChange, disabled }: NumberWidgetProps) {
  const current = coerceNumber(value, 0);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Value</Label>
      <Input
        type="number"
        value={current}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        disabled={disabled}
        className="max-w-[180px]"
      />
    </div>
  );
}
