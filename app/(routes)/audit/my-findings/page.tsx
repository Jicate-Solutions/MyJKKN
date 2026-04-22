'use client';

// Audit Workflow Sprint 01 — per-owner rectification queue.
// Lists findings where the current user is requester/assignee (via service-level
// listMyFindings). Sorted by severity desc, SLA asc. Renders an "Upload evidence"
// button that opens CloseFindingDialog.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Inbox, Upload, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useMyFindings } from '@/hooks/audit/use-audit-findings';
import { SeverityBadge } from '../_components/findings/severity-badge';
import { SlaChip } from '../_components/findings/sla-chip';
import { CloseFindingDialog } from '../_components/findings/close-finding-dialog';
import type { AuditFindingView, FindingSeverity } from '@/lib/types/audit';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

function slaDaysFallback(severity: FindingSeverity): number {
  return severity === 'red' ? 7 : severity === 'yellow' ? 30 : 60;
}

function daysRemaining(
  submittedAt: string | null,
  expectedDays: number
): number {
  if (!submittedAt) return Infinity;
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return Infinity;
  const deadline = submitted + expectedDays * 24 * 60 * 60 * 1000;
  return Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function MyAuditFindingsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const userId = profile?.id;

  const { data: findings = [], isLoading } = useMyFindings(userId);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [activeFinding, setActiveFinding] = useState<AuditFindingView | null>(null);

  const sortedFindings = useMemo(() => {
    const withDerived = findings.map((f) => ({
      finding: f,
      slaDays: slaDaysFallback(f.severity),
      daysLeft: daysRemaining(f.submitted_at, slaDaysFallback(f.severity)),
    }));
    // Severity asc-rank (red first), then SLA asc (lowest days-left first)
    return withDerived.sort((a, b) => {
      const sev = SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity];
      if (sev !== 0) return sev;
      return a.daysLeft - b.daysLeft;
    });
  }, [findings]);

  const overdueCount = sortedFindings.filter((s) => s.daysLeft < 0).length;
  const dueSoonCount = sortedFindings.filter((s) => s.daysLeft >= 0 && s.daysLeft < 3).length;

  function openClose(finding: AuditFindingView) {
    setActiveFinding(finding);
    setCloseDialogOpen(true);
  }

  return (
    <ContentLayout title="My Audit Findings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/audit">Audit</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>My Findings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">My Rectification Queue</h1>
          <p className="text-muted-foreground text-sm">
            Audit findings assigned to you for rectification. Sorted by severity and deadline.
          </p>
        </div>

        {/* Overdue banner (thrash T5 — in-app nudge) */}
        {(overdueCount > 0 || dueSoonCount > 0) && (
          <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="flex items-start gap-3 pt-4">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-900 dark:text-red-100">
                  Attention required
                </p>
                <p className="text-red-800 dark:text-red-200 mt-1">
                  {overdueCount > 0 && (
                    <>
                      <strong>{overdueCount}</strong> finding{overdueCount === 1 ? '' : 's'} past SLA.
                    </>
                  )}{' '}
                  {dueSoonCount > 0 && (
                    <>
                      <strong>{dueSoonCount}</strong> due within 3 days.
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Open findings{' '}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({sortedFindings.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {authLoading || isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !userId ? (
              <p className="text-sm text-muted-foreground">
                Sign in to view your rectification queue.
              </p>
            ) : sortedFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No findings assigned to you. Nothing to rectify.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedFindings.map(({ finding, slaDays }) => (
                  <div
                    key={finding.finding_id}
                    className="border rounded-md p-4 space-y-3 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SeverityBadge severity={finding.severity} />
                          <Badge variant="outline" className="text-xs capitalize">
                            {finding.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {finding.request_number ?? finding.finding_id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium">
                          <span className="font-mono text-xs mr-2 text-muted-foreground">
                            {finding.parameter_code}
                          </span>
                        </p>
                        {finding.form_data?.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {finding.form_data.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <SlaChip
                          submittedAt={finding.submitted_at}
                          expectedResolutionDays={slaDays}
                        />
                        <div className="flex gap-2">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                          >
                            <Link href={`/service-requests/${finding.finding_id}`}>
                              View detail
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openClose(finding)}
                            className="h-8 text-xs"
                            disabled={finding.status === 'closed'}
                          >
                            <Upload className="h-3.5 w-3.5 mr-1" />
                            Upload evidence
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CloseFindingDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        finding={activeFinding}
      />
    </ContentLayout>
  );
}
