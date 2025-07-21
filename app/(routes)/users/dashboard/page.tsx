'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Separator } from '@/components/ui/separator';
import { useUserDashboardStats } from '@/hooks/use-user-dashboard';
import { PageBreadcrumb } from '@/components/navigation';
import { BeatLoader } from 'react-spinners';
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  Filter,
  Eye,
  Settings,
  Activity,
  Shield,
  Globe,
  Building,
  Award,
  Clock,
  AlertTriangle,
  UserPlus
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

// Chart colors
const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#6366f1'
];

export default function UserDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [showFilters, setShowFilters] = useState(false);

  const {
    dashboardStats,
    activitySummary,
    roleStats,
    registrationTrends,
    institutionDistribution,
    topActiveUsers,
    recentRegistrations,
    keyMetrics,
    filters,
    isLoading,
    error,
    hasData,
    loadingStates,
    updateFilters,
    clearFilters,
    refreshAll,
    exportData,
    canAccessAllInstitutions,
    userInstitutions,
    isSuperAdmin
  } = useUserDashboardStats();

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      await exportData(format);
      toast.success(`Dashboard data exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    trend,
    trendValue,
    description,
    color = 'blue'
  }: {
    title: string;
    value: string | number;
    icon: any;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string | number;
    description?: string;
    color?: string;
  }) => (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className={`h-4 w-4 text-${color}-600`} />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value.toLocaleString()}</div>
        {trend && trendValue && (
          <div className='flex items-center gap-1 text-xs text-muted-foreground'>
            {trend === 'up' ? (
              <TrendingUp className='h-3 w-3 text-green-500' />
            ) : trend === 'down' ? (
              <TrendingDown className='h-3 w-3 text-red-500' />
            ) : null}
            <span
              className={
                trend === 'up'
                  ? 'text-green-600'
                  : trend === 'down'
                  ? 'text-red-600'
                  : ''
              }
            >
              {trendValue}
            </span>
          </div>
        )}
        {description && (
          <p className='text-xs text-muted-foreground mt-1'>{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <ContentLayout title='User Management Dashboard'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <AlertTriangle className='h-12 w-12 text-red-500 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>
              Error Loading Dashboard
            </h3>
            <p className='text-gray-600 mb-4'>{error.message}</p>
            <Button onClick={refreshAll}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='User Management Dashboard'>
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <PageBreadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'Users', href: '/users' },
                { label: 'Dashboard' }
              ]}
            />
            <h1 className='text-3xl font-bold text-gray-900 mt-2'>
              User Management Dashboard
            </h1>
            <p className='text-gray-600'>
              Comprehensive analytics and insights for user management
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className='h-4 w-4 mr-2' />
              Filters
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={refreshAll}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <Select
              onValueChange={(format: 'csv' | 'excel') => handleExport(format)}
            >
              <SelectTrigger className='w-32'>
                <Download className='h-4 w-4 mr-2' />
                <SelectValue placeholder='Export' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='csv'>Export CSV</SelectItem>
                <SelectItem value='excel'>Export Excel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Dashboard Filters</CardTitle>
              <CardDescription>
                Customize the dashboard view with filters
              </CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              {canAccessAllInstitutions && (
                <div className='space-y-2'>
                  <Label>Institution</Label>
                  <Select
                    value={filters.institutionId || 'all'}
                    onValueChange={(value) =>
                      updateFilters({
                        institutionId: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='All Institutions' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Institutions</SelectItem>
                      {userInstitutions.map((inst) => (
                        <SelectItem
                          key={inst.institution_id}
                          value={inst.institution_id}
                        >
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className='space-y-2'>
                <Label>Status</Label>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(value: 'active' | 'inactive' | 'all') =>
                    updateFilters({ status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder='All Users' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Users</SelectItem>
                    <SelectItem value='active'>Active Only</SelectItem>
                    <SelectItem value='inactive'>Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Date Range</Label>
                <DatePickerWithRange
                  value={filters.dateRange}
                  onChange={(range) => updateFilters({ dateRange: range })}
                />
              </div>

              <div className='flex items-end'>
                <Button
                  variant='outline'
                  onClick={clearFilters}
                  className='w-full'
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && !hasData && (
          <div className='flex items-center justify-center min-h-[400px]'>
            <div className='text-center'>
              <BeatLoader color='#3b82f6' />
              <p className='text-gray-600 mt-4'>Loading dashboard data...</p>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {hasData && (
          <>
            {/* Key Metrics Overview */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              <StatCard
                title='Total Users'
                value={keyMetrics?.totalUsers || 0}
                icon={Users}
                description='All registered users'
                color='blue'
              />
              <StatCard
                title='Active Users'
                value={keyMetrics?.activeUsers || 0}
                icon={UserCheck}
                trend={
                  keyMetrics?.growthRate && keyMetrics.growthRate > 0
                    ? 'up'
                    : 'down'
                }
                trendValue={`${keyMetrics?.growthRate?.toFixed(1) || 0}%`}
                description='Currently active users'
                color='green'
              />
              <StatCard
                title='New This Month'
                value={keyMetrics?.newUsersThisMonth || 0}
                icon={UserPlus}
                description='New registrations this month'
                color='purple'
              />
              <StatCard
                title='Profile Completion'
                value={`${keyMetrics?.profileCompletionRate?.toFixed(1) || 0}%`}
                icon={Award}
                description='Users with complete profiles'
                color='orange'
              />
            </div>

            {/* Main Dashboard Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className='space-y-6'
            >
              <TabsList className='grid w-full grid-cols-5'>
                <TabsTrigger value='overview'>Overview</TabsTrigger>
                <TabsTrigger value='analytics'>Analytics</TabsTrigger>
                <TabsTrigger value='roles'>Roles</TabsTrigger>
                <TabsTrigger value='institutions'>Institutions</TabsTrigger>
                <TabsTrigger value='activity'>Activity</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value='overview' className='space-y-6'>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                  {/* Registration Trends */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Registration Trends (30 Days)</CardTitle>
                      <CardDescription>
                        Daily user registrations over the last 30 days
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='h-[300px]'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <AreaChart data={registrationTrends}>
                            <CartesianGrid strokeDasharray='3 3' />
                            <XAxis
                              dataKey='date'
                              tickFormatter={(value) =>
                                format(new Date(value), 'MMM dd')
                              }
                            />
                            <YAxis />
                            <Tooltip
                              labelFormatter={(value) =>
                                format(new Date(value), 'MMM dd, yyyy')
                              }
                            />
                            <Area
                              type='monotone'
                              dataKey='count'
                              stroke='#3b82f6'
                              fill='#3b82f6'
                              fillOpacity={0.3}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User Status Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle>User Status Distribution</CardTitle>
                      <CardDescription>
                        Active vs inactive user breakdown
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='h-[300px]'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <PieChart>
                            <Pie
                              data={[
                                {
                                  name: 'Active',
                                  value:
                                    dashboardStats?.overview.activeUsers || 0,
                                  fill: '#10b981'
                                },
                                {
                                  name: 'Inactive',
                                  value:
                                    dashboardStats?.overview.inactiveUsers || 0,
                                  fill: '#ef4444'
                                }
                              ]}
                              cx='50%'
                              cy='50%'
                              labelLine={false}
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                              outerRadius={80}
                              fill='#8884d8'
                              dataKey='value'
                            >
                              {[
                                {
                                  name: 'Active',
                                  value:
                                    dashboardStats?.overview.activeUsers || 0,
                                  fill: '#10b981'
                                },
                                {
                                  name: 'Inactive',
                                  value:
                                    dashboardStats?.overview.inactiveUsers || 0,
                                  fill: '#ef4444'
                                }
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Activity Summary Cards */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-sm font-medium'>
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Last 7 days
                          </span>
                          <span className='font-semibold'>
                            {dashboardStats?.overview.lastLoginWithin7Days || 0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Last 30 days
                          </span>
                          <span className='font-semibold'>
                            {dashboardStats?.overview.lastLoginWithin30Days ||
                              0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Never logged in
                          </span>
                          <span className='font-semibold text-orange-600'>
                            {dashboardStats?.overview.neverLoggedIn || 0}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-sm font-medium'>
                        Profile Completion
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Complete
                          </span>
                          <span className='font-semibold text-green-600'>
                            {dashboardStats?.overview.completeProfiles || 0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Incomplete
                          </span>
                          <span className='font-semibold text-orange-600'>
                            {dashboardStats?.overview.incompleteProfiles || 0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Completion Rate
                          </span>
                          <span className='font-semibold'>
                            {dashboardStats?.overview.profileCompletionRate.toFixed(
                              1
                            ) || 0}
                            %
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-sm font-medium'>
                        Growth Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-2'>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            This Month
                          </span>
                          <span className='font-semibold'>
                            {dashboardStats?.overview.newUsersThisMonth || 0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Last Month
                          </span>
                          <span className='font-semibold'>
                            {dashboardStats?.overview.newUsersLastMonth || 0}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-sm text-gray-600'>
                            Growth Rate
                          </span>
                          <span
                            className={`font-semibold ${
                              (dashboardStats?.overview.growthRate || 0) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {dashboardStats?.overview.growthRate?.toFixed(1) ||
                              0}
                            %
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Analytics Tab */}
              <TabsContent value='analytics' className='space-y-6'>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                  {/* Role Distribution Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Role Distribution</CardTitle>
                      <CardDescription>
                        User distribution across different roles
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='h-[300px]'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <BarChart
                            data={dashboardStats?.roleDistribution || []}
                          >
                            <CartesianGrid strokeDasharray='3 3' />
                            <XAxis dataKey='roleDisplayName' />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey='count' fill='#3b82f6' />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Geographic Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Geographic Distribution</CardTitle>
                      <CardDescription>
                        User distribution by location
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-3'>
                        {dashboardStats?.geographicDistribution.map(
                          (location, index) => (
                            <div
                              key={index}
                              className='flex items-center justify-between'
                            >
                              <div>
                                <span className='font-medium'>
                                  {location.district}
                                </span>
                                <span className='text-sm text-gray-500 ml-2'>
                                  {location.state}
                                </span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <span className='font-semibold'>
                                  {location.userCount}
                                </span>
                                <Badge variant='secondary'>
                                  {location.percentage}%
                                </Badge>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Roles Tab */}
              <TabsContent value='roles' className='space-y-6'>
                <Card>
                  <CardHeader>
                    <CardTitle>Role-based Statistics</CardTitle>
                    <CardDescription>
                      Detailed breakdown of users by role
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-4'>
                      {dashboardStats?.roleDistribution.map((role) => (
                        <div key={role.role} className='border rounded-lg p-4'>
                          <div className='flex items-center justify-between mb-2'>
                            <h3 className='font-semibold'>
                              {role.roleDisplayName}
                            </h3>
                            <Badge variant='outline'>
                              {role.count} users ({role.percentage.toFixed(1)}%)
                            </Badge>
                          </div>
                          <div className='grid grid-cols-2 gap-4'>
                            <div className='flex justify-between'>
                              <span className='text-sm text-gray-600'>
                                Active:
                              </span>
                              <span className='font-medium text-green-600'>
                                {role.activeCount}
                              </span>
                            </div>
                            <div className='flex justify-between'>
                              <span className='text-sm text-gray-600'>
                                Inactive:
                              </span>
                              <span className='font-medium text-red-600'>
                                {role.inactiveCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Institutions Tab */}
              <TabsContent value='institutions' className='space-y-6'>
                {canAccessAllInstitutions ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Institution-wise User Distribution</CardTitle>
                      <CardDescription>
                        User statistics across different institutions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-4'>
                        {dashboardStats?.institutionStats.map((institution) => (
                          <div
                            key={institution.id}
                            className='border rounded-lg p-4'
                          >
                            <div className='flex items-center justify-between mb-3'>
                              <div>
                                <h3 className='font-semibold'>
                                  {institution.name}
                                </h3>
                                <p className='text-sm text-gray-600'>
                                  Code: {institution.counsellingCode || 'N/A'}
                                </p>
                              </div>
                              <div className='text-right'>
                                <div className='font-semibold'>
                                  {institution.totalUsers} users
                                </div>
                                <div className='text-sm text-gray-600'>
                                  {institution.percentage.toFixed(1)}% of total
                                </div>
                              </div>
                            </div>
                            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                              <div className='text-center'>
                                <div className='font-medium text-green-600'>
                                  {institution.activeUsers}
                                </div>
                                <div className='text-xs text-gray-600'>
                                  Active
                                </div>
                              </div>
                              <div className='text-center'>
                                <div className='font-medium text-red-600'>
                                  {institution.totalUsers -
                                    institution.activeUsers}
                                </div>
                                <div className='text-xs text-gray-600'>
                                  Inactive
                                </div>
                              </div>
                              <div className='text-center'>
                                <div className='font-medium'>
                                  {Object.values(institution.byRole).reduce(
                                    (a, b) => a + b,
                                    0
                                  )}
                                </div>
                                <div className='text-xs text-gray-600'>
                                  Total Roles
                                </div>
                              </div>
                              <div className='text-center'>
                                <div className='font-medium'>
                                  {institution.lastActivity
                                    ? format(
                                        new Date(institution.lastActivity),
                                        'MMM dd'
                                      )
                                    : 'No activity'}
                                </div>
                                <div className='text-xs text-gray-600'>
                                  Last Activity
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className='text-center py-8'>
                      <Building className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                      <h3 className='text-lg font-semibold mb-2'>
                        Institution View Restricted
                      </h3>
                      <p className='text-gray-600'>
                        You can only view data for your assigned institution.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value='activity' className='space-y-6'>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                  {/* Top Active Users */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Most Active Users</CardTitle>
                      <CardDescription>
                        Users with recent login activity
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-3'>
                        {topActiveUsers?.slice(0, 10).map((user, index) => (
                          <div
                            key={user.id}
                            className='flex items-center justify-between'
                          >
                            <div>
                              <p className='font-medium'>{user.name}</p>
                              <p className='text-sm text-gray-600'>
                                {user.email}
                              </p>
                              <div className='flex items-center gap-2 mt-1'>
                                <Badge variant='outline' className='text-xs'>
                                  {user.role}
                                </Badge>
                                {user.institution && (
                                  <span className='text-xs text-gray-500'>
                                    {user.institution}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className='text-right'>
                              <div className='text-sm font-medium'>
                                {user.lastLogin
                                  ? format(
                                      new Date(user.lastLogin),
                                      'MMM dd, HH:mm'
                                    )
                                  : 'Never'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Registrations */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Registrations</CardTitle>
                      <CardDescription>Newly registered users</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className='space-y-3'>
                        {recentRegistrations?.slice(0, 10).map((user) => (
                          <div
                            key={user.id}
                            className='flex items-center justify-between'
                          >
                            <div>
                              <p className='font-medium'>{user.name}</p>
                              <p className='text-sm text-gray-600'>
                                {user.email}
                              </p>
                              <div className='flex items-center gap-2 mt-1'>
                                <Badge variant='outline' className='text-xs'>
                                  {user.role}
                                </Badge>
                                {user.institution && (
                                  <span className='text-xs text-gray-500'>
                                    {user.institution}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className='text-right'>
                              <div className='text-sm font-medium'>
                                {format(
                                  new Date(user.registeredAt),
                                  'MMM dd, yyyy'
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Security Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Security & Compliance Metrics</CardTitle>
                    <CardDescription>
                      Account security and compliance statistics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                      <div className='text-center p-4 border rounded-lg'>
                        <div className='font-semibold text-2xl'>
                          {dashboardStats?.securityMetrics
                            .accountsWithRecentPasswordChanges || 0}
                        </div>
                        <div className='text-sm text-gray-600 mt-1'>
                          Recent Password Changes
                        </div>
                      </div>
                      <div className='text-center p-4 border rounded-lg'>
                        <div className='font-semibold text-2xl text-red-600'>
                          {dashboardStats?.securityMetrics.suspendedAccounts ||
                            0}
                        </div>
                        <div className='text-sm text-gray-600 mt-1'>
                          Suspended Accounts
                        </div>
                      </div>
                      <div className='text-center p-4 border rounded-lg'>
                        <div className='font-semibold text-2xl text-orange-600'>
                          {dashboardStats?.securityMetrics
                            .accountsRequiringAttention || 0}
                        </div>
                        <div className='text-sm text-gray-600 mt-1'>
                          Requiring Attention
                        </div>
                      </div>
                      <div className='text-center p-4 border rounded-lg'>
                        <div className='font-semibold text-2xl text-blue-600'>
                          {dashboardStats?.securityMetrics.twoFactorEnabled ||
                            0}
                        </div>
                        <div className='text-sm text-gray-600 mt-1'>
                          2FA Enabled
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
