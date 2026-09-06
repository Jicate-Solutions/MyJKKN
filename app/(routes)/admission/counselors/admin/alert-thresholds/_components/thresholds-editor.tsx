'use client';

// Created: 2026-04-29
// Editor for staffing_alert_thresholds rows. Super-admin only (enforced by both
// the parent <SuperAdminOnly> guard and the RLS WRITE policy on the table).
//
// Three rows, each with its own numeric input + Save button:
//   - max_to_median_ratio       → { ratio: number }
//   - max_open_leads_alert      → { threshold: number }
//   - orphan_institution_alert  → { min_unassigned: number }

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useStaffingThresholdsList,
  useUpdateStaffingThreshold,
  type StaffingThresholdKey,
  STAFFING_THRESHOLD_DEFAULTS,
} from '@/lib/services/admin/staffing-alert-thresholds-service';

// Per-row config: which JSONB inner key to expose, label, and number constraints.
const FIELD_CONFIG: Record<
  StaffingThresholdKey,
  {
    valueKey: string;
    label: string;
    helperText: string;
    step: number;
    min: number;
  }
> = {
  max_to_median_ratio: {
    valueKey: 'ratio',
    label: 'Ratio',
    helperText: 'Trigger imbalance alert if max_open_leads / median_open_leads > this',
    step: 0.1,
    min: 1,
  },
  max_open_leads_alert: {
    valueKey: 'threshold',
    label: 'Threshold (leads)',
    helperText: 'Trigger overload alert if any single counselor has more than this',
    step: 1,
    min: 1,
  },
  orphan_institution_alert: {
    valueKey: 'min_unassigned',
    label: 'Min unassigned institutions',
    helperText:
      'Trigger orphan-institution alert if at least this many institutions have unassigned leads + 0 active counselors',
    step: 1,
    min: 1,
  },
};

const ORDERED_KEYS: StaffingThresholdKey[] = [
  'max_to_median_ratio',
  'max_open_leads_alert',
  'orphan_institution_alert',
];

export function ThresholdsEditor() {
  const { data: rows, isLoading } = useStaffingThresholdsList();
  const updateMutation = useUpdateStaffingThreshold();

  // Local edit buffer keyed by row.key (string of the typed numeric input)
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Hydrate drafts when rows arrive
  useEffect(() => {
    if (!rows) return;
    const next: Record<string, string> = {};
    for (const row of rows) {
      const cfg = FIELD_CONFIG[row.key as StaffingThresholdKey];
      if (!cfg) continue;
      const v = (row.value as Record<string, unknown>)[cfg.valueKey];
      next[row.key] = v != null ? String(v) : '';
    }
    setDrafts(next);
  }, [rows]);

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
        No threshold rows found. Run migration{' '}
        <code className='rounded bg-muted px-1 py-0.5 text-xs'>
          20260429_staffing_alert_thresholds.sql
        </code>{' '}
        to seed defaults.
      </div>
    );
  }

  const handleSave = (key: StaffingThresholdKey) => {
    const cfg = FIELD_CONFIG[key];
    if (!cfg) return;
    const raw = drafts[key];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < cfg.min) {
      toast.error(`Invalid value for ${cfg.label}. Must be a number >= ${cfg.min}.`);
      return;
    }
    const newValue = { [cfg.valueKey]: parsed };
    updateMutation.mutate(
      { key, value: newValue },
      {
        onSuccess: () => {
          toast.success(`${key} updated`);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Update failed';
          toast.error(msg);
        },
      },
    );
  };

  // Lookup helper — index rows by key
  const rowByKey: Record<string, (typeof rows)[number] | undefined> = {};
  for (const r of rows) rowByKey[r.key] = r;

  return (
    <div className='space-y-6'>
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        These thresholds drive the counselor staffing-imbalance alert banner shown
        on the admission dashboard. Changes take effect within 5 minutes (TanStack
        Query cache TTL on the consumer hook).
      </div>

      {ORDERED_KEYS.map((key) => {
        const row = rowByKey[key];
        const cfg = FIELD_CONFIG[key];
        if (!row || !cfg) return null;
        const seedHint =
          (STAFFING_THRESHOLD_DEFAULTS[key] as Record<string, number>)[cfg.valueKey];

        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className='text-base'>{key}</CardTitle>
              <CardDescription>{row.description}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='space-y-1.5'>
                <Label htmlFor={`field-${key}`}>{cfg.label}</Label>
                <Input
                  id={`field-${key}`}
                  type='number'
                  step={cfg.step}
                  min={cfg.min}
                  value={drafts[key] ?? ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className='max-w-xs'
                />
                <p className='text-xs text-muted-foreground'>
                  {cfg.helperText}. Default: {seedHint}.
                </p>
              </div>
              <div className='text-xs text-muted-foreground'>
                Last updated:{' '}
                {row.updated_at
                  ? new Date(row.updated_at).toLocaleString()
                  : '—'}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => handleSave(key)}
                disabled={
                  updateMutation.isPending && updateMutation.variables?.key === key
                }
              >
                {updateMutation.isPending && updateMutation.variables?.key === key ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Save className='mr-2 h-4 w-4' />
                )}
                Save
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
