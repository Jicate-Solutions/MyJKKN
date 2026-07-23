'use client';

// =====================================================================
// /hr/admin/policies/staff-development — Wave 3 W3-M6a
// =====================================================================
// Backed by `hr.staff_development` (scope=institution, per Director lock).
// Seeded by migrations/20260608_hr_governance_part1_seeds.sql.
// JSONB shape (per specs/hr-policy-jsonb-structures-2026-05-15.md §14):
//   {
//     sedc: { member_count, chairperson_role_code, evaluation_scope },
//     annual_incentives: {
//       annual_amount_authority, director_special_amount_authority[],
//       tenure_extension_based_on_perf, monthly_honorarium_authority,
//       monthly_honorarium_basis
//     },
//     training_categories: {
//       induction: { coverage, target },
//       internal: { scope },
//       specialised: { external_faculty, request_routed_to, feedback_required, records_owner }
//     }
//   }
// =====================================================================

import { Info, Plus, X } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

// ---------------------------------------------------------------------------
// Types + parse
// ---------------------------------------------------------------------------

interface StaffDevValue {
  sedc: {
    member_count: number;
    chairperson_role_code: string | null;
    evaluation_scope: string;
  };
  annual_incentives: {
    annual_amount_authority: string;
    director_special_amount_authority: string[];
    tenure_extension_based_on_perf: boolean;
    monthly_honorarium_authority: string;
    monthly_honorarium_basis: string;
  };
  training_categories: {
    induction: { coverage: string; target: string };
    internal: { scope: string };
    specialised: {
      external_faculty: boolean;
      request_routed_to: string;
      feedback_required: boolean;
      records_owner: string;
    };
  };
}

const DEFAULT_VALUE: StaffDevValue = {
  sedc: { member_count: 7, chairperson_role_code: null, evaluation_scope: 'below_manager_level' },
  annual_incentives: {
    annual_amount_authority: 'SEDC',
    director_special_amount_authority: ['SEDC', 'Director'],
    tenure_extension_based_on_perf: true,
    monthly_honorarium_authority: 'SEDC',
    monthly_honorarium_basis: 'additional_responsibilities',
  },
  training_categories: {
    induction: { coverage: 'all_departments', target: 'newly_recruited_employee' },
    internal: { scope: 'current_job_and_related' },
    specialised: {
      external_faculty: true,
      request_routed_to: 'CAO',
      feedback_required: true,
      records_owner: 'HR',
    },
  },
};

