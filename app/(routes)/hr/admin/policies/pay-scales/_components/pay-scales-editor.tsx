'use client';

// Pay Scales Editor — Director's-view UI.
// Renders the institution-scoped hr.pay_scales row as an editable pay matrix
// (designation × qualification → basic_pay) plus a small "overrides + governance"
// strip. Never shows raw JSONB.

import { useEffect, useMemo, useState } from 'react';
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
  type CompensationInstitutionId,
  type PayMatrixRow,
  type PayScalesValue,
} from '@/hooks/admin/use-hr-compensation-policies';

// ---------------------------------------------------------------------------
// Defaults — applied when the row exists but a key is missing, so the editor
// never crashes on a partial value.
// ---------------------------------------------------------------------------

const EMPTY_VALUE: PayScalesValue = {
  pay_matrix: [],
  overrides: { net_set_basic: null },
  fixation_basis: ['qualification', 'experience'],
  selection_committee_authority: true,
  higher_pay_package_approver: 'Trust Secretary',
};

function inrFormat(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('en-IN');
}

export function PayScalesEditor() {
  const [institutionId, setInstitutionId] =
    useState<CompensationInstitutionId>(COMPENSATION_INSTITUTIONS[0].id);

  const policyQ = useCompensationPolicy<PayScalesValue>(
    HR_COMPENSATION_KEYS.PAY_SCALES,
    institutionId
  );
  const updateM = useUpdateCompensationPolicy<PayScalesValue>(
    HR_COMPENSATION_KEYS.PAY_SCALES,
    institutionId
  );

  const [draft, setDraft] = useState<PayScalesValue>(EMPTY_VALUE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!policyQ.data) return;
    setDraft(policyQ.data.value ?? EMPTY_VALUE);
    setDirty(false);
  }, [policyQ.data, institutionId]);

  const totalRows = draft.pay_matrix.length;
  const totalBasicPay = useMemo(
    () => draft.pay_matrix.reduce((sum, r) => sum + (r.basic_pay || 0), 0),
    [draft.pay_matrix]
  );

  const handleRowChange = (
    index: number,
    field: keyof PayMatrixRow,
    value: string | number | null
  ) => {
    setDraft((prev) => {
      const next = { ...prev, pay_matrix: [...prev.pay_matrix] };
      next.pay_matrix[index] = {
        ...next.pay_matrix[index],
        [field]: value,
      };
      return next;
    });
    setDirty(true);
  };

  const handleAddRow = () => {
    setDraft((prev) => ({
      ...prev,
      pay_matrix: [
        ...prev.pay_matrix,
        { designation: '', qualification: null, basic_pay: 0 },
      ],
    }));
    setDirty(true);
  };

  const handleRemoveRow = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      pay_matrix: prev.pay_matrix.filter((_, i) => i !== index),
    }));
    setDirty(true);
  };

  const handleOverrideChange = (value: number | null) => {
    setDraft((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, net_set_basic: value },
    }));
    setDirty(true);
  };

  const handleGovernanceChange = <K extends keyof PayScalesValue>(
    key: K,
    value: PayScalesValue[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
        <AlertTitle>Failed to load pay-scales policy</AlertTitle>
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
            Pay scales are stored per institution. Switch to edit each one.
          </p>
        </div>
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
      </section>

      {seedMissing && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No row seeded yet for this institution</AlertTitle>
          <AlertDescription>
            The hr.pay_scales row for this institution has not been seeded.
            Apply migrations/20260605_hr_compensation_seeds.sql, then return.
            Saves will no-op until the row exists.
          </AlertDescription>
        </Alert>
      )}

      {/* Pay matrix */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Pay matrix</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Each row sets the monthly basic pay (INR) for one
              designation × qualification pair. Leave qualification blank if the
              pay applies to the designation regardless of qualification.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              disabled={updateM.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add row
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateM.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateM.isPending ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium w-1/3">Designation</th>
                <th className="px-4 py-3 font-medium w-1/3">Qualification</th>
                <th className="px-4 py-3 font-medium w-40 text-right">
                  Basic pay (₹/month)
                </th>
                <th className="px-4 py-3 font-medium w-16" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {draft.pay_matrix.map((row, idx) => (
                <tr key={idx} className="border-t border-border align-top">
                  <td className="px-4 py-2">
                    <Input
                      value={row.designation}
                      onChange={(e) =>
                        handleRowChange(idx, 'designation', e.target.value)
                      }
                      placeholder="e.g. Assistant Professor"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={row.qualification ?? ''}
                      onChange={(e) =>
                        handleRowChange(
                          idx,
                          'qualification',
                          e.target.value === '' ? null : e.target.value
                        )
                      }
                      placeholder="(any) — leave blank"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={row.basic_pay ?? 0}
                      onChange={(e) =>
                        handleRowChange(
                          idx,
                          'basic_pay',
                          Number(e.target.value) || 0
                        )
                      }
                      className="text-right tabular-nums"
                    />
                    <div className="text-xs text-muted-foreground text-right mt-0.5">
                      ₹{inrFormat(row.basic_pay)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRow(idx)}
                      disabled={updateM.isPending}
                      aria-label={`Remove row ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {draft.pay_matrix.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No pay-matrix rows yet. Click <strong>Add row</strong> to
                    start.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-muted/20 text-xs">
              <tr>
                <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                  {totalRows} rows
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  Sum: ₹{inrFormat(totalBasicPay)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Overrides + governance */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Overrides &amp; governance</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Floor / ceiling overrides and the people who can grant a higher
            package outside the matrix.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="net-set-basic" className="text-sm">
              Net set basic (minimum guaranteed)
            </Label>
            <Input
              id="net-set-basic"
              type="number"
              min={0}
              step={500}
              value={draft.overrides.net_set_basic ?? ''}
              onChange={(e) =>
                handleOverrideChange(
                  e.target.value === '' ? null : Number(e.target.value)
                )
              }
              placeholder="Leave blank for no floor"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              When set, no employee can be paid below this basic regardless of
              the matrix.
            </p>
          </div>

          <div>
            <Label htmlFor="higher-approver" className="text-sm">
              Approver for higher pay package
            </Label>
            <Input
              id="higher-approver"
              value={draft.higher_pay_package_approver ?? ''}
              onChange={(e) =>
                handleGovernanceChange(
                  'higher_pay_package_approver',
                  e.target.value
                )
              }
              placeholder="e.g. Trust Secretary"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The role authorised to override the matrix.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                Selection committee authority
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                When ON, the selection committee can finalize pay within the
                matrix without further escalation.
              </p>
            </div>
            <Switch
              checked={draft.selection_committee_authority}
              onCheckedChange={(c) =>
                handleGovernanceChange('selection_committee_authority', c)
              }
              aria-label="Toggle selection committee authority"
            />
          </div>

          <div className="rounded-md bg-muted/40 p-3">
            <div className="text-sm font-medium mb-1">Fixation basis</div>
            <div className="flex flex-wrap gap-2">
              {draft.fixation_basis.map((f) => (
                <span
                  key={f}
                  className="rounded bg-background px-2 py-0.5 text-xs border border-border"
                >
                  {f}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Axes used by the selection committee. (Edit via direct JSONB once
              W3-M0 substrate ships the draft / publish flow.)
            </p>
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
