'use client';

// Motivation Fund Editor — Director's-view UI for the hr.motivation_fund
// policy. EPF percentages, award framework, and consultancy permissions
// rendered as friendly inputs / toggles. Never shows raw JSONB.

import { useEffect, useState } from 'react';
import { ShieldAlert, Info, Save } from 'lucide-react';
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
  type CompensationInstitutionId,
  type MotivationFundValue,
} from '@/hooks/admin/use-hr-compensation-policies';

const EMPTY_VALUE: MotivationFundValue = {
  epf: {
    employee_contribution_pct: 12.0,
    employer_contribution_pct: 12.0,
    deposit_to_govt_dept_timely: true,
  },
  awards: {
    categories: ['faculty', 'supporting_staff'],
    variables: ['academic_perf', 'student_feedback', 'pass_pct', 'top_ranks', 'grade'],
    forms: ['cash', 'appreciation_letter', 'commending_letter', 'promotion', 'increment'],
    top_ranks_at_university_level: true,
  },
  consultancy: {
    problems_referred_by: ['industries', 'government_agencies'],
    uses_faculty_expertise_and_infra: true,
  },
};

export function MotivationFundEditor() {
  const [institutionId, setInstitutionId] =
    useState<CompensationInstitutionId>(COMPENSATION_INSTITUTIONS[0].id);

  const policyQ = useCompensationPolicy<MotivationFundValue>(
    HR_COMPENSATION_KEYS.MOTIVATION_FUND,
    institutionId
  );
  const updateM = useUpdateCompensationPolicy<MotivationFundValue>(
    HR_COMPENSATION_KEYS.MOTIVATION_FUND,
    institutionId
  );

  const [draft, setDraft] = useState<MotivationFundValue>(EMPTY_VALUE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!policyQ.data) return;
    setDraft(policyQ.data.value ?? EMPTY_VALUE);
    setDirty(false);
  }, [policyQ.data, institutionId]);

  const handleEpfPct = (field: 'employee_contribution_pct' | 'employer_contribution_pct', value: number) => {
    setDraft((prev) => ({
      ...prev,
      epf: { ...prev.epf, [field]: value },
    }));
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
        <AlertTitle>Failed to load motivation fund policy</AlertTitle>
        <AlertDescription>
          {policyQ.error?.message || 'Unknown error.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Institution selector */}
      <section className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="institution-select" className="text-sm">
            Institution
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Motivation fund policy is stored per institution.
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
            The hr.motivation_fund row for this institution has not been
            seeded. Apply
            migrations/20260605_hr_compensation_seeds.sql, then return.
          </AlertDescription>
        </Alert>
      )}

      {/* EPF */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Employees&apos; Provident Fund (EPF)</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Statutory contribution percentages and deposit discipline.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="emp-pct" className="text-sm">
              Employee contribution (%)
            </Label>
            <Input
              id="emp-pct"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draft.epf.employee_contribution_pct ?? 0}
              onChange={(e) =>
                handleEpfPct('employee_contribution_pct', Number(e.target.value) || 0)
              }
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deducted from employee gross. Statutory rate: 12%.
            </p>
          </div>

          <div>
            <Label htmlFor="emr-pct" className="text-sm">
              Employer contribution (%)
            </Label>
            <Input
              id="emr-pct"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draft.epf.employer_contribution_pct ?? 0}
              onChange={(e) =>
                handleEpfPct('employer_contribution_pct', Number(e.target.value) || 0)
              }
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paid by JKKN on top of CTC. Statutory rate: 12%.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3 md:col-span-2">
            <div>
              <div className="text-sm font-medium">
                Deposit to govt dept timely
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, the institution commits to depositing contributions
                with the EPF Office by the statutory deadline each month.
              </p>
            </div>
            <Switch
              checked={draft.epf.deposit_to_govt_dept_timely}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  epf: { ...prev.epf, deposit_to_govt_dept_timely: c },
                }));
                setDirty(true);
              }}
              aria-label="Toggle timely EPF deposit"
            />
          </div>
        </div>
      </section>

      {/* Awards */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Performance awards</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Who gets recognized, on what dimensions, and in what form.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <div className="text-sm font-medium">Categories</div>
            <div className="flex flex-wrap gap-2">
              {draft.awards.categories.map((c) => (
                <span
                  key={c}
                  className="rounded bg-background px-2 py-0.5 text-xs border border-border"
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Staff buckets eligible for awards.
            </p>
          </div>

          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <div className="text-sm font-medium">Variables (judging criteria)</div>
            <div className="flex flex-wrap gap-2">
              {draft.awards.variables.map((v) => (
                <span
                  key={v}
                  className="rounded bg-background px-2 py-0.5 text-xs border border-border"
                >
                  {v}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Dimensions used to identify award-worthy performance.
            </p>
          </div>

          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <div className="text-sm font-medium">Forms of award</div>
            <div className="flex flex-wrap gap-2">
              {draft.awards.forms.map((f) => (
                <span
                  key={f}
                  className="rounded bg-background px-2 py-0.5 text-xs border border-border"
                >
                  {f}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              How the recognition is delivered.
            </p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
          <div>
            <div className="text-sm font-medium">
              Recognize top ranks at university level
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              When ON, faculty whose students rank at university level qualify
              for special awards.
            </p>
          </div>
          <Switch
            checked={draft.awards.top_ranks_at_university_level}
            onCheckedChange={(c) => {
              setDraft((prev) => ({
                ...prev,
                awards: { ...prev.awards, top_ranks_at_university_level: c },
              }));
              setDirty(true);
            }}
            aria-label="Toggle university-level top ranks"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          (Categories / variables / forms list-editing comes online once W3-M0
          substrate ships the draft / publish flow.)
        </p>
      </section>

      {/* Consultancy */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Faculty consultancy</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Whether faculty may take on external problem-solving work using
            JKKN expertise and infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <div className="text-sm font-medium">Problems referred by</div>
            <div className="flex flex-wrap gap-2">
              {draft.consultancy.problems_referred_by.map((s) => (
                <span
                  key={s}
                  className="rounded bg-background px-2 py-0.5 text-xs border border-border"
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sources that may route consultancy problems to JKKN faculty.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                May use faculty expertise + JKKN infra
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, faculty may use JKKN labs / equipment when delivering
                consultancy work.
              </p>
            </div>
            <Switch
              checked={draft.consultancy.uses_faculty_expertise_and_infra}
              onCheckedChange={(c) => {
                setDraft((prev) => ({
                  ...prev,
                  consultancy: {
                    ...prev.consultancy,
                    uses_faculty_expertise_and_infra: c,
                  },
                }));
                setDirty(true);
              }}
              aria-label="Toggle infra use"
            />
          </div>
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
