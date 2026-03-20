'use client';

import { useState, useMemo } from 'react';
import {
  useBugReporterStats,
  useBugReports
} from '@/hooks/bug-reports/use-bug-reports';
import {
  BugReporterStats,
  BugReporterStatsSortField,
  BugReportCategory
} from '@/types/bugs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { BugCategoryBadge } from '@/components/bug-reporter/bug-category-badge';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Search,
  X,
  Users,
  Bug,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Mail,
  Building2,
  TrendingUp
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getInitials = (name: string | null): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

type BadgeInfo = { label: string; color: string } | null;

const getReporterBadge = (reporter: BugReporterStats): BadgeInfo => {
  if (reporter.resolved_count >= 5)
    return { label: 'Quality Reporter', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  if (reporter.total_bugs >= 10)
    return { label: 'Bug Hunter', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
  if (reporter.resolved_count === 0 && reporter.total_bugs >= 5)
    return { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' };
  return null;
};

const CATEGORY_LABELS: Record<BugReportCategory, string> = {
  bug: 'Bug',
  feature_request: 'Feature',
  ui_design: 'UI/Design',
  performance: 'Performance',
  security: 'Security',
  other: 'Other'
};

// ---------------------------------------------------------------------------
// Reporter detail content — lives inside the Sheet
// Separate component so useBugReports only mounts when the Sheet opens
// ---------------------------------------------------------------------------

function ReporterDetailContent({ reporter }: { reporter: BugReporterStats }) {
  const { data, isLoading } = useBugReports({
    reporter_user_id: reporter.reporter_user_id,
    limit: 50,
    page: 1
  });

  const bugs = data?.data ?? [];

  const categoryCounts = useMemo(() => {
    return bugs.reduce(
      (acc, bug) => {
        if (bug.category) acc[bug.category] = (acc[bug.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [bugs]);

  const rateColor =
    reporter.resolution_rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';

  return (
    <div className='space-y-6'>
      {/* Mini stat cards */}
      <div className='grid grid-cols-2 gap-3'>
        <div className='bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
          <div className='flex items-center gap-2 mb-1'>
            <Bug className='h-3.5 w-3.5 text-blue-500' />
            <span className='text-xs text-muted-foreground'>Total Submitted</span>
          </div>
          <p className='text-2xl font-bold'>{reporter.total_bugs}</p>
        </div>
        <div className='bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3'>
          <div className='flex items-center gap-2 mb-1'>
            <CheckCircle className='h-3.5 w-3.5 text-green-500' />
            <span className='text-xs text-muted-foreground'>Resolved</span>
          </div>
          <p className='text-2xl font-bold text-green-700 dark:text-green-400'>
            {reporter.resolved_count}
          </p>
        </div>
        <div className='bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3'>
          <div className='flex items-center gap-2 mb-1'>
            <Clock className='h-3.5 w-3.5 text-yellow-500' />
            <span className='text-xs text-muted-foreground'>Pending</span>
          </div>
          <p className='text-2xl font-bold'>
            {reporter.pending_count + reporter.in_progress_count}
          </p>
        </div>
        <div className='bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3'>
          <div className='flex items-center gap-2 mb-1'>
            <TrendingUp className='h-3.5 w-3.5 text-purple-500' />
            <span className='text-xs text-muted-foreground'>Resolution Rate</span>
          </div>
          <p className={`text-2xl font-bold ${rateColor}`}>
            {reporter.resolution_rate}%
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(categoryCounts).length > 0 && (
        <div>
          <p className='text-sm font-medium mb-2'>Category Breakdown</p>
          <div className='flex flex-wrap gap-1.5'>
            {(Object.entries(categoryCounts) as [BugReportCategory, number][]).map(
              ([cat, count]) => (
                <Badge key={cat} variant='outline' className='text-xs gap-1'>
                  <BugCategoryBadge category={cat} size='sm' />
                  <span>{CATEGORY_LABELS[cat] ?? cat} ({count})</span>
                </Badge>
              )
            )}
          </div>
        </div>
      )}

      {/* Bug list */}
      <div>
        <p className='text-sm font-medium mb-2'>
          Reports{bugs.length === 50 ? ' (showing latest 50)' : ` (${bugs.length})`}
        </p>
        {isLoading ? (
          <div className='space-y-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : bugs.length === 0 ? (
          <p className='text-sm text-muted-foreground py-4 text-center'>No reports found.</p>
        ) : (
          <div className='border rounded-md overflow-hidden'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-xs'>Bug ID</TableHead>
                  <TableHead className='text-xs'>Category</TableHead>
                  <TableHead className='text-xs'>Status</TableHead>
                  <TableHead className='text-xs'>Created</TableHead>
                  <TableHead className='w-8' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bugs.map((bug) => (
                  <TableRow key={bug.id} className='text-xs'>
                    <TableCell className='font-mono font-medium'>
                      {bug.display_id}
                    </TableCell>
                    <TableCell>
                      {bug.category ? (
                        <BugCategoryBadge category={bug.category} size='sm' />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          bug.status === 'resolved'
                            ? 'default'
                            : bug.status === 'wont_fix'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={`text-xs px-1.5 py-0.5 ${
                          bug.status === 'resolved'
                            ? 'bg-green-500 text-white'
                            : ''
                        }`}
                      >
                        {bug.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDistanceToNow(new Date(bug.created_at), {
                        addSuffix: true
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/bug-reports/${bug.id}`}
                        target='_blank'
                        className='text-muted-foreground hover:text-primary transition-colors'
                      >
                        <ExternalLink className='h-3.5 w-3.5' />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ReporterAnalyticsTabProps {
  institution_id?: string;
  department_id?: string;
}

export function ReporterAnalyticsTab({
  institution_id,
  department_id
}: ReporterAnalyticsTabProps) {
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<BugReporterStatsSortField>('total_bugs');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedReporter, setSelectedReporter] = useState<BugReporterStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useBugReporterStats({
    institution_id,
    department_id,
    sort_by: sortBy,
    sort_order: sortOrder,
    limit: 50
  });

  const reporters = data?.data ?? [];

  // Client-side name/email search within the already-fetched reporters list
  const filtered = useMemo(() => {
    if (!searchInput.trim()) return reporters;
    const q = searchInput.toLowerCase();
    return reporters.filter(
      (r) =>
        r.reporter_name?.toLowerCase().includes(q) ||
        r.reporter_email?.toLowerCase().includes(q)
    );
  }, [reporters, searchInput]);

  const handleSortToggle = (field: BugReporterStatsSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: BugReporterStatsSortField }) => {
    if (sortBy !== field) return <ArrowUpDown className='h-3 w-3 text-muted-foreground/50' />;
    return sortOrder === 'desc' ? (
      <ChevronDown className='h-3 w-3' />
    ) : (
      <ChevronUp className='h-3 w-3' />
    );
  };

  const openSheet = (reporter: BugReporterStats) => {
    setSelectedReporter(reporter);
    setSheetOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Users className='h-5 w-5' />
            Reporter Analytics
            {data?.metadata?.total != null && (
              <Badge variant='secondary' className='ml-1'>
                {data.metadata.total} reporters
              </Badge>
            )}
          </CardTitle>
          <div className='flex flex-wrap items-center gap-2 pt-1'>
            {/* Reporter search */}
            <div className='relative w-full sm:w-64'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                type='text'
                placeholder='Search by name or email...'
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className='pl-8 pr-8'
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className='absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors'
                >
                  <X className='h-4 w-4' />
                </button>
              )}
            </div>
            {/* Server-side sort */}
            <Select
              value={`${sortBy}:${sortOrder}`}
              onValueChange={(val) => {
                const [field, order] = val.split(':') as [
                  BugReporterStatsSortField,
                  'asc' | 'desc'
                ];
                setSortBy(field);
                setSortOrder(order);
              }}
            >
              <SelectTrigger className='w-full sm:w-52'>
                <SelectValue placeholder='Sort by...' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='total_bugs:desc'>Most Bugs Reported</SelectItem>
                <SelectItem value='total_bugs:asc'>Fewest Bugs Reported</SelectItem>
                <SelectItem value='resolved_count:desc'>Most Resolved</SelectItem>
                <SelectItem value='resolution_rate:desc'>Highest Resolution Rate</SelectItem>
                <SelectItem value='resolution_rate:asc'>Lowest Resolution Rate</SelectItem>
                <SelectItem value='last_reported_at:desc'>Most Recent Activity</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className='flex items-center gap-3'>
                  <Skeleton className='h-9 w-9 rounded-full' />
                  <Skeleton className='h-4 flex-1' />
                  <Skeleton className='h-4 w-12' />
                  <Skeleton className='h-4 w-12' />
                  <Skeleton className='h-4 w-12' />
                  <Skeleton className='h-4 w-16' />
                  <Skeleton className='h-4 w-12' />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 gap-3'>
              <Users className='h-10 w-10 text-muted-foreground/30' />
              {searchInput ? (
                <>
                  <p className='font-medium'>No reporters match &quot;{searchInput}&quot;</p>
                  <p className='text-sm text-muted-foreground'>
                    Try a different name or email address
                  </p>
                  <Button variant='ghost' size='sm' onClick={() => setSearchInput('')}>
                    Clear search
                  </Button>
                </>
              ) : (
                <>
                  <p className='font-medium'>No reporters yet</p>
                  <p className='text-sm text-muted-foreground'>
                    Analytics will appear once users start submitting bug reports.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reporter</TableHead>
                    <TableHead>
                      <button
                        className='flex items-center gap-1 hover:text-foreground transition-colors'
                        onClick={() => handleSortToggle('total_bugs')}
                      >
                        Total <SortIcon field='total_bugs' />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className='flex items-center gap-1 hover:text-foreground transition-colors'
                        onClick={() => handleSortToggle('resolved_count')}
                      >
                        Resolved <SortIcon field='resolved_count' />
                      </button>
                    </TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Won&apos;t Fix</TableHead>
                    <TableHead>
                      <button
                        className='flex items-center gap-1 hover:text-foreground transition-colors'
                        onClick={() => handleSortToggle('resolution_rate')}
                      >
                        Rate <SortIcon field='resolution_rate' />
                      </button>
                    </TableHead>
                    <TableHead>Top Category</TableHead>
                    <TableHead>
                      <button
                        className='flex items-center gap-1 hover:text-foreground transition-colors'
                        onClick={() => handleSortToggle('last_reported_at')}
                      >
                        Last Active <SortIcon field='last_reported_at' />
                      </button>
                    </TableHead>
                    <TableHead className='w-24' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((reporter) => {
                    const badge = getReporterBadge(reporter);
                    const pending =
                      reporter.pending_count + reporter.in_progress_count;
                    return (
                      <TableRow key={reporter.reporter_user_id}>
                        {/* Reporter cell */}
                        <TableCell className='min-w-[200px]'>
                          <div className='flex items-center gap-2'>
                            <Avatar className='h-8 w-8 shrink-0'>
                              {reporter.avatar_url && (
                                <AvatarImage src={reporter.avatar_url} />
                              )}
                              <AvatarFallback className='text-xs'>
                                {getInitials(reporter.reporter_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className='min-w-0'>
                              <div className='flex items-center gap-1.5 flex-wrap'>
                                <span className='font-medium text-sm truncate'>
                                  {reporter.reporter_name ?? 'Deleted User'}
                                </span>
                                {badge && (
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}
                                  >
                                    {badge.label}
                                  </span>
                                )}
                              </div>
                              <p className='text-xs text-muted-foreground truncate max-w-[160px]'>
                                {reporter.reporter_email ?? '—'}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Stats */}
                        <TableCell className='font-semibold'>
                          {reporter.total_bugs}
                        </TableCell>
                        <TableCell className='text-green-600 dark:text-green-400 font-medium'>
                          {reporter.resolved_count}
                        </TableCell>
                        <TableCell className='text-yellow-600 dark:text-yellow-400'>
                          {pending}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {reporter.wont_fix_count}
                        </TableCell>

                        {/* Resolution rate with mini progress bar */}
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <div className='w-14 bg-muted rounded-full h-1.5 hidden sm:block'>
                              <div
                                className='h-1.5 rounded-full bg-green-500'
                                style={{
                                  width: `${Math.min(100, reporter.resolution_rate)}%`
                                }}
                              />
                            </div>
                            <span
                              className={`text-xs font-mono ${
                                reporter.resolution_rate >= 50
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {reporter.resolution_rate}%
                            </span>
                          </div>
                        </TableCell>

                        {/* Top category */}
                        <TableCell>
                          {reporter.top_category ? (
                            <BugCategoryBadge
                              category={reporter.top_category}
                              size='sm'
                            />
                          ) : (
                            <span className='text-muted-foreground text-xs'>—</span>
                          )}
                        </TableCell>

                        {/* Last active */}
                        <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                          {reporter.last_reported_at
                            ? formatDistanceToNow(
                                new Date(reporter.last_reported_at),
                                { addSuffix: true }
                              )
                            : '—'}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <Button
                            variant='outline'
                            size='sm'
                            className='text-xs h-7'
                            onClick={() => openSheet(reporter)}
                          >
                            View Reports
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reporter detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side='right' className='w-full sm:w-[600px] sm:max-w-[600px] overflow-y-auto'>
          {selectedReporter && (
            <>
              <SheetHeader className='pb-4 border-b'>
                <div className='flex items-center gap-3'>
                  <Avatar className='h-12 w-12'>
                    {selectedReporter.avatar_url && (
                      <AvatarImage src={selectedReporter.avatar_url} />
                    )}
                    <AvatarFallback>
                      {getInitials(selectedReporter.reporter_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0'>
                    <SheetTitle className='text-left'>
                      {selectedReporter.reporter_name ?? 'Deleted User'}
                    </SheetTitle>
                    <SheetDescription className='text-left flex flex-col gap-0.5'>
                      {selectedReporter.reporter_email && (
                        <span className='flex items-center gap-1'>
                          <Mail className='h-3 w-3' />
                          {selectedReporter.reporter_email}
                        </span>
                      )}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className='pt-4'>
                <ReporterDetailContent reporter={selectedReporter} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
