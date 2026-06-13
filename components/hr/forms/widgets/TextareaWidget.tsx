/**
 * TextareaWidget — multi-line text input renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 */
'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TextareaWidget as TextareaWidgetType } from '@/types/hr-forms';

interface TextareaWidgetProps {
  widget: TextareaWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function TextareaWidget({
  widget,
  value = '',
  onChange,
  readOnly,
}: TextareaWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Textarea
        id={widget.id}
        placeholder={widget.placeholder}
        maxLength={widget.max_length}
        rows={widget.rows ?? 4}
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
