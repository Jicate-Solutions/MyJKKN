'use client';

// Renders ONE custom registration field by its field_type. Shared by the
// admin builder's live preview and both actual registration surfaces (public
// guest form, organizer Add Entry dialog) — one rendering implementation, no
// drift between "what the organizer designed" and "what a registrant sees."

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventRegistrationFormField, FormFieldCondition } from '@/types/tournament';

/** Whether `field` should be shown given the current answers to ALL fields on the form. */
export function isFieldVisible(
  field: EventRegistrationFormField,
  allValues: Record<string, unknown>
): boolean {
  const condition = field.condition as FormFieldCondition | null;
  if (!condition) return true;
  const dependentValue = allValues[condition.field];
  const asString = dependentValue == null ? '' : String(dependentValue);
  switch (condition.op) {
    case 'eq':
      return asString === condition.value;
    case 'neq':
      return asString !== condition.value;
    case 'contains':
      return asString.includes(condition.value);
    case 'not_empty':
      return asString.trim() !== '';
    case 'empty':
      return asString.trim() === '';
    default:
      return true;
  }
}

interface Props {
  field: EventRegistrationFormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function DynamicFieldInput({ field, value, onChange }: Props) {
  const label = (
    <Label htmlFor={field.id}>
      {field.field_label}
      {field.is_required && <span className="text-destructive"> *</span>}
    </Label>
  );

  switch (field.field_type) {
    case 'textarea':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={field.id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'select':
    case 'radio':
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={(value as string) ?? ''} onValueChange={onChange}>
            <SelectTrigger id={field.id}>
              <SelectValue placeholder={field.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="space-y-1.5 rounded-md border p-2.5">
            {(field.options ?? []).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          {label}
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'file':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="file"
            onChange={(e) => onChange(e.target.files?.[0]?.name ?? null)}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type="number"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );

    case 'phone':
    case 'email':
    case 'text':
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={field.id}
            type={field.field_type === 'email' ? 'email' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            maxLength={field.max_length ?? undefined}
            pattern={field.pattern ?? undefined}
          />
          {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
        </div>
      );
  }
}
