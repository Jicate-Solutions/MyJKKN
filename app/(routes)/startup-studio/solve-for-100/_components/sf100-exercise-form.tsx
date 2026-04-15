'use client';

/**
 * SF100ExerciseForm — Renders a dynamic form from SF100ExerciseField[] definition.
 *
 * Handles all field types: text, textarea, select, radio, number, scale.
 * Validates required fields before submission.
 *
 * Usage:
 *   <SF100ExerciseForm
 *     fields={exercise.fields}
 *     exerciseId={exercise.id}
 *     enrollmentId={enrollment.id}
 *     initialData={existingResponse?.response_data}
 *   />
 */

import { useState, useCallback } from 'react';
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
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useSubmitSF100ExerciseResponse } from '@/hooks/startup-studio';
import type { SF100ExerciseField } from '@/types/startup-studio/sf100';

interface SF100ExerciseFormProps {
  fields: SF100ExerciseField[];
  exerciseId: string;
  enrollmentId: string;
  initialData?: Record<string, any>;
  readOnly?: boolean;
  onSuccess: () => void;
}

export function SF100ExerciseForm({
  fields,
  exerciseId,
  enrollmentId,
  initialData,
  readOnly = false,
  onSuccess,
}: SF100ExerciseFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData || {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { mutate, isPending } = useSubmitSF100ExerciseResponse(exerciseId, enrollmentId);

  const handleChange = useCallback((fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
    if (submitError) setSubmitError(null);
    if (submitted) setSubmitted(false);
  }, [errors, submitError, submitted]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required) {
        const value = formData[field.id];
        if (value === undefined || value === null || value === '' || (typeof value === 'string' && !value.trim())) {
          newErrors[field.id] = 'This field is required';
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    if (!validate()) {
      // Scroll to the first error
      const firstErrorField = fields.find((f) => errors[f.id] || (f.required && !formData[f.id]?.toString().trim()));
      if (firstErrorField) {
        document.getElementById(`field-${firstErrorField.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    mutate(
      { response_data: formData },
      {
        onSuccess: () => {
          setSubmitted(true);
          setSubmitError(null);
          onSuccess();
        },
        onError: () => {
          setSubmitError('Failed to save your response. Please try again.');
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {fields.map((field, index) => (
        <div key={field.id} id={`field-${field.id}`} className="space-y-2">
          <Label htmlFor={field.id} className="text-sm font-medium leading-snug">
            <span className="text-muted-foreground mr-1.5">{index + 1}.</span>
            {field.label}
            {field.required && (
              <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
            )}
          </Label>

          {renderField(field, formData[field.id], handleChange, readOnly)}

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
          <span>Response saved successfully!</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isPending} size="lg">
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
            {initialData ? 'Update Response' : 'Submit Response'}
          </Button>
        </div>
      )}
    </form>
  );
}

// --- Field Renderers ---

function renderField(
  field: SF100ExerciseField,
  value: any,
  onChange: (fieldId: string, value: any) => void,
  readOnly: boolean
) {
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
        <Select
          value={value || ''}
          onValueChange={(v) => onChange(field.id, v)}
          disabled={readOnly}
        >
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
      const scaleValue = typeof value === 'number' ? value : 5;
      const max = field.options?.length ? field.options.length : 10;
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
