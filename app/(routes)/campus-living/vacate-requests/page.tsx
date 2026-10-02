'use client';

// Queue of vacate requests for every approver in the chain (principal, warden,
// mess in-charge, CAO) and the hostel office. RLS decides which rows each role
// sees. Filter by stage and reason. Click row to open detail.

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
import { useVacateRequests } from '@/hooks/campus-living/use-hostel-vacate';
import { ArrowRight, Loader2, Search, FileText } from 'lucide-react';
import { VACATE_STATUS_LABELS } from '@/types/hostel-vacate';
import type { VacateRequestStatus, VacateReason } from '@/types/hostel-vacate';

const statusVariant: Record<
  VacateRequestStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'outline',
  pending_parent: 'secondary',
  pending_dues: 'secondary',
  pending_principal: 'default',
  pending_warden: 'default',
  pending_mess: 'default',
  pending_cao: 'default',
  pending_fine: 'secondary',
  pending_chief: 'default',
  approved: 'default',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
};

const statusLabel = VACATE_STATUS_LABELS;

export default function VacateRequestsQueuePage() {
  // No client-side institution filter: a warden's access is a BLOCK grant (their
  // profile institution owns no block), so filtering on profile.institution_id
  // hid every request from them. RLS (view key + institution-or-block scope)
  // decides which rows come back.
  const institutionId = '';

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
            Bills are checked automatically, then the request goes to the Principal, the Warden
            (checklist and room inspection), the Mess In-charge and the CAO. Any damage is billed as a
            fine; once it is paid the bed is released and the learner becomes a Day Scholar. To raise a
            request for a resident, open their allocation.
          </p>
        </div>

        {/* KPI row */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <KpiTile label='Bills pending' value={counts.pending_dues ?? 0} variant='secondary' />
          <KpiTile
            label='With approvers'
            value={(counts.pending_principal ?? 0) + (counts.pending_warden ?? 0) + (counts.pending_mess ?? 0) + (counts.pending_cao ?? 0)}
            variant='default'
          />
          <KpiTile label='Awaiting fine' value={counts.pending_fine ?? 0} variant='secondary' />
          <KpiTile label='Vacated' value={counts.completed ?? 0} variant='success' />
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
            <SelectTrigger className='w-[220px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='active'>Active (not closed)</SelectItem>
              <SelectItem value='all'>All statuses</SelectItem>
              <SelectItem value='draft'>Draft</SelectItem>
              <SelectItem value='pending_dues'>Bills pending</SelectItem>
              <SelectItem value='pending_principal'>With Principal</SelectItem>
              <SelectItem value='pending_warden'>With Warden</SelectItem>
              <SelectItem value='pending_mess'>With Mess In-charge</SelectItem>
              <SelectItem value='pending_cao'>With CAO</SelectItem>
              <SelectItem value='pending_fine'>Awaiting fine payment</SelectItem>
              <SelectItem value='completed'>Vacated</SelectItem>
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
