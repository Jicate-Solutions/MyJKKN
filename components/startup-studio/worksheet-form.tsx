'use client';

/**
 * WorksheetForm — Foundations (Level 0) dynamic worksheet renderer.
 *
 * Self-contained & controlled. Renders a form from FoundationsWorksheetField[]
 * and calls `onSubmit(data)` with the collected response_data. Submission state
 * (pending / error / success) is managed internally; the parent only injects the
 * async mutation via onSubmit.
 *
 * Supports all 9 field types: text, textarea, select, radio, number, scale,
 * matrix (editable table), markdown (display-only), image (upload).
 *
 * NOTE (image): for now the file is stored as a data-URL in response_data. A
 * follow-up swaps this for a Supabase Storage upload returning a URL once the
 * studio's upload bucket/util is confirmed (Step-0 verify item in the spec).
 */

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type {
  FoundationsWorksheetField,
  FoundationsMatrixColumn,
} from '@/types/startup-studio/foundations';

type FormData = Record<string, any>;

interface WorksheetFormProps {
  fields: FoundationsWorksheetField[];
  initialData?: FormData;
  readOnly?: boolean;
  onSubmit: (data: FormData) => Promise<void> | void;
  submitLabel?: string;
  updateLabel?: string;
  successMessage?: string;
}

export function WorksheetForm({
  fields,
  initialData,
  readOnly = false,
  onSubmit,
  submitLabel = 'Submit',
  updateLabel = 'Update',
  successMessage = 'Saved successfully!',
}: WorksheetFormProps) {
  const [formData, setFormData] = useState<FormData>(initialData || {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const handleChange = useCallback(
    (fieldId: string, value: any) => {
      setFormData((prev) => ({ ...prev, [fieldId]: value }));
      setErrors((prev) => {
        if (!prev[fieldId]) return prev;
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
      setSubmitError(null);
      setSubmitted(false);
    },
    []
  );

  function isEmpty(field: FoundationsWorksheetField, value: any): boolean {
    if (field.type === 'markdown') return false; // display-only, never required
    if (field.type === 'matrix') {
      return !Array.isArray(value) || value.length === 0;
    }
    if (typeof value === 'string') return !value.trim();
    return value === undefined || value === null || value === '';
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && isEmpty(field, formData[field.id])) {
        next[field.id] = 'This field is required';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || pending) return;

    if (!validate()) {
      const firstError = fields.find((f) => f.required && isEmpty(f, formData[f.id]));
      if (firstError) {
        document
          .getElementById(`field-${firstError.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    try {
      setPending(true);
      await onSubmit(formData);
      setSubmitted(true);
      setSubmitError(null);
    } catch {
      setSubmitError('Could not save your response. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {fields.map((field, index) => (
        <div key={field.id} id={`field-${field.id}`} className="space-y-2">
          {field.type !== 'markdown' && (
            <Label htmlFor={field.id} className="text-sm font-medium leading-snug">
              <span className="text-muted-foreground mr-1.5">{index + 1}.</span>
              {field.label}
              {field.required && (
                <span className="text-destructive ml-0.5" aria-hidden="true">
                  *
                </span>
              )}
            </Label>
          )}

          <FieldRenderer
            field={field}
            value={formData[field.id]}
            onChange={handleChange}
            readOnly={readOnly}
          />

          {errors[field.id] && (
            <p className="text-xs text-destructive" role="alert">
              {errors[field.id]}
            </p>
          )}
        </div>
      ))}

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}

      {submitted && (
        <div className="flex items-center gap-2 text-sm text-green-600" role="status">
          <CheckCircle2 className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={pending} size="lg">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
            {initialData ? updateLabel : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

// --- Field renderers ---

function FieldRenderer({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FoundationsWorksheetField;
  value: any;
  onChange: (fieldId: string, value: any) => void;
  readOnly: boolean;
}) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          id={field.id}
          value={value || ''}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          aria-required={field.required}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={field.id}
          value={value || ''}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="resize-y"
          disabled={readOnly}
          aria-required={field.required}
        />
      );

    case 'number':
      return (
        <Input
          id={field.id}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(field.id, e.target.value ? Number(e.target.value) : '')}
          placeholder={field.placeholder}
          disabled={readOnly}
          aria-required={field.required}
        />
      );

    case 'select':
      return (
        <Select value={value || ''} onValueChange={(v) => onChange(field.id, v)} disabled={readOnly}>
          <SelectTrigger id={field.id} aria-required={field.required}>
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'radio':
      return (
        <RadioGroup
          value={value || ''}
          onValueChange={(v) => onChange(field.id, v)}
          disabled={readOnly}
          className="space-y-2"
        >
          {(field.options || []).map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${field.id}-${opt}`} />
              <Label htmlFor={`${field.id}-${opt}`} className="font-normal cursor-pointer">
                {opt}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case 'scale': {
      const max = field.scale_max ?? (field.options?.length ? field.options.length : 10);
      const scaleValue = typeof value === 'number' ? value : 1;
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">1</span>
            <Badge variant="secondary" className="tabular-nums">
              {scaleValue} / {max}
            </Badge>
            <span className="text-xs text-muted-foreground">{max}</span>
          </div>
          <Slider
            min={1}
            max={max}
            step={1}
            value={[scaleValue]}
            onValueChange={([v]) => onChange(field.id, v)}
            disabled={readOnly}
            aria-label={field.label}
          />
          {field.options && field.options.length > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{field.options[0]}</span>
              <span>{field.options[field.options.length - 1]}</span>
            </div>
          )}
        </div>
      );
    }

    case 'markdown':
      return (
        <div className="rounded-md border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {field.content || field.label}
        </div>
      );

    case 'image':
      return <ImageField field={field} value={value} onChange={onChange} readOnly={readOnly} />;

    case 'matrix':
      return <MatrixField field={field} value={value} onChange={onChange} readOnly={readOnly} />;

    default:
      return (
        <Input
          id={field.id}
          value={value || ''}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
        />
      );
  }
}

function ImageField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FoundationsWorksheetField;
  value: any;
  onChange: (fieldId: string, value: any) => void;
  readOnly: boolean;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(field.id, reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={field.label}
          className="max-h-64 rounded-md border object-contain"
        />
      )}
      {!readOnly && (
        <Input
          id={field.id}
          type="file"
          accept="image/*"
          onChange={handleFile}
          aria-required={field.required}
        />
      )}
    </div>
  );
}

