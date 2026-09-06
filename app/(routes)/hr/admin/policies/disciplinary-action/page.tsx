'use client';

// =====================================================================
// /hr/admin/policies/disciplinary-action — Wave 3 W3-M6b
// =====================================================================
// Backed by `hr.disciplinary_action` (scope=institution; classification=major).
// JSONB shape (spec §30):
//   - employee_classifications: [{ key, description }]
//   - minor_penalties: string[]
//   - major_penalties: string[]
//   - suspension: { triggers[], lower_authority_report_required,
//                   deemed_custody_exceeding_hours,
//                   deemed_conviction_imprisonment_exceeding_hours }
// =====================================================================

import { useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

export const navMeta = {
  label: 'Disciplinary Action',
  icon: 'Gavel',
} as const;

interface EmployeeClassification {
  key: string;
  description: string;
}

interface DisciplinaryActionValue {
  employee_classifications: EmployeeClassification[];
  minor_penalties: string[];
  major_penalties: string[];
  suspension: {
    triggers: string[];
    lower_authority_report_required: boolean;
    deemed_custody_exceeding_hours: number;
    deemed_conviction_imprisonment_exceeding_hours: number;
  };
}

const DEFAULT_VALUE: DisciplinaryActionValue = {
  employee_classifications: [
    { key: 'tenure_based_scaled_contract', description: 'fixed-tenure pay-scale employees' },
    {
      key: 'outsourced',
      description:
        'hired via outsourcing agency/contractor; excludes contractor employees in security/housekeeping',
    },
  ],
  minor_penalties: [
    'withhold_promotion',
    'pecuniary_loss_recovery',
    'reduction_lower_stage_max_3_years_no_cumulative_no_pension_effect',
    'withhold_increment',
  ],
  major_penalties: [
    'reduction_specified_period_with_directions',
    'reduction_lower_timescale_with_directions',
    'removal_no_future_employment_disqualification',
    'dismissal_with_future_employment_disqualification',
  ],
  suspension: {
    triggers: [
      'pending_disciplinary',
      'state_security_prejudicial',
      'criminal_under_investigation',
    ],
    lower_authority_report_required: true,
    deemed_custody_exceeding_hours: 48,
    deemed_conviction_imprisonment_exceeding_hours: 48,
  },
};

function parseValue(raw: unknown): DisciplinaryActionValue {
  const obj = (raw || {}) as Partial<DisciplinaryActionValue>;
  const sus = (obj.suspension || {}) as Partial<DisciplinaryActionValue['suspension']>;
  return {
    employee_classifications: Array.isArray(obj.employee_classifications)
      ? obj.employee_classifications
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            key: typeof c.key === 'string' ? c.key : '',
            description: typeof c.description === 'string' ? c.description : '',
          }))
      : DEFAULT_VALUE.employee_classifications,
    minor_penalties: Array.isArray(obj.minor_penalties)
      ? obj.minor_penalties.map(String)
      : DEFAULT_VALUE.minor_penalties,
    major_penalties: Array.isArray(obj.major_penalties)
      ? obj.major_penalties.map(String)
      : DEFAULT_VALUE.major_penalties,
    suspension: {
      triggers: Array.isArray(sus.triggers)
        ? sus.triggers.map(String)
        : DEFAULT_VALUE.suspension.triggers,
      lower_authority_report_required:
        typeof sus.lower_authority_report_required === 'boolean'
          ? sus.lower_authority_report_required
          : DEFAULT_VALUE.suspension.lower_authority_report_required,
      deemed_custody_exceeding_hours:
        typeof sus.deemed_custody_exceeding_hours === 'number'
          ? sus.deemed_custody_exceeding_hours
          : DEFAULT_VALUE.suspension.deemed_custody_exceeding_hours,
      deemed_conviction_imprisonment_exceeding_hours:
        typeof sus.deemed_conviction_imprisonment_exceeding_hours === 'number'
          ? sus.deemed_conviction_imprisonment_exceeding_hours
          : DEFAULT_VALUE.suspension.deemed_conviction_imprisonment_exceeding_hours,
    },
  };
}

export default function DisciplinaryActionPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Policy — Disciplinary Action">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Disciplinary
            action policy determines termination ladders and is classified as
            a major policy.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Policy — Disciplinary Action">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Disciplinary Action' },
          ]}
        />
        <PolicyEditorShell<DisciplinaryActionValue>
          policyKey="hr.disciplinary_action"
          pageTitle="Disciplinary Action"
          pageBlurb="Two-tier penalty ladder for staff misconduct: minor penalties (withhold promotion/increment, pecuniary recovery, 3-year reduction) and major penalties (timed reduction, lower-timescale reduction, removal, dismissal). Suspension auto-fires when custody / imprisonment exceeds the configured threshold."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <DisciplinaryEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function DisciplinaryEditor({
  value,
  onChange,
  disabled,
}: {
  value: DisciplinaryActionValue;
  onChange: (next: DisciplinaryActionValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      <ClassificationsSection
        value={value.employee_classifications}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, employee_classifications: next })}
      />

      <PenaltyList
        title="Minor penalties"
        help="Lower-severity penalties for misconduct. Each entry is a snake_case label engine consumers match against."
        items={value.minor_penalties}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, minor_penalties: next })}
      />

      <PenaltyList
        title="Major penalties"
        help="High-severity penalties including removal and dismissal. Reorder by severity if needed."
        items={value.major_penalties}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, major_penalties: next })}
      />

      <SuspensionSection
        value={value.suspension}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, suspension: next })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee classifications
