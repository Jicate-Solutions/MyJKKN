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
import { useHostelAllocations } from '@/hooks/campus-living/use-hostel-allocations';
import {
  Plus,
  Search,
  BedDouble,
  Loader2,
  Users,
  ArrowRightLeft,
  LogOut,
  Filter,
  Download,
  UserCheck
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  active: { label: 'Active', variant: 'success' },
  vacated: { label: 'Vacated', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'outline' },
  suspended: { label: 'Suspended', variant: 'destructive' },
};

const feeStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partial', variant: 'default' },
  pending: { label: 'Pending', variant: 'destructive' },
  waived: { label: 'Waived', variant: 'outline' },
};

export default function AllocationsPage() {
  const { profile } = useAuth();
  const { data: allocations, isLoading } = useHostelAllocations(profile?.institution_id ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [blockFilter, setBlockFilter] = useState<string>('all');

  const filteredAllocations = allocations?.filter((a) => {
    const matchesSearch =
      a.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.room_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesBlock = blockFilter === 'all' || a.block_name === blockFilter;
    return matchesSearch && matchesStatus && matchesBlock;
  }) ?? [];

  const blockNames = [...new Set(allocations?.map((a) => a.block_name) ?? [])];

  if (isLoading) {
    return (
      <ContentLayout title="Allocations">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hostel Allocations">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Hostel Allocations</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage student bed allocations across all blocks
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/allocations/roommate-matching">
                <Users className="mr-2 h-4 w-4" />
                Roommate Matching
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/allocations/new">
                <Plus className="mr-2 h-4 w-4" />
                Allocate Bed
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <UserCheck className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{allocations?.filter((a) => a.status === 'active').length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowRightLeft className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{allocations?.filter((a) => a.allocation_type === 'transfer').length}</p>
                <p className="text-xs text-muted-foreground">Transfers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <LogOut className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{allocations?.filter((a) => a.status === 'vacated').length}</p>
                <p className="text-xs text-muted-foreground">Vacated</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BedDouble className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{allocations?.filter((a) => a.fee_status === 'pending').length}</p>
                <p className="text-xs text-muted-foreground">Fee Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, roll number, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'active', 'vacated', 'transferred', 'suspended'].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : statusConfig[s]?.label ?? s}
              </Button>
            ))}
          </div>
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
          >
            <option value="all">All Blocks</option>
            {blockNames.map((bn) => (
              <option key={bn} value={bn}>{bn}</option>
            ))}
          </select>
        </div>

        {/* Allocations Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllocations.map((alloc) => {
                  const sCfg = statusConfig[alloc.status] ?? { label: alloc.status, variant: 'outline' as const };
                  const fCfg = feeStatusConfig[alloc.fee_status] ?? { label: alloc.fee_status, variant: 'outline' as const };
                  return (
                    <TableRow key={alloc.id}>
                      <TableCell className="font-medium">{alloc.student_name}</TableCell>
                      <TableCell className="text-muted-foreground">{alloc.roll_number}</TableCell>
                      <TableCell>{alloc.department}</TableCell>
                      <TableCell>{alloc.block_name}</TableCell>
                      <TableCell>{alloc.room_number}</TableCell>
                      <TableCell>{alloc.bed_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{alloc.allocation_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={fCfg.variant}>{fCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/allocations/${alloc.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredAllocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No allocations found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/campus-living/allocations/waitlist">
              <Users className="mr-2 h-4 w-4" />
              View Waitlist
            </Link>
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
