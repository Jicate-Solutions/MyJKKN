/**
 * DateWidget — date input renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 * Uses the native HTML5 date input for now (broad browser support, no extra
 * deps). The shadcn DatePicker is available if a richer picker is required
 * later.
 */
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DateWidget as DateWidgetType } from '@/types/hr-forms';

interface DateWidgetProps {
  widget: DateWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function DateWidget({ widget, value = '', onChange, readOnly }: DateWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={widget.id}
        type="date"
        min={widget.min_date}
        max={widget.max_date}
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        required={widget.required}
      />
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
