/**
 * RadioWidget — single-choice radio renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 */
'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { RadioWidget as RadioWidgetType } from '@/types/hr-forms';

interface RadioWidgetProps {
  widget: RadioWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function RadioWidget({ widget, value, onChange, readOnly }: RadioWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange?.(v)}
        disabled={readOnly}
      >
        {widget.options.map((opt) => (
          <div key={opt.value} className="flex items-center space-x-2">
            <RadioGroupItem id={`${widget.id}-${opt.value}`} value={opt.value} />
            <Label
              htmlFor={`${widget.id}-${opt.value}`}
              className="text-sm font-normal"
            >
              {opt.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
