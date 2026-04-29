'use client';
// ============================================
// COUNSELOR ROUTING CONFIG (Super-Admin)
// ============================================
// Created: 2026-04-29
// Purpose: Director's standing rule (2026-04-29) — every policy decision = config row.
//          Edit cap_per_run / cascade_after_minutes / flush_interval_minutes here, no PR.
// Memory: feedback_policy_decisions_must_be_config_rows.md
// ============================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, RefreshCw, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CounselorRoutingConfigService,
  ROUTING_CONFIG_INNER_FIELD,
  type CounselorRoutingConfigRow,
} from '@/lib/services/admin/counselor-routing-config-service';

interface RowDraft {
  row: CounselorRoutingConfigRow;
  innerField: string;
  current: number | null;
  draft: string;
  saving: boolean;
}

export default function CounselorRoutingConfigPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [drafts, setDrafts] = useState<RowDraft[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const rows = await CounselorRoutingConfigService.list();
    const next: RowDraft[] = rows.map((row) => {
      const innerField = ROUTING_CONFIG_INNER_FIELD[row.key] || 'value';
      const current = CounselorRoutingConfigService.extractInteger(row, innerField);
      return {
        row,
        innerField,
        current,
        draft: current !== null ? String(current) : '',
        saving: false,
      };
    });
    setDrafts(next);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDraftChange = (key: string, value: string) => {
    setDrafts((prev) =>
      prev
        ? prev.map((d) => (d.row.key === key ? { ...d, draft: value } : d))
        : prev,
    );
  };

  const handleSave = async (entry: RowDraft) => {
    const trimmed = entry.draft.trim();
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== trimmed) {
      toast.error('Enter a non-negative whole number');
      return;
    }
    if (parsed === entry.current) {
      toast('No change', { icon: 'ℹ️' });
      return;
    }

    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.row.key === entry.row.key ? { ...d, saving: true } : d,
          )
        : prev,
    );

    const res = await CounselorRoutingConfigService.updateInteger(
      entry.row.key,
      entry.innerField,
      parsed,
    );

    if (!res.ok) {
      toast.error(res.error || 'Save failed');
      setDrafts((prev) =>
        prev
          ? prev.map((d) =>
              d.row.key === entry.row.key ? { ...d, saving: false } : d,
            )
          : prev,
      );
      return;
    }

    toast.success(`${entry.row.key} updated to ${parsed}`);
    await load();
  };

  // Permission gate
  if (permsLoading) {
    return (
      <ContentLayout title="Counselor Routing Config">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Counselor Routing Config">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            This page is restricted to super-admin users. Routing config drives
            production lead-assignment behavior — locked tight.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Counselor Routing Config">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Counselors', href: '/admin/counselors' },
          { label: 'Routing Config' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Counselor Routing Config</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Edit lead-routing thresholds without a deploy. Changes apply on the
            next cron run. Director&apos;s standing rule (2026-04-29): policy
            decisions live as config rows, not code constants.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading || drafts === null ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : drafts.length === 0 ? (
        <Alert>
          <AlertTitle>No config rows</AlertTitle>
          <AlertDescription>
            Expected 3 seeded rows (cap_per_run, cascade_after_minutes,
            flush_interval_minutes). Run the migration
            <code className="mx-1 rounded bg-muted px-1">
              20260429_counselor_routing_config.sql
            </code>
            and reload.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {drafts.map((entry) => (
            <Card key={entry.row.key}>
              <CardHeader>
                <CardTitle className="font-mono text-base">
                  {entry.row.key}
                </CardTitle>
                <CardDescription>{entry.row.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label
                      htmlFor={`input-${entry.row.key}`}
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {entry.innerField}
                    </Label>
                    <Input
                      id={`input-${entry.row.key}`}
                      type="number"
                      min={0}
                      step={1}
                      value={entry.draft}
                      onChange={(e) =>
                        handleDraftChange(entry.row.key, e.target.value)
                      }
                      disabled={entry.saving}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(entry)}
                    disabled={
                      entry.saving ||
                      entry.draft.trim() === String(entry.current ?? '')
                    }
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {entry.saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Current value: <strong>{entry.current ?? '—'}</strong>
                  {entry.row.updated_at && (
                    <>
                      {' '}
                      · Last updated{' '}
                      {new Date(entry.row.updated_at).toLocaleString()}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Alert className="mt-6">
        <AlertTitle>How tweaks land in production</AlertTitle>
        <AlertDescription className="text-sm">
          Save above → row updates → next cron run reads new value via{' '}
          <code className="rounded bg-muted px-1">get_routing_config()</code>.
          No deploy, no PR. Function bodies will read from this table after the
          follow-up cleanup PR rewrites
          <code className="mx-1 rounded bg-muted px-1">
            fn_flush_queued_leads
          </code>
          and{' '}
          <code className="rounded bg-muted px-1">
            fn_cascade_off_duty_counselors
          </code>
          .
        </AlertDescription>
      </Alert>
    </ContentLayout>
  );
}
