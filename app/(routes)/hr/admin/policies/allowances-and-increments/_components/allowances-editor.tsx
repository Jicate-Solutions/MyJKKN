'use client';

// Allowances & Increments Editor — Director's-view UI for the
// hr.allowances_and_increments policy. Allowance amounts + increment governance
// rendered as friendly inputs / toggles. Never shows raw JSONB.

import { useEffect, useState } from 'react';
import { ShieldAlert, Info, Save, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  COMPENSATION_INSTITUTIONS,
  HR_COMPENSATION_KEYS,
  useCompensationPolicy,
  useUpdateCompensationPolicy,
  type AllowancesAndIncrementsValue,
  type CompensationInstitutionId,
} from '@/hooks/admin/use-hr-compensation-policies';

const EMPTY_VALUE: AllowancesAndIncrementsValue = {
  allowances: { hod: null, other_per_designation: {} },
  allowance_aicte_university_government_aligned: true,
  allowance_governing_body_decision_authority: true,
  increments: {
    annual_window_months: 12,
    approver_default: 'Principal',
    approver_for_principal: ['Chairman', 'Secretary'],
    satisfactory_performance_required: true,
    head_of_dept_recommendation_required: true,
    withholding_triggers: ['poor_conduct', 'unsatisfactory_work'],
  },
  yearly_increment_factors: [],
  discretion: 'management',
};

function inrFormat(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('en-IN');
}