function parseValue(raw: unknown): StaffDevValue {
  const obj = (raw || {}) as Partial<StaffDevValue>;
  return {
    sedc: {
      member_count: Number(obj.sedc?.member_count ?? DEFAULT_VALUE.sedc.member_count),
      chairperson_role_code:
        obj.sedc?.chairperson_role_code != null
          ? String(obj.sedc.chairperson_role_code)
          : null,
      evaluation_scope: String(
        obj.sedc?.evaluation_scope ?? DEFAULT_VALUE.sedc.evaluation_scope,
      ),
    },
    annual_incentives: {
      annual_amount_authority: String(
        obj.annual_incentives?.annual_amount_authority ??
          DEFAULT_VALUE.annual_incentives.annual_amount_authority,
      ),
      director_special_amount_authority: Array.isArray(
        obj.annual_incentives?.director_special_amount_authority,
      )
        ? obj.annual_incentives!.director_special_amount_authority.map(String)
        : [...DEFAULT_VALUE.annual_incentives.director_special_amount_authority],
      tenure_extension_based_on_perf: Boolean(
        obj.annual_incentives?.tenure_extension_based_on_perf ??
          DEFAULT_VALUE.annual_incentives.tenure_extension_based_on_perf,
      ),
      monthly_honorarium_authority: String(
        obj.annual_incentives?.monthly_honorarium_authority ??
          DEFAULT_VALUE.annual_incentives.monthly_honorarium_authority,
      ),
      monthly_honorarium_basis: String(
        obj.annual_incentives?.monthly_honorarium_basis ??
          DEFAULT_VALUE.annual_incentives.monthly_honorarium_basis,
      ),
    },
    training_categories: {
      induction: {
        coverage: String(
          obj.training_categories?.induction?.coverage ??
            DEFAULT_VALUE.training_categories.induction.coverage,
        ),
        target: String(
          obj.training_categories?.induction?.target ??
            DEFAULT_VALUE.training_categories.induction.target,
        ),
      },
      internal: {
        scope: String(
          obj.training_categories?.internal?.scope ??
            DEFAULT_VALUE.training_categories.internal.scope,
        ),
      },
      specialised: {
        external_faculty: Boolean(
          obj.training_categories?.specialised?.external_faculty ??
            DEFAULT_VALUE.training_categories.specialised.external_faculty,
        ),
        request_routed_to: String(
          obj.training_categories?.specialised?.request_routed_to ??
            DEFAULT_VALUE.training_categories.specialised.request_routed_to,
        ),
        feedback_required: Boolean(
          obj.training_categories?.specialised?.feedback_required ??
            DEFAULT_VALUE.training_categories.specialised.feedback_required,
        ),
        records_owner: String(
          obj.training_categories?.specialised?.records_owner ??
            DEFAULT_VALUE.training_categories.specialised.records_owner,
        ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StaffDevelopmentPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Staff Development">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Staff Development' },
          ]}
        />
        <PolicyEditorShell<StaffDevValue>
          policyKey="hr.staff_development"
          pageTitle="Staff Development"
          pageBlurb="SEDC (Staff Evaluation & Development Committee) configuration, annual incentive authority, and the three training categories — induction, internal, specialised."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <StaffDevEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — three sections (SEDC, annual incentives, training categories)
// ---------------------------------------------------------------------------

function StaffDevEditor({
  value,
  onChange,
  disabled,
}: {
  value: StaffDevValue;
  onChange: (next: StaffDevValue) => void;
  disabled: boolean;
}) {
  const [authDraft, setAuthDraft] = useState('');

  function addAuthority() {
    const v = authDraft.trim();
    if (!v) return;
    if (value.annual_incentives.director_special_amount_authority.includes(v)) {
      setAuthDraft('');
      return;
    }
    onChange({
      ...value,
      annual_incentives: {
        ...value.annual_incentives,
        director_special_amount_authority: [
          ...value.annual_incentives.director_special_amount_authority,
          v,
        ],
      },
    });
    setAuthDraft('');
  }

  function removeAuthority(item: string) {
    onChange({
      ...value,
      annual_incentives: {
        ...value.annual_incentives,
        director_special_amount_authority:
          value.annual_incentives.director_special_amount_authority.filter((x) => x !== item),
      },
    });
  }

  return (
    <div className="space-y-8">
      {/* SEDC */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">SEDC committee</Label>
          <p className="text-xs text-muted-foreground">
            Staff Evaluation & Development Committee. Decides annual incentives and reviews
            below-manager-level staff.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="sedc-members" className="text-xs">
              Member count
            </Label>
            <Input
              id="sedc-members"
              type="number"
              min={1}
              max={50}
              value={value.sedc.member_count}
              onChange={(e) =>
                onChange({
                  ...value,
                  sedc: { ...value.sedc, member_count: Number(e.target.value) || 0 },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="sedc-chair" className="text-xs">
              Chairperson role code
            </Label>
            <Input
              id="sedc-chair"
              value={value.sedc.chairperson_role_code ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  sedc: {
                    ...value.sedc,
                    chairperson_role_code: e.target.value === '' ? null : e.target.value,
                  },
                })
              }
              placeholder="(unset)"
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="sedc-scope" className="text-xs">
              Evaluation scope
            </Label>
            <Input
              id="sedc-scope"
              value={value.sedc.evaluation_scope}
              onChange={(e) =>
                onChange({
                  ...value,
                  sedc: { ...value.sedc, evaluation_scope: e.target.value },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>
      </section>

      {/* Annual incentives */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Annual incentives</Label>
          <p className="text-xs text-muted-foreground">
            Who can sanction annual amounts, special director amounts, and monthly honoraria.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ann-auth" className="text-xs">
              Annual amount authority
            </Label>
            <Input
              id="ann-auth"
              value={value.annual_incentives.annual_amount_authority}
              onChange={(e) =>
                onChange({
                  ...value,
                  annual_incentives: {
                    ...value.annual_incentives,
                    annual_amount_authority: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="mon-hon-auth" className="text-xs">
              Monthly honorarium authority
            </Label>
            <Input
              id="mon-hon-auth"
              value={value.annual_incentives.monthly_honorarium_authority}
              onChange={(e) =>
                onChange({
                  ...value,
                  annual_incentives: {
                    ...value.annual_incentives,
                    monthly_honorarium_authority: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="mon-hon-basis" className="text-xs">
              Monthly honorarium basis
            </Label>
            <Input
              id="mon-hon-basis"
              value={value.annual_incentives.monthly_honorarium_basis}
              onChange={(e) =>
                onChange({
                  ...value,
                  annual_incentives: {
                    ...value.annual_incentives,
                    monthly_honorarium_basis: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3 mt-2">
          <div>
            <div className="text-sm font-medium">Tenure extension based on performance</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              When ON, staff whose performance review is satisfactory automatically qualify for
              tenure extension.
            </p>
          </div>
          <Switch
            checked={value.annual_incentives.tenure_extension_based_on_perf}
            onCheckedChange={(c) =>
              onChange({
                ...value,
                annual_incentives: {
                  ...value.annual_incentives,
                  tenure_extension_based_on_perf: c,
                },
              })
            }
            disabled={disabled}
            aria-label="Toggle tenure extension based on performance"
          />
        </div>

        <div className="space-y-2 mt-2">
          <Label className="text-xs">Director-special amount authorities</Label>
          <p className="text-xs text-muted-foreground">
            Roles required to co-approve when the Director sanctions a special amount.
          </p>
          <div className="flex flex-wrap gap-2">
            {value.annual_incentives.director_special_amount_authority.map((a) => (
              <Badge key={a} variant="outline" className="pr-1 text-sm">
                <span className="font-mono">{a}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAuthority(a)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                    aria-label={`Remove ${a}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
            {value.annual_incentives.director_special_amount_authority.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No authorities listed.</p>
            )}
          </div>
          {!disabled && (
            <div className="flex items-center gap-2 pt-2">
              <Input
                value={authDraft}
                onChange={(e) => setAuthDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAuthority();
                  }
                }}
                placeholder="e.g. SEDC, Director, Chairman"
                className="max-w-md"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAuthority}
                disabled={!authDraft.trim()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Training categories */}
      <section className="space-y-4 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Training categories</Label>
          <p className="text-xs text-muted-foreground">
            Three buckets — induction (new recruits), internal (current job), specialised
            (external faculty).
          </p>
        </div>

        {/* Induction */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <Label className="text-xs font-semibold">Induction</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ind-cov" className="text-xs">
                Coverage
              </Label>
              <Input
                id="ind-cov"
                value={value.training_categories.induction.coverage}
                onChange={(e) =>
                  onChange({
                    ...value,
                    training_categories: {
                      ...value.training_categories,
                      induction: {
                        ...value.training_categories.induction,
                        coverage: e.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ind-tgt" className="text-xs">
                Target
              </Label>
              <Input
                id="ind-tgt"
                value={value.training_categories.induction.target}
                onChange={(e) =>
                  onChange({
                    ...value,
                    training_categories: {
                      ...value.training_categories,
                      induction: {
                        ...value.training_categories.induction,
                        target: e.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Internal */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <Label className="text-xs font-semibold">Internal</Label>
          <div>
            <Label htmlFor="int-scope" className="text-xs">
              Scope
            </Label>
            <Input
              id="int-scope"
              value={value.training_categories.internal.scope}
              onChange={(e) =>
                onChange({
                  ...value,
                  training_categories: {
                    ...value.training_categories,
                    internal: { scope: e.target.value },
                  },
                })
              }
              disabled={disabled}
              className="mt-1 max-w-md"
            />
          </div>
        </div>

        {/* Specialised */}
        <div className="rounded-md border border-border p-3 space-y-3">
          <Label className="text-xs font-semibold">Specialised</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="spc-route" className="text-xs">
                Request routed to
              </Label>
              <Input
                id="spc-route"
                value={value.training_categories.specialised.request_routed_to}
                onChange={(e) =>
                  onChange({
                    ...value,
                    training_categories: {
                      ...value.training_categories,
                      specialised: {
                        ...value.training_categories.specialised,
                        request_routed_to: e.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="spc-records" className="text-xs">
                Records owner
              </Label>
              <Input
                id="spc-records"
                value={value.training_categories.specialised.records_owner}
                onChange={(e) =>
                  onChange({
                    ...value,
                    training_categories: {
                      ...value.training_categories,
                      specialised: {
                        ...value.training_categories.specialised,
                        records_owner: e.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded bg-muted/40 p-2">
            <div className="text-xs">
              External faculty allowed
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, specialised training can be delivered by external faculty.
              </p>
            </div>
            <Switch
              checked={value.training_categories.specialised.external_faculty}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  training_categories: {
                    ...value.training_categories,
                    specialised: {
                      ...value.training_categories.specialised,
                      external_faculty: c,
                    },
                  },
                })
              }
              disabled={disabled}
              aria-label="Toggle external faculty allowed"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded bg-muted/40 p-2">
            <div className="text-xs">
              Feedback required
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, every specialised training must collect participant feedback.
              </p>
            </div>
            <Switch
              checked={value.training_categories.specialised.feedback_required}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  training_categories: {
                    ...value.training_categories,
                    specialised: {
                      ...value.training_categories.specialised,
                      feedback_required: c,
                    },
                  },
                })
              }
              disabled={disabled}
              aria-label="Toggle specialised training feedback required"
            />
          </div>
        </div>
      </section>

      {/* Footnote */}
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
