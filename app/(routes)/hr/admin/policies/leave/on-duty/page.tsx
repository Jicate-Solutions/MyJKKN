'use client';

// =====================================================================
// /hr/admin/policies/leave/on-duty — Wave 3 W3-M5b
// =====================================================================
// Backed by `hr.leave.on_duty` (scope=institution).
// JSONB shape (spec §23 + audit-gap 2026-05-15 lock):
//   {
//     categories: Array<{ key, max_per_year?, cap?, applies }>,
//     approval_chain: string[],
//     fdp_outcome_demonstration_window_days: number,
//     rejection_on_no_outcome: boolean,
//     form_required: boolean
//   }
//
// Per-institution audit lock:
//   - Engineering: higher_study_research { applies: true, max_per_year: 6 }
//   - Dental:      higher_study_research { applies: false }
// =====================================================================

import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

import { PolicyEditorShell } from '../../_shared/policy-editor-shell';

interface OnDutyCategory {
  key: string;
  max_per_year?: number;
  cap?: string; // 'uncapped' or absent
  applies: boolean;
}

interface OnDutyValue {
  categories: OnDutyCategory[];
  approval_chain: string[];
  fdp_outcome_demonstration_window_days: number;
  rejection_on_no_outcome: boolean;
  form_required: boolean;
}

const DEFAULT_VALUE: OnDutyValue = {
  categories: [
    { key: 'conferences_seminars_workshops', max_per_year: 6, applies: true },
    { key: 'exam_supervision', cap: 'uncapped', applies: true },
    { key: 'other_institution_work', max_per_year: 6, applies: true },
    { key: 'higher_study_research', max_per_year: 6, applies: true },
  ],
  approval_chain: ['HoD', 'Principal'],
  fdp_outcome_demonstration_window_days: 15,
  rejection_on_no_outcome: true,
  form_required: true,
};

function parseValue(raw: unknown): OnDutyValue {
  const obj = (raw || {}) as Partial<OnDutyValue>;
  return {
    categories: Array.isArray(obj.categories)
      ? (obj.categories as OnDutyCategory[]).map((c) => ({
          key: String(c.key || ''),
          max_per_year:
            typeof c.max_per_year === 'number' ? c.max_per_year : undefined,
          cap: typeof c.cap === 'string' ? c.cap : undefined,
          applies: c.applies !== false,
        }))
      : DEFAULT_VALUE.categories,
    approval_chain: Array.isArray(obj.approval_chain)
      ? obj.approval_chain.map(String)
      : DEFAULT_VALUE.approval_chain,
    fdp_outcome_demonstration_window_days:
      typeof obj.fdp_outcome_demonstration_window_days === 'number'
        ? obj.fdp_outcome_demonstration_window_days
        : DEFAULT_VALUE.fdp_outcome_demonstration_window_days,
    rejection_on_no_outcome: obj.rejection_on_no_outcome !== false,
    form_required: obj.form_required !== false,
  };
}

