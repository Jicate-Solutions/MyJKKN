// app/(routes)/users/activity/page.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import {
  useActivityLogs,
  useActivityMetrics,
  useActivityFilters
} from '@/hooks/use-activity';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Search,
  Users,
  Activity,
  Clock,
  TrendingUp,
  Eye,
  Shield,
  AlertTriangle,
  Info,
  X,
  LogIn,
  LogOut,
  Plus,
  Edit,
  Trash2,
  Upload,
  Clipboard,
  BarChart3
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ACTIVITY_TYPES,
  RESOURCE_TYPES,
  ACTIVITY_SEVERITY,
  UserActivityLogWithUser
} from '@/types/activity';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/utils/export-utils';

// Engagement Analytics imports
import { EngagementFilters } from '@/components/analytics/engagement-filters';
import { StudentEngagementTable } from '@/components/analytics/student-engagement-table';
import { AtRiskModal } from '@/components/analytics/at-risk-modal';
import { StudentDetailModal } from '@/components/analytics/student-detail-modal';
import { SectionComparisonTable } from '@/components/analytics/section-comparison-table';
import { LoginTrendChart } from '@/components/analytics/charts/login-trend-chart';
import { EngagementDistributionChart } from '@/components/analytics/charts/engagement-distribution-chart';
import { HierarchicalBreakdownChart } from '@/components/analytics/charts/hierarchical-breakdown-chart';
import { EngagementComparisonChart } from '@/components/analytics/charts/engagement-comparison-chart';
import { EngagementHeatmap } from '@/components/analytics/charts/engagement-heatmap';
import { EngagementRadialChart } from '@/components/analytics/charts/engagement-radial-chart';
import { useEngagementMetrics } from '@/hooks/analytics/use-engagement-metrics';
import { useAtRiskStudents } from '@/hooks/analytics/use-at-risk-students';
import { useHierarchyData } from '@/hooks/analytics/use-hierarchy-data';
import type { OrganizationalLevel, EngagementLevel } from '@/types/analytics';

const SEVERITY_COLORS = {
  [ACTIVITY_SEVERITY.LOW]: 'bg-green-100 text-green-800',
  [ACTIVITY_SEVERITY.MEDIUM]: 'bg-blue-100 text-blue-800',
  [ACTIVITY_SEVERITY.HIGH]: 'bg-yellow-100 text-yellow-800',
  [ACTIVITY_SEVERITY.CRITICAL]: 'bg-red-100 text-red-800'
};

const ACTION_ICONS = {
  [ACTIVITY_TYPES.LOGIN]: LogIn,
  [ACTIVITY_TYPES.LOGOUT]: LogOut,
  [ACTIVITY_TYPES.CREATE]: Plus,
  [ACTIVITY_TYPES.UPDATE]: Edit,
  [ACTIVITY_TYPES.DELETE]: Trash2,
  [ACTIVITY_TYPES.VIEW]: Eye,
  [ACTIVITY_TYPES.UPLOAD]: Upload,
  [ACTIVITY_TYPES.DOWNLOAD]: Download,
  default: Clipboard
};

const ACTION_ICON_COLORS = {
  [ACTIVITY_TYPES.LOGIN]: 'text-green-600',
  [ACTIVITY_TYPES.LOGOUT]: 'text-red-600',
  [ACTIVITY_TYPES.CREATE]: 'text-blue-600',
  [ACTIVITY_TYPES.UPDATE]: 'text-yellow-600',
  [ACTIVITY_TYPES.DELETE]: 'text-red-600',
  [ACTIVITY_TYPES.VIEW]: 'text-gray-600',
  [ACTIVITY_TYPES.UPLOAD]: 'text-purple-600',
  [ACTIVITY_TYPES.DOWNLOAD]: 'text-indigo-600',
  default: 'text-gray-500'
};

