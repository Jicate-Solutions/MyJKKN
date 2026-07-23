/**
 * TextWidget — single-line text input renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 * Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
 *
 * Two modes:
 *   - render mode (default): displays the input + label, calls onChange when
 *     the user types. Used by the submission renderer at /hr/forms/[id]/submit.
 *   - builder preview (readOnly): displays the input disabled so directors can
 *     see what the field looks like inside the builder canvas.
 */
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TextWidget as TextWidgetType } from '@/types/hr-forms';

interface TextWidgetProps {
  widget: TextWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function TextWidget({ widget, value = '', onChange, readOnly }: TextWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={widget.id}
        type="text"
        placeholder={widget.placeholder}
        maxLength={widget.max_length}
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