export default function OnDutyLeavePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — On-Duty (OD) Leave">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Leave' },
            { label: 'On-Duty' },
          ]}
        />
        <PolicyEditorShell<OnDutyValue>
          policyKey="hr.leave.on_duty"
          pageTitle="On-Duty (OD) Leave"
          pageBlurb="OD leave categories, per-year caps, approval chain, and the FDP-outcome demonstration window. The higher-study-research category is per-institution: applies in Engineering, not in Dental."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <OnDutyEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function OnDutyEditor({
  value,
  onChange,
  disabled,
}: {
  value: OnDutyValue;
  onChange: (next: OnDutyValue) => void;
  disabled: boolean;
}) {
  const [newCat, setNewCat] = useState('');
  const [newApprover, setNewApprover] = useState('');

  function updateCategory(key: string, patch: Partial<OnDutyCategory>) {
    onChange({
      ...value,
      categories: value.categories.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    });
  }

  function addCategory() {
    const k = newCat.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k || value.categories.some((c) => c.key === k)) {
      setNewCat('');
      return;
    }
    onChange({
      ...value,
      categories: [...value.categories, { key: k, max_per_year: 0, applies: true }],
    });
    setNewCat('');
  }

  function removeCategory(key: string) {
    onChange({
      ...value,
      categories: value.categories.filter((c) => c.key !== key),
    });
  }

  function addApprover() {
    const a = newApprover.trim();
    if (!a || value.approval_chain.includes(a)) {
      setNewApprover('');
      return;
    }
    onChange({ ...value, approval_chain: [...value.approval_chain, a] });
    setNewApprover('');
  }

  function removeApprover(a: string) {
    onChange({
      ...value,
      approval_chain: value.approval_chain.filter((x) => x !== a),
    });
  }

  return (
    <div className="space-y-8">
      {/* Categories */}
      <section className="space-y-4">
        <div>
          <Label className="text-sm font-semibold">
            OD leave categories ({value.categories.length})
          </Label>
          <p className="text-xs text-muted-foreground">
            Each category has a per-year cap and a per-institution applicability
            toggle. Uncapped categories use the "uncapped" cap flag.
          </p>
        </div>
        <div className="space-y-3">
          {value.categories.map((cat) => (
            <div
              key={cat.key}
              className="rounded-md border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm">{cat.key}</div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCategory(cat.key)}
                    aria-label={`Remove ${cat.key}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Cap style</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Switch
                      checked={cat.cap === 'uncapped'}
                      onCheckedChange={(c) =>
                        updateCategory(cat.key, {
                          cap: c ? 'uncapped' : undefined,
                          max_per_year: c ? undefined : 6,
                        })
                      }
                      disabled={disabled}
                      aria-label="Toggle uncapped"
                    />
                    <span className="text-xs">
                      {cat.cap === 'uncapped' ? 'Uncapped' : 'Capped per year'}
                    </span>
                  </div>
                </div>
                {cat.cap !== 'uncapped' && (
                  <div>
                    <Label className="text-xs">Max days / year</Label>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={cat.max_per_year ?? 0}
                      onChange={(e) =>
                        updateCategory(cat.key, {
                          max_per_year: Number(e.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                      className="mt-1 tabular-nums"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Applies to this institution</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Switch
                      checked={cat.applies}
                      onCheckedChange={(c) =>
                        updateCategory(cat.key, { applies: c })
                      }
                      disabled={disabled}
                      aria-label={`Toggle ${cat.key} applies`}
                    />
                    <span className="text-xs">
                      {cat.applies ? 'Applies' : 'Not applicable'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder="Add category (e.g. internship_assignment)"
              className="max-w-md"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addCategory}
              disabled={!newCat.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add category
            </Button>
          </div>
        )}
      </section>

      {/* Approval chain */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">
            Approval chain ({value.approval_chain.length})
          </Label>
          <p className="text-xs text-muted-foreground">
            Ordered list of approvers an OD request must clear before being granted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value.approval_chain.map((a, i) => (
            <Badge key={a} variant="secondary" className="pr-1 text-sm">
              <span>
                {i + 1}. {a}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeApprover(a)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${a}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {value.approval_chain.length === 0 && (
            <p className="text-xs italic text-muted-foreground">
              No approvers configured.
            </p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Input
              value={newApprover}
              onChange={(e) => setNewApprover(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addApprover();
                }
              }}
              placeholder="Add approver role (e.g. Dean)"
              className="max-w-md"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addApprover}
              disabled={!newApprover.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add approver
            </Button>
          </div>
        )}
      </section>

      {/* FDP outcome rules */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">FDP outcome enforcement</Label>
          <p className="text-xs text-muted-foreground">
            Faculty Development Programme deliverable rules — when faculty go
            on OD, they must demonstrate the outcome within a fixed window.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Outcome demonstration window (days)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={value.fdp_outcome_demonstration_window_days}
              onChange={(e) =>
                onChange({
                  ...value,
                  fdp_outcome_demonstration_window_days:
                    Number(e.target.value) || 0,
                })
              }
              disabled={disabled}
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Days from return-from-OD to demonstrate outcome.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Reject if no outcome</div>
              <p className="text-xs text-muted-foreground">
                When ON, future OD requests are auto-rejected if the previous
                OD has no outcome on file past the window.
              </p>
            </div>
            <Switch
              checked={value.rejection_on_no_outcome}
              onCheckedChange={(c) =>
                onChange({ ...value, rejection_on_no_outcome: c })
              }
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 md:col-span-2">
            <div>
              <div className="text-sm font-medium">OD form required</div>
              <p className="text-xs text-muted-foreground">
                When ON, the OD application form is mandatory before approval.
              </p>
            </div>
            <Switch
              checked={value.form_required}
              onCheckedChange={(c) =>
                onChange({ ...value, form_required: c })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
