'use client';

/**
 * SF100 Create Exercise Page
 *
 * Admin-only page to create a new exercise with dynamic field builder.
 * Supports adding/removing/reordering fields of all types.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useSF100Programs, useCreateSF100Exercise } from '@/hooks/startup-studio';
import type { SF100ExerciseField } from '@/types/startup-studio/sf100';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/startup-studio/solve-for-100/exercises',
} as const;


type FieldType = SF100ExerciseField['type'];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short Text',
  textarea: 'Long Text',
  select: 'Dropdown',
  radio: 'Radio Buttons',
  number: 'Number',
  scale: 'Scale (1-10)',
};

function createEmptyField(): SF100ExerciseField {
  return {
    id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'text',
    label: '',
    required: false,
  };
}

export default function CreateExercisePage() {
  const router = useRouter();

  // Get active program
  const { data: programsData, isLoading: loadingPrograms } = useSF100Programs({
    status: 'active',
    limit: 1,
  });
  const programs = (programsData as any)?.data || [];
  const activeProgram = programs[0];
  const programId = activeProgram?.id || '';

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [fields, setFields] = useState<SF100ExerciseField[]>([createEmptyField()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutate: createExercise, isPending } = useCreateSF100Exercise();

  // Field management
  const addField = useCallback(() => {
    setFields((prev) => [...prev, createEmptyField()]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
    setFields((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const updateField = useCallback(
    (index: number, updates: Partial<SF100ExerciseField>) => {
      setFields((prev) =>
        prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const updateFieldOptions = useCallback(
    (index: number, optionsText: string) => {
      const options = optionsText
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean);
      updateField(index, { options });
    },
    [updateField]
  );

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (fields.length === 0) newErrors.fields = 'At least one field is required';

    for (let i = 0; i < fields.length; i++) {
      if (!fields[i].label.trim()) {
        newErrors[`field_${i}_label`] = `Question ${i + 1} needs a label`;
      }
      if (
        (fields[i].type === 'select' || fields[i].type === 'radio') &&
        (!fields[i].options || fields[i].options!.length === 0)
      ) {
        newErrors[`field_${i}_options`] = `Question ${i + 1} needs at least one option`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createExercise(
      {
        program_id: programId,
        title: title.trim(),
        description: description.trim() || undefined,
        is_required: isRequired,
        due_date: dueDate || undefined,
        fields,
      },
      {
        onSuccess: () => {
          router.push('/startup-studio/solve-for-100/exercises');
        },
      }
    );
  }

  const needsOptions = (type: FieldType) => type === 'select' || type === 'radio';

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Exercises', href: '/startup-studio/solve-for-100/exercises' },
          { label: 'Create' },
        ]}
      />

      <div className="space-y-6 mt-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold py-1">Create Exercise</h1>
          <p className="text-sm text-muted-foreground">
            Build a form that teams will fill out. All responses are visible to everyone.
          </p>
        </div>

        {!programId && !loadingPrograms && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-amber-800 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>No active program found. Create or activate a Solve for 100 program first.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exercise metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exercise Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                  }}
                  placeholder="e.g., Ideal Customer Profile Builder"
                />
                {errors.title && (
                  <p className="text-xs text-destructive">{errors.title}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions for the teams..."
                  rows={3}
                  className="resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_required"
                      checked={isRequired}
                      onCheckedChange={(c) => setIsRequired(c === true)}
                    />
                    <Label htmlFor="is_required" className="font-normal cursor-pointer">
                      Required exercise
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fields builder */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Questions</CardTitle>
                  <CardDescription>
                    Add questions that teams will answer. Drag to reorder.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {fields.length} question{fields.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {errors.fields && (
                <p className="text-xs text-destructive">{errors.fields}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="border rounded-lg p-4 space-y-3 bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      Q{index + 1}
                    </Badge>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === 0}
                      onClick={() => moveField(index, 'up')}
                      aria-label="Move question up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === fields.length - 1}
                      onClick={() => moveField(index, 'down')}
                      aria-label="Move question down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeField(index)}
                      disabled={fields.length <= 1}
                      aria-label="Remove question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Field type selector */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(v) =>
                          updateField(index, { type: v as FieldType })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Field label */}
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs">
                        Question Label <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="What do you want to ask?"
                        className="h-9"
                      />
                      {errors[`field_${index}_label`] && (
                        <p className="text-xs text-destructive">
                          {errors[`field_${index}_label`]}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Optional placeholder */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Placeholder (optional)</Label>
                    <Input
                      value={field.placeholder || ''}
                      onChange={(e) => updateField(index, { placeholder: e.target.value || undefined })}
                      placeholder="Hint text shown in the field..."
                      className="h-9"
                    />
                  </div>

                  {/* Options for select/radio */}
                  {needsOptions(field.type) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Options (one per line) <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        value={(field.options || []).join('\n')}
                        onChange={(e) => updateFieldOptions(index, e.target.value)}
                        placeholder="Option 1\nOption 2\nOption 3"
                        rows={4}
                        className="resize-y text-sm"
                      />
                      {errors[`field_${index}_options`] && (
                        <p className="text-xs text-destructive">
                          {errors[`field_${index}_options`]}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Required checkbox */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`required_${field.id}`}
                      checked={field.required}
                      onCheckedChange={(c) => updateField(index, { required: c === true })}
                    />
                    <Label
                      htmlFor={`required_${field.id}`}
                      className="text-xs font-normal cursor-pointer"
                    >
                      Required
                    </Label>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addField}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Question
              </Button>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !programId} size="lg">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Exercise
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
