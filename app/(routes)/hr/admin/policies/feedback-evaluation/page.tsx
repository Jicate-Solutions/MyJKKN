'use client';

// =====================================================================
// /hr/admin/policies/feedback-evaluation — Wave 3 W3-M6a
// =====================================================================
// Backed by `hr.feedback_evaluation` (scope=institution, per Director lock).
// Seeded by migrations/20260608_hr_governance_part1_seeds.sql.
// JSONB shape (per specs/hr-policy-jsonb-structures-2026-05-15.md §15):
//   {
//     student_feedback_frequency_per_semester: number,
//     format: string,
//     teaching_dimensions: string[],
//     env_dimensions: string[]
//   }
// =====================================================================

import { ArrowDown, ArrowUp, Info, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

// ---------------------------------------------------------------------------
// Types + parse
// ---------------------------------------------------------------------------

interface FeedbackValue {
  student_feedback_frequency_per_semester: number;
  format: string;
  teaching_dimensions: string[];
  env_dimensions: string[];
}

const DEFAULT_VALUE: FeedbackValue = {
  student_feedback_frequency_per_semester: 2,
  format: 'computerised_structure',
  teaching_dimensions: [
    'punctuality',
    'regularity',
    'teacher_control',
    'class_test_conduct',
    'tutorials_quality',
    'assignments_quality',
    'syllabus_coverage',
  ],
  env_dimensions: [
    'environment',
    'cleanliness_sanitation',
    'library',
    'canteen',
    'water_supply',
    'games_sports',
    'transport',
    'hod_attitude',
    'principal_grievance_response',
    'management_support',
  ],
};

function parseValue(raw: unknown): FeedbackValue {
  const obj = (raw || {}) as Partial<FeedbackValue>;
  return {
    student_feedback_frequency_per_semester: Number(
      obj.student_feedback_frequency_per_semester ??
        DEFAULT_VALUE.student_feedback_frequency_per_semester,
    ),
    format: String(obj.format ?? DEFAULT_VALUE.format),
    teaching_dimensions: Array.isArray(obj.teaching_dimensions)
      ? obj.teaching_dimensions.map(String)
      : [...DEFAULT_VALUE.teaching_dimensions],
    env_dimensions: Array.isArray(obj.env_dimensions)
      ? obj.env_dimensions.map(String)
      : [...DEFAULT_VALUE.env_dimensions],
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeedbackEvaluationPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Student Feedback & Evaluation">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Feedback & Evaluation' },
          ]}
        />
        <PolicyEditorShell<FeedbackValue>
          policyKey="hr.feedback_evaluation"
          pageTitle="Student Feedback & Evaluation"
          pageBlurb="How often students give feedback per semester, the collection format, and the two dimension sets — teaching quality dimensions and environmental dimensions."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <FeedbackEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — frequency + format + two reorderable string arrays
// ---------------------------------------------------------------------------

function FeedbackEditor({
  value,
  onChange,
  disabled,
}: {
  value: FeedbackValue;
  onChange: (next: FeedbackValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* Frequency + format */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Collection settings</Label>
          <p className="text-xs text-muted-foreground">
            How often per semester and in what format students submit feedback.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="freq" className="text-xs">
              Frequency per semester
            </Label>
            <Input
              id="freq"
              type="number"
              min={1}
              max={12}
              value={value.student_feedback_frequency_per_semester}
              onChange={(e) =>
                onChange({
                  ...value,
                  student_feedback_frequency_per_semester: Number(e.target.value) || 0,
                })
              }
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              How many times per semester each student fills the feedback form.
            </p>
          </div>
          <div>
            <Label htmlFor="format" className="text-xs">
              Format
            </Label>
            <Input
              id="format"
              value={value.format}
              onChange={(e) => onChange({ ...value, format: e.target.value })}
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              e.g. computerised_structure (online form), paper, hybrid.
            </p>
          </div>
        </div>
      </section>

      {/* Teaching dimensions */}
      <DimensionList
        label="Teaching dimensions"
        helpText="Aspects of teaching quality that students rate every cycle. Reorder by priority for the survey."
        items={value.teaching_dimensions}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, teaching_dimensions: next })}
        addPlaceholder="e.g. classroom_engagement"
      />

      {/* Environmental dimensions */}
      <DimensionList
        label="Environmental dimensions"
        helpText="Campus / facility / service aspects students rate. Cleanliness, library, transport, etc."
        items={value.env_dimensions}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, env_dimensions: next })}
        addPlaceholder="e.g. wifi_quality"
      />

      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Per Director lock 2026-05-15: every HR policy is per-institution. Changes here only
          affect the selected institution.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DimensionList — string array editor with add / remove / reorder
// ---------------------------------------------------------------------------

function DimensionList({
  label,
  helpText,
  items,
  disabled,
  onChange,
  addPlaceholder,
}: {
  label: string;
  helpText: string;
  items: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
  addPlaceholder: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function move(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  }

  return (
    <section className="space-y-3 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">
          {label} ({items.length})
        </Label>
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, idx) => (
          <Badge key={`${it}-${idx}`} variant="outline" className="pr-1 text-sm">
            <span className="text-xs text-muted-foreground mr-1">#{idx + 1}</span>
            <span className="font-mono">{it}</span>
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="ml-1 rounded-full p-0.5 hover:bg-accent disabled:opacity-40"
                  aria-label={`Move ${it} up`}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-accent disabled:opacity-40"
                  aria-label={`Move ${it} down`}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${it}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </Badge>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No dimensions yet.</p>
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={addPlaceholder}
            className="max-w-md"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}
