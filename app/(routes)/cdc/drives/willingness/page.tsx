'use client';

/**
 * /cdc/drives/willingness — sidebar entry point for the willingness tracker.
 * Lists drives that have (or had) a willingness window and links each to its
 * assigned-learner view at /cdc/drives/[id]/willingness.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, Search, Users } from 'lucide-react';
import { useCdcDrives, useCdcLookups } from '@/hooks/cdc/use-cdc-drives';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';
import { DriveStatusBadge } from '../_components/drive-status-badge';
import { describeTargeting } from '../_components/institution-semester-picker';

export const navMeta = { icon: 'Users' };

const TRACKED_STATUSES: CdcDriveStatus[] = [
  'willingness_open',
  'eligibility_locked',
  'attendance_day',
  'results_announced',
  'closed',
];

export default function CdcDrivesWillingnessIndexPage() {
  // Learners have no tracker; their assigned drives live at /cdc/drives.
  const router = useRouter();
  const { profile, isLoading } = useAuth();
  const isLearner = !!profile?.learner_id && profile.role === 'student';
  useEffect(() => {
    if (!isLoading && isLearner) router.replace('/cdc/drives');
  }, [isLoading, isLearner, router]);
  if (isLoading || isLearner) {
    return (
      <ContentLayout title="Willingness Tracker">
        <p className="text-sm text-muted-foreground p-6">Loading…</p>
      </ContentLayout>
    );
  }
  return (
    <PermissionGuard module="cdc.drives" action="willingness.view">
      <IndexContent />
    </PermissionGuard>
  );
}

function IndexContent() {
  const [status, setStatus] = useState<string>('willingness_open');
  const [search, setSearch] = useState('');
  const { data: lookups } = useCdcLookups();
  const { data, isLoading, error } = useCdcDrives({
    status: status === 'all' ? TRACKED_STATUSES : (status as CdcDriveStatus),
    search: search.trim() || undefined,
    pageSize: 100,
  });
  const recruiterName = new Map((lookups?.recruiters ?? []).map((r) => [r.id, r.name]));
  const drives = data?.data ?? [];

  return (
    <ContentLayout title="Willingness Tracker">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc/drives">Drives</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Willingness Tracker</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" /> Willingness Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a drive to see every assigned learner, who has responded, and who is still pending.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 md:grid-cols-3 pt-6">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tracked statuses</SelectItem>
                {TRACKED_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CDC_DRIVE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative md:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search drives…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading drives…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : drives.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No drives in this status.</p>
                <p className="text-xs text-muted-foreground">Drives appear here once willingness has been opened.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Drive</TableHead>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Audience</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drives.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          <Link href={`/cdc/drives/${d.id}`} className="hover:underline">
                            {d.title}
                          </Link>
                        </TableCell>
                        <TableCell>{recruiterName.get(d.recruiter_id) ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {describeTargeting(d.institution_semesters ?? [], d.institutions.length)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {d.willingness_window_close_at
                            ? new Date(d.willingness_window_close_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <DriveStatusBadge status={d.status} />
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/cdc/drives/${d.id}/willingness`}>
                              Willingness <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
