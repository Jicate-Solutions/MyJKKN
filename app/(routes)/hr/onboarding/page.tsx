// ============================================================================
// HR — Onboarding (T3.1 from specs/hr-module-decomposition-2026-05-09.md)
// Created: 2026-05-10.
//
// HR officer view: list of onboarding checklist TEMPLATES by organization +
// cadre. Read-only — admins manage the templates at
// /admin/hr/onboarding-checklists.
//
// Why this page exists despite "no instance table":
//   The original task plan assumed an instance table tracking each new
//   joinee's progress through their checklist. That table does NOT exist in
//   production. What HR officers CAN do today is see the per-cadre template
//   so they know what to brief new joiners on. When a new staff joins, HR
//   prints / forwards the relevant checklist; per-step completion is tracked
//   off-platform until Phase 2 ships hr_staff_onboarding_progress.
//
// Filter chips: All / Active / Inactive. Future: filter by org once
// multi-institution HR officers have a use case.
//
// Permission gate: HR officer + super_admin (anyone with /hr/* access reads
// this page).
//
// Spec: specs/hr-module-decomposition-2026-05-09.md (T3.1)
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOnboardingChecklists } from '@/hooks/hr/use-onboarding';
import type { HROnboardingChecklistView } from '@/types/hr-onboarding';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function HROnboardingPage() {
  const [status, setStatus] = useState<StatusFilter>('active');

  // We always pull all rows then filter client-side so toggling status doesn't
  // re-fetch. Volume is tiny (one row per org x cadre).
  const { data, isLoading, error, refetch } = useOnboardingChecklists({
    activeOnly: false,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (status === 'active') return rows.filter((r) => r.is_active);
    if (status === 'inactive') return rows.filter((r) => !r.is_active);
    return rows;
  }, [data, status]);

  // Group by organization name (best-effort — null orgs lump under '—').
  const grouped = useMemo(() => {
    const map = new Map<string, HROnboardingChecklistView[]>();
    for (const row of filtered) {
      const key = row.organization_name ?? '—';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const total = data?.length ?? 0;
  const activeCount = (data ?? []).filter((r) => r.is_active).length;

  return (
    <ContentLayout title="Onboarding Checklists">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Onboarding Checklists</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Templates that define what each new staff joiner is expected to
              complete in their first weeks — by organization and cadre. HR
              officers brief new joiners against these checklists. To edit a
              template, ask your admin to update it from{' '}
              <Link
                href="/admin/hr/onboarding-checklists"
                className="text-primary underline"
              >
                Admin → HR → Onboarding Checklists
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label={`All (${total})`}
            active={status === 'all'}
            onClick={() => setStatus('all')}
          />
          <FilterChip
            label={`Active (${activeCount})`}
            active={status === 'active'}
            onClick={() => setStatus('active')}
          />
          <FilterChip
            label={`Inactive (${total - activeCount})`}
            active={status === 'inactive'}
            onClick={() => setStatus('inactive')}
          />
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading onboarding checklists…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load onboarding checklists.{' '}
            {error instanceof Error ? error.message : ''}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState status={status} />
        ) : (
          <div className="space-y-6">
            {grouped.map(([orgName, rows]) => (
              <section key={orgName} className="space-y-3">
                <h2 className="text-base font-semibold text-muted-foreground">
                  {orgName}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((row) => (
                    <ChecklistCard key={row.id} row={row} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Phase-2 gap callout — visible to HR officers so the limitation is
            explicit, not hidden. */}
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-muted-foreground">
          <strong className="text-amber-700 dark:text-amber-400">
            Per-staff progress tracking coming in Phase 2.
          </strong>{' '}
          Today this page shows the templates only. Per-joinee step
          completion (who&apos;s done what, who&apos;s overdue) needs a new
          progress table — tracked as a Phase 2 follow-up to T3.1.
        </div>
      </div>
    </ContentLayout>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );
}

function ChecklistCard({ row }: { row: HROnboardingChecklistView }) {
  const sortedSteps = useMemo(
    () => row.steps.slice().sort((a, b) => a.order - b.order),
    [row.steps],
  );

  return (
    <Card className={row.is_active ? '' : 'opacity-60'}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold leading-tight">
              {row.checklist_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {row.cadre_name ? (
                <>
                  Cadre: <span className="font-medium">{row.cadre_name}</span>
                  {row.cadre_code ? (
                    <span className="ml-1 font-mono">({row.cadre_code})</span>
                  ) : null}
                </>
              ) : (
                <span className="italic">Applies to all cadres</span>
              )}
            </p>
          </div>
          <Badge variant={row.is_active ? 'default' : 'secondary'}>
            {row.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {sortedSteps.length} step{sortedSteps.length === 1 ? '' : 's'}
        </p>
        <ol className="space-y-1.5">
          {sortedSteps.map((step) => (
            <li key={step.order} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                {step.order}
              </span>
              <span className="flex-1">
                <span>{step.title}</span>
                {typeof step.expected_by_day === 'number' ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    by day {step.expected_by_day}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function EmptyState({ status }: { status: StatusFilter }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      <p className="font-medium">
        {status === 'all'
          ? 'No onboarding checklists configured yet.'
          : status === 'active'
            ? 'No active onboarding checklists.'
            : 'No inactive onboarding checklists.'}
      </p>
      <p className="mt-1 text-xs">
        Admins can create templates from{' '}
        <Link
          href="/admin/hr/onboarding-checklists"
          className="text-primary underline"
        >
          Admin → HR → Onboarding Checklists
        </Link>
        .
      </p>
    </div>
  );
}
