'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
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
import { useOnboardingChecklists } from '@/hooks/campus-living/use-onboarding';
import {
  Search,
  Loader2,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  SkipForward,
  AlertCircle,
  Settings2,
  Eye,
} from 'lucide-react';
import type { OnboardingStatus } from '@/types/campus-living';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  not_started: { label: 'Not Started', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'outline' },
};

// Helper to safely access joined Supabase relations
const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

// Helper to get nested joined data (e.g. hostel_allocations -> hostel_blocks -> name)
const getNestedJoined = (row: any, relation: string, nested: string, field: string): string =>
  row?.[relation]?.[nested]?.[field] ?? '';

export default function OnboardingListPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filters = statusFilter !== 'all' ? { status: statusFilter as OnboardingStatus } : undefined;
  const { data: checklistsResult, isLoading } = useOnboardingChecklists(institutionId, filters);
  const checklists = checklistsResult?.data ?? [];

  const filteredChecklists = checklists.filter((c: any) => {
    if (!searchQuery) return true;
    const studentName = getJoined(c, 'profiles', 'full_name');
    const blockName = getNestedJoined(c, 'hostel_allocations', 'hostel_blocks', 'name');
    const roomNumber = getNestedJoined(c, 'hostel_allocations', 'hostel_rooms', 'room_number');
    const query = searchQuery.toLowerCase();
    return (
      studentName.toLowerCase().includes(query) ||
      blockName.toLowerCase().includes(query) ||
      roomNumber.toLowerCase().includes(query)
    );
  });

  // Summary counts (from all checklists, not filtered)
  const allChecklists = checklistsResult?.data ?? [];
  const pendingCount = allChecklists.filter((c: any) => c.status === 'not_started').length;
  const inProgressCount = allChecklists.filter((c: any) => c.status === 'in_progress').length;
  const completedCount = allChecklists.filter((c: any) => c.status === 'completed').length;
  const skippedCount = allChecklists.filter((c: any) => c.status === 'skipped').length;

  if (isLoading) {
    return (
      <ContentLayout title="Student Onboarding">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Student Onboarding">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Onboarding' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Student Onboarding</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track onboarding progress for all hostel residents
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/campus-living/allocations/onboarding/templates">
              <Settings2 className="mr-2 h-4 w-4" />
              Manage Templates
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{inProgressCount}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <SkipForward className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{skippedCount}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by student, block, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'not_started', 'in_progress', 'completed', 'skipped'].map((s) => (
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
        </div>

        {/* Checklists Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChecklists.map((checklist: any) => {
                  const sCfg = statusConfig[checklist.status] ?? { label: checklist.status, variant: 'outline' as const };
                  const studentName = getJoined(checklist, 'profiles', 'full_name') || 'Unknown';
                  const blockName = getNestedJoined(checklist, 'hostel_allocations', 'hostel_blocks', 'name');
                  const roomNumber = getNestedJoined(checklist, 'hostel_allocations', 'hostel_rooms', 'room_number');
                  const bedNumber = getNestedJoined(checklist, 'hostel_allocations', 'hostel_beds', 'bed_number');

                  const items = checklist.items ?? [];
                  const totalItems = items.length;
                  const doneItems = items.filter((i: any) => i.status === 'done').length;
                  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

                  return (
                    <TableRow key={checklist.id}>
                      <TableCell className="font-medium">{studentName}</TableCell>
                      <TableCell>{blockName || '-'}</TableCell>
                      <TableCell>{roomNumber || '-'}</TableCell>
                      <TableCell>{bedNumber || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-[60px] h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {doneItems}/{totalItems}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {checklist.started_at
                          ? new Date(checklist.started_at).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {checklist.completed_at
                          ? new Date(checklist.completed_at).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/allocations/onboarding/${checklist.id}`}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredChecklists.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ClipboardCheck className="h-10 w-10 text-muted-foreground/50" />
                        <p>No onboarding checklists found</p>
                        <p className="text-xs">Checklists are created automatically when students are allocated beds</p>
                      </div>
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
