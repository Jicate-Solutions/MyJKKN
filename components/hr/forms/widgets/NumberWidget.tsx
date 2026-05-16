/**
 * NumberWidget — numeric input renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 */
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NumberWidget as NumberWidgetType } from '@/types/hr-forms';

interface NumberWidgetProps {
  widget: NumberWidgetType;
  value?: number | '';
  onChange?: (next: number | '') => void;
  readOnly?: boolean;
}

export function NumberWidget({
  widget,
  value = '',
  onChange,
  readOnly,
}: NumberWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={widget.id}
        type="number"
        min={widget.min}
        max={widget.max}
        step={widget.step ?? 1}
        value={value === '' ? '' : value}
        disabled={readOnly}
        onChange={(e) => {
          const raw = e.target.value;
          onChange?.(raw === '' ? '' : Number(raw));
        }}
        required={widget.required}
      />
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
