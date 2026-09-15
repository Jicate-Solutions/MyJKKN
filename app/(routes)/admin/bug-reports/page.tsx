'use client';

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  useBugReports,
  useUpdateBugReportStatus,
  useDeleteBugReport,
  useBulkDeleteBugReports,
  useBulkUpdateBugReportsStatus,
  useInstitutions,
  useDepartments,
  useBugReportStats,
  useBugModules,
  buildBugReportsQuery
} from '@/hooks/bug-reports/use-bug-reports';
import {
  ALL_BUG_STATUSES,
  BUG_STATUS_TABS,
  DEFAULT_BUG_STATUS_TAB,
  getBugStatusTab,
  isBugStatusTab,
  isIsoDate,
  isResolvedDateMode,
  monthRange,
  tabForStatus,
  type BugStatusTab,
  type ResolvedDateMode
} from '@/lib/utils/bug-reports/status-tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { BugReport, BugReportStatus, BugReportCategory, BugReportFilters } from '@/types/bugs';
import { MoreHorizontalIcon } from '@/components/icons';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { BugCategoryBadge } from '@/components/bug-reporter/bug-category-badge';
import { BugModuleBadge } from '@/components/bug-reporter/bug-module-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReporterAnalyticsTab } from './_components/reporter-analytics-tab';
import { ExportBugsDialog } from './_components/export-bugs-dialog';
import { MarkDuplicateDialog } from './_components/mark-duplicate-dialog';
import { BugGroupsTab } from './_components/bug-groups-tab';
import {
  Users,
  Bug,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Trophy,
  Search,
  X,
  Loader2,
  Layers,
  CalendarRange,
  Download,
  Eye,
  XCircle,
  Copy
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_LABELS: Record<BugReportStatus, string> = {
  new: 'New',
  seen: 'Seen',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  wont_fix: "Won't Fix",
  duplicate: 'Duplicate'
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

/** URL-backed page state: the list filters plus the status tab and resolved-date picker mode. */
type PageFilters = BugReportFilters & {
  tab: BugStatusTab;
  resolved_mode?: ResolvedDateMode;
};

/** Today's date in India time, as YYYY-MM-DD. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** YYYY-MM-DD -> "12 Sept 2026" */
function formatIsoDate(iso: string): string {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** "on 12 Sept 2026", "in September 2026", "between … and …", or "(all time)". */
function describeResolvedPeriod(
  mode: ResolvedDateMode,
  from: string | undefined,
  to: string | undefined
): string {
  if (mode === 'date' && from) return `on ${formatIsoDate(from)}`;
  if (mode === 'month' && from) {
    return `in ${MONTH_NAMES[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`;
  }
  if (from && to) return `between ${formatIsoDate(from)} and ${formatIsoDate(to)}`;
  if (from) return `on or after ${formatIsoDate(from)}`;
  if (to) return `on or before ${formatIsoDate(to)}`;
  return '(all time)';
}

const BugStatusBadge = ({ status }: { status: BugReportStatus }) => {
  const variant = {
    new: 'default',
    seen: 'secondary',
    in_progress: 'outline',
    resolved: 'default', // A 'success' variant would be better
    wont_fix: 'destructive',
    duplicate: 'outline'
  }[status] as 'default' | 'secondary' | 'destructive' | 'outline';

  const colorClass =
    status === 'resolved'
      ? 'bg-green-500 text-white'
      : status === 'duplicate'
      ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200'
      : '';

  return (
    <Badge
      variant={variant}
      className={`${colorClass} text-xs px-1 py-0.5 sm:px-2 sm:py-1`}
    >
      <span className='sm:hidden'>
        {status === 'in_progress' ? 'Progress' : status.replace(/_/g, ' ')}
      </span>
      <span className='hidden sm:inline'>{status.replace(/_/g, ' ')}</span>
    </Badge>
  );
};

// Statistics Card Component
const StatCard = ({
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
  trend = 'neutral',
  onClick,
  active = false
}: {
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  trend?: 'up' | 'down' | 'neutral';
  /** Makes the card a toggle button (e.g. filter the list by this card's status). */
  onClick?: () => void;
  active?: boolean;
}) => {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-100',
    green: 'bg-green-500 text-green-100',
    red: 'bg-red-500 text-red-100',
    yellow: 'bg-yellow-500 text-yellow-100',
    purple: 'bg-purple-500 text-purple-100'
  };

  const bgColorClasses = {
    blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
    green:
      'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
    red: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
    yellow:
      'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
    purple:
      'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800'
  };

  return (
    <Card
      className={`${bgColorClasses[color]} transition-all hover:shadow-lg ${
        onClick
          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          : ''
      } ${active ? 'ring-2 ring-primary shadow-lg' : ''}`}
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': active,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          }
        : {})}
    >
      <CardContent className='p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-sm font-medium text-muted-foreground'>{title}</p>
            <p className='text-2xl font-bold'>{value}</p>
            {change && (
              <div className='flex items-center mt-1'>
                {trend === 'up' && (
                  <TrendingUp className='w-4 h-4 text-green-500 mr-1' />
                )}
                {trend === 'down' && (
                  <TrendingDown className='w-4 h-4 text-red-500 mr-1' />
                )}
                <span
                  className={`text-sm ${
                    trend === 'up'
                      ? 'text-green-600'
                      : trend === 'down'
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {change}
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className='w-6 h-6' />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function AdminBugReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Derive filters from URL params so browser refresh preserves page + filter state
  const filters = useMemo<PageFilters>(() => {
    const status = (searchParams.get('status') as BugReportStatus) || undefined;
    const rawTab = searchParams.get('tab');
    // No tab in the URL: an old `?status=` link opens the tab holding that status.
    const tab: BugStatusTab = isBugStatusTab(rawTab)
      ? rawTab
      : tabForStatus(status) ?? DEFAULT_BUG_STATUS_TAB;
    const rawFrom = searchParams.get('resolved_from');
    const rawTo = searchParams.get('resolved_to');
    const resolvedFrom = tab === 'resolved' && isIsoDate(rawFrom) ? rawFrom : undefined;
    const resolvedTo = tab === 'resolved' && isIsoDate(rawTo) ? rawTo : undefined;
    const rawMode = searchParams.get('resolved_mode');
    const resolvedMode: ResolvedDateMode | undefined =
      tab !== 'resolved'
        ? undefined
        : isResolvedDateMode(rawMode)
        ? rawMode
        : resolvedFrom || resolvedTo
        ? 'range'
        : 'all_time';
    return {
      tab,
      page: Number(searchParams.get('page') ?? '1'),
      limit: Number(searchParams.get('limit') ?? '10'),
      status,
      category: (searchParams.get('category') as BugReportCategory) || undefined,
      institution_id: searchParams.get('institution_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      module_name: searchParams.get('module_name') || undefined,
      sub_module_name: searchParams.get('sub_module_name') || undefined,
      search: searchParams.get('search') || undefined,
      resolved_mode: resolvedMode,
      resolved_from: resolvedFrom,
      resolved_to: resolvedTo
    };
  }, [searchParams]);

  const activeTab = getBugStatusTab(filters.tab);
  // The only status of a one-status tab (New, Resolved): the dropdown is fixed to it.
  const singleStatusOfTab =
    activeTab.statuses?.length === 1 ? activeTab.statuses[0] : undefined;
  // A status outside the active tab (e.g. a hand-edited URL) is ignored, not ANDed into zero rows.
  const effectiveStatus =
    filters.status && (!activeTab.statuses || activeTab.statuses.includes(filters.status))
      ? filters.status
      : undefined;

  // What the list API actually receives: page filters narrowed to the active tab.
  const listFilters = useMemo<BugReportFilters>(() => {
    const { tab: _tab, resolved_mode: _mode, ...rest } = filters;
    return {
      ...rest,
      status: effectiveStatus,
      statuses: activeTab.statuses ?? undefined
    };
  }, [filters, effectiveStatus, activeTab]);

  // Mirror of the latest filters, updated synchronously on every write.
  // router.replace commits async, so consecutive updates (filter click +
  // pagination + search debounce) must compose against this ref instead of
  // the not-yet-committed URL — otherwise the later write drops the earlier
  // one's params (filters "resetting on their own").
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Write filter changes back to the URL; router.replace avoids polluting history
  const setFilters = useCallback(
    (updater: PageFilters | ((prev: PageFilters) => PageFilters)) => {
      const nf =
        typeof updater === 'function' ? updater(filtersRef.current) : updater;
      filtersRef.current = nf;
      const params = new URLSearchParams();
      // Always written: an omitted tab would be re-inferred from `status` on read.
      params.set('tab', nf.tab);
      if (nf.tab === 'resolved') {
        if (nf.resolved_mode && nf.resolved_mode !== 'all_time') {
          params.set('resolved_mode', nf.resolved_mode);
        }
        if (nf.resolved_from) params.set('resolved_from', nf.resolved_from);
        if (nf.resolved_to) params.set('resolved_to', nf.resolved_to);
      }
      if (nf.page && nf.page !== 1) params.set('page', String(nf.page));
      if (nf.limit && nf.limit !== 10) params.set('limit', String(nf.limit));
      if (nf.status) params.set('status', nf.status);
      if (nf.category) params.set('category', nf.category);
      if (nf.institution_id) params.set('institution_id', nf.institution_id);
      if (nf.department_id) params.set('department_id', nf.department_id);
      if (nf.module_name) params.set('module_name', nf.module_name);
      if (nf.sub_module_name) params.set('sub_module_name', nf.sub_module_name);
      if (nf.search) params.set('search', nf.search);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkStatusUpdateOpen, setBulkStatusUpdateOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] =
    useState<BugReportStatus>('seen');
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<BugReport | null>(null);
  // Seed from URL so the input reflects an already-active search on mount
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const { isSuperAdmin } = usePermissions();

  // Debounce search: update filters.search 300ms after the user stops typing.
  // Guard by VALUE (input vs last-written search) rather than a first-mount
  // ref: a ref guard leaks one write per mount under Strict Mode's double
  // effect invocation, which rewrote the URL with page:1 ~300ms after every
  // mount. Comparing values is idempotent — if the input already matches the
  // URL there is nothing to write, on mount or ever.
  useEffect(() => {
    if (searchInput.trim() === (filtersRef.current.search ?? '')) return;
    const timer = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        search: searchInput.trim() || undefined,
        page: 1
      }));
      setSelectedReports([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFilters]);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } =
    useBugReports(listFilters);
  const updateStatusMutation = useUpdateBugReportStatus();
  const deleteReportMutation = useDeleteBugReport();
  const bulkDeleteMutation = useBulkDeleteBugReports();
  const bulkUpdateStatusMutation = useBulkUpdateBugReportsStatus();

  // Filter data
  const { data: institutions } = useInstitutions();
  const { data: departments } = useDepartments(filters.institution_id);
  // Filter dropdown counts follow the active tab; "Export for AI" keeps counts for every status.
  const { data: modulesData, refetch: refetchTabModules } = useBugModules(
    activeTab.statuses ?? undefined
  );
  const { data: allModulesData } = useBugModules();
  const allModulesCount = (modulesData?.modules ?? []).reduce(
    (sum, mod) => sum + mod.count,
    0
  );

  // Scorecards follow the active tab (and the resolved date filter). The All
  // tab with no date filter is unscoped — the same query as the tab counts.
  const statsScope = useMemo(() => {
    if (!listFilters.statuses && !listFilters.resolved_from && !listFilters.resolved_to) {
      return undefined;
    }
    return {
      statuses: listFilters.statuses,
      resolved_from: listFilters.resolved_from,
      resolved_to: listFilters.resolved_to
    };
  }, [listFilters.statuses, listFilters.resolved_from, listFilters.resolved_to]);

  // Use dedicated stats endpoint for real-time accurate statistics
  const { data: statsData, refetch: refetchScopedStats } = useBugReportStats(statsScope);
  // Unscoped counts for the tab badges
  const { data: tabCountsData, refetch: refetchTabCounts } = useBugReportStats();

  const refetchStats = useCallback(() => {
    refetchScopedStats();
    if (statsScope) refetchTabCounts();
    // A status change moves bugs between tabs, so the tab's module counts change too.
    refetchTabModules();
  }, [refetchScopedStats, refetchTabCounts, refetchTabModules, statsScope]);

  const tabCounts: Record<BugStatusTab, number | undefined> = {
    new: tabCountsData?.newReports,
    in_progress: tabCountsData
      ? tabCountsData.seen +
        tabCountsData.inProgress +
        tabCountsData.wontFix +
        tabCountsData.duplicates
      : undefined,
    resolved: tabCountsData?.resolved,
    all: tabCountsData?.total
  };

  const handleStatusTabChange = useCallback(
    (value: string) => {
      if (!isBugStatusTab(value)) return;
      const next = getBugStatusTab(value);
      setFilters((prev) => ({
        ...prev,
        tab: value,
        // Keep the status dropdown only if the new tab still contains it
        status:
          prev.status && (!next.statuses || next.statuses.includes(prev.status))
            ? prev.status
            : undefined,
        resolved_mode: value === 'resolved' ? prev.resolved_mode : undefined,
        resolved_from: value === 'resolved' ? prev.resolved_from : undefined,
        resolved_to: value === 'resolved' ? prev.resolved_to : undefined,
        page: 1
      }));
      setSelectedReports([]);
    },
    [setFilters]
  );

  const setResolvedFilter = useCallback(
    (mode: ResolvedDateMode, from?: string, to?: string) => {
      setFilters((prev) => ({
        ...prev,
        resolved_mode: mode,
        resolved_from: from || undefined,
        resolved_to: to || undefined,
        page: 1
      }));
      setSelectedReports([]);
    },
    [setFilters]
  );

  const handleResolvedModeChange = (value: string) => {
    if (!isResolvedDateMode(value)) return;
    const today = todayInIndia();
    if (value === 'date') {
      setResolvedFilter('date', today, today);
    } else if (value === 'month') {
      const { from, to } = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
      setResolvedFilter('month', from, to);
    } else if (value === 'range') {
      setResolvedFilter('range', `${today.slice(0, 7)}-01`, today);
    } else {
      setResolvedFilter('all_time');
    }
  };

  const resolvedMode = filters.resolved_mode ?? 'all_time';
  const hasResolvedDateFilter = !!(listFilters.resolved_from || listFilters.resolved_to);
  const currentYear = Number(todayInIndia().slice(0, 4));
  const yearOptions = Array.from(
    { length: currentYear - 2024 + 1 },
    (_, i) => currentYear - i
  );
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  // Statistics from dedicated endpoint - no limit, real-time counts
  const statistics = useMemo(() => {
    if (!statsData) {
      return {
        total: 0,
        resolved: 0,
        inProgress: 0,
        newReports: 0,
        seen: 0,
        wontFix: 0,
        duplicates: 0,
        resolutionRate: '0.0',
        reportsTrend: { value: '0.0', direction: 'neutral' as const },
        recentReports: 0,
        previousReports: 0
      };
    }

    return {
      total: statsData.total,
      resolved: statsData.resolved,
      inProgress: statsData.inProgress,
      newReports: statsData.newReports,
      seen: statsData.seen,
      wontFix: statsData.wontFix,
      duplicates: statsData.duplicates,
      resolutionRate: statsData.resolutionRate,
      recentReports: statsData.recentReports,
      previousReports: statsData.previousReports,
      reportsTrend: statsData.reportsTrend
    };
  }, [statsData]);

  // In the Resolved tab every scoped bug is resolved, so a scoped rate is always
  // 100%. There the rate is resolved (in the date range, if any) out of ALL bugs.
  const resolutionRateTotal =
    filters.tab === 'resolved' ? tabCountsData?.total ?? 0 : statistics.total;
  const resolutionRateValue =
    filters.tab === 'resolved'
      ? resolutionRateTotal > 0
        ? ((statistics.resolved / resolutionRateTotal) * 100).toFixed(1)
        : '0.0'
      : statistics.resolutionRate;

  const handleStatusChange = useCallback(
    async (reportId: string, status: BugReportStatus) => {
      try {
        await updateStatusMutation.mutateAsync({ reportId, status });
        toast.success(`Report status changed to ${status.replace(/_/g, ' ')}.`);
        // invalidateQueries in onSuccess already triggers a background refetch;
        // calling refetch() here again races with it and can cause the pagination
        // display to jump. Let invalidateQueries handle it.
        refetchStats();
      } catch (err: any) {
        toast.error(err?.message || 'Could not update the report status.');
      }
    },
    [updateStatusMutation, refetchStats]
  );

  const handleDeleteReport = useCallback(async () => {
    if (!reportToDelete) return;

    try {
      await deleteReportMutation.mutateAsync(reportToDelete);
      toast.success('Bug Report Deleted');
      setDeleteConfirmOpen(false);
      setReportToDelete(null);
      refetchStats();
    } catch (err) {
      toast.error('Could not delete the bug report.');
    }
  }, [reportToDelete, deleteReportMutation, refetchStats]);

  const handleBulkDelete = useCallback(async () => {
    try {
      await bulkDeleteMutation.mutateAsync(selectedReports);
      toast.success(
        `${selectedReports.length} bug report(s) have been removed.`
      );
      setBulkDeleteConfirmOpen(false);
      setSelectedReports([]);
      refetchStats();
    } catch (err: any) {
      toast.error('Could not delete the selected bug reports.');
    }
  }, [selectedReports, bulkDeleteMutation, refetchStats]);

  const handleBulkStatusUpdate = useCallback(async () => {
    try {
      await bulkUpdateStatusMutation.mutateAsync({
        reportIds: selectedReports,
        status: bulkStatusValue
      });
      toast.success(
        `${
          selectedReports.length
        } bug report(s) status updated to ${bulkStatusValue.replace('_', ' ')}.`
      );
      setBulkStatusUpdateOpen(false);
      setSelectedReports([]);
      refetchStats();
    } catch (err: any) {
      toast.error('Could not update the status of selected bug reports.');
    }
  }, [
    selectedReports,
    bulkStatusValue,
    bulkUpdateStatusMutation,
    refetchStats
  ]);

  // Search is now server-side via filters.search — no client-side filtering needed
  const reports = data?.data ?? [];
  const metadata = data?.metadata;

  // Resolved report: every row matching the Resolved tab's current filters, as Excel.
  const handleDownloadResolvedReport = useCallback(async () => {
    setIsDownloadingReport(true);
    try {
      const pageSize = 1000;
      const rows: BugReport[] = [];
      let page = 1;
      let totalPages = 1;
      let expectedTotal = 0;
      do {
        const response = await fetch(
          `/api/bug-reports?${buildBugReportsQuery({ ...listFilters, page, limit: pageSize })}`
        );
        if (!response.ok) throw new Error('Could not load resolved bugs for the report.');
        const json = await response.json();
        rows.push(...(json.data ?? []));
        totalPages = json.metadata?.totalPages ?? 1;
        expectedTotal = json.metadata?.total ?? rows.length;
        page += 1;
      } while (page <= totalPages);

      // A server-side row cap below pageSize would silently drop rows; refuse a short report.
      if (rows.length < expectedTotal) {
        throw new Error(
          `Report incomplete: loaded ${rows.length} of ${expectedTotal} bugs. Please try again.`
        );
      }
      if (rows.length === 0) {
        toast.error('No resolved bugs match the selected filters.');
        return;
      }

      rows.sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));

      const period = describeResolvedPeriod(
        resolvedMode,
        listFilters.resolved_from,
        listFilters.resolved_to
      );
      const filterNotes: string[] = [];
      if (listFilters.institution_id) {
        filterNotes.push(
          `Institution: ${
            institutions?.find((i) => i.id === listFilters.institution_id)?.name ??
            listFilters.institution_id
          }`
        );
      }
      if (listFilters.department_id) {
        filterNotes.push(
          `Department: ${
            departments?.find((d) => d.id === listFilters.department_id)?.name ??
            listFilters.department_id
          }`
        );
      }
      if (listFilters.category) filterNotes.push(`Category: ${listFilters.category}`);
      if (listFilters.module_name) filterNotes.push(`Module: ${listFilters.module_name}`);
      if (listFilters.sub_module_name) {
        filterNotes.push(`Sub-module: ${listFilters.sub_module_name}`);
      }
      if (listFilters.search) filterNotes.push(`Search: ${listFilters.search}`);

      const summary: (string | number)[][] = [
        ['Resolved Bugs Report'],
        [],
        ['Resolved', period],
        ['Total resolved bugs', rows.length],
        ['Filters', filterNotes.length > 0 ? filterNotes.join('; ') : 'None'],
        ['Generated on', formatDateTime(new Date().toISOString())]
      ];
      if (hasResolvedDateFilter && (tabCountsData?.resolvedMissingDate ?? 0) > 0) {
        summary.push([
          'Note',
          `${tabCountsData?.resolvedMissingDate} resolved bugs have no resolved date recorded and are not included in a date-filtered report.`
        ]);
      }

      const bugRows = rows.map((bug) => ({
        'Bug ID': bug.display_id,
        Category: bug.category ?? '',
        Module: bug.module_name ?? '',
        'Sub-module': bug.sub_module_name ?? '',
        Reporter: bug.reporter?.full_name ?? '',
        'Reporter Email': bug.reporter?.email ?? '',
        Institution: bug.institution_name ?? '',
        Department: bug.department_name ?? '',
        Created: formatDateTime(bug.created_at),
        Resolved: formatDateTime(bug.resolved_at),
        Description: bug.description ?? '',
        'Page URL': bug.page_url ?? ''
      }));

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Summary');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bugRows), 'Resolved Bugs');

      const fileSuffix = hasResolvedDateFilter
        ? `${listFilters.resolved_from ?? 'start'}-to-${listFilters.resolved_to ?? todayInIndia()}`
        : `all-time-${todayInIndia()}`;
      XLSX.writeFile(workbook, `resolved-bugs-${fileSuffix}.xlsx`);
      toast.success(`Resolved report downloaded (${rows.length} bugs).`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not download the resolved report.');
    } finally {
      setIsDownloadingReport(false);
    }
  }, [
    listFilters,
    resolvedMode,
    hasResolvedDateFilter,
    institutions,
    departments,
    tabCountsData?.resolvedMissingDate
  ]);

  const handleSelectAll = useCallback(() => {
    if (selectedReports.length === reports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(reports.map((r) => r.id));
    }
  }, [selectedReports.length, reports]);

  const handleSelectReport = useCallback((reportId: string) => {
    setSelectedReports((prev) => {
      if (prev.includes(reportId)) {
        return prev.filter((id) => id !== reportId);
      } else {
        return [...prev, reportId];
      }
    });
  }, []);

  const columns: ColumnDef<BugReport>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () =>
          isSuperAdmin ? (
            <Checkbox
              checked={
                reports.length > 0 && selectedReports.length === reports.length
              }
              onCheckedChange={handleSelectAll}
              aria-label='Select all'
            />
          ) : null,
        cell: ({ row }) =>
          isSuperAdmin ? (
            <Checkbox
              checked={selectedReports.includes(row.original.id)}
              onCheckedChange={() => handleSelectReport(row.original.id)}
              aria-label='Select row'
            />
          ) : null,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
      {
        accessorKey: 'display_id',
        header: 'Bug ID',
        cell: ({ row }) => (
          <Link
            href={`/admin/bug-reports/${row.original.id}`}
            target='_blank'
            className='font-mono font-medium text-xs sm:text-sm hover:text-primary transition-colors hover:underline underline-offset-2'
          >
            {row.original.display_id}
          </Link>
        )
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => (
          <BugCategoryBadge category={row.original.category} size='sm' />
        )
      },
      {
        accessorKey: 'module_name',
        header: 'Module',
        cell: ({ row }) => (
          <BugModuleBadge
            module={row.original.module_name}
            subModule={row.original.sub_module_name}
            size='sm'
            stacked
          />
        )
      },
      {
        accessorKey: 'reporter',
        header: 'Reporter',
        cell: ({ row }) => {
          const reporter = row.original.reporter;
          return (
            <div className='text-xs sm:text-sm min-w-[120px]'>
              {reporter ? (
                <div>
                  <div className='font-medium text-gray-900 dark:text-gray-100'>
                    {reporter.full_name || 'Unknown User'}
                  </div>
                  <div className='text-gray-500 dark:text-gray-400 text-xs truncate max-w-[150px]'>
                    {reporter.email || 'No email'}
                  </div>
                </div>
              ) : (
                <div className='text-gray-500 dark:text-gray-400'>
                  <div>Unknown User</div>
                  <div className='text-xs'>No details</div>
                </div>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm'>
            <div className='sm:hidden'>
              {new Date(row.original.created_at).toLocaleDateString()}
            </div>
            <div className='hidden sm:block'>
              {new Date(row.original.created_at).toLocaleString()}
            </div>
          </div>
        )
      },
      {
        accessorKey: 'institution_name',
        header: 'Institution',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm min-w-[100px]'>
            {row.original.institution_name || 'N/A'}
          </div>
        )
      },
      {
        accessorKey: 'department_name',
        header: 'Department',
        cell: ({ row }) => (
          <div className='text-xs sm:text-sm min-w-[100px]'>
            {row.original.department_name || 'N/A'}
          </div>
        )
      },

      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className='flex flex-col items-start gap-0.5'>
            <BugStatusBadge status={row.original.status} />
            {(row.original.duplicate_count ?? 0) > 0 && (
              <Badge
                variant='outline'
                className='text-[10px] px-1 py-0 border-purple-300 text-purple-700 dark:text-purple-300'
              >
                {row.original.duplicate_count} dup
                {(row.original.duplicate_count ?? 0) > 1 ? 's' : ''}
              </Badge>
            )}
            {row.original.status === 'duplicate' &&
              row.original.duplicate_of_display_id && (
                <span className='text-[10px] text-muted-foreground'>
                  → {row.original.duplicate_of_display_id}
                </span>
              )}
          </div>
        )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className='text-right'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreHorizontalIcon className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/bug-reports/${row.original.id}`}>
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange(row.original.id, 'seen')}
                >
                  Mark as Seen
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'in_progress')
                  }
                >
                  Mark as In Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'resolved')
                  }
                >
                  Mark as Resolved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleStatusChange(row.original.id, 'wont_fix')
                  }
                >
                  {"Mark as Won't Fix"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDuplicateSource(row.original);
                    setDuplicateDialogOpen(true);
                  }}
                >
                  Mark as Duplicate…
                </DropdownMenuItem>
                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setReportToDelete(row.original.id);
                        setDeleteConfirmOpen(true);
                      }}
                      className='text-destructive focus:text-destructive'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      Delete Report
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      }
    ],
    [
      handleStatusChange,
      isSuperAdmin,
      selectedReports,
      handleSelectAll,
      handleSelectReport,
      reports
    ]
  );

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: newPageSize, page: 1 }));
  };

  return (
    <AdminPermissionGuard
      fallback={<div>You do not have permission to view this page.</div>}
      adminRoles={['super_admin', 'administrator', 'ceo']}
    >
      <ContentLayout title='Bug Reports Analytics'>
        <div className='space-y-6'>
          {/* Header */}
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                Bug Reports Dashboard
              </h1>
              <p className='text-muted-foreground'>
                Comprehensive analytics and management
              </p>
            </div>
            <div className='flex gap-2'>
              {selectedReports.length > 0 && (
                <>
                  <Button
                    variant='outline'
                    onClick={() => setBulkStatusUpdateOpen(true)}
                  >
                    Update Status ({selectedReports.length})
                  </Button>
                  {isSuperAdmin && (
                    <Button
                      variant='destructive'
                      onClick={() => setBulkDeleteConfirmOpen(true)}
                    >
                      <Trash2 className='w-4 h-4 mr-2' />
                      Delete Selected ({selectedReports.length})
                    </Button>
                  )}
                </>
              )}
              <ExportBugsDialog modules={allModulesData?.modules ?? []} />
              <Button asChild variant='outline'>
                <Link href='/bug-leaderboard'>
                  <Trophy className='w-4 h-4 mr-2' />
                  View Leaderboard
                </Link>
              </Button>
            </div>
          </div>

          {/* Statistics Cards: each status tab shows only the cards that mean something for it */}
          {filters.tab === 'new' && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <StatCard
                title='Total Reports'
                value={statistics.total}
                change={`${Math.abs(
                  parseFloat(statistics.reportsTrend.value)
                )}% vs last week`}
                icon={Bug}
                color='blue'
                trend={statistics.reportsTrend.direction}
              />
              <StatCard
                title='New Reports (This Week)'
                value={statistics.recentReports}
                change={`${statistics.previousReports} last week`}
                icon={AlertTriangle}
                color='red'
                trend={statistics.reportsTrend.direction}
              />
            </div>
          )}

          {filters.tab === 'in_progress' && (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              {(
                [
                  { status: 'seen', title: 'Seen', value: statistics.seen, icon: Eye, color: 'blue' },
                  { status: 'in_progress', title: 'In Progress', value: statistics.inProgress, icon: Clock, color: 'yellow' },
                  { status: 'wont_fix', title: "Won't Fix", value: statistics.wontFix, icon: XCircle, color: 'red' },
                  { status: 'duplicate', title: 'Duplicate', value: statistics.duplicates, icon: Copy, color: 'purple' }
                ] as const
              ).map((card) => (
                <StatCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  change={`${
                    statistics.total > 0
                      ? ((card.value / statistics.total) * 100).toFixed(1)
                      : '0.0'
                  }% of In-Progress`}
                  icon={card.icon}
                  color={card.color}
                  trend='neutral'
                  active={effectiveStatus === card.status}
                  // Click filters the list to this status; clicking the active card clears it.
                  onClick={() => {
                    setFilters((prev) => ({
                      ...prev,
                      status: prev.status === card.status ? undefined : card.status,
                      page: 1
                    }));
                    setSelectedReports([]);
                  }}
                />
              ))}
            </div>
          )}

          {filters.tab === 'resolved' && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <StatCard
                title='Total Resolved'
                value={statistics.total}
                change={`resolved ${describeResolvedPeriod(
                  resolvedMode,
                  listFilters.resolved_from,
                  listFilters.resolved_to
                )}`}
                icon={CheckCircle}
                color='blue'
                trend='neutral'
              />
              <StatCard
                title='Resolution Rate'
                value={`${resolutionRateValue}%`}
                change={`${statistics.resolved}/${resolutionRateTotal} resolved`}
                icon={CheckCircle}
                color='green'
                trend='up'
              />
            </div>
          )}

          {filters.tab === 'all' && (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard
              title='Total Reports'
              value={statistics.total}
              change={`${Math.abs(
                parseFloat(statistics.reportsTrend.value)
              )}% vs last week`}
              icon={Bug}
              color='blue'
              trend={statistics.reportsTrend.direction}
            />
            <StatCard
              title='Resolution Rate'
              value={`${resolutionRateValue}%`}
              change={`${statistics.resolved}/${resolutionRateTotal} resolved`}
              icon={CheckCircle}
              color='green'
              trend='up'
            />
            <StatCard
              title='In Progress'
              value={statistics.inProgress}
              change={`${
                statistics.total > 0
                  ? ((statistics.inProgress / statistics.total) * 100).toFixed(
                      1
                    )
                  : '0.0'
              }% of total`}
              icon={Clock}
              color='yellow'
              trend='neutral'
            />
            <StatCard
              title='New Reports'
              value={statistics.newReports}
              change={`${statistics.recentReports} this week`}
              icon={AlertTriangle}
              color='red'
              trend={statistics.reportsTrend.direction}
            />
          </div>
          )}

          {/* Tabs: Reports List + Reporter Analytics */}
          <Tabs defaultValue='reports'>
            {/* h-auto + flex-wrap: the three triggers total ~340px, wider than
                the card at 320px, and TabsTrigger is whitespace-nowrap — so a
                fixed-height row put "Groups" off the edge of the page. min-h-9
                keeps the desktop height identical to the default h-9. */}
            <TabsList className='h-auto min-h-9 flex-wrap'>
              <TabsTrigger value='reports' className='flex items-center gap-2'>
                <Bug className='w-4 h-4' />
                Reports List
              </TabsTrigger>
              <TabsTrigger value='reporters' className='flex items-center gap-2'>
                <Users className='w-4 h-4' />
                Reporter Analytics
              </TabsTrigger>
              <TabsTrigger value='groups' className='flex items-center gap-2'>
                <Layers className='w-4 h-4' />
                Groups
              </TabsTrigger>
            </TabsList>

            <TabsContent value='reports' className='space-y-4'>
          {/* Status tabs: narrow the list and the scorecards above */}
          <Tabs value={filters.tab} onValueChange={handleStatusTabChange}>
            <TabsList className='h-auto min-h-9 flex-wrap'>
              {BUG_STATUS_TABS.map((statusTab) => (
                <TabsTrigger
                  key={statusTab.value}
                  value={statusTab.value}
                  className='flex items-center gap-2'
                >
                  {statusTab.label}
                  <Badge variant='secondary' className='px-1.5 py-0 text-xs'>
                    {tabCounts[statusTab.value]?.toLocaleString() ?? '…'}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Card>
            <CardHeader className='w-full flex flex-col justify-between'>
              <CardTitle className='flex items-center gap-2 py-4'>
                <Users className='w-5 h-5' />
                Bug Reports List
              </CardTitle>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='w-full sm:w-auto md:w-72'>
                  <div className='relative'>
                    <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      type='text'
                      placeholder='Search by name or email...'
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className='pl-8 pr-8'
                    />
                    {/* Show spinner while refetching, clear button when input has value */}
                    {isFetching && !isLoading ? (
                      <Loader2 className='absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin' />
                    ) : searchInput ? (
                      <button
                        onClick={() => setSearchInput('')}
                        className='absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors'
                      >
                        <X className='h-4 w-4' />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={singleStatusOfTab ?? effectiveStatus ?? 'all'}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        status:
                          value === 'all'
                            ? undefined
                            : (value as BugReportStatus),
                        page: 1
                      }));
                      setSelectedReports([]);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by status...' />
                    </SelectTrigger>
                    <SelectContent>
                      {/* New / Resolved tabs hold one status, so "All Statuses" would mean the same thing */}
                      {!singleStatusOfTab && (
                        <SelectItem value='all'>All Statuses</SelectItem>
                      )}
                      {(activeTab.statuses ?? ALL_BUG_STATUSES).map((statusValue) => (
                        <SelectItem key={statusValue} value={statusValue}>
                          {STATUS_LABELS[statusValue]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.category || 'all'}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        category: value === 'all' ? undefined : (value as any),
                        page: 1
                      }));
                      setSelectedReports([]);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by category...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Categories</SelectItem>
                      <SelectItem value='bug'>Bug/Issue</SelectItem>
                      <SelectItem value='feature_request'>
                        Feature Request
                      </SelectItem>
                      <SelectItem value='ui_design'>UI/Design</SelectItem>
                      <SelectItem value='performance'>Performance</SelectItem>
                      <SelectItem value='security'>Security</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.institution_id || 'all'}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        institution_id: value === 'all' ? undefined : value,
                        department_id: undefined,
                        page: 1
                      }));
                      setSelectedReports([]);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by institution...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Institutions</SelectItem>
                      {institutions?.map((institution) => (
                        <SelectItem key={institution.id} value={institution.id}>
                          {institution.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.department_id || 'all'}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        department_id: value === 'all' ? undefined : value,
                        page: 1
                      }));
                      setSelectedReports([]);
                    }}
                    disabled={!filters.institution_id}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by department...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Departments</SelectItem>
                      {filters.institution_id &&
                        departments?.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='w-full sm:w-auto md:w-48'>
                  <Select
                    value={filters.module_name || 'all'}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        module_name: value === 'all' ? undefined : value,
                        sub_module_name: undefined,
                        page: 1
                      }));
                      setSelectedReports([]);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filter by module...' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        All Modules{modulesData ? ` (${allModulesCount})` : ''}
                      </SelectItem>
                      {modulesData?.modules.map((mod) => (
                        <SelectItem key={mod.name} value={mod.name}>
                          {mod.name} ({mod.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {filters.module_name && (() => {
                  const subModules = modulesData?.modules.find(
                    (m) => m.name === filters.module_name
                  )?.subModules ?? [];
                  if (subModules.length === 0) return null;
                  return (
                    <div className='w-full sm:w-auto md:w-52'>
                      <Select
                        value={filters.sub_module_name || 'all'}
                        onValueChange={(value) => {
                          setFilters((prev) => ({
                            ...prev,
                            sub_module_name: value === 'all' ? undefined : value,
                            page: 1
                          }));
                          setSelectedReports([]);
                        }}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='All sub-modules' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='all'>All Sub-modules</SelectItem>
                          {subModules.map((sub) => (
                            <SelectItem key={sub.name} value={sub.name}>
                              {sub.name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} ({sub.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}

                {/* Resolved tab only: filter by when the bug was resolved */}
                {filters.tab === 'resolved' && (
                  <>
                    <div className='w-full sm:w-auto md:w-56'>
                      <Select value={resolvedMode} onValueChange={handleResolvedModeChange}>
                        <SelectTrigger className='w-full' aria-label='Resolved date filter'>
                          <div className='flex items-center gap-2'>
                            <CalendarRange className='h-4 w-4 text-muted-foreground' />
                            <SelectValue placeholder='Resolved date' />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='all_time'>Resolved: All time</SelectItem>
                          <SelectItem value='date'>Resolved on a date</SelectItem>
                          <SelectItem value='month'>Resolved in a month</SelectItem>
                          <SelectItem value='range'>Resolved in a date range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {resolvedMode === 'date' && (
                      <div className='w-full sm:w-auto md:w-44'>
                        <Input
                          type='date'
                          aria-label='Resolved date'
                          value={filters.resolved_from ?? ''}
                          max={todayInIndia()}
                          onChange={(e) =>
                            setResolvedFilter('date', e.target.value, e.target.value)
                          }
                        />
                      </div>
                    )}

                    {resolvedMode === 'month' && (
                      <>
                        <div className='w-full sm:w-auto md:w-40'>
                          <Select
                            value={filters.resolved_from ? filters.resolved_from.slice(5, 7) : undefined}
                            onValueChange={(month) => {
                              const year = filters.resolved_from
                                ? Number(filters.resolved_from.slice(0, 4))
                                : currentYear;
                              const { from, to } = monthRange(year, Number(month));
                              setResolvedFilter('month', from, to);
                            }}
                          >
                            <SelectTrigger className='w-full' aria-label='Resolved month'>
                              <SelectValue placeholder='Month' />
                            </SelectTrigger>
                            <SelectContent>
                              {MONTH_NAMES.map((name, index) => (
                                <SelectItem
                                  key={name}
                                  value={String(index + 1).padStart(2, '0')}
                                >
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className='w-full sm:w-auto md:w-28'>
                          <Select
                            value={filters.resolved_from ? filters.resolved_from.slice(0, 4) : undefined}
                            onValueChange={(year) => {
                              const month = filters.resolved_from
                                ? Number(filters.resolved_from.slice(5, 7))
                                : Number(todayInIndia().slice(5, 7));
                              const { from, to } = monthRange(Number(year), month);
                              setResolvedFilter('month', from, to);
                            }}
                          >
                            <SelectTrigger className='w-full' aria-label='Resolved year'>
                              <SelectValue placeholder='Year' />
                            </SelectTrigger>
                            <SelectContent>
                              {yearOptions.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {resolvedMode === 'range' && (
                      <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
                        <Input
                          type='date'
                          aria-label='Resolved from'
                          className='w-full sm:w-44'
                          value={filters.resolved_from ?? ''}
                          max={filters.resolved_to ?? todayInIndia()}
                          onChange={(e) => {
                            const from = e.target.value;
                            // A start after the end would match nothing; pull the end along.
                            const to =
                              filters.resolved_to && from && from > filters.resolved_to
                                ? from
                                : filters.resolved_to;
                            setResolvedFilter('range', from, to);
                          }}
                        />
                        <span className='text-sm text-muted-foreground'>to</span>
                        <Input
                          type='date'
                          aria-label='Resolved to'
                          className='w-full sm:w-44'
                          value={filters.resolved_to ?? ''}
                          min={filters.resolved_from}
                          max={todayInIndia()}
                          onChange={(e) => {
                            const to = e.target.value;
                            const from =
                              filters.resolved_from && to && to < filters.resolved_from
                                ? to
                                : filters.resolved_from;
                            setResolvedFilter('range', from, to);
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {filters.tab === 'resolved' && (
                <div className='mt-2 flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='space-y-1'>
                    <p className='text-sm'>
                      <span className='text-lg font-bold'>
                        {isLoading || isPlaceholderData
                          ? '…'
                          : (metadata?.total ?? 0).toLocaleString()}
                      </span>{' '}
                      {(metadata?.total ?? 0) === 1 ? 'bug' : 'bugs'} resolved{' '}
                      {describeResolvedPeriod(
                        resolvedMode,
                        listFilters.resolved_from,
                        listFilters.resolved_to
                      )}
                    </p>
                    {hasResolvedDateFilter &&
                      (tabCountsData?.resolvedMissingDate ?? 0) > 0 && (
                        <p className='text-xs text-muted-foreground'>
                          {tabCountsData?.resolvedMissingDate.toLocaleString()} resolved
                          bugs have no resolved date recorded, so a date filter does not
                          include them.
                        </p>
                      )}
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className='shrink-0'
                    onClick={handleDownloadResolvedReport}
                    disabled={
                      isDownloadingReport ||
                      isLoading ||
                      isPlaceholderData ||
                      (metadata?.total ?? 0) === 0
                    }
                  >
                    {isDownloadingReport ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : (
                      <Download className='mr-2 h-4 w-4' />
                    )}
                    Download Resolved Report
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <div className='min-w-[800px]'>
                  <DataTable
                    columns={columns}
                    data={reports}
                    permissions={{
                      module: 'system.bugs',
                      actions: { view: true }
                    }}
                    onRefresh={refetch}
                    serverSidePagination={{
                      currentPage: filters.page ?? 1,
                      pageSize: filters.limit ?? 10,
                      totalPages: metadata?.totalPages ?? 1,
                      totalItems: metadata?.total ?? 0,
                      onPageChange: handlePageChange,
                      onPageSizeChange: handlePageSizeChange,
                      // Overlay during first load AND while previous-page
                      // placeholder rows are shown for an in-flight page change
                      isLoading: isLoading || (isPlaceholderData && isFetching),
                      hasPreviousPage: (filters.page ?? 1) > 1,
                      hasNextPage:
                        (filters.page ?? 1) < (metadata?.totalPages ?? 1)
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value='reporters'>
              <ReporterAnalyticsTab
                institution_id={filters.institution_id}
                department_id={filters.department_id}
              />
            </TabsContent>

            <TabsContent value='groups'>
              <BugGroupsTab />
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the bug
              report and remove any associated screenshot from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReport}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedReports.length} bug report
              {selectedReports.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected bug reports and remove any associated screenshots from
              storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Update Dialog */}
      <AlertDialog
        open={bulkStatusUpdateOpen}
        onOpenChange={setBulkStatusUpdateOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Update Status for {selectedReports.length} bug report
              {selectedReports.length > 1 ? 's' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Select the new status for the selected bug reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-4'>
            <label className='text-sm font-medium text-muted-foreground mb-2 block'>
              New Status
            </label>
            <Select
              value={bulkStatusValue}
              onValueChange={(value) =>
                setBulkStatusValue(value as BugReportStatus)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select status...' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='new'>New</SelectItem>
                <SelectItem value='seen'>Seen</SelectItem>
                <SelectItem value='in_progress'>In Progress</SelectItem>
                <SelectItem value='resolved'>Resolved</SelectItem>
                <SelectItem value='wont_fix'>Won&apos;t Fix</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkStatusUpdate}
              disabled={bulkUpdateStatusMutation.isPending}
            >
              {bulkUpdateStatusMutation.isPending
                ? 'Updating...'
                : 'Update Status'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark-as-Duplicate Dialog */}
      <MarkDuplicateDialog
        open={duplicateDialogOpen}
        onOpenChange={(open) => {
          setDuplicateDialogOpen(open);
          if (!open) setDuplicateSource(null);
        }}
        sourceBug={duplicateSource}
        onMarked={() => refetchStats()}
      />
    </AdminPermissionGuard>
  );
}

export default function AdminBugReportsPage() {
  return (
    <Suspense
      fallback={
        <div className='flex items-center justify-center h-40'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      }
    >
      <AdminBugReportsContent />
    </Suspense>
  );
}
