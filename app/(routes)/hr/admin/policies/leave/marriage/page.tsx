'use client';

// =====================================================================
// /hr/admin/policies/leave/marriage — Wave 3 W3-M5b
// =====================================================================
// Backed by `hr.leave.marriage` (scope=institution).
// JSONB shape (spec §24, audit-gap lock 2026-05-15):
//   Engineering: { applies: false }
//   Dental:      { applies: true, days: 10, min_service_years: 1, ... }
//
// "10 days" is definitive — the manual stated both "1 week" and "10 days"
// in the same section; Director resolved as 10 days on 2026-05-15.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

import { PolicyEditorShell } from '../../_shared/policy-editor-shell';

interface MarriageValue {
  applies: boolean;
  days?: number;
  min_service_years?: number;
  advance_application_required?: boolean;
  can_prefix_suffix_holidays?: boolean;
  deducted_from_vacation?: boolean;
}

const DEFAULT_VALUE: MarriageValue = {
  applies: false,
};

function parseValue(raw: unknown): MarriageValue {
  const obj = (raw || {}) as Partial<MarriageValue>;
  if (obj.applies === false) {
    return { applies: false };
  }
  return {
    applies: true,
    days: typeof obj.days === 'number' ? obj.days : 10,
    min_service_years:
      typeof obj.min_service_years === 'number' ? obj.min_service_years : 1,
    advance_application_required: obj.advance_application_required !== false,
    can_prefix_suffix_holidays: obj.can_prefix_suffix_holidays !== false,
    deducted_from_vacation: obj.deducted_from_vacation !== false,
  };
}

export default function MarriageLeavePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Marriage Leave">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Leave' },
            { label: 'Marriage' },
          ]}
        />
        <PolicyEditorShell<MarriageValue>
          policyKey="hr.leave.marriage"
          pageTitle="Marriage Leave"
          pageBlurb="Per-institution marriage leave policy. Dental: 10 days (Director-locked 2026-05-15). Engineering: not applicable — staff use vacation/casual leave instead."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <MarriageEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function MarriageEditor({
  value,
  onChange,
  disabled,
}: {
  value: MarriageValue;
  onChange: (next: MarriageValue) => void;
  disabled: boolean;
}) {
  function setApplies(applies: boolean) {
    if (applies) {
      // Hydrate defaults when turning ON
      onChange({
        applies: true,
        days: value.days ?? 10,
        min_service_years: value.min_service_years ?? 1,
        advance_application_required: value.advance_application_required !== false,
        can_prefix_suffix_holidays: value.can_prefix_suffix_holidays !== false,
        deducted_from_vacation: value.deducted_from_vacation !== false,
      });
    } else {
      // Collapse to {applies: false}
      onChange({ applies: false });
    }
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Director audit-gap lock 2026-05-15</AlertTitle>
        <AlertDescription>
          The HR manual contained both "1 week" and "10 days" for marriage
          leave in the same section. The Director resolved this as 10 days
          definitively on 2026-05-15. Dental seeds 10 days; Engineering seeds
          not-applicable.
        </AlertDescription>
      </Alert>

      <section className="space-y-3">
        <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
          <div>
            <Label className="text-sm font-semibold">
              Applies to this institution
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When OFF, staff do not get a separate marriage leave bucket;
              they apply for casual or vacation leave instead.
            </p>
          </div>
          <Switch
            checked={value.applies}
            onCheckedChange={setApplies}
            disabled={disabled}
            aria-label="Toggle marriage leave applies"
          />
        </div>
      </section>

      {!value.applies && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          Marriage leave is not applicable to this institution. Toggle the
          switch above to introduce a policy.
        </div>
      )}

      {value.applies && (
        <section className="space-y-4 rounded-md border border-border bg-card p-6">
          <div>
            <Label className="text-sm font-semibold">Marriage leave terms</Label>
            <p className="text-xs text-muted-foreground">
              Number of days, service eligibility, and how the leave interacts
              with holidays / vacation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Number of days</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={value.days ?? 10}
                onChange={(e) =>
                  onChange({ ...value, days: Number(e.target.value) || 0 })
                }
                disabled={disabled}
                className="mt-1 tabular-nums"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Director-locked default: 10 days.
              </p>
            </div>
            <div>
              <Label className="text-xs">Min service (years)</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={value.min_service_years ?? 1}
                onChange={(e) =>
                  onChange({
                    ...value,
                    min_service_years: Number(e.target.value) || 0,
                  })
                }
                disabled={disabled}
                className="mt-1 tabular-nums"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Staff must complete this many years before eligibility.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium">Advance application required</div>
                <p className="text-xs text-muted-foreground">
                  Cannot be applied retrospectively.
                </p>
              </div>
              <Switch
                checked={value.advance_application_required !== false}
                onCheckedChange={(c) =>
                  onChange({ ...value, advance_application_required: c })
                }
                disabled={disabled}
              />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium">Can prefix / suffix holidays</div>
                <p className="text-xs text-muted-foreground">
                  Public holidays adjacent to the leave extend the time off.
                </p>
              </div>
              <Switch
                checked={value.can_prefix_suffix_holidays !== false}
                onCheckedChange={(c) =>
                  onChange({ ...value, can_prefix_suffix_holidays: c })
                }
                disabled={disabled}
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-md bg-muted/40 p-3">
              <div>
                <div className="text-sm font-medium">Deducted from vacation</div>
                <p className="text-xs text-muted-foreground">
                  When ON, marriage leave days are subtracted from the
                  employees annual vacation balance.
                </p>
              </div>
              <Switch
                checked={value.deducted_from_vacation !== false}
                onCheckedChange={(c) =>
                  onChange({ ...value, deducted_from_vacation: c })
                }
                disabled={disabled}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
