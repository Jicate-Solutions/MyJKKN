'use client';

// =====================================================================
// /hr/admin/policies/leave/holidays-and-lop — Wave 3 W3-M5b
// =====================================================================
// Backed by `hr.leave.holidays_and_lop` (scope=institution).
// JSONB shape (spec §25):
//   {
//     public_holidays_source: string,
//     restricted_holidays_list: string[],
//     half_day_windows: { forenoon_start/end, afternoon_start/end },
//     lop: { max_days_per_year, 2plus_per_month_triggers_memo, principal_prior_approval_required }
//   }
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

interface HolidaysAndLopValue {
  public_holidays_source: string;
  restricted_holidays_list: string[];
  half_day_windows: {
    forenoon_start: string;
    forenoon_end: string;
    afternoon_start: string;
    afternoon_end: string;
  };
  lop: {
    max_days_per_year: number;
    '2plus_per_month_triggers_memo': boolean;
    principal_prior_approval_required: boolean;
  };
}

const DEFAULT_VALUE: HolidaysAndLopValue = {
  public_holidays_source: 'Govt_of_India_list_approved_by_Director',
  restricted_holidays_list: [],
  half_day_windows: {
    forenoon_start: '09:00',
    forenoon_end: '13:00',
    afternoon_start: '12:30',
    afternoon_end: '16:30',
  },
  lop: {
    max_days_per_year: 15,
    '2plus_per_month_triggers_memo': true,
    principal_prior_approval_required: true,
  },
};

function parseValue(raw: unknown): HolidaysAndLopValue {
  const obj = (raw || {}) as Partial<HolidaysAndLopValue>;
  const hdw = obj.half_day_windows || ({} as Partial<HolidaysAndLopValue['half_day_windows']>);
  const lop = obj.lop || ({} as Partial<HolidaysAndLopValue['lop']>);
  return {
    public_holidays_source: String(
      obj.public_holidays_source || DEFAULT_VALUE.public_holidays_source,
    ),
    restricted_holidays_list: Array.isArray(obj.restricted_holidays_list)
      ? obj.restricted_holidays_list.map(String)
      : [],
    half_day_windows: {
      forenoon_start: String(hdw.forenoon_start || DEFAULT_VALUE.half_day_windows.forenoon_start),
      forenoon_end: String(hdw.forenoon_end || DEFAULT_VALUE.half_day_windows.forenoon_end),
      afternoon_start: String(hdw.afternoon_start || DEFAULT_VALUE.half_day_windows.afternoon_start),
      afternoon_end: String(hdw.afternoon_end || DEFAULT_VALUE.half_day_windows.afternoon_end),
    },
    lop: {
      max_days_per_year:
        typeof lop.max_days_per_year === 'number' ? lop.max_days_per_year : 15,
      '2plus_per_month_triggers_memo':
        lop['2plus_per_month_triggers_memo'] !== false,
      principal_prior_approval_required:
        lop.principal_prior_approval_required !== false,
    },
  };
}

