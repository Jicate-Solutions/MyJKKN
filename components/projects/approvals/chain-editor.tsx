'use client';

/**
 * ChainEditor — visual add/remove/reorder editor for an approval_chain JSONB array.
 *
 * Each step has a label (display name) and a role key.
 * Reordering is done via Up/Down arrow buttons (no drag-and-drop dependency needed).
 * The array of ApprovalStep objects is lifted to the parent via onChange.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { ApprovalStep } from './types';

interface ChainEditorProps {
  value: ApprovalStep[];
  onChange: (steps: ApprovalStep[]) => void;
  disabled?: boolean;
}

interface NewStepState {
  label: string;
  role: string;
}

const EMPTY_NEW_STEP: NewStepState = { label: '', role: '' };

export function ChainEditor({ value, onChange, disabled = false }: ChainEditorProps) {
  const [newStep, setNewStep] = useState<NewStepState>(EMPTY_NEW_STEP);

  function addStep() {
    const label = newStep.label.trim();
    const role = newStep.role.trim();
    if (!label || !role) return;

    const next: ApprovalStep = { label, role, order: value.length };
    onChange([...value, next]);
    setNewStep(EMPTY_NEW_STEP);
  }

  function removeStep(index: number) {
    const next = value.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i }));
    onChange(next);
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const next = [...value];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((s, i) => ({ ...s, order: i })));
  }

  function updateStep(index: number, field: 'label' | 'role', val: string) {
    const next = value.map((s, i) => (i === index ? { ...s, [field]: val } : s));
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No steps yet — add one below.
        </p>
      )}

      {value.map((step, index) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

          <span className="min-w-[1.5rem] text-center text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>

          <Input
            value={step.label}
            onChange={(e) => updateStep(index, 'label', e.target.value)}
            placeholder="Label (e.g. Head of Department)"
            className="h-8 text-sm"
            disabled={disabled}
          />
          <Input
            value={step.role}
            onChange={(e) => updateStep(index, 'role', e.target.value)}
            placeholder="Role key (e.g. hod)"
            className="h-8 w-36 text-sm font-mono"
            disabled={disabled}
          />

          <div className="flex gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${TAP_TARGET_ICON}`}
              onClick={() => moveStep(index, 'up')}
              disabled={disabled || index === 0}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${TAP_TARGET_ICON}`}
              onClick={() => moveStep(index, 'down')}
              disabled={disabled || index === value.length - 1}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`h-7 w-7 text-destructive hover:text-destructive ${TAP_TARGET_ICON}`}
              onClick={() => removeStep(index)}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      {/* Add-step row */}
      <div className="flex items-end gap-2 border-t pt-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={newStep.label}
            onChange={(e) => setNewStep((s) => ({ ...s, label: e.target.value }))}
            placeholder="Head of Department"
            className="h-8 text-sm"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addStep();
              }
            }}
          />
        </div>
        <div className="w-40 space-y-1">
          <Label className="text-xs">Role key</Label>
          <Input
            value={newStep.role}
            onChange={(e) => setNewStep((s) => ({ ...s, role: e.target.value }))}
            placeholder="hod"
            className="h-8 text-sm font-mono"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addStep();
              }
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={addStep}
          disabled={disabled || !newStep.label.trim() || !newStep.role.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </Button>
      </div>
    </div>
  );
}
