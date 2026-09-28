'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useAllHostelAttendance } from '@/hooks/campus-living/use-hostel-attendance';
import { absenteeWindowStart, buildAbsenteeRows, type AbsenteeTier } from '@/lib/campus-living/absentee-rows';
import {
  ArrowLeft,
  Search,
  Loader2,
  UserX,
  AlertTriangle,
  Bell,
  Calendar,
  Download
} from 'lucide-react';

const statusConfig: Record<AbsenteeTier, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; icon: React.ReactNode }> = {
  critical: { label: 'Critical (3+ days)', variant: 'destructive', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  warning: { label: 'Warning (2+ days)', variant: 'default', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  normal: { label: 'Today', variant: 'secondary', icon: <UserX className="h-3.5 w-3.5" /> },
};

export default function AbsenteesPage() {
  const { profile } = useAuth();
  // BUG-006210: the raw attendance rows carry evening_status, not the page's
  // `status` / `name` / `consecutive_days`. Read EVERY record of the last
  // ABSENTEE_WINDOW_DAYS days (all statuses, all pages — a super admin sees every
  // college), then build one row per resident absent on their block's latest
  // marked day.
  const [windowStart] = useState(() => absenteeWindowStart(new Date()));
  const { data: attendance, isLoading } = useAllHostelAttendance(profile?.institution_id ?? '', {
    date_from: windowStart,
  });
  const absentees = buildAbsenteeRows(attendance?.data ?? [], windowStart);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const q = searchQuery.toLowerCase();
  const filteredAbsentees = absentees.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || a.tier === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const criticalCount = absentees.filter((a) => a.tier === 'critical').length;
  const warningCount = absentees.filter((a) => a.tier === 'warning').length;

  if (isLoading) {
    return (
      <ContentLayout title="Absentees">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Absentees">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance', href: '/campus-living/attendance' },
          { label: 'Absentees' },
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
              <h1 className="text-2xl font-bold py-1">Absentee List</h1>
              <p className="text-sm text-muted-foreground">
                Students absent from hostel without approved leave
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                toast.info('Bulk parent notification ships next.', {
                  description:
                    'Will send SMS / WhatsApp / email blast to parents of all absentees once notification engine is wired.',
                })
              }
            >
              <Bell className="mr-2 h-4 w-4" />
              Notify Parents
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.info('Absentee export ships next.', {
                  description: 'CSV download will be available once export endpoint is live.',
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {attendance?.truncated && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Showing the first {attendance.data.length} of {attendance.count} attendance records. Narrow by college to see everyone.
          </p>
        )}

        {/* Alert Indicators */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                {criticalCount} student(s) absent for 3+ consecutive days
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Follow up with these residents and their parents.
              </p>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-red-200">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
                <p className="text-xs text-muted-foreground">Critical (3+ days)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold text-amber-600">{warningCount}</p>
                <p className="text-xs text-muted-foreground">Warning (2 days)</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <UserX className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{absentees.length}</p>
                <p className="text-xs text-muted-foreground">Total Absent Today</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'critical', 'warning', 'normal'].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead className="text-center">Days Absent</TableHead>
                  <TableHead>Absent Since</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAbsentees.map((resident) => {
                  const sCfg = statusConfig[resident.tier];
                  return (
                    <TableRow key={resident.learnerId} className={resident.tier === 'critical' ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{resident.name}</p>
                          {resident.email && <p className="text-xs text-muted-foreground">{resident.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{resident.block ?? '—'}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${resident.consecutiveDays >= 3 ? 'text-red-600' : resident.consecutiveDays >= 2 ? 'text-amber-600' : ''}`}>
                          {resident.consecutiveDays}{resident.atLeast ? '+' : ''}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{resident.absentSince}</TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant} className="flex items-center gap-1 w-fit">
                          {sCfg.icon}
                          {sCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toast.info('Contact action ships next.', {
                              description: `Would open the contact dialog (call / WhatsApp / SMS) for ${resident.name}.`,
                            })
                          }
                        >
                          Contact
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredAbsentees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No absentees found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