export default function HolidaysAndLopPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Holidays & Loss of Pay">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Leave' },
            { label: 'Holidays & LOP' },
          ]}
        />
        <PolicyEditorShell<HolidaysAndLopValue>
          policyKey="hr.leave.holidays_and_lop"
          pageTitle="Holidays & Loss of Pay"
          pageBlurb="Public holiday source, restricted holiday list, half-day attendance windows, and the loss-of-pay rules (annual cap, memo trigger, approval gate)."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <HolidaysAndLopEditor
              value={value}
              onChange={onChange}
              disabled={disabled}
            />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function HolidaysAndLopEditor({
  value,
  onChange,
  disabled,
}: {
  value: HolidaysAndLopValue;
  onChange: (next: HolidaysAndLopValue) => void;
  disabled: boolean;
}) {
  const [newRestricted, setNewRestricted] = useState('');

  function addRestricted() {
    const v = newRestricted.trim();
    if (!v || value.restricted_holidays_list.includes(v)) {
      setNewRestricted('');
      return;
    }
    onChange({
      ...value,
      restricted_holidays_list: [...value.restricted_holidays_list, v],
    });
    setNewRestricted('');
  }

  function removeRestricted(v: string) {
    onChange({
      ...value,
      restricted_holidays_list: value.restricted_holidays_list.filter((x) => x !== v),
    });
  }

  return (
    <div className="space-y-8">
      {/* Public holiday source */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Public holiday source</Label>
          <p className="text-xs text-muted-foreground">
            Where the list of declared holidays comes from each year.
          </p>
        </div>
        <Input
          value={value.public_holidays_source}
          onChange={(e) =>
            onChange({ ...value, public_holidays_source: e.target.value })
          }
          disabled={disabled}
          className="max-w-xl"
        />
      </section>

      {/* Restricted holidays */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">
            Restricted holidays ({value.restricted_holidays_list.length})
          </Label>
          <p className="text-xs text-muted-foreground">
            Staff may opt-in to a limited list of restricted holidays in
            addition to the public list. Add festival or institution-specific
            entries here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value.restricted_holidays_list.map((h) => (
            <Badge key={h} variant="outline" className="pr-1 text-sm">
              <span>{h}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeRestricted(h)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${h}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {value.restricted_holidays_list.length === 0 && (
            <p className="text-xs italic text-muted-foreground">
              No restricted holidays configured.
            </p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Input
              value={newRestricted}
              onChange={(e) => setNewRestricted(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRestricted();
                }
              }}
              placeholder="Add restricted holiday (e.g. Pongal Day 3)"
              className="max-w-md"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addRestricted}
              disabled={!newRestricted.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add holiday
            </Button>
          </div>
        )}
      </section>

      {/* Half-day windows */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Half-day attendance windows</Label>
          <p className="text-xs text-muted-foreground">
            Start and end times for forenoon and afternoon shifts. Used by
            attendance to compute half-day vs full-day leave.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Forenoon start</Label>
            <Input
              type="time"
              value={value.half_day_windows.forenoon_start}
              onChange={(e) =>
                onChange({
                  ...value,
                  half_day_windows: {
                    ...value.half_day_windows,
                    forenoon_start: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Forenoon end</Label>
            <Input
              type="time"
              value={value.half_day_windows.forenoon_end}
              onChange={(e) =>
                onChange({
                  ...value,
                  half_day_windows: {
                    ...value.half_day_windows,
                    forenoon_end: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Afternoon start</Label>
            <Input
              type="time"
              value={value.half_day_windows.afternoon_start}
              onChange={(e) =>
                onChange({
                  ...value,
                  half_day_windows: {
                    ...value.half_day_windows,
                    afternoon_start: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Afternoon end</Label>
            <Input
              type="time"
              value={value.half_day_windows.afternoon_end}
              onChange={(e) =>
                onChange({
                  ...value,
                  half_day_windows: {
                    ...value.half_day_windows,
                    afternoon_end: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>
      </section>

      {/* LOP */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Loss of Pay (LOP) rules</Label>
          <p className="text-xs text-muted-foreground">
            Annual ceiling and triggers for memos / pre-approval.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Max LOP days / year</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={value.lop.max_days_per_year}
              onChange={(e) =>
                onChange({
                  ...value,
                  lop: {
                    ...value.lop,
                    max_days_per_year: Number(e.target.value) || 0,
                  },
                })
              }
              disabled={disabled}
              className="mt-1 tabular-nums"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Hard cap. Beyond this, termination workflow may trigger.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                2+ LOPs in a month triggers memo
              </div>
              <p className="text-xs text-muted-foreground">
                When ON, two or more LOPs in a single calendar month
                generates a memo to the staff member.
              </p>
            </div>
            <Switch
              checked={value.lop['2plus_per_month_triggers_memo']}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  lop: { ...value.lop, '2plus_per_month_triggers_memo': c },
                })
              }
              disabled={disabled}
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">
                Principal prior approval required
              </div>
              <p className="text-xs text-muted-foreground">
                When ON, LOP requests must be pre-approved by the Principal.
              </p>
            </div>
            <Switch
              checked={value.lop.principal_prior_approval_required}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  lop: { ...value.lop, principal_prior_approval_required: c },
                })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