export function AllowancesEditor() {
  const [institutionId, setInstitutionId] =
    useState<CompensationInstitutionId>(COMPENSATION_INSTITUTIONS[0].id);

  const policyQ = useCompensationPolicy<AllowancesAndIncrementsValue>(
    HR_COMPENSATION_KEYS.ALLOWANCES_AND_INCREMENTS,
    institutionId
  );
  const updateM = useUpdateCompensationPolicy<AllowancesAndIncrementsValue>(
    HR_COMPENSATION_KEYS.ALLOWANCES_AND_INCREMENTS,
    institutionId
  );

  const [draft, setDraft] = useState<AllowancesAndIncrementsValue>(EMPTY_VALUE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!policyQ.data) return;
    setDraft(policyQ.data.value ?? EMPTY_VALUE);
    setDirty(false);
  }, [policyQ.data, institutionId]);

  const handleAllowanceChange = (designation: string, value: number) => {
    setDraft((prev) => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        other_per_designation: {
          ...prev.allowances.other_per_designation,
          [designation]: value,
        },
      },
    }));
    setDirty(true);
  };

  const handleAllowanceAdd = () => {
    setDraft((prev) => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        other_per_designation: {
          ...prev.allowances.other_per_designation,
          '': 0,
        },
      },
    }));
    setDirty(true);
  };

  const handleAllowanceRemove = (designation: string) => {
    setDraft((prev) => {
      const next = { ...prev.allowances.other_per_designation };
      delete next[designation];
      return {
        ...prev,
        allowances: { ...prev.allowances, other_per_designation: next },
      };
    });
    setDirty(true);
  };

  const handleAllowanceRename = (oldKey: string, newKey: string) => {
    setDraft((prev) => {
      const entries = Object.entries(prev.allowances.other_per_designation);
      const renamed = entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v])) as [string, number][];
      return {
        ...prev,
        allowances: {
          ...prev.allowances,
          other_per_designation: Object.fromEntries(renamed),
        },
      };
    });
    setDirty(true);
  };

  const handleSave = () => {
    updateM.mutate(draft, { onSuccess: () => setDirty(false) });
  };

  const isLoading = policyQ.isLoading;
  const hasError = policyQ.isError;
  const seedMissing = policyQ.data?.exists === false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Failed to load allowances policy</AlertTitle>
        <AlertDescription>
          {policyQ.error?.message || 'Unknown error.'}
        </AlertDescription>
      </Alert>
    );
  }

  const otherDesignations = Object.entries(
    draft.allowances.other_per_designation || {}
  );

  return (
    <div className="space-y-6">
      {/* Institution selector */}
      <section className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="institution-select" className="text-sm">
            Institution
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Allowances and increments are stored per institution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={institutionId}
            onValueChange={(v) =>
              setInstitutionId(v as CompensationInstitutionId)
            }
          >
            <SelectTrigger id="institution-select" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPENSATION_INSTITUTIONS.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || updateM.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateM.isPending ? 'Saving…' : 'Save policy'}
          </Button>
        </div>
      </section>

      {seedMissing && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No row seeded yet for this institution</AlertTitle>
          <AlertDescription>
            The hr.allowances_and_increments row for this institution has not
            been seeded. Apply
            migrations/20260605_hr_compensation_seeds.sql, then return.
          </AlertDescription>
        </Alert>
      )}

      {/* Allowances */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Allowances (INR / month)</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Monthly allowance paid on top of the basic pay matrix.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="hod-allowance" className="text-sm">
              HOD allowance
            </Label>
            <Input
              id="hod-allowance"
              type="number"
              min={0}
              step={100}
              value={draft.allowances.hod ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                setDraft((prev) => ({
                  ...prev,
                  allowances: { ...prev.allowances, hod: v },
                }));
                setDirty(true);
              }}
              placeholder="Leave blank if not specified"
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Current: ₹{inrFormat(draft.allowances.hod)} / month
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                AICTE / University / Govt aligned
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, allowance scales follow the published AICTE / UGC /
                state-govt norms.
              </p>
            </div>
            <Switch
              checked={draft.allowance_aicte_university_government_aligned}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  allowance_aicte_university_government_aligned: c,
                }));
                setDirty(true);
              }}
              aria-label="Toggle AICTE alignment"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3 md:col-span-2">
            <div>
              <div className="text-sm font-medium">
                Governing body decision authority
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, the governing body has the final say on any allowance
                exception above the matrix.
              </p>
            </div>
            <Switch
              checked={draft.allowance_governing_body_decision_authority}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  allowance_governing_body_decision_authority: c,
                }));
                setDirty(true);
              }}
              aria-label="Toggle governing body authority"
            />
          </div>
        </div>

        {/* Other allowances */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                Other allowances by designation
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optional. Add a row per designation that gets a standing
                allowance.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAllowanceAdd}
              disabled={updateM.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add allowance
            </Button>
          </div>

          {otherDesignations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No designation-specific allowances configured.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Designation</th>
                    <th className="px-4 py-2 font-medium w-40 text-right">
                      Allowance (₹/mo)
                    </th>
                    <th className="px-4 py-2 font-medium w-16" />
                  </tr>
                </thead>
                <tbody>
                  {otherDesignations.map(([designation, amount]) => (
                    <tr
                      key={designation || '__new'}
                      className="border-t border-border"
                    >
                      <td className="px-4 py-2">
                        <Input
                          value={designation}
                          onChange={(e) =>
                            handleAllowanceRename(designation, e.target.value)
                          }
                          placeholder="e.g. Vice Principal"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={amount ?? 0}
                          onChange={(e) =>
                            handleAllowanceChange(
                              designation,
                              Number(e.target.value) || 0
                            )
                          }
                          className="text-right tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAllowanceRemove(designation)}
                          disabled={updateM.isPending}
                          aria-label={`Remove ${designation || 'row'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Increments */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Increments — annual cycle</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Governance for the yearly increment review.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="annual-window" className="text-sm">
              Annual window (months)
            </Label>
            <Input
              id="annual-window"
              type="number"
              min={1}
              max={24}
              step={1}
              value={draft.increments.annual_window_months ?? 12}
              onChange={(e) => {
                setDraft((prev) => ({
                  ...prev,
                  increments: {
                    ...prev.increments,
                    annual_window_months: Number(e.target.value) || 12,
                  },
                }));
                setDirty(true);
              }}
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              How many months between increment cycles. Standard: 12.
            </p>
          </div>

          <div>
            <Label htmlFor="approver-default" className="text-sm">
              Default approver
            </Label>
            <Input
              id="approver-default"
              value={draft.increments.approver_default ?? ''}
              onChange={(e) => {
                setDraft((prev) => ({
                  ...prev,
                  increments: {
                    ...prev.increments,
                    approver_default: e.target.value,
                  },
                }));
                setDirty(true);
              }}
              placeholder="e.g. Principal"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The role that approves increments for all staff except the
              Principal themself.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                Satisfactory performance required
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, an increment requires a documented performance review.
              </p>
            </div>
            <Switch
              checked={draft.increments.satisfactory_performance_required}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  increments: {
                    ...prev.increments,
                    satisfactory_performance_required: c,
                  },
                }));
                setDirty(true);
              }}
              aria-label="Toggle satisfactory performance"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                HOD recommendation required
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, the Head of Department must recommend the increment
                before the approver signs off.
              </p>
            </div>
            <Switch
              checked={draft.increments.head_of_dept_recommendation_required}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  increments: {
                    ...prev.increments,
                    head_of_dept_recommendation_required: c,
                  },
                }));
                setDirty(true);
              }}
              aria-label="Toggle HOD recommendation"
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/40 p-3 space-y-2">
          <div className="text-sm font-medium">
            Approvers for the Principal&apos;s own increment
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.increments.approver_for_principal.map((r) => (
              <span
                key={r}
                className="rounded bg-background px-2 py-0.5 text-xs border border-border"
              >
                {r}
              </span>
            ))}
            {draft.increments.approver_for_principal.length === 0 && (
              <span className="text-xs text-muted-foreground">
                (none configured)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Roles that approve the Principal&apos;s increment (the Principal
            can&apos;t self-approve). Edit via direct JSONB once W3-M0 substrate
            ships the draft / publish flow.
          </p>
        </div>

        <div className="rounded-md bg-muted/40 p-3 space-y-2">
          <div className="text-sm font-medium">Withholding triggers</div>
          <div className="flex flex-wrap gap-2">
            {draft.increments.withholding_triggers.map((t) => (
              <span
                key={t}
                className="rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs border border-amber-200 dark:border-amber-900"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Conditions under which the approver may withhold an increment.
          </p>
        </div>

        <div className="rounded-md bg-muted/40 p-3 space-y-2">
          <div className="text-sm font-medium">Yearly increment factors</div>
          <div className="flex flex-wrap gap-2">
            {draft.yearly_increment_factors.map((f) => (
              <span
                key={f}
                className="rounded bg-background px-2 py-0.5 text-xs border border-border"
              >
                {f}
              </span>
            ))}
            {draft.yearly_increment_factors.length === 0 && (
              <span className="text-xs text-muted-foreground">
                (none configured)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Performance dimensions considered during the annual review.
          </p>
        </div>

        {policyQ.data?.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(policyQ.data.updatedAt).toLocaleString()}
          </p>
        )}
      </section>
    </div>
  );
}
