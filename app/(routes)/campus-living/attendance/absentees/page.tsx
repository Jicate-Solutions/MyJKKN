'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { useHostelAttendance } from '@/hooks/campus-living/use-hostel-attendance';
import {
  ArrowLeft,
  Search,
  Loader2,
  UserX,
  AlertTriangle,
  Bell,
  Phone,
  Calendar,
  Download
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; icon: React.ReactNode }> = {
  critical: { label: 'Critical (3+ days)', variant: 'destructive', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  warning: { label: 'Warning (2+ days)', variant: 'default', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  normal: { label: 'Today', variant: 'secondary', icon: <UserX className="h-3.5 w-3.5" /> },
};

export default function AbsenteesPage() {
  const { profile } = useAuth();
  const { data: rawAbsentees, isLoading } = useHostelAttendance(profile?.institution_id ?? '', { status: 'absent' });
  const absentees = rawAbsentees as any;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredAbsentees = absentees?.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.roll.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const criticalCount = absentees?.filter((a) => a.status === 'critical').length ?? 0;
  const warningCount = absentees?.filter((a) => a.status === 'warning').length ?? 0;

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
            <Button variant="outline">
              <Bell className="mr-2 h-4 w-4" />
              Notify Parents
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Alert Indicators */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                {criticalCount} student(s) absent for 3+ consecutive days
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Parents and chief warden have been notified. Immediate attention required.
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
                <p className="text-2xl font-bold">{absentees?.length ?? 0}</p>
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
              placeholder="Search by name or roll number..."
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
                  <TableHead>Department</TableHead>
                  <TableHead>Block / Room</TableHead>
                  <TableHead className="text-center">Days Absent</TableHead>
                  <TableHead>Last Present</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAbsentees.map((student) => {
                  const sCfg = statusConfig[student.status];
                  return (
                    <TableRow key={student.id} className={student.status === 'critical' ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.roll}</p>
                        </div>
                      </TableCell>
                      <TableCell>{student.department}</TableCell>
                      <TableCell>
                        <p className="text-sm">{student.block}</p>
                        <p className="text-xs text-muted-foreground">Room {student.room}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${student.consecutive_days >= 3 ? 'text-red-600' : student.consecutive_days >= 2 ? 'text-amber-600' : ''}`}>
                          {student.consecutive_days}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{student.last_present}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {student.parent_notified && (
                            <Badge variant="outline" className="text-xs">
                              <Phone className="h-3 w-3 mr-1" /> Parent
                            </Badge>
                          )}
                          {student.warden_notified && (
                            <Badge variant="outline" className="text-xs">
                              <Bell className="h-3 w-3 mr-1" /> Warden
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant} className="flex items-center gap-1 w-fit">
                          {sCfg.icon}
                          {sCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          Contact
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredAbsentees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
