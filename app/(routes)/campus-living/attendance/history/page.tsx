'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useHostelAttendance } from '@/hooks/campus-living/use-hostel-attendance';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import {
  ArrowLeft,
  Search,
  Loader2,
  Download,
  X,
} from 'lucide-react';

// Render-shape fix (2026-05-15): the page previously rendered an aggregated
// `{date, block, total, present, absent, on_leave, late, rate}` shape but
// `HostelAttendanceService.getAttendance` returns raw rows joined with
// `learner` + `block` relations. Columns are aligned to what the service
// actually emits — one row per (learner, date) — matching the "Last 5
// attendance entries" pattern in the residents detail drawer that deep-links
// here via `?learner=<id>`. Originally flagged by Agent H on 2026-05-10 as
// an out-of-scope finding alongside PR #853.

type AttendanceStatus = 'present' | 'absent' | 'on_leave' | 'late_entry' | 'medical';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  on_leave: 'On leave',
  late_entry: 'Late entry',
  medical: 'Medical',
};

function statusBadgeVariant(status: AttendanceStatus | null | undefined) {
  switch (status) {
    case 'present':
      return 'success' as const;
    case 'absent':
      return 'destructive' as const;
    case 'on_leave':
      return 'default' as const;
    case 'late_entry':
      return 'outline' as const;
    case 'medical':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function StatusBadge({ status }: { status: AttendanceStatus | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Badge variant={statusBadgeVariant(status)} className="text-xs">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export default function AttendanceHistoryPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const learnerId = searchParams.get('learner') ?? undefined;
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filters = {
    ...(selectedBlock !== 'all' ? { block_id: selectedBlock } : {}),
    ...(fromDate ? { date_from: fromDate } : {}),
    ...(toDate ? { date_to: toDate } : {}),
    ...(learnerId ? { learner_id: learnerId } : {}),
  };
  const { data: rawData, isLoading } = useHostelAttendance(profile?.institution_id ?? '', filters);
  // Tolerant unwrap — service is `{data, count}` but be defensive about
  // future-shape drift since this page already burned us once.
  const raw = rawData as any;
  const records: any[] = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw)
      ? raw
      : [];
  const totalCount: number = typeof raw?.count === 'number' ? raw.count : records.length;

  const { data: blockListData } = useHostelBlocks(profile?.institution_id ?? '');
  const blockList = blockListData as any;
  const blocks = [
    { id: 'all', name: 'All Blocks' },
    ...((blockList?.data ?? []).map((b: any) => ({ id: b.id, name: b.name }))),
  ];

  // Local search across learner name / email / remarks. Date + block + learner
  // filters are pushed to Supabase via `filters` above; this client-side pass
  // is a UX assist, not a security filter.
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      const name = (r?.learner?.full_name ?? '').toLowerCase();
      const email = (r?.learner?.email ?? '').toLowerCase();
      const remarks = (r?.remarks ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || remarks.includes(q);
    });
  }, [records, searchQuery]);

  // First-row learner label powers the "Filtered to learner X" chip when the
  // page is opened via the residents drawer deep-link.
  const learnerLabel = learnerId
    ? records[0]?.learner?.full_name ?? records[0]?.learner?.email ?? learnerId
    : null;

  if (isLoading) {
    return (
      <ContentLayout title="Attendance History">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const hasActiveFilters =
    selectedBlock !== 'all' || !!fromDate || !!toDate || !!searchQuery || !!learnerId;

  return (
    <ContentLayout title="Attendance History">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance', href: '/campus-living/attendance' },
          { label: 'History' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/attendance">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Attendance History</h1>
              <p className="text-sm text-muted-foreground">
                Per-learner attendance records with date-range and block filters
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              toast.info('Attendance-history CSV export ships next.', {
                description: 'CSV download will be available once the export endpoint is live.',
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Deep-link chip when arrived via ?learner=… */}
        {learnerId && (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Filtered to learner:</span>
            <span className="font-medium">{learnerLabel}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 ml-auto" asChild>
              <Link href="/campus-living/attendance/history">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Link>
            </Button>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1.5">
                <Label>Block</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Learner name, email, or remarks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead className="text-center">Evening</TableHead>
                  <TableHead className="text-center">Morning</TableHead>
                  <TableHead className="text-center">Late (mins)</TableHead>
                  <TableHead className="text-center">Curfew</TableHead>
                  <TableHead>Marked By</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record: any) => (
                  <TableRow key={record?.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {record?.date ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {record?.learner?.full_name ?? '—'}
                        </span>
                        {record?.learner?.email && (
                          <span className="text-xs text-muted-foreground">
                            {record.learner.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {record?.block?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={record?.evening_status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={record?.morning_status} />
                    </TableCell>
                    <TableCell className="text-center text-orange-600">
                      {record?.late_minutes ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {record?.is_curfew_violation ? (
                        <Badge variant="destructive" className="text-xs">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {record?.marker?.full_name ?? (record?.marked_by ? 'Unknown' : '—')}
                        </span>
                        {(record?.updated_at ?? record?.created_at) && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(record.updated_at ?? record.created_at).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {record?.remarks ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10">
                      {hasActiveFilters ? (
                        <div className="text-center text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">No matching records</p>
                          <p className="text-sm">
                            Clear the filters or pick a different date range to see all attendance history.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center space-y-3">
                          <p className="font-medium text-foreground">No attendance history yet</p>
                          <p className="text-sm text-muted-foreground max-w-md">
                            History appears here once attendance has been marked. Mark attendance for a block first, then return here to view and filter past records.
                          </p>
                          <Button asChild size="sm" className="mt-1">
                            <Link href="/campus-living/attendance/mark">
                              Mark attendance
                            </Link>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Footer count */}
        {filteredRecords.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing {filteredRecords.length}
            {searchQuery && records.length !== filteredRecords.length
              ? ` of ${records.length}`
              : ''}{' '}
            {totalCount > records.length ? `(${totalCount} total)` : ''}{' '}
            record{filteredRecords.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
