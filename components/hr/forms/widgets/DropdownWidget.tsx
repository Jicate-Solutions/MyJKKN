/**
 * DropdownWidget — single-select dropdown renderer for the HR forms builder.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 */
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DropdownWidget as DropdownWidgetType } from '@/types/hr-forms';

interface DropdownWidgetProps {
  widget: DropdownWidgetType;
  value?: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
}

export function DropdownWidget({
  widget,
  value,
  onChange,
  readOnly,
}: DropdownWidgetProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={widget.id} className="text-sm font-medium">
        {widget.label}
        {widget.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange?.(v)}
        disabled={readOnly}
      >
        <SelectTrigger id={widget.id}>
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {widget.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {widget.help_text ? (
        <p className="text-xs text-muted-foreground">{widget.help_text}</p>
      ) : null}
    </div>
  );
}
