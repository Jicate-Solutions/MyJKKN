// =====================================================================
// /pde/admin/demonstrations — Faculty validator inbox
// =====================================================================
// Lists pending PDE demonstrations awaiting validation. RLS narrows to
// the caller's institution; the policy on `pde_demonstrations` permits
// faculty/hod/coordinator/dean/institution_admin/administrator to read.
//
// Server component — fetches via PDEValidatorService.listPending() and
// renders a table with a link to the per-row detail page.
// =====================================================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Inbox } from 'lucide-react';
import { PDEValidatorService } from '@/lib/services/pde-validator-service';
import { ClickableDemoRow } from './_components/ClickableDemoRow';

export const dynamic = 'force-dynamic';

export const navMeta = {
  label: 'PDE Demonstrations',
  icon: 'Inbox',
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Aging badge — green inside half the SLA, amber approaching, red breached. */
function agingBadge(submittedAt: string | null, slaDays: number) {
  if (!submittedAt) return null;
  const days = Math.floor(
    (Date.now() - new Date(submittedAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  const breached = days >= slaDays;
  const warning = !breached && days >= slaDays / 2;
  return (
    <Badge
      variant="outline"
      className={
        breached
          ? 'text-xs border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
          : warning
            ? 'text-xs border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
            : 'text-xs border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      }
    >
      {days}d{breached ? ' — SLA breached' : ''}
    </Badge>
  );
}

export default async function PdeDemonstrationsInboxPage() {
  let pending: Awaited<ReturnType<typeof PDEValidatorService.listPending>> = [];
  let stats: Awaited<ReturnType<typeof PDEValidatorService.validationVisibilityStats>> | null = null;
  let errorMessage: string | null = null;

  try {
    pending = await PDEValidatorService.listPending();
    stats = await PDEValidatorService.validationVisibilityStats();
  } catch (err: any) {
    errorMessage = err?.message || 'Failed to load pending demonstrations';
  }

  return (
    <ContentLayout title="PDE Demonstrations — Validator Inbox">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'PDE', href: '/pde/admin/assessments' },
          { label: 'Demonstrations' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Validator Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Pending PDE demonstrations awaiting faculty review. Open one to record
            your validation notes and raw score; the scoring engine then computes
            the weighted score.
          </p>
        </div>

        {/* Validation-loop visibility (CARE corrective move A — A3/A4):
            SLA from policy pde.scoring.validation_sla_days, tunable live. */}
        {stats && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground">Awaiting validation</div>
                <div className="text-2xl font-semibold tabular-nums">{stats.pendingCount}</div>
                <div className="text-[11px] text-muted-foreground">oldest first below</div>
              </CardContent>
            </Card>
            <Card className={stats.pendingOverSla > 0 ? 'border-red-300' : undefined}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground">
                  Over {stats.slaDays}-day SLA
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  {stats.pendingOverSla}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  target: every submission acknowledged in {stats.slaDays} days
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground">Median time to validation</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {stats.medianLatencyDays === null ? '—' : `${stats.medianLatencyDays}d`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  approx. — submission → validation/score
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground">Learners acknowledged</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {stats.ackCoveragePct === null ? '—' : `${stats.ackCoveragePct}%`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  of learners with a submission (coverage of the median)
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {errorMessage ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {errorMessage}
            </CardContent>
          </Card>
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                No demonstrations awaiting validation in your institution.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner ID</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Skill</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <ClickableDemoRow
                      key={row.id}
                      href={`/pde/admin/demonstrations/${row.id}`}
                    >
                      <TableCell className="font-mono text-xs">
                        {row.learner_id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.category_key}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.skill_name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.evidence_type || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.submitted_at)}
                      </TableCell>
                      <TableCell>
                        {agingBadge(row.submitted_at, stats?.slaDays ?? 7)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/pde/admin/demonstrations/${row.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Validate →
                        </Link>
                      </TableCell>
                    </ClickableDemoRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
