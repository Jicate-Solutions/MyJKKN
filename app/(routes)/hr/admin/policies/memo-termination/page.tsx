'use client';

// =====================================================================
// /hr/admin/policies/memo-termination — Wave 3 W3-M6a
// =====================================================================
// Backed by `hr.memo_and_termination_triggers` (scope=institution).
// Seeded by migrations/20260608_hr_governance_part1_seeds.sql.
// JSONB shape (per specs/hr-policy-jsonb-structures-2026-05-15.md §26):
//   {
//     memo_triggers: string[],
//     memo_threshold_for_termination: number,
//     memo_notice_format_template_ref: string | null,
//     termination_triggers: {
//       3plus_memos_immediate: boolean,
//       unannounced_leave_week_threshold_days: number
//     },
//     termination_5_step_process: string[]
//   }
// =====================================================================

import { ArrowDown, ArrowUp, Info, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

// ---------------------------------------------------------------------------
// Types + parse
// ---------------------------------------------------------------------------

interface MemoTermValue {
  memo_triggers: string[];
  memo_threshold_for_termination: number;
  memo_notice_format_template_ref: string | null;
  termination_triggers: {
    '3plus_memos_immediate': boolean;
    unannounced_leave_week_threshold_days: number;
  };
  termination_5_step_process: string[];
}

const DEFAULT_VALUE: MemoTermValue = {
  memo_triggers: ['leave_before_approval', '2plus_lops_per_month'],
  memo_threshold_for_termination: 3,
  memo_notice_format_template_ref: null,
  termination_triggers: {
    '3plus_memos_immediate': true,
    unannounced_leave_week_threshold_days: 7,
  },
  termination_5_step_process: [
    'identify_and_document_issues',
    'coach_employees_to_rectify',
    'create_performance_improvement_plan',
    'terminate_the_employee',
    'have_hr_conduct_exit_interview',
  ],
};

function parseValue(raw: unknown): MemoTermValue {
  const obj = (raw || {}) as Partial<MemoTermValue>;
  const tt = (obj.termination_triggers || {}) as Partial<MemoTermValue['termination_triggers']>;
  return {
    memo_triggers: Array.isArray(obj.memo_triggers)
      ? obj.memo_triggers.map(String)
      : [...DEFAULT_VALUE.memo_triggers],
    memo_threshold_for_termination: Number(
      obj.memo_threshold_for_termination ?? DEFAULT_VALUE.memo_threshold_for_termination,
    ),
    memo_notice_format_template_ref:
      obj.memo_notice_format_template_ref != null
        ? String(obj.memo_notice_format_template_ref)
        : null,
    termination_triggers: {
      '3plus_memos_immediate': Boolean(
        tt['3plus_memos_immediate'] ?? DEFAULT_VALUE.termination_triggers['3plus_memos_immediate'],
      ),
      unannounced_leave_week_threshold_days: Number(
        tt.unannounced_leave_week_threshold_days ??
          DEFAULT_VALUE.termination_triggers.unannounced_leave_week_threshold_days,
      ),
    },
    termination_5_step_process: Array.isArray(obj.termination_5_step_process)
      ? obj.termination_5_step_process.map(String)
      : [...DEFAULT_VALUE.termination_5_step_process],
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemoTerminationPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Memo & Termination Triggers">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Memo & Termination' },
          ]}
        />
        <PolicyEditorShell<MemoTermValue>
          policyKey="hr.memo_and_termination_triggers"
          pageTitle="Memo & Termination Triggers"
          pageBlurb="When memos are issued, how many memos trigger termination, the immediate-termination conditions, and the 5-step termination process."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <MemoTermEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — triggers list + threshold + immediate triggers + 5-step process
// ---------------------------------------------------------------------------

function MemoTermEditor({
  value,
  onChange,
  disabled,
}: {
  value: MemoTermValue;
  onChange: (next: MemoTermValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* Memo triggers */}
      <StringList
        label="Memo triggers"
        helpText="Situations that result in a written memo being issued to the employee."
        items={value.memo_triggers}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, memo_triggers: next })}
        addPlaceholder="e.g. unauthorised_absence"
        showOrder={false}
      />

      {/* Threshold */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Termination threshold</Label>
          <p className="text-xs text-muted-foreground">
            How many memos cumulatively trigger termination review.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="threshold" className="text-xs">
              Memos that trigger termination
            </Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              max={20}
              value={value.memo_threshold_for_termination}
              onChange={(e) =>
                onChange({
                  ...value,
                  memo_threshold_for_termination: Number(e.target.value) || 0,
                })
              }
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default: 3. When an employee accumulates this many memos, termination review starts.
            </p>
          </div>
          <div>
            <Label htmlFor="template-ref" className="text-xs">
              Memo notice format template
            </Label>
            <Input
              id="template-ref"
              value={value.memo_notice_format_template_ref ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  memo_notice_format_template_ref:
                    e.target.value === '' ? null : e.target.value,
                })
              }
              placeholder="https://... (template URL, optional)"
              disabled={disabled}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional link to the official memo notice template.
            </p>
          </div>
        </div>
      </section>

      {/* Termination triggers */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Immediate termination triggers</Label>
          <p className="text-xs text-muted-foreground">
            Conditions that bypass the gradual memo process and trigger immediate termination.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">3+ memos already → immediate termination</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, an employee with 3 or more memos on record can be terminated without
                further notice.
              </p>
            </div>
            <Switch
              checked={value.termination_triggers['3plus_memos_immediate']}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  termination_triggers: {
                    ...value.termination_triggers,
                    '3plus_memos_immediate': c,
                  },
                })
              }
              disabled={disabled}
              aria-label="Toggle 3+ memos immediate termination"
            />
          </div>
          <div>
            <Label htmlFor="unannounced-days" className="text-xs">
              Unannounced leave threshold (days)
            </Label>
            <Input
              id="unannounced-days"
              type="number"
              min={1}
              max={90}
              value={value.termination_triggers.unannounced_leave_week_threshold_days}
              onChange={(e) =>
                onChange({
                  ...value,
                  termination_triggers: {
                    ...value.termination_triggers,
                    unannounced_leave_week_threshold_days: Number(e.target.value) || 0,
                  },
                })
              }
              disabled={disabled}
              className="mt-1 max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default: 7. Continuous unannounced leave exceeding this many days triggers
              immediate termination.
            </p>
          </div>
        </div>
      </section>

      {/* 5-step process */}
      <StringList
        label="Termination process (ordered)"
        helpText="The 5 steps HR follows when terminating an employee. Reorder as needed."
        items={value.termination_5_step_process}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, termination_5_step_process: next })}
        addPlaceholder="e.g. legal_review"
        showOrder={true}
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
// StringList — reorderable string-array editor with add/remove
// ---------------------------------------------------------------------------

function StringList({
  label,
  helpText,
  items,
  disabled,
  onChange,
  addPlaceholder,
  showOrder,
}: {
  label: string;
  helpText: string;
  items: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
  addPlaceholder: string;
  showOrder: boolean;
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
    <section className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">
          {label} ({items.length})
        </Label>
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, idx) => (
          <Badge key={`${it}-${idx}`} variant="outline" className="pr-1 text-sm">
            {showOrder && (
              <span className="text-xs text-muted-foreground mr-1">#{idx + 1}</span>
            )}
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
          <p className="text-xs text-muted-foreground italic">No entries.</p>
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
