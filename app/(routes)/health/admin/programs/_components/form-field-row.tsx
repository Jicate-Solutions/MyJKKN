'use client';

// app/(routes)/health/admin/programs/_components/form-field-row.tsx
// Created: 2026-06-16 — Wellness Programs form builder.
// One field editor: type picker + label + (per type) options / scale config,
// plus "graded" and "required" toggles. Replaces quiz-question-row.tsx.

import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  FormField,
  FormFieldOption,
  FormFieldType,
} from '@/types/health-programs';
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  isChoiceType,
  makeBlankField,
  makeBlankOption,
} from '@/lib/health/forms';
import { FormOptionRow } from './form-option-row';

const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

interface FormFieldRowProps {
  index: number;
  total: number;
  field: FormField;
  onChange: (next: FormField) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function FormFieldRow({
  index,
  total,
  field,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: FormFieldRowProps) {
  const isChoice = isChoiceType(field.type);
  const isMulti = field.type === 'multi_choice';
  const options = field.options ?? [];

  function changeType(type: FormFieldType) {
    // Rebuild type-specific scaffolding while keeping the label + required flag.
    const rebuilt = makeBlankField(type);
    onChange({
      ...rebuilt,
      id: field.id,
      label: field.label,
      description: field.description,
      required: field.required,
    });
  }

  function updateOption(optId: string, next: FormFieldOption) {
    onChange({
      ...field,
      options: options.map((o) => (o.id === optId ? next : o)),
    });
  }

  function toggleCorrect(optId: string) {
    if (isMulti) {
      onChange({
        ...field,
        options: options.map((o) =>
          o.id === optId ? { ...o, is_correct: !o.is_correct } : o
        ),
      });
    } else {
      onChange({
        ...field,
        options: options.map((o) => ({ ...o, is_correct: o.id === optId })),
      });
    }
  }

  function deleteOption(optId: string) {
    if (options.length <= MIN_OPTIONS) return;
    onChange({ ...field, options: options.filter((o) => o.id !== optId) });
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    onChange({ ...field, options: [...options, makeBlankOption()] });
  }

  const correctCount = options.filter((o) => o.is_correct).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-slate-400"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move field up"
            >
              <GripVertical className="h-3.5 w-3.5 rotate-90" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-slate-400"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move field down"
            >
              <GripVertical className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
          <h4 className="text-sm font-semibold text-slate-700">
            Field {index + 1}
          </h4>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-slate-400 hover:text-destructive"
          aria-label={`Delete field ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Question / label</Label>
          <Textarea
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            placeholder="e.g. How many hours of sleep do adults need each night?"
            className="min-h-[44px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={field.type} onValueChange={(v) => changeType(v as FormFieldType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Optional helper sub-text shown under the question (all types) */}
      <div className="mt-3 space-y-1.5">
        <Label className="text-xs">Description (optional)</Label>
        <Input
          value={field.description ?? ''}
          onChange={(e) =>
            onChange({ ...field, description: e.target.value })
          }
          placeholder="Helper text shown under the question"
        />
      </div>

      {/* Choice options */}
      {isChoice && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Options
              <span className="ml-2 text-slate-400">
                {options.length} / {MAX_OPTIONS}
              </span>
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={!!field.graded}
                onChange={(e) => onChange({ ...field, graded: e.target.checked })}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              Graded {isMulti ? '(exact match)' : ''}
            </label>
          </div>

          {field.graded && correctCount === 0 && (
            <p className="text-xs text-amber-600">
              Select the correct answer{isMulti ? '(s)' : ''}.
            </p>
          )}
          {field.graded && !isMulti && correctCount > 1 && (
            <p className="text-xs text-destructive">Only one answer can be correct.</p>
          )}

          {options.map((o, i) => (
            <FormOptionRow
              key={o.id}
              index={i}
              option={o}
              fieldId={field.id}
              graded={!!field.graded}
              multi={isMulti}
              canDelete={options.length > MIN_OPTIONS}
              onChange={(next) => updateOption(o.id, next)}
              onToggleCorrect={() => toggleCorrect(o.id)}
              onDelete={() => deleteOption(o.id)}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={options.length >= MAX_OPTIONS}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add option
          </Button>
        </div>
      )}

      {/* Scale config */}
      {field.type === 'scale' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Lowest number</Label>
            <Input
              type="number"
              value={field.scale_min ?? 1}
              onChange={(e) =>
                onChange({ ...field, scale_min: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Highest number</Label>
            <Input
              type="number"
              value={field.scale_max ?? 5}
              onChange={(e) =>
                onChange({ ...field, scale_max: Number(e.target.value) })
              }
            />
          </div>
        </div>
      )}

      {/* Required */}
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={!!field.required}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        Required
      </label>
    </div>
  );
}
