'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  ArrowLeft,
  Search,
  Loader2,
  Users,
  Clock,
  ArrowUp,
  ArrowDown,
  UserPlus,
  CalendarClock
} from 'lucide-react';

// Placeholder data
const useWaitlist = (institutionId: string | null) => {
  return {
    data: [
      { id: 'w1', student_name: 'Sneha Gupta', roll_number: 'EC2025010', department: 'Electronics', preferred_block: 'Girls Hostel A', preferred_room_type: 'double', priority: 1, status: 'waiting', requested_date: '2026-01-15', position: 1, reason: 'New admission - Hosteller' },
      { id: 'w2', student_name: 'Amit Verma', roll_number: 'CS2025020', department: 'Computer Science', preferred_block: 'Boys Hostel A', preferred_room_type: 'triple', priority: 2, status: 'waiting', requested_date: '2026-01-16', position: 2, reason: 'Transfer from day scholar' },
      { id: 'w3', student_name: 'Pooja Nair', roll_number: 'IT2025005', department: 'IT', preferred_block: 'Girls Hostel B', preferred_room_type: 'double', priority: 1, status: 'waiting', requested_date: '2026-01-17', position: 3, reason: 'New admission - Hosteller' },
      { id: 'w4', student_name: 'Rohan Das', roll_number: 'ME2025008', department: 'Mechanical', preferred_block: 'Boys Hostel B', preferred_room_type: 'quad', priority: 3, status: 'offered', requested_date: '2026-01-10', position: 4, reason: 'Room upgrade request' },
      { id: 'w5', student_name: 'Lakshmi S', roll_number: 'CE2025015', department: 'Civil', preferred_block: 'Girls Hostel A', preferred_room_type: 'single', priority: 2, status: 'waiting', requested_date: '2026-01-18', position: 5, reason: 'New admission - Hosteller' },
      { id: 'w6', student_name: 'Arun M', roll_number: 'EC2025022', department: 'Electronics', preferred_block: 'Boys Hostel A', preferred_room_type: 'double', priority: 1, status: 'expired', requested_date: '2025-12-01', position: 6, reason: 'New admission - did not respond' },
    ],
    isLoading: false,
    error: null,
  };
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  waiting: { label: 'Waiting', variant: 'default' },
  offered: { label: 'Offered', variant: 'success' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'secondary' },
  expired: { label: 'Expired', variant: 'outline' },
  allocated: { label: 'Allocated', variant: 'success' },
};

const priorityConfig: Record<number, { label: string; color: string }> = {
  1: { label: 'High', color: 'text-red-600 bg-red-50' },
  2: { label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  3: { label: 'Low', color: 'text-blue-600 bg-blue-50' },
};

export default function WaitlistPage() {
  const { profile } = useAuth();
  const { data: waitlist, isLoading } = useWaitlist(profile?.institution_id ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('waiting');

  const filteredWaitlist = waitlist?.filter((w) => {
    const matchesSearch =
      w.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.roll_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  if (isLoading) {
    return (
      <ContentLayout title="Waitlist">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hostel Waitlist">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Waitlist' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/allocations">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Waitlist Management</h1>
              <p className="text-sm text-muted-foreground">
                Students waiting for hostel bed allocation
              </p>
            </div>
          </div>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add to Waitlist
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{waitlist?.filter((w) => w.status === 'waiting').length}</p>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{waitlist?.filter((w) => w.status === 'offered').length}</p>
                <p className="text-xs text-muted-foreground">Offered</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowUp className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{waitlist?.filter((w) => w.priority === 1).length}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CalendarClock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{waitlist?.filter((w) => w.status === 'expired').length}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
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
          <div className="flex gap-2 flex-wrap">
            {['all', 'waiting', 'offered', 'expired'].map((s) => (
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

        {/* Waitlist Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Preferred Block</TableHead>
                  <TableHead>Room Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWaitlist.map((entry) => {
                  const sCfg = statusConfig[entry.status] ?? { label: entry.status, variant: 'outline' as const };
                  const pCfg = priorityConfig[entry.priority] ?? { label: 'Normal', color: '' };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.position}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.student_name}</p>
                          <p className="text-xs text-muted-foreground">{entry.roll_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>{entry.department}</TableCell>
                      <TableCell>{entry.preferred_block}</TableCell>
                      <TableCell className="capitalize">{entry.preferred_room_type}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${pCfg.color}`}>{pCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.requested_date}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {entry.status === 'waiting' && (
                            <Button variant="outline" size="sm">
                              Allocate
                            </Button>
                          )}
                          {entry.status === 'offered' && (
                            <Button variant="outline" size="sm">
                              Confirm
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredWaitlist.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No waitlist entries found
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
