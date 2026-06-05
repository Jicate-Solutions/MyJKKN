'use client';

import { useEffect, useRef, useState } from 'react';
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
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useTmsRoutes, useTmsRouteStops } from '@/hooks/service-requests/use-tms-lookups';
import { useAuth } from '@/hooks/use-auth';
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
        schema = field.is_required
          ? z.string().min(1, `${field.field_label} is required`)
          : z.string().optional();
        break;
      case 'file':
        schema = field.is_required
          ? z.any().refine(
              (val) => {
                if (typeof val === 'string') return val.length > 0;
                if (val instanceof FileList) return val.length > 0;
                return !!val;
              },
              `${field.field_label} is required`
            )
          : z.any().optional();
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
      case 'tms_route':
      case 'tms_route_stop':
        schema = field.is_required
          ? z.string().min(1, `${field.field_label} is required`)
          : z.string().optional();
        break;
      case 'passenger_type':
        schema = z.string().optional();
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

async function uploadFileFields(
  formData: Record<string, any>,
  fields: ServiceTypeField[]
): Promise<Record<string, any>> {
  const supabase = createClientSupabaseClient();
  const processed = { ...formData };

  for (const field of fields) {
    if (field.field_type !== 'file') continue;
    const value = processed[field.field_key];

    if (!value || typeof value === 'string') continue;

    const fileList = value as FileList;
    if (fileList.length === 0) {
      processed[field.field_key] = '';
      continue;
    }

    const file = fileList[0];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage
      .from('service-request-attachments')
      .upload(path, file);

    if (error) throw new Error(`Failed to upload ${field.field_label}: ${error.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('service-request-attachments')
      .getPublicUrl(data.path);

    processed[field.field_key] = publicUrl;
  }

  return processed;
}

function TmsRouteFieldControl({
  field,
  value,
  onChange,
  error,
}: {
  field: ServiceTypeField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { data: routes = [], isLoading } = useTmsRoutes();
  return (
    <div className="space-y-2">
      <Label htmlFor={field.field_key}>
        {field.field_label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select value={value || ''} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger id={field.field_key}>
          <SelectValue
            placeholder={isLoading ? 'Loading routes…' : field.placeholder || 'Select a route'}
          />
        </SelectTrigger>
        <SelectContent>
          {routes.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.route_number} — {r.route_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function TmsRouteStopFieldControl({
  field,
  routeId,
  value,
  onChange,
  error,
}: {
  field: ServiceTypeField;
  routeId: string | undefined;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { data: stops = [], isLoading } = useTmsRouteStops(routeId);
  const disabled = !routeId || isLoading;
  return (
    <div className="space-y-2">
      <Label htmlFor={field.field_key}>
        {field.field_label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={field.field_key}>
          <SelectValue
            placeholder={
              !routeId
                ? 'Select a route first'
                : isLoading
                ? 'Loading stops…'
                : field.placeholder || 'Select a boarding stop'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {stops.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.stop_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function PassengerTypeFieldControl({
  field,
  value,
  onChange,
}: {
  field: ServiceTypeField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { profile } = useAuth() as any;
  const detected = profile?.learner_id ? 'learner' : 'staff';
  useEffect(() => {
    if (value !== detected) onChange(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected]);
  return (
    <div className="space-y-2">
      <Label>{field.field_label}</Label>
      <div>
        <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-sm font-medium capitalize">
          {detected === 'learner' ? 'Learner' : 'Staff'}
        </span>
      </div>
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
    </div>
  );
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  // The Boarding Stop field cascades off whichever field is the tms_route picker.
  const routeFieldKey = sortedFields.find((f) => f.field_type === 'tms_route')?.field_key;
  const selectedRouteId = routeFieldKey
    ? (allValues[routeFieldKey] as string | undefined)
    : undefined;

  // Track whether the component has finished its initial mount so the cascade
  // reset effect does NOT fire on first render (which would clear pre-populated
  // defaultValues for cascading child fields in the edit flow).
  const hasMounted = useRef(false);

  // When a parent field changes, reset any cascading child fields that
  // were filtering based on that parent's value.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
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

  // Clear the boarding-stop field whenever the selected route changes (but not
  // on first mount, so a pre-filled stop survives the edit flow's initial render).
  const stopResetMounted = useRef(false);
  useEffect(() => {
    if (!stopResetMounted.current) {
      stopResetMounted.current = true;
      return;
    }
    sortedFields.forEach((field) => {
      if (field.field_type === 'tms_route_stop') {
        setValue(field.field_key, '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId]);

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

      case 'file': {
        const existingUrl = defaultValues?.[field.field_key];
        const isExistingString = typeof existingUrl === 'string' && existingUrl.length > 0;
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
            {isExistingString && (
              <p className="text-xs text-muted-foreground">
                Current file:{' '}
                <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
                  {existingUrl.split('/').pop()}
                </a>
              </p>
            )}
            {field.help_text && (
              <p className="text-xs text-muted-foreground">{field.help_text}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        );
      }

      case 'tms_route':
        return (
          <TmsRouteFieldControl
            key={field.field_key}
            field={field}
            value={(allValues[field.field_key] as string) || ''}
            onChange={(v) => setValue(field.field_key, v)}
            error={errorMessage}
          />
        );

      case 'tms_route_stop':
        return (
          <TmsRouteStopFieldControl
            key={field.field_key}
            field={field}
            routeId={selectedRouteId}
            value={(allValues[field.field_key] as string) || ''}
            onChange={(v) => setValue(field.field_key, v)}
            error={errorMessage}
          />
        );

      case 'passenger_type':
        return (
          <PassengerTypeFieldControl
            key={field.field_key}
            field={field}
            value={(allValues[field.field_key] as string) || ''}
            onChange={(v) => setValue(field.field_key, v)}
          />
        );

      default:
        return null;
    }
  };

  const hasFileFields = sortedFields.some((f) => f.field_type === 'file');
  const busy = isSubmitting || isUploading;

  const handleFormSubmit = async (data: Record<string, any>) => {
    if (!hasFileFields) return onSubmit(data);
    setUploadError(null);
    setIsUploading(true);
    try {
      const processed = await uploadFileFields(data, sortedFields);
      onSubmit(processed);
    } catch (err: any) {
      setUploadError(err?.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDraft = async () => {
    if (!onSaveDraft) return;
    const data = getValues();
    if (!hasFileFields) return onSaveDraft(data);
    setUploadError(null);
    setIsUploading(true);
    try {
      const processed = await uploadFileFields(data, sortedFields);
      onSaveDraft(processed);
    } catch (err: any) {
      setUploadError(err?.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {sortedFields.map(renderField)}

      {uploadError && (
        <p className="text-sm text-red-500">{uploadError}</p>
      )}

      <div className="flex justify-end gap-3 pt-4">
        {onSaveDraft && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDraft}
            disabled={busy}
          >
            Save as Draft
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {isUploading ? 'Uploading files...' : isSubmitting ? 'Submitting...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
