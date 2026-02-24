'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ServiceTypeField } from '@/types/service-request';

interface DynamicRequestFormProps {
  fields: ServiceTypeField[];
  defaultValues?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onSaveDraft?: (data: Record<string, any>) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

function buildDynamicSchema(fields: ServiceTypeField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  fields.forEach((field) => {
    let schema: z.ZodTypeAny;
    switch (field.field_type) {
      case 'text':
      case 'textarea':
      case 'select':
      case 'file':
        schema = field.is_required
          ? z.string().min(1, `${field.field_label} is required`)
          : z.string().optional();
        break;
      case 'number':
        schema = field.is_required
          ? z.number({ required_error: `${field.field_label} is required` })
          : z.number().optional();
        break;
      case 'boolean':
        schema = z.boolean().default(false);
        break;
      case 'date':
        schema = field.is_required
          ? z.string().min(1, `${field.field_label} is required`)
          : z.string().optional();
        break;
      default:
        schema = z.any();
    }
    shape[field.field_key] = schema;
  });

  return z.object(shape);
}

/**
 * Returns filtered options for a cascading select field.
 *
 * Convention: option values that contain "||" are treated as cascading.
 * Format: "parentFieldValue||actualStopValue"
 *
 * When no parent value is selected yet, returns an empty array so the
 * dropdown shows an informational placeholder instead of all 400+ stops.
 */
function getCascadingOptions(
  field: ServiceTypeField,
  allValues: Record<string, any>
): { options: Array<{ label: string; value: string }>; isCascading: boolean } {
  const opts = field.field_options ?? [];
  const isCascading = opts.some((o) => o.value.includes('||'));

  if (!isCascading) return { options: opts, isCascading: false };

  // Collect all unique parent prefixes present in this field's options
  const prefixes = new Set(opts.map((o) => o.value.split('||')[0]));

  // Find which currently selected form value matches a known prefix
  const selectedParent = Object.values(allValues).find(
    (val) => typeof val === 'string' && prefixes.has(val)
  );

  if (!selectedParent) return { options: [], isCascading: true };

  const filtered = opts
    .filter((o) => o.value.startsWith(selectedParent + '||'))
    .map((o) => ({ label: o.label, value: o.value.split('||')[1] }));

  return { options: filtered, isCascading: true };
}

export function DynamicRequestForm({
  fields,
  defaultValues,
  onSubmit,
  onSaveDraft,
  isSubmitting,
  submitLabel = 'Submit Request',
}: DynamicRequestFormProps) {
  const sortedFields = [...fields].sort((a, b) => a.display_order - b.display_order);
  const schema = buildDynamicSchema(sortedFields);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || {},
  });

  const allValues = watch();

  // When a parent field changes, reset any cascading child fields that
  // were filtering based on that parent's value.
  useEffect(() => {
    sortedFields.forEach((field) => {
      if (field.field_options?.some((o) => o.value.includes('||'))) {
        setValue(field.field_key, '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Depend on the values of NON-cascading select fields (the parent fields)
    ...sortedFields
      .filter((f) => f.field_type === 'select' && !f.field_options?.some((o) => o.value.includes('||')))
      .map((f) => allValues[f.field_key]),
  ]);

  const renderField = (field: ServiceTypeField) => {
    const error = errors[field.field_key];
    const errorMessage = error?.message as string | undefined;

    switch (field.field_type) {
      case 'text':
        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.field_key}
              placeholder={field.placeholder || ''}
              {...register(field.field_key)}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={field.field_key}
              placeholder={field.placeholder || ''}
              className="min-h-[100px]"
              {...register(field.field_key)}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.field_key}
              type="number"
              placeholder={field.placeholder || ''}
              {...register(field.field_key, { valueAsNumber: true })}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.field_key}
              type="date"
              {...register(field.field_key)}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.field_key} className="flex items-center space-x-2 py-2">
            <Checkbox
              id={field.field_key}
              checked={watch(field.field_key) || false}
              onCheckedChange={(checked) => setValue(field.field_key, !!checked)}
            />
            <Label htmlFor={field.field_key} className="cursor-pointer">
              {field.field_label}
            </Label>
            {field.help_text && (
              <p className="text-xs text-muted-foreground ml-2">{field.help_text}</p>
            )}
          </div>
        );

      case 'select': {
        const { options: effectiveOptions, isCascading } = getCascadingOptions(field, allValues);
        const hasNoParentSelected = isCascading && effectiveOptions.length === 0;

        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select
              value={watch(field.field_key) || ''}
              onValueChange={(value) => setValue(field.field_key, value)}
              disabled={hasNoParentSelected}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    hasNoParentSelected
                      ? 'Select a route first'
                      : field.placeholder || `Select ${field.field_label}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {effectiveOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );
      }

      case 'file':
        return (
          <div key={field.field_key} className="space-y-2">
            <Label htmlFor={field.field_key}>
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.field_key}
              type="file"
              {...register(field.field_key)}
            />
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {sortedFields.map(renderField)}

      <div className="flex justify-end gap-3 pt-4">
        {onSaveDraft && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onSaveDraft(getValues())}
            disabled={isSubmitting}
          >
            Save as Draft
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
