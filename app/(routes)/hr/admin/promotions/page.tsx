'use client';

/**
 * /hr/admin/promotions — review queue (T5.2)
 * Surfaces all submitted promotion applications grouped by lifecycle state.
 * SEDC reviewers score 'submitted' rows; Director decides on 'sedc_scored' rows.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  PromotionApplication,
  PromotionStatus,
} from '@/lib/services/hr/promotion-service';

const STATUS_LABELS: Record<PromotionStatus, string> = {
  submitted: 'Awaiting SEDC',
  sedc_scored: 'Awaiting Director',
  director_decided: 'Director Decided',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_VARIANT: Record<PromotionStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'secondary',
  sedc_scored: 'default',
  director_decided: 'default',
  approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function PromotionReviewQueuePage() {
  const [applications, setApplications] = useState<PromotionApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/hr/promotions?pageSize=100');
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Load failed' }));
          throw new Error(err.error ?? 'Load failed');
        }
        const json = (await res.json()) as { data: PromotionApplication[] };
        if (!cancelled) setApplications(json.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingSedc = applications.filter((a) => a.status === 'submitted');
  const pendingDirector = applications.filter((a) => a.status === 'sedc_scored');
  const decided = applications.filter((a) =>
    ['approved', 'rejected', 'withdrawn', 'director_decided'].includes(a.status)
  );

  return (
    <SuperAdminOnly>
    <ContentLayout title="HR Promotion Review Queue">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Promotions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <QueueSection
          title="Awaiting SEDC scoring"
          subtitle="Applicants have submitted; SEDC reviewers need to enter merit + qualification + commitment scores."
          applications={pendingSedc}
          loading={loading}
          error={error}
        />
        <QueueSection
          title="Awaiting Director decision"
          subtitle="SEDC has scored; Director must approve or reject."
          applications={pendingDirector}
          loading={loading}
          error={null}
        />
        <QueueSection
          title="Decided / Closed"
          subtitle="Approved, rejected, or withdrawn applications."
          applications={decided}
          loading={loading}
          error={null}
        />
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}

function QueueSection({
  title,
  subtitle,
  applications,
  loading,
  error,
}: {
  title: string;
  subtitle: string;
  applications: PromotionApplication[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          {title}
          <Badge variant="outline">{applications.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && applications.length === 0 && (
          <p className="text-sm text-muted-foreground">No applications in this state.</p>
        )}
        {!loading && applications.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Total Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(a.submitted_at)}</TableCell>
                  <TableCell>
                    {a.from_designation_name} → {a.to_designation_name}
                  </TableCell>
                  <TableCell>
                    {a.total_score !== null && a.total_score !== undefined
                      ? a.total_score
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/hr/admin/promotions/${a.id}`}
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      Open
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
