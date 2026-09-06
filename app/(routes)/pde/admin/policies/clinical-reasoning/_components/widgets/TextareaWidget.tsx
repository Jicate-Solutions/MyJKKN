'use client';

// TextareaWidget — renders <Textarea> for ui_widget='textarea' policy rows.
// Long-form prompt template editing (system prompt, instructions, etc.).
// Stored as string; if the underlying JSONB holds a string, it round-trips
// fine.

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface TextareaWidgetProps {
  value: unknown;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
}

function coerceString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

export function TextareaWidget({
  value,
  onChange,
  disabled,
  rows = 14,
}: TextareaWidgetProps) {
  const current = coerceString(value);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        Template ({current.length} chars)
      </Label>
      <Textarea
        rows={rows}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-xs"
      />
    </div>
  );
}
