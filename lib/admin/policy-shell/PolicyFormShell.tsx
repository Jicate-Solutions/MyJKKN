'use client';

// ============================================================================
// PolicyFormShell — schema-driven create/edit dialog.
// Created: 2026-05-07. Used by all 3 shape primitives (CascadeStepList,
// SettingsPanel, LookupTable). Reads a FieldSchema[] and renders the right
// inputs with plain-English labels, hints, and consequence text.
//
// Eliminates the per-page form-dialog rewrite — pages declare schema, shell
// renders. Future audit logs can read the same schema for consistent labels.
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { FieldSchema } from './types';

interface PolicyFormShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain English dialog title. */
  title: string;
  /** Plain English description below the title. */
  description?: string;
  /** Field schema describing the form structure. */
  fields: ReadonlyArray<FieldSchema>;
  /** Initial values keyed by field.name. */
  initialValues: Record<string, unknown>;
  /** Optional list of institutions for scope-with-institution fields. */
  institutions?: ReadonlyArray<{ id: string; name: string }>;
  /** Submit button label. Default: "Save". */
  saveLabel?: string;
  /** Submit handler. Receives current form values. */
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

export function PolicyFormShell({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initialValues,
  institutions,
  saveLabel = 'Save',
  onSubmit,
}: PolicyFormShellProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  const update = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    // Required-field validation
    for (const f of fields) {
      if (!f.required) continue;
      if (f.visibleWhen && !f.visibleWhen(values)) continue;
      const v = values[f.name];
      if (v === undefined || v === null || v === '') {
        toast.error(`${f.englishLabel} is required`);
        return;
      }
    }
    // Number range validation
    for (const f of fields) {
      if (f.kind !== 'number') continue;
      const v = values[f.name];
      if (v === undefined || v === '' || v === null) continue;
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      if (Number.isNaN(n)) {
        toast.error(`${f.englishLabel} must be a number`);
        return;
      }
      if (f.min !== undefined && n < f.min) {
        toast.error(`${f.englishLabel} must be at least ${f.min}`);
        return;
      }
      if (f.max !== undefined && n > f.max) {
        toast.error(`${f.englishLabel} must be at most ${f.max}`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fields.map((f) => {
            if (f.visibleWhen && !f.visibleWhen(values)) return null;
            return (
              <FieldRenderer
                key={f.name}
                field={f}
                value={values[f.name]}
                onChange={(v) => update(f.name, v)}
                institutions={institutions}
              />
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// FieldRenderer — dispatches by FieldKind. Each branch renders the same
// label + input + hint structure for visual consistency.
// ----------------------------------------------------------------------------
interface FieldRendererProps {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  institutions?: ReadonlyArray<{ id: string; name: string }>;
}

function FieldRenderer({
  field,
  value,
  onChange,
  institutions,
}: FieldRendererProps) {
  const id = `field-${field.name}`;

  // Toggle — different layout (label + switch on one row)
  if (field.kind === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="flex-1">
          <Label htmlFor={id} className="cursor-pointer text-sm">
            {field.englishLabel}
          </Label>
          {field.englishHint && (
            <p className="text-xs text-muted-foreground">{field.englishHint}</p>
          )}
        </div>
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={onChange}
          disabled={field.disabled}
        />
      </div>
    );
  }

  // All other kinds use stacked layout
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.englishLabel}</Label>
      {renderInput(field, value, onChange, institutions, id)}
      {field.englishHint && (
        <p className="text-xs text-muted-foreground">{field.englishHint}</p>
      )}
      {field.consequenceText && (
        <p className="text-xs italic text-muted-foreground">
          {field.consequenceText}
        </p>
      )}
    </div>
  );
}

function renderInput(
  field: FieldSchema,
  value: unknown,
  onChange: (v: unknown) => void,
  _institutions: ReadonlyArray<{ id: string; name: string }> | undefined,
  id: string,
) {
  // _institutions is reserved for a future scope-with-institution variant that
  // renders the institution dropdown inline. Today, pages add a sibling
  // 'institution_id' field with kind='enum' instead — see schema example in
  // CascadeStepList migration of tier-policy.
  switch (field.kind) {
    case 'text':
    case 'url':
      return (
        <Input
          id={id}
          type={field.kind === 'url' ? 'url' : 'text'}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
        />
      );

    case 'number':
      return (
        <Input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={id}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
        />
      );

    case 'enum':
    case 'enum-with-hint': {
      const options = field.options ?? [];
      const selected = options.find((o) => o.value === value);
      return (
        <>
          <Select
            value={String(value ?? '')}
            onValueChange={onChange}
            disabled={field.disabled}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder={field.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.kind === 'enum-with-hint' && selected?.hint && (
            <p className="text-xs text-muted-foreground">{selected.hint}</p>
          )}
        </>
      );
    }

    case 'scope-with-institution': {
      // This kind expects two values keyed at field.name and `${field.name}__institution_id`.
      // Pages provide both as separate fields in schema, OR they encode scope as the value
      // 'global' | 'institution' and pair it with a sibling 'institution_id' field. To keep
      // the substrate simple, we render JUST the scope select here; pages add a sibling
      // institution_id field (kind='enum', visibleWhen scope==='institution') in their schema.
      const options = field.options ?? [
        { value: 'global', label: 'All colleges (default)' },
        { value: 'institution', label: 'Just one college (override)' },
      ];
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={onChange}
          disabled={field.disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    default:
      // Unreachable if FieldKind union is exhaustive — keeps TS exhaustiveness check honest.
      return null;
  }
}
