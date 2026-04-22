'use client';

// Warden / chief warden / hostel office queue of vacate requests.
// Filter by status (pending stages) and reason. Click row to open detail.

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useVacateRequests } from '@/hooks/campus-living/use-hostel-vacate';
import { ArrowRight, Loader2, Search, FileText } from 'lucide-react';
import type { VacateRequestStatus, VacateReason } from '@/types/hostel-vacate';

const statusVariant: Record<
  VacateRequestStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'outline',
  pending_parent: 'secondary',
  pending_warden: 'default',
  pending_chief: 'default',
  pending_dues: 'default',
  approved: 'default',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
};

const statusLabel: Record<VacateRequestStatus, string> = {
  draft: 'Draft',
  pending_parent: 'Parent OTP',
  pending_warden: 'Warden',
  pending_chief: 'Chief Warden',
  pending_dues: 'Dues',
  approved: 'Approved',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function VacateRequestsQueuePage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? '' : profile?.institution_id ?? '';

  const [statusFilter, setStatusFilter] = useState<VacateRequestStatus | 'all' | 'active'>('active');
  const [reasonFilter, setReasonFilter] = useState<VacateReason | 'all'>('all');
  const [search, setSearch] = useState('');

  const filters = statusFilter !== 'all' && statusFilter !== 'active'
    ? { status: statusFilter as VacateRequestStatus }
    : {};

  const { data, isLoading, error } = useVacateRequests(institutionId, filters);
  const rows = data?.data ?? [];

  // Client-side filter for 'active' + reason + search
  const filtered = rows.filter((r) => {
    if (statusFilter === 'active' && ['completed', 'rejected', 'cancelled'].includes(r.status)) {
      return false;
    }
    if (reasonFilter !== 'all' && r.reason_type !== reasonFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = r.learner_profile?.full_name ?? '';
      return (
        name.toLowerCase().includes(s) ||
        r.reason_text.toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Count by stage for the top-of-page KPIs
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <ContentLayout title='Vacate Requests'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Vacate Requests' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Vacate Requests</h1>
          <p className='text-sm text-muted-foreground'>
            Review and act on student / staff hostel vacate submissions. Your actions will
            advance the approval chain.
          </p>
        </div>

        {/* KPI row */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <KpiTile label='Parent OTP pending' value={counts.pending_parent ?? 0} variant='secondary' />
          <KpiTile label='Warden action' value={counts.pending_warden ?? 0} variant='default' />
          <KpiTile label='Chief warden action' value={counts.pending_chief ?? 0} variant='default' />
          <KpiTile label='Dues clearance' value={counts.pending_dues ?? 0} variant='default' />
        </div>

        {/* Filters */}
        <div className='flex flex-col sm:flex-row gap-2'>
          <div className='relative max-w-sm flex-1'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search name / reason text...'
              className='pl-9'
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='active'>Active (not closed)</SelectItem>
              <SelectItem value='all'>All statuses</SelectItem>
              <SelectItem value='pending_parent'>Parent OTP</SelectItem>
              <SelectItem value='pending_warden'>Warden</SelectItem>
              <SelectItem value='pending_chief'>Chief Warden</SelectItem>
              <SelectItem value='pending_dues'>Dues</SelectItem>
              <SelectItem value='approved'>Approved</SelectItem>
              <SelectItem value='completed'>Completed</SelectItem>
              <SelectItem value='rejected'>Rejected</SelectItem>
              <SelectItem value='cancelled'>Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as typeof reasonFilter)}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All reasons</SelectItem>
              <SelectItem value='medical'>Medical</SelectItem>
              <SelectItem value='graduation'>Graduation</SelectItem>
              <SelectItem value='withdrawal'>Withdrawal</SelectItem>
              <SelectItem value='transfer'>Transfer</SelectItem>
              <SelectItem value='voluntary'>Voluntary</SelectItem>
              <SelectItem value='semester_end'>Semester end</SelectItem>
              <SelectItem value='disciplinary'>Disciplinary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className='flex items-center justify-center min-h-[200px]'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        ) : error ? (
          <Card className='border-destructive'>
            <CardContent className='p-4 text-sm text-destructive'>
              Failed to load: {(error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resident</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested date</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className='flex flex-col'>
                          <span className='font-medium'>
                            {r.learner_profile?.full_name ?? 'Unknown'}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {r.learner_profile?.email ?? ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-1'>
                          <Badge variant='outline' className='capitalize w-fit'>
                            {r.reason_type.replace(/_/g, ' ')}
                          </Badge>
                          {r.has_medical_grounds && (
                            <Badge variant='destructive' className='w-fit text-xs'>
                              Medical
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-muted-foreground'>{r.requested_vacate_date}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? 'outline'}>
                          {statusLabel[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant='ghost' size='sm'>
                          <Link href={`/campus-living/vacate-requests/${r.id}`}>
                            View
                            <ArrowRight className='ml-1 h-3 w-3' />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center py-10 text-muted-foreground'>
                        <FileText className='h-8 w-8 mx-auto mb-2 opacity-40' />
                        No vacate requests match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function KpiTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <div className='flex items-baseline gap-2 mt-1'>
          <span className='text-2xl font-bold'>{value}</span>
          <Badge variant={variant}>&middot;</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
