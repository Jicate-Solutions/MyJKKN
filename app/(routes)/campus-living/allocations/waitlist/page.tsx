'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useHostelWaitlist, useCancelWaitlistUpgrade } from '@/hooks/campus-living/use-hostel-waitlist';
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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  waiting: { label: 'Waiting', variant: 'default' },
  offered: { label: 'Offered', variant: 'success' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'secondary' },
  expired: { label: 'Expired', variant: 'outline' },
  allocated: { label: 'Allocated', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const priorityConfig: Record<number, { label: string; color: string }> = {
  1: { label: 'High', color: 'text-red-600 bg-red-50' },
  2: { label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  3: { label: 'Low', color: 'text-blue-600 bg-blue-50' },
};

export default function WaitlistPage() {
  const { profile } = useAuth();
  const { data: waitlistResult, isLoading } = useHostelWaitlist(profile?.institution_id ?? '');
  const waitlist = waitlistResult?.data;
  const cancelUpgrade = useCancelWaitlistUpgrade();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('waiting');

  const filteredWaitlist = waitlist?.filter((w) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery.length === 0 ||
      w.learner_name.toLowerCase().includes(q) ||
      (w.roll_number ?? '').toLowerCase().includes(q) ||
      (w.notes ?? '').toLowerCase().includes(q);
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
          <Button
            onClick={() =>
              toast.info('Add-to-waitlist dialog ships next.', {
                description:
                  'Use the allocations module to create a new waitlist entry until the inline form is wired.',
              })
            }
          >
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
                <p className="text-2xl font-bold">{waitlist?.filter((w) => w.priority_score >= 80).length}</p>
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
                  <TableHead>Learner</TableHead>
                  <TableHead>Waiting for</TableHead>
                  <TableHead>Held room</TableHead>
                  <TableHead>Priority Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWaitlist.map((entry) => {
                  const sCfg = statusConfig[entry.status] ?? { label: entry.status, variant: 'outline' as const };
                  const priorityLevel = entry.priority_score >= 80 ? 1 : entry.priority_score >= 50 ? 2 : 3;
                  const pCfg = priorityConfig[priorityLevel] ?? { label: 'Normal', color: '' };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <p className="font-medium">{entry.learner_name}</p>
                        {entry.roll_number && (
                          <p className="text-xs text-muted-foreground">{entry.roll_number}</p>
                        )}
                        {(entry.institution_name || entry.semester_name) && (
                          <p className="text-xs text-muted-foreground/80">
                            {[entry.institution_name, entry.semester_name].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.target_category_name ? (
                          <span className="text-sm">
                            {entry.target_category_name}
                            {entry.target_category_type && (
                              <span className="text-xs text-muted-foreground"> ({entry.target_category_type})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm capitalize text-muted-foreground">{entry.preferred_room_type ?? 'Any'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {entry.held_room_number ? (
                          <div className="text-sm">
                            <span>
                              Room {entry.held_room_number}
                              {entry.held_room_floor != null ? ` · Floor ${entry.held_room_floor}` : ''}
                            </span>
                            {entry.held_block_name && (
                              <span className="block text-xs text-muted-foreground">{entry.held_block_name}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${pCfg.color}`}>{entry.priority_score} ({pCfg.label})</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{entry.notes ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {entry.status === 'waiting' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toast.info('Allocate-from-waitlist flow ships next.', {
                                  description: `Would open the allocation dialog for waitlist entry ${entry.id}.`,
                                })
                              }
                            >
                              Allocate
                            </Button>
                          )}
                          {entry.status === 'offered' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toast.info('Offer-confirm flow ships next.', {
                                  description: `Would mark waitlist entry ${entry.id} as accepted.`,
                                })
                              }
                            >
                              Confirm
                            </Button>
                          )}
                          {(entry.status === 'waiting' || entry.status === 'offered') && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  disabled={cancelUpgrade.isPending}
                                >
                                  Cancel
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel this upgrade request?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This reverts {entry.learner_name}&apos;s category back to the original,
                                    releases any held bed, and cancels the unpaid upgrade bill. This can&apos;t be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep request</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => cancelUpgrade.mutate(entry.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Cancel &amp; revert
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredWaitlist.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