export default function ActivityPage() {
  // React Query client for cache invalidation
  const queryClient = useQueryClient();

  // Activity Logs state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('activity');

  // Engagement Analytics state
  const [engagementFilters, setEngagementFilters] = useState<{
    level: OrganizationalLevel;
    id: string;
    dateFrom: string;
    dateTo: string;
  } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showAtRiskModal, setShowAtRiskModal] = useState(false);
  const [showStudentDetailModal, setShowStudentDetailModal] = useState(false);

  // All hooks must be called before any early returns
  const {
    filters,
    updateFilter,
    removeFilter,
    clearFilters,
    hasActiveFilters
  } = useActivityFilters();

  // Add search to filters
  const finalFilters = useMemo(
    () => ({
      ...filters,
      search: searchQuery || undefined
    }),
    [filters, searchQuery]
  );

  const {
    data: activityData,
    loading: activityLoading,
    error: activityError,
    refresh: refreshActivity
  } = useActivityLogs({
    filters: finalFilters,
    page: currentPage,
    limit: pageSize,
    sortBy,
    sortOrder
  });

  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
    refresh: refreshMetrics
  } = useActivityMetrics({
    period: selectedPeriod as 'day' | 'week' | 'month' | 'year'
  });

  // Engagement Analytics hooks
  const {
    data: engagementMetrics,
    isLoading: engagementLoading,
    error: engagementError,
    refetch: refetchEngagementMetrics
  } = useEngagementMetrics({
    level: engagementFilters?.level || 'institution',
    id: engagementFilters?.id || '',
    dateFrom: engagementFilters?.dateFrom,
    dateTo: engagementFilters?.dateTo,
    enabled: activeTab === 'engagement' && !!engagementFilters?.id
  });

  const {
    data: atRiskStudents,
    isLoading: atRiskLoading,
    refetch: refetchAtRiskStudents
  } = useAtRiskStudents({
    level: engagementFilters?.level || 'institution',
    id: engagementFilters?.id || '',
    enabled: activeTab === 'engagement' && !!engagementFilters?.id
  });

  // Hierarchy data for advanced charts
  const {
    data: hierarchyData,
    isLoading: hierarchyLoading
  } = useHierarchyData({
    level: engagementFilters?.level === 'institution' ? 'department' :
           engagementFilters?.level === 'department' ? 'program' :
           engagementFilters?.level === 'program' ? 'semester' :
           engagementFilters?.level === 'semester' ? 'section' : 'all',
    parentId: engagementFilters?.id,
    enabled: activeTab === 'engagement' && !!engagementFilters?.id
  });

  // Permission checking - temporarily allow all users to test data
  const hasViewPermission = true; // For testing - remove this later
  const hasExportPermission = true; // For testing - remove this later
  const hasAnalyticsPermission = true; // For testing - remove this later

  // Debug logging

  const handleRefresh = () => {
    refreshActivity();
    refreshMetrics();
  };

  // Engagement Analytics handlers
  const handleRefreshEngagement = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all engagement-related queries to force fresh data
      await queryClient.invalidateQueries({ queryKey: ['engagement-metrics'] });
      await queryClient.invalidateQueries({ queryKey: ['at-risk-students'] });

      // Now refetch
      await Promise.all([
        refetchEngagementMetrics(),
        refetchAtRiskStudents()
      ]);
    } catch (error) {
      console.error('[ActivityPage] Error refreshing engagement data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, refetchEngagementMetrics, refetchAtRiskStudents]);

  const handleStudentClick = (studentId: string) => {
    setSelectedStudentId(studentId);
    setShowStudentDetailModal(true);
  };

  const handleAtRiskClick = () => {
    setShowAtRiskModal(true);
  };

  // Prepare chart data for engagement analytics
  const loginTrendData = useMemo(() => {
    if (!engagementMetrics?.trends) return [];
    return engagementMetrics.trends.map((trend) => ({
      date: trend.date,
      logins: trend.total_logins,
      uniqueUsers: trend.unique_users
    }));
  }, [engagementMetrics]);

  const engagementDistributionData = useMemo(() => {
    if (!engagementMetrics) return [];
    const levels: EngagementLevel[] = ['high', 'medium', 'low', 'at_risk'];
    const total =
      (engagementMetrics.high_engagement_count || 0) +
      (engagementMetrics.medium_engagement_count || 0) +
      (engagementMetrics.low_engagement_count || 0) +
      (engagementMetrics.at_risk_count || 0);

    return levels
      .map((level) => {
        const countKey = `${level === 'at_risk' ? 'at_risk' : level + '_engagement'}_count` as keyof typeof engagementMetrics;
        const count = (engagementMetrics[countKey] as number) || 0;
        return {
          level,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0
        };
      })
      .filter((item) => item.count > 0);
  }, [engagementMetrics]);

  const handleExport = async () => {
    try {
      const response = await fetch('/api/activity/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: finalFilters,
          columns: [
            'timestamp',
            'user_name',
            'user_email',
            'action_type',
            'resource_type',
            'resource_name',
            'description',
            'ip_address',
            'status_code'
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download =
        response.headers
          .get('Content-Disposition')
          ?.split('filename=')[1]
          ?.replace(/"/g, '') || 'activity-logs.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      // You could add a toast notification here
    }
  };

  const getSeverityBadge = (actionType: string, statusCode?: number) => {
    const severity = getSeverity(actionType, statusCode);
    return (
      <Badge
        variant='outline'
        className={SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS]}
      >
        {severity}
      </Badge>
    );
  };

  const getSeverity = (actionType: string, statusCode?: number): string => {
    // Critical actions
    const criticalActions = [
      ACTIVITY_TYPES.SECURITY_VIOLATION,
      ACTIVITY_TYPES.UNAUTHORIZED_ACCESS,
      ACTIVITY_TYPES.SUSPICIOUS_ACTIVITY,
      ACTIVITY_TYPES.USER_DELETE,
      ACTIVITY_TYPES.DELETE
    ];

    if (criticalActions.includes(actionType as any)) {
      return ACTIVITY_SEVERITY.CRITICAL;
    }

    // High severity actions
    const highSeverityActions = [
      ACTIVITY_TYPES.PASSWORD_CHANGE,
      ACTIVITY_TYPES.ROLE_ASSIGN,
      ACTIVITY_TYPES.PERMISSIONS_UPDATE,
      ACTIVITY_TYPES.USER_CREATE,
      ACTIVITY_TYPES.USER_UPDATE
    ];

    if (highSeverityActions.includes(actionType as any)) {
      return ACTIVITY_SEVERITY.HIGH;
    }

    // Medium severity actions
    const mediumSeverityActions = [
      ACTIVITY_TYPES.LOGIN,
      ACTIVITY_TYPES.LOGOUT,
      ACTIVITY_TYPES.CREATE,
      ACTIVITY_TYPES.UPDATE,
      ACTIVITY_TYPES.UPLOAD
    ];

    if (mediumSeverityActions.includes(actionType as any)) {
      return ACTIVITY_SEVERITY.MEDIUM;
    }

    // Check status codes
    if (statusCode) {
      if ([500, 502, 503, 504].includes(statusCode)) {
        return ACTIVITY_SEVERITY.HIGH;
      }
      if ([400, 401, 403, 404, 422].includes(statusCode)) {
        return ACTIVITY_SEVERITY.MEDIUM;
      }
    }

    return ACTIVITY_SEVERITY.LOW;
  };

  const getActionIcon = (actionType: string) => {
    const IconComponent =
      ACTION_ICONS[actionType as keyof typeof ACTION_ICONS] ||
      ACTION_ICONS.default;
    const colorClass =
      ACTION_ICON_COLORS[actionType as keyof typeof ACTION_ICON_COLORS] ||
      ACTION_ICON_COLORS.default;
    return <IconComponent className={`h-4 w-4 ${colorClass}`} />;
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  // Define columns for DataTable
  const columns: PermissionColumnDef<UserActivityLogWithUser, any>[] = [
    {
      id: 'icon',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className='flex justify-center'>
          {getActionIcon(row.original.action_type)}
        </div>
      )
    },
    {
      id: 'created_at',
      header: 'Time',
      enableSorting: true,
      cell: ({ row }) => (
        <div className='font-mono text-sm'>
          {formatDateTime(row.original.created_at)}
        </div>
      )
    },
    {
      id: 'user',
      header: 'User',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <div className='font-medium'>
            {row.original.profiles?.full_name || 'Unknown User'}
          </div>
          <div className='text-sm text-gray-500'>
            {row.original.profiles?.email}
          </div>
        </div>
      ),
      requiredPermission: {
        module: 'users',
        action: 'view'
      }
    },
    {
      id: 'action_type',
      header: 'Action',
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant='outline'>
          {row.original.action_type.replace('_', ' ')}
        </Badge>
      )
    },
    {
      id: 'resource',
      header: 'Resource',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.resource_type ? (
          <div>
            <div className='font-medium'>{row.original.resource_type}</div>
            {row.original.resource_name && (
              <div className='text-sm text-gray-500'>
                {row.original.resource_name}
              </div>
            )}
          </div>
        ) : null
    },
    {
      id: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => (
        <div className='max-w-md truncate' title={row.original.description}>
          {row.original.description}
        </div>
      )
    },
    {
      id: 'ip_address',
      header: 'IP Address',
      enableSorting: false,
      cell: ({ row }) => (
        <div className='font-mono text-sm'>
          {row.original.ip_address || '-'}
        </div>
      ),
      requiredPermission: {
        module: 'users',
        action: 'view'
      }
    },
    {
      id: 'status_code',
      header: 'Status',
      enableSorting: true,
      cell: ({ row }) =>
        row.original.status_code ? (
          <Badge
            variant={
              row.original.status_code >= 200 && row.original.status_code < 300
                ? 'default'
                : row.original.status_code >= 400
                ? 'destructive'
                : 'secondary'
            }
          >
            {row.original.status_code}
          </Badge>
        ) : null
    },
    {
      id: 'severity',
      header: 'Severity',
      enableSorting: false,
      cell: ({ row }) =>
        getSeverityBadge(row.original.action_type, row.original.status_code)
    }
  ];

  // Handle page changes for server-side pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Prepare server-side pagination configuration
  const serverSidePagination = {
    currentPage,
    totalPages: activityData ? Math.ceil(activityData.count / pageSize) : 0,
    pageSize,
    totalItems: activityData?.count || 0,
    hasNextPage:
      currentPage <
      (activityData ? Math.ceil(activityData.count / pageSize) : 0),
    hasPreviousPage: currentPage > 1,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    isLoading: activityLoading
  };

  // Table tools (buttons in the toolbar)
  const tableTools = (
    <>
      <Button
        variant='outline'
        onClick={() => setShowFilters(!showFilters)}
        className='flex items-center gap-2'
      >
        <Filter className='h-4 w-4' />
        Filters
        {hasActiveFilters && (
          <Badge variant='destructive' className='ml-1 px-1 py-0 text-xs'>
            {Object.keys(filters).length}
          </Badge>
        )}
      </Button>

      {hasExportPermission && (
        <Button
          variant='outline'
          className='flex items-center gap-2'
          onClick={handleExport}
          disabled={activityLoading || !activityData?.data.length}
        >
          <Download className='h-4 w-4' />
          Export
        </Button>
      )}
    </>
  );

  return (
    <ContentLayout title='Activity & Engagement Analytics'>
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>
              Activity & Engagement Analytics
            </h1>
            <p className='text-gray-600'>
              Comprehensive user activity monitoring and student engagement insights
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full max-w-md grid-cols-2'>
            <TabsTrigger value='activity' className='flex items-center gap-2'>
              <Activity className='h-4 w-4' />
              Activity Logs
            </TabsTrigger>
            <TabsTrigger value='engagement' className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4' />
              Engagement Analytics
            </TabsTrigger>
          </TabsList>

          {/* Activity Logs Tab */}
          <TabsContent value='activity' className='space-y-6 mt-6'>

        {/* Metrics Dashboard */}
        {!metricsLoading && metrics && (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            <Card>
              <CardContent className='pt-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-gray-600'>
                      Total Activities
                    </p>
                    <p className='text-2xl font-bold'>
                      {metrics.totalActivities.toLocaleString()}
                    </p>
                  </div>
                  <Activity className='h-8 w-8 text-blue-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='pt-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-gray-600'>
                      Unique Users
                    </p>
                    <p className='text-2xl font-bold'>{metrics.uniqueUsers}</p>
                  </div>
                  <Users className='h-8 w-8 text-green-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='pt-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-gray-600'>
                      Unique Sessions
                    </p>
                    <p className='text-2xl font-bold'>
                      {metrics.uniqueSessions}
                    </p>
                  </div>
                  <Clock className='h-8 w-8 text-purple-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='pt-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-gray-600'>
                      Avg Per User
                    </p>
                    <p className='text-2xl font-bold'>
                      {metrics.avgActivitiesPerUser}
                    </p>
                  </div>
                  <TrendingUp className='h-8 w-8 text-orange-600' />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts Section */}
        {!metricsLoading && metrics && (
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Activity Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Trend</CardTitle>
                <CardDescription>
                  Daily activity volume over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-[300px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart data={metrics.activityTrend}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis
                        dataKey='date'
                        tickFormatter={(value) =>
                          format(parseISO(value), 'MMM dd')
                        }
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(value) =>
                          format(parseISO(value as string), 'MMM dd, yyyy')
                        }
                      />
                      <Line
                        type='monotone'
                        dataKey='count'
                        stroke='#3b82f6'
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Top Actions</CardTitle>
                <CardDescription>Most frequent activity types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-[300px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={metrics.topActions.slice(0, 8)}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis
                        dataKey='action_type'
                        angle={-45}
                        textAnchor='end'
                        height={100}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey='count' fill='#8b5cf6' />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search and Filters */}
        <Card>
          <CardContent className='pt-6'>
            <div className='space-y-4'>
              {/* Search */}
              <div className='flex items-center gap-4'>
                <div className='relative flex-1'>
                  <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4' />
                  <Input
                    placeholder='Search by action, description, resource...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='pl-10'
                  />
                </div>
                <Select
                  value={selectedPeriod}
                  onValueChange={setSelectedPeriod}
                >
                  <SelectTrigger className='w-32'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='day'>Today</SelectItem>
                    <SelectItem value='week'>This Week</SelectItem>
                    <SelectItem value='month'>This Month</SelectItem>
                    <SelectItem value='year'>This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Action Type
                    </label>
                    <Select
                      value={filters.action_type || 'none'}
                      onValueChange={(value) =>
                        value === 'none'
                          ? removeFilter('action_type')
                          : updateFilter('action_type', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='All actions' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='none'>All Actions</SelectItem>
                        {Object.values(ACTIVITY_TYPES).map((type) => (
                          <SelectItem key={type} value={type}>
                            <div className='flex items-center gap-2'>
                              {getActionIcon(type)}
                              <span>
                                {type.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Resource Type
                    </label>
                    <Select
                      value={filters.resource_type || 'none'}
                      onValueChange={(value) =>
                        value === 'none'
                          ? removeFilter('resource_type')
                          : updateFilter('resource_type', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='All resources' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='none'>All Resources</SelectItem>
                        {Object.values(RESOURCE_TYPES).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Date From
                    </label>
                    <Input
                      type='date'
                      value={filters.date_from?.split('T')[0] || ''}
                      onChange={(e) =>
                        e.target.value
                          ? updateFilter(
                              'date_from',
                              new Date(e.target.value).toISOString()
                            )
                          : removeFilter('date_from')
                      }
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                      Date To
                    </label>
                    <Input
                      type='date'
                      value={filters.date_to?.split('T')[0] || ''}
                      onChange={(e) =>
                        e.target.value
                          ? updateFilter(
                              'date_to',
                              new Date(e.target.value).toISOString()
                            )
                          : removeFilter('date_to')
                      }
                    />
                  </div>

                  {hasActiveFilters && (
                    <div className='md:col-span-2 lg:col-span-4'>
                      <Button
                        variant='outline'
                        onClick={clearFilters}
                        className='flex items-center gap-2'
                      >
                        <X className='h-4 w-4' />
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

            {/* Activity Table using DataTable */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Logs</CardTitle>
                <CardDescription>
                  {activityData
                    ? `Showing ${activityData.data.length} of ${activityData.count} activities`
                    : 'Loading activities...'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activityError ? (
                  <div className='text-center py-8'>
                    <AlertTriangle className='h-12 w-12 text-red-500 mx-auto mb-4' />
                    <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                      Error Loading Activities
                    </h3>
                    <p className='text-gray-600 mb-4'>{activityError}</p>
                    <Button onClick={handleRefresh}>Try Again</Button>
                  </div>
                ) : !activityData?.data.length && !activityLoading ? (
                  <div className='text-center py-8'>
                    <Activity className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                    <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                      No Activities Found
                    </h3>
                    <p className='text-gray-600'>
                      No activity logs match your current filters.
                    </p>
                  </div>
                ) : (
                  <DataTable
                    columns={columns}
                    data={activityData?.data || []}
                    searchPlaceholder='Search by action, description, resource...'
                    filterColumn=''
                    permissions={{
                      module: 'users',
                      actions: {
                        view: true,
                        create: false,
                        edit: false,
                        delete: false
                      },
                      showPermissionError: true
                    }}
                    tableTools={tableTools}
                    serverSidePagination={serverSidePagination}
                    onRefresh={handleRefresh}
                    showRefresh={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Engagement Analytics Tab */}
          <TabsContent value='engagement' className='space-y-6 mt-6'>
            {/* Filters and Refresh Button */}
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <h3 className='text-lg font-semibold'>Engagement Analytics</h3>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleRefreshEngagement}
                  disabled={isRefreshing || engagementLoading || !engagementFilters?.id}
                  className='flex items-center gap-2'
                >
                  <RefreshCw className={cn('h-4 w-4', (isRefreshing || engagementLoading) && 'animate-spin')} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
              <EngagementFilters
                onFilterChange={(filters) => setEngagementFilters(filters)}
                onExport={() => {
                  if (!engagementMetrics?.students || engagementMetrics.students.length === 0) return;
                  exportToCSV(engagementMetrics.students, 'engagement-analytics', [
                    { key: 'name', label: 'Student Name' },
                    { key: 'student_id', label: 'Student ID' },
                    { key: 'email', label: 'Email' },
                    { key: 'program_name', label: 'Program' },
                    { key: 'section_name', label: 'Section' },
                    { key: 'engagement_level', label: 'Engagement Level' },
                    { key: 'logins_last_7_days', label: 'Logins (7d)' },
                    { key: 'logins_last_30_days', label: 'Logins (30d)' },
                    { key: 'avg_session_duration_minutes', label: 'Avg Session (min)', formatter: (v: number) => v != null ? v.toFixed(1) : '' },
                    { key: 'total_time_spent_hours', label: 'Total Time (hrs)', formatter: (v: number) => v != null ? v.toFixed(1) : '' },
                    { key: 'modules_accessed_count', label: 'Modules Accessed' },
                    { key: 'last_login_at', label: 'Last Login' },
                    { key: 'days_since_last_login', label: 'Days Since Last Login' },
                    { key: 'percentile_rank', label: 'Percentile Rank', formatter: (v: number) => v != null ? v.toFixed(1) : '' },
                  ]);
                }}
              />
            </div>

            {engagementFilters && engagementFilters.id && (
              <>
                {/* Overview Cards */}
                {!engagementLoading && engagementMetrics && (
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                    <Card>
                      <CardContent className='pt-6'>
                        <div className='flex items-center justify-between'>
                          <div>
                            <p className='text-sm font-medium text-gray-600'>
                              Active Students (7d)
                            </p>
                            <p className='text-2xl font-bold'>
                              {engagementMetrics.active_students_7d || 0}
                            </p>
                          </div>
                          <Users className='h-8 w-8 text-green-600' />
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className='cursor-pointer hover:shadow-lg transition-shadow'
                      onClick={handleAtRiskClick}
                    >
                      <CardContent className='pt-6'>
                        <div className='flex items-center justify-between'>
                          <div>
                            <p className='text-sm font-medium text-gray-600'>
                              At-Risk Students
                            </p>
                            <p className='text-2xl font-bold text-red-600'>
                              {engagementMetrics.at_risk_count || 0}
                            </p>
                          </div>
                          <AlertTriangle className='h-8 w-8 text-red-600' />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className='pt-6'>
                        <div className='flex items-center justify-between'>
                          <div>
                            <p className='text-sm font-medium text-gray-600'>
                              Avg Session Duration
                            </p>
                            <p className='text-2xl font-bold'>
                              {Math.round(engagementMetrics.avg_session_duration_minutes || 0)}m
                            </p>
                          </div>
                          <Clock className='h-8 w-8 text-blue-600' />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className='pt-6'>
                        <div className='flex items-center justify-between'>
                          <div>
                            <p className='text-sm font-medium text-gray-600'>
                              Avg Logins/Week
                            </p>
                            <p className='text-2xl font-bold'>
                              {(engagementMetrics.avg_logins_7d || 0).toFixed(1)}
                            </p>
                          </div>
                          <TrendingUp className='h-8 w-8 text-purple-600' />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Charts */}
                {!engagementLoading && engagementMetrics && (
                  <>
                    <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                      <Card>
                        <CardHeader>
                          <CardTitle>Login Trend (30 days)</CardTitle>
                          <CardDescription>Daily login activity over time</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <LoginTrendChart data={loginTrendData} height={300} />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Engagement Distribution</CardTitle>
                          <CardDescription>Students by engagement level</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <EngagementDistributionChart
                            data={engagementDistributionData}
                            height={300}
                          />
                        </CardContent>
                      </Card>
                    </div>

                    {/* Advanced Hierarchical Charts */}
                    {hierarchyData && hierarchyData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Organizational Breakdown</CardTitle>
                          <CardDescription>
                            Engagement distribution across{' '}
                            {engagementFilters?.level === 'institution'
                              ? 'departments'
                              : engagementFilters?.level === 'department'
                              ? 'programs'
                              : engagementFilters?.level === 'program'
                              ? 'semesters'
                              : engagementFilters?.level === 'semester'
                              ? 'sections'
                              : 'units'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <HierarchicalBreakdownChart
                            data={hierarchyData}
                            height={400}
                            level={
                              engagementFilters?.level === 'institution'
                                ? 'department'
                                : engagementFilters?.level === 'department'
                                ? 'program'
                                : engagementFilters?.level === 'program'
                                ? 'semester'
                                : engagementFilters?.level === 'semester'
                                ? 'section'
                                : 'institution'
                            }
                            onBarClick={(data) => {
                              // Drill-down: Navigate to clicked entity
                              const nextLevel: OrganizationalLevel =
                                engagementFilters?.level === 'institution'
                                  ? 'department'
                                  : engagementFilters?.level === 'department'
                                  ? 'program'
                                  : engagementFilters?.level === 'program'
                                  ? 'semester'
                                  : engagementFilters?.level === 'semester'
                                  ? 'section'
                                  : 'institution';

                              setEngagementFilters({
                                ...engagementFilters,
                                level: nextLevel,
                                id: data.id
                              });
                            }}
                          />
                        </CardContent>
                      </Card>
                    )}

                    {/* Comparison Charts */}
                    {hierarchyData && hierarchyData.length > 1 && (
                      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                        <Card>
                          <CardHeader>
                            <CardTitle>Active Students Comparison</CardTitle>
                            <CardDescription>
                              Percentage of active students by unit
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <EngagementComparisonChart
                              data={hierarchyData.map(d => ({
                                ...d,
                                at_risk_percentage: d.total_students > 0
                                  ? (d.at_risk / d.total_students) * 100
                                  : 0,
                                avg_logins_7d: 0,
                                avg_session_duration: 0
                              }))}
                              metric='active_percentage'
                              height={350}
                            />
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>At-Risk Students Comparison</CardTitle>
                            <CardDescription>
                              Percentage of at-risk students by unit
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <EngagementComparisonChart
                              data={hierarchyData.map(d => ({
                                ...d,
                                at_risk_percentage: d.total_students > 0
                                  ? (d.at_risk / d.total_students) * 100
                                  : 0,
                                avg_logins_7d: 0,
                                avg_session_duration: 0
                              }))}
                              metric='at_risk_percentage'
                              height={350}
                            />
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Radial Chart for Top Units */}
                    {hierarchyData && hierarchyData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Top Performing Units</CardTitle>
                          <CardDescription>
                            Units with highest student engagement
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <EngagementRadialChart
                            data={hierarchyData
                              .sort((a, b) => b.total_students - a.total_students)
                              .slice(0, 7)
                              .map((item, idx) => {
                                const colors = [
                                  '#3B82F6',
                                  '#10B981',
                                  '#F59E0B',
                                  '#8B5CF6',
                                  '#EC4899',
                                  '#14B8A6',
                                  '#F97316'
                                ];
                                return {
                                  name: item.name,
                                  value: item.high_engagement + item.medium_engagement,
                                  fill: colors[idx % colors.length],
                                  fullMark: item.total_students
                                };
                              })}
                            height={350}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {/* Section Comparison (if semester selected) */}
                {engagementFilters.level === 'semester' && (
                  <SectionComparisonTable
                    semesterId={engagementFilters.id}
                    onSectionClick={(sectionId) => {
                      setEngagementFilters({
                        ...engagementFilters,
                        level: 'section',
                        id: sectionId
                      });
                    }}
                  />
                )}

                {/* Student Engagement Table */}
                {engagementMetrics?.students && (
                  <StudentEngagementTable
                    students={engagementMetrics.students}
                    onStudentClick={handleStudentClick}
                    isLoading={engagementLoading}
                  />
                )}

                {/* Loading State */}
                {engagementLoading && (
                  <div className='flex items-center justify-center py-12'>
                    <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
                    <span className='ml-4 text-gray-600'>Loading engagement data...</span>
                  </div>
                )}

                {/* Error State */}
                {engagementError && (
                  <Card>
                    <CardContent className='pt-6'>
                      <div className='text-center py-8'>
                        <AlertTriangle className='h-12 w-12 text-red-500 mx-auto mb-4' />
                        <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                          Error Loading Engagement Data
                        </h3>
                        <p className='text-gray-600 mb-4'>{engagementError.message}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* No Filters Selected State */}
            {(!engagementFilters || !engagementFilters.id) && (
              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center py-12'>
                    <BarChart3 className='h-16 w-16 text-gray-400 mx-auto mb-4' />
                    <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                      Select Filters to View Analytics
                    </h3>
                    <p className='text-gray-600'>
                      Use the filters above to select an institution, department, program,
                      semester, or section to view engagement analytics.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Modals */}
        {showAtRiskModal && atRiskStudents && (
          <AtRiskModal
            isOpen={showAtRiskModal}
            onClose={() => setShowAtRiskModal(false)}
            students={atRiskStudents}
            isLoading={atRiskLoading}
          />
        )}

        {showStudentDetailModal && selectedStudentId && (
          <StudentDetailModal
            isOpen={showStudentDetailModal}
            onClose={() => {
              setShowStudentDetailModal(false);
              setSelectedStudentId(null);
            }}
            studentId={selectedStudentId}
          />
        )}
      </div>
    </ContentLayout>
  );
}