function MatrixField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FoundationsWorksheetField;
  value: any;
  onChange: (fieldId: string, value: any) => void;
  readOnly: boolean;
}) {
  const columns: FoundationsMatrixColumn[] = field.columns || [];
  const rows: Array<Record<string, any>> = Array.isArray(value) ? value : [];

  function emptyRow(): Record<string, any> {
    return Object.fromEntries(columns.map((c) => [c.key, '']));
  }

  function setCell(rowIdx: number, colKey: string, cellValue: any) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: cellValue } : r));
    onChange(field.id, next);
  }

  function addRow() {
    onChange(field.id, [...rows, emptyRow()]);
  }

  function removeRow(rowIdx: number) {
    onChange(
      field.id,
      rows.filter((_, i) => i !== rowIdx)
    );
  }

  // Ensure at least the configured starter rows are visible when empty & editable.
  const displayRows = rows.length === 0 && !readOnly ? [emptyRow()] : rows;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-medium">
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="w-10 px-2 py-2" aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t">
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 align-top">
                    <Input
                      type={c.type === 'number' ? 'number' : 'text'}
                      value={row[c.key] ?? ''}
                      onChange={(e) =>
                        setCell(
                          rowIdx,
                          c.key,
                          c.type === 'number'
                            ? e.target.value
                              ? Number(e.target.value)
                              : ''
                            : e.target.value
                        )
                      }
                      disabled={readOnly}
                      className="h-8"
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-2 py-1.5 text-right align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeRow(rowIdx)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1.5" /> Add row
        </Button>
      )}
    </div>
  );
}
