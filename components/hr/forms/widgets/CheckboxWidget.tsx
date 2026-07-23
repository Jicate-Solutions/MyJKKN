/**
 * CheckboxWidget — multi-choice checkbox renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 * Value shape: array of selected option `value`s.
 */
'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CheckboxWidget as CheckboxWidgetType } from '@/types/hr-forms';

interface CheckboxWidgetProps {
  widget: CheckboxWidgetType;
  value?: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
}

export function CheckboxWidget({
  widget,
  value = [],
  onChange,
  readOnly,
}: CheckboxWidgetProps) {
  const toggle = (optValue: string, checked: boolean) => {
    if (!onChange) return;
    const next = new Set(value);
    if (checked) next.add(optValue);
    else next.delete(optValue);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <div className="space-y-2">
        {widget.options.map((opt) => (
          <div key={opt.value} className="flex items-center space-x-2">
            <Checkbox
              id={`${widget.id}-${opt.value}`}
              checked={value.includes(opt.value)}
              disabled={readOnly}
              onCheckedChange={(c) => toggle(opt.value, c === true)}
            />
            <Label
              htmlFor={`${widget.id}-${opt.value}`}
              className="text-sm font-normal"
            >
              {opt.label}
            </Label>
          </div>
        ))}
      </div>
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
