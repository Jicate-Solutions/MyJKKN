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

export default async function PdeDemonstrationsInboxPage() {
  let pending: Awaited<ReturnType<typeof PDEValidatorService.listPending>> = [];
  let errorMessage: string | null = null;

  try {
    pending = await PDEValidatorService.listPending();
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
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.id}>
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
                      <TableCell className="text-right">
                        <Link
                          href={`/pde/admin/demonstrations/${row.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Validate →
                        </Link>
                      </TableCell>
                    </TableRow>
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
