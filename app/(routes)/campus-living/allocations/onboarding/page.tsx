'use client';

/**
 * Hosteller Onboarding — list of per-learner onboarding checklists.
 *
 * Lists in-progress + completed + not-started checklists for the active
 * institution, with per-row progress, learner name, status badge, and a
 * "create checklist" CTA. Click a row → drawer with item ticks + notes +
 * delete.
 *
 * Substrate (lib/services/campus-living/hostel-onboarding-service.ts) wires
 * directly to the live prod tables hostel_onboarding_checklists +
 * hostel_onboarding_templates. No migrations.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardCheck,
  FileStack,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingChecklists } from '@/hooks/campus-living/use-hostel-onboarding';
import {
  computeChecklistProgress,
  type OnboardingChecklistWithJoins,
  type OnboardingStatus,
} from '@/types/campus-living/onboarding';
import { CreateChecklistDialog } from './_components/create-checklist-dialog';
import { ChecklistDetailDrawer } from './_components/checklist-detail-drawer';

const statusBadge: Record<
  OnboardingStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  not_started: { label: 'Not started', variant: 'outline' },
  in_progress: { label: 'In progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'secondary' },
};

type StatusFilter = OnboardingStatus | 'all';

export default function CampusLivingOnboardingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const { data: checklists, isLoading } = useOnboardingChecklists(institutionId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<OnboardingChecklistWithJoins | null>(
    null,
  );

  const counts = useMemo(() => {
    const c = {
      total: checklists?.length ?? 0,
      not_started: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
    };
    for (const row of checklists ?? []) c[row.status] += 1;
    return c;
  }, [checklists]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (checklists ?? []).filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!term) return true;
      const name = row.learner?.full_name?.toLowerCase() ?? '';
      const email = row.learner?.email?.toLowerCase() ?? '';
      return (
        name.includes(term) ||
        email.includes(term) ||
        row.learner_id.toLowerCase().includes(term)
      );
    });
  }, [checklists, search, statusFilter]);

  if (!institutionId) {
    return (
      <ContentLayout title="Hosteller Onboarding">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Onboarding' },
          ]}
        />
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Pick an institution to view its onboarding checklists.
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hosteller Onboarding">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Onboarding' },
        ]}
      />

      <div className="container mx-auto p-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              Hosteller Onboarding
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Structured first-week checklist for every new hosteller — ID
              verification, room inspection, mess registration, induction.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/campus-living/allocations/onboarding/templates">
              <Button variant="outline" size="sm">
                <FileStack className="h-4 w-4 mr-1" />
                Templates
              </Button>
            </Link>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New checklist
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total" value={counts.total} />
          <SummaryCard label="In progress" value={counts.in_progress} accent />
          <SummaryCard label="Completed" value={counts.completed} />
          <SummaryCard label="Not started" value={counts.not_started} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All checklists</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by learner name, email, or id"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="border border-dashed rounded-md p-10 text-center text-muted-foreground text-sm">
                {checklists?.length === 0
                  ? 'No onboarding checklists yet. Click “New checklist” to start one for an active allocation.'
                  : 'No checklists match the current filters.'}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => {
                      const items = Array.isArray(row.items) ? row.items : [];
                      const progress = computeChecklistProgress(items);
                      const badge = statusBadge[row.status];
                      const learnerName =
                        row.learner?.full_name ??
                        `Learner ${row.learner_id.slice(0, 8)}`;
                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => setActive(row)}
                        >
                          <TableCell>
                            <div className="font-medium">{learnerName}</div>
                            {row.learner?.email && (
                              <div className="text-xs text-muted-foreground">
                                {row.learner.email}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <Progress value={progress} className="h-2" />
                            <div className="text-xs text-muted-foreground mt-1">
                              {progress}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.started_at
                              ? new Date(row.started_at).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {items.filter((i) => i.completed).length} /{' '}
                            {items.length}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateChecklistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
      />
      <ChecklistDetailDrawer
        checklist={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        institutionId={institutionId}
      />
    </ContentLayout>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={`text-2xl font-semibold mt-1 ${
            accent ? 'text-primary' : ''
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