// ---------------------------------------------------------------------------

function ClassificationsSection({
  value,
  disabled,
  onChange,
}: {
  value: EmployeeClassification[];
  disabled: boolean;
  onChange: (next: EmployeeClassification[]) => void;
}) {
  const [draftKey, setDraftKey] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  function add() {
    const k = draftKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k) return;
    if (value.some((c) => c.key === k)) return;
    onChange([...value, { key: k, description: draftDesc.trim() }]);
    setDraftKey('');
    setDraftDesc('');
  }

  function remove(key: string) {
    onChange(value.filter((c) => c.key !== key));
  }

  function update(idx: number, patch: Partial<EmployeeClassification>) {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  return (
    <section className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">
          Employee classifications ({value.length})
        </Label>
        <p className="text-xs text-muted-foreground">
          Which employee types this disciplinary policy applies to. Edit the
          description to explain who falls in each category.
        </p>
      </div>
      <div className="space-y-2">
        {value.map((c, idx) => (
          <div
            key={c.key}
            className="flex flex-wrap items-start gap-2 rounded border p-3"
          >
            <div className="min-w-[180px]">
              <Label className="text-xs">Key</Label>
              <Input
                value={c.key}
                onChange={(e) =>
                  update(idx, {
                    key: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                  })
                }
                disabled={disabled}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[280px]">
              <Label className="text-xs">Description</Label>
              <Input
                value={c.description}
                onChange={(e) => update(idx, { description: e.target.value })}
                disabled={disabled}
              />
            </div>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(c.key)}
                aria-label={`Remove ${c.key}`}
                className="mt-5"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {value.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            No classifications defined.
          </p>
        )}
      </div>
      {!disabled && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="min-w-[180px]">
            <Label className="text-xs">New key</Label>
            <Input
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="e.g. permanent"
              className="font-mono"
            />
          </div>
          <div className="flex-1 min-w-0 sm:min-w-[260px]">
            <Label className="text-xs">Description</Label>
            <Input
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="Plain-English description"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={!draftKey.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add classification
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Penalty list (reusable for minor + major)
// ---------------------------------------------------------------------------

function PenaltyList({
  title,
  help,
  items,
  disabled,
  onChange,
}: {
  title: string;
  help: string;
  items: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  }
  function remove(item: string) {
    onChange(items.filter((x) => x !== item));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <section className="space-y-3 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">
          {title} ({items.length})
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="space-y-1">
        {items.map((it, idx) => (
          <div
            key={it}
            className="flex items-center gap-2 rounded border px-2 py-1.5"
          >
            <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
            <span className="flex-1 font-mono text-sm">{it}</span>
            {!disabled && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="h-7 w-7 p-0"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move down"
                  className="h-7 w-7 p-0"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(it)}
                  aria-label={`Remove ${it}`}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs italic text-muted-foreground">No penalties defined.</p>
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="add penalty (snake_case)"
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

// ---------------------------------------------------------------------------
// Suspension config
// ---------------------------------------------------------------------------

function SuspensionSection({
  value,
  disabled,
  onChange,
}: {
  value: DisciplinaryActionValue['suspension'];
  disabled: boolean;
  onChange: (next: DisciplinaryActionValue['suspension']) => void;
}) {
  const [draftTrigger, setDraftTrigger] = useState('');

  function addTrigger() {
    const v = draftTrigger.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || value.triggers.includes(v)) {
      setDraftTrigger('');
      return;
    }
    onChange({ ...value, triggers: [...value.triggers, v] });
    setDraftTrigger('');
  }
  function removeTrigger(t: string) {
    onChange({ ...value, triggers: value.triggers.filter((x) => x !== t) });
  }

  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">Suspension</Label>
        <p className="text-xs text-muted-foreground">
          When suspension fires and what it requires. Deemed-suspension auto-applies if
          custody/imprisonment exceeds the configured hours.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Triggers ({value.triggers.length})</Label>
        <div className="flex flex-wrap gap-2">
          {value.triggers.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono"
            >
              {t}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTrigger(t)}
                  className="rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {value.triggers.length === 0 && (
            <p className="text-xs italic text-muted-foreground">No triggers configured.</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={draftTrigger}
              onChange={(e) => setDraftTrigger(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTrigger();
                }
              }}
              placeholder="add trigger (snake_case)"
              className="max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTrigger}
              disabled={!draftTrigger.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Switch
          checked={value.lower_authority_report_required}
          onCheckedChange={(checked) =>
            onChange({ ...value, lower_authority_report_required: checked })
          }
          disabled={disabled}
        />
        <div>
          <Label className="text-sm">Lower-authority report required</Label>
          <p className="text-xs text-muted-foreground">
            When on, a report from the immediate-supervisor authority is required before
            suspension can be confirmed by the disciplinary authority.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Deemed suspension if custody exceeds (hours)</Label>
          <Input
            type="number"
            value={value.deemed_custody_exceeding_hours}
            onChange={(e) =>
              onChange({
                ...value,
                deemed_custody_exceeding_hours: Number(e.target.value) || 0,
              })
            }
            disabled={disabled}
            min={0}
            max={720}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            Deemed suspension if conviction-imprisonment exceeds (hours)
          </Label>
          <Input
            type="number"
            value={value.deemed_conviction_imprisonment_exceeding_hours}
            onChange={(e) =>
              onChange({
                ...value,
                deemed_conviction_imprisonment_exceeding_hours: Number(e.target.value) || 0,
              })
            }
            disabled={disabled}
            min={0}
            max={720}
          />
        </div>
      </div>
    </section>
  );
}
