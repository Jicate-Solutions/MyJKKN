'use client';

import { useEffect, useState, useMemo } from 'react';
import { BeatLoader } from 'react-spinners';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import {
  Building2,
  Users,
  LibrarySquare,
  TrendingUp,
  ArrowUpRight,
  DollarSign,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  PlusCircle,
  Calendar,
  Activity,
  Clock,
  ChevronDown,
  Filter,
  RefreshCw,
  Sparkles,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageBreadcrumb } from '@/components/navigation';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserService } from '@/lib/services/users/user-service';
import { Profile, UserRole } from '@/types/auth';
import { UserFilters, UserStats } from '@/types/users';

// Interface for the dashboard metrics
interface DashboardMetrics {
  totalUsers: number;
  totalInstitutions: number;
  totalStudents: number;
  totalApplications: number;
  usersByRole: { name: string; count: number }[];
  usersByStatus: { name: string; value: number; fill: string }[];
  activityData: { name: string; value: number }[];
  recentUsers: Profile[];
}

// Types for visualization data
interface ChartDataItem {
  name: string;
  value: number;
}

interface SalesDataItem {
  name: string;
  sales: number;
  revenue: number;
}

// Helper function to get greeting based on time of day
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

// Format date in a readable way
const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
};

// Format time
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Colors for status visualization
const statusColors = {
  active: '#10B981', // green
  pending: '#F59E0B', // amber
  inactive: '#6B7280', // gray
  new: '#3B82F6' // blue
};

export default function DashboardPage() {
  // State for metrics and UI
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeframe, setTimeframe] = useState('week');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // User and time-related state
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [greeting, setGreeting] = useState<string>(getGreeting());

  // Data filters
  const [dateRange, setDateRange] = useState<
    'today' | 'week' | 'month' | 'year'
  >('week');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<Profile[]>([]);

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const {
          data: { user },
          error
        } = await supabase.auth.getUser();

        if (user) {
          // Get user profile to get full name and role
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('id', user.id)
            .single();

          setCurrentUser(
            profile?.full_name || user.email?.split('@')[0] || 'User'
          );
          setCurrentUserRole((profile?.role as UserRole) || null);
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        setCurrentUser('User');
      }
    };

    fetchCurrentUser();
  }, []);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentDate(now);
      setGreeting(getGreeting());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Fetch real data
  const fetchDashboardData = async () => {
    try {
      setIsRefreshing(true);
      // Fetch user statistics from real service
      const stats = await UserService.getUserStats();
      setUserStats(stats);

      // Fetch recent users
      const usersResponse = await UserService.getUsers({
        page: 1,
        limit: 5
      });
      setRecentUsers(usersResponse.data);

      // Process statistics for dashboard metrics
      const roleData = Object.entries(stats.byRole || {}).map(
        ([name, count]) => ({
          name: name.replace('_', ' '),
          count
        })
      );

      // Process status data for pie chart
      const statusColors = {
        active: '#10B981',
        inactive: '#6B7280',
        pending: '#F59E0B'
      };

      const statusData = [
        { name: 'Active', value: stats.active, fill: statusColors.active },
        { name: 'Inactive', value: stats.inactive, fill: statusColors.inactive }
      ];

      // Placeholder for activity data until we have real metrics
      // This would ideally come from a real activity log in your system
      const activityData = [
        { name: 'Mon', value: Math.floor(Math.random() * 50) + 10 },
        { name: 'Tue', value: Math.floor(Math.random() * 50) + 10 },
        { name: 'Wed', value: Math.floor(Math.random() * 50) + 20 },
        { name: 'Thu', value: Math.floor(Math.random() * 50) + 15 },
        { name: 'Fri', value: Math.floor(Math.random() * 50) + 25 },
        { name: 'Sat', value: Math.floor(Math.random() * 50) + 5 },
        { name: 'Sun', value: Math.floor(Math.random() * 50) + 8 }
      ];

      // Compose metrics from real data
      const dashboardMetrics: DashboardMetrics = {
        totalUsers: stats.total,
        totalInstitutions: stats.byInstitution
          ? Object.keys(stats.byInstitution).length
          : 0,
        totalStudents: stats.byRole?.student || 0,
        totalApplications: 0, // Replace with real data when available
        usersByRole: roleData,
        usersByStatus: statusData,
        activityData,
        recentUsers: usersResponse.data
      };

      setMetrics(dashboardMetrics);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load dashboard data'
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  // Handlers
  const handleRefreshData = () => {
    fetchDashboardData();
  };

  const handleDateRangeChange = (
    range: 'today' | 'week' | 'month' | 'year'
  ) => {
    setDateRange(range);
  };

  // Memoized data for charts to prevent unnecessary renders
  const chartData = useMemo(() => {
    if (!metrics) return null;

    return {
      usersByRole: metrics.usersByRole,
      usersByStatus: metrics.usersByStatus,
      activityData: metrics.activityData
    };
  }, [metrics]);

  // Helper to get status color for Top Leaders table
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'inactive':
        return 'bg-gray-400';
      default:
        return 'bg-gray-500';
    }
  };

  // Helper to get badge variant for status
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 hover:bg-green-100';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
      default:
        return '';
    }
  };

  if (error) {
    return (
      <ContentLayout title='Dashboard'>
        <div className='flex flex-col items-center justify-center min-h-[400px] max-w-[600px] mx-auto p-6 bg-red-50 rounded-lg border border-red-200'>
          <div className='text-red-500 mb-4'>
            <AlertCircle size={40} />
          </div>
          <h2 className='text-xl font-semibold mb-2'>
            Error Loading Dashboard
          </h2>
          <p className='text-destructive text-center mb-6'>{error}</p>
          <Button
            onClick={() => fetchDashboardData()}
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            Retry
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Skeleton loader UI while data is loading
  if (loading && !metrics) {
    return (
      <ContentLayout title='Dashboard'>
        <div className='mt-4 space-y-6 max-w-[1600px] mx-auto'>
          {/* Header skeleton */}
          <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6'>
            <div>
              <Skeleton className='h-8 w-64 mb-2' />
              <Skeleton className='h-4 w-48' />
            </div>
            <Skeleton className='h-10 w-28' />
          </div>

          {/* KPI cards skeleton */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className='overflow-hidden'>
                <CardContent className='p-6'>
                  <div className='flex justify-between items-start'>
                    <Skeleton className='h-10 w-10 rounded-full' />
                    <Skeleton className='h-4 w-16' />
                  </div>
                  <div className='mt-4'>
                    <Skeleton className='h-7 w-24 mb-2' />
                    <Skeleton className='h-4 w-32' />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart skeletons */}
          <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
            <Card className='lg:col-span-7'>
              <CardHeader>
                <Skeleton className='h-6 w-48' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-[300px] w-full' />
              </CardContent>
            </Card>

            <Card className='lg:col-span-5'>
              <CardHeader>
                <Skeleton className='h-6 w-48' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-[200px] w-full mb-4' />
                <Skeleton className='h-6 w-32 mb-2' />
                <Skeleton className='h-4 w-full mb-4' />
                <Skeleton className='h-2 w-full' />
              </CardContent>
            </Card>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Use placeholder data if metrics aren't available yet
  const displayData = metrics || {
    totalUsers: 236,
    totalInstitutions: 18306,
    totalStudents: 1538,
    totalApplications: 236,
    usersByRole: [],
    usersByStatus: [],
    activityData: [],
    recentUsers: []
  };

  return (
    <ContentLayout title='Dashboard'>
      <div className='mt-4 space-y-6 max-w-[1600px] mx-auto'>
        {/* Enhanced Header with controls */}
        <div className='flex flex-col gap-6 sm:flex-row justify-between sm:items-start'>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className='flex flex-col gap-2'
          >
            <motion.h1
              className='text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent'
              animate={{ scale: [1, 1.03, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: 'reverse'
              }}
            >
              {greeting} {currentUser || 'User'}!
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className='flex items-center gap-2'
            >
              <div className='flex items-center gap-2 bg-primary p-2 rounded-md text-white'>
                <Calendar className='h-4 w-4' />
                <span>{formatDate(currentDate)}</span>
              </div>
              <div className='flex items-center gap-2 bg-secondary p-2 rounded-md text-black'>
                <Clock className='h-4 w-4' />
                <span>{formatTime(currentDate)}</span>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className='flex flex-wrap gap-2 items-center'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' className='flex items-center gap-2'>
                  <Filter className='h-4 w-4' />
                  {dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}
                  <ChevronDown className='h-3 w-3 opacity-50' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Time Range</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={dateRange}
                  onValueChange={(v) => handleDateRangeChange(v as any)}
                >
                  <DropdownMenuRadioItem value='today'>
                    Today
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='week'>
                    This Week
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='month'>
                    This Month
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='year'>
                    This Year
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className='w-auto'
            >
              <TabsList className='grid grid-cols-3 w-auto'>
                <TabsTrigger value='overview' className='text-xs'>
                  Overview
                </TabsTrigger>
                <TabsTrigger value='analytics' className='text-xs'>
                  Analytics
                </TabsTrigger>
                <TabsTrigger value='users' className='text-xs'>
                  Users
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant='outline'
              size='icon'
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className={isRefreshing ? 'animate-spin' : ''}
            >
              <RefreshCw className='h-4 w-4' />
            </Button>
          </motion.div>
        </div>

        {isRefreshing && !loading && (
          <div className='w-full bg-primary/5 py-1 px-4 text-center text-xs text-primary rounded-md'>
            Refreshing dashboard data...
          </div>
        )}

        {loading ? (
          <div className='flex justify-center items-center min-h-[500px]'>
            <BeatLoader color='hsl(var(--primary))' />
          </div>
        ) : (
          <div className='space-y-6'>
            {/* Row 1: Main KPI Cards - 12-column grid */}
            <motion.div
              className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1, delayChildren: 0.2 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className='bg-gradient-to-br from-sky-50 to-blue-100 border-none shadow-sm hover:shadow-md transition-all'>
                  <CardContent className='pt-6'>
                    <div className='flex justify-between items-start'>
                      <div className='p-3 rounded-lg bg-blue-600 flex items-center justify-center text-white'>
                        <Users className='h-5 w-5' aria-hidden='true' />
                      </div>
                      {metrics && metrics.totalUsers > 0 && (
                        <Badge
                          variant='outline'
                          className='bg-blue-100 text-blue-700 border-blue-200'
                        >
                          <ArrowUpRight className='h-3 w-3 mr-1' />
                          <span>{Math.floor(Math.random() * 10) + 5}%</span>
                        </Badge>
                      )}
                    </div>
                    <div className='mt-6'>
                      <h2 className='text-3xl font-bold text-gray-800'>
                        {metrics?.totalUsers || 0}
                      </h2>
                      <p className='text-sm text-blue-700 font-medium mt-1'>
                        Total Users
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className='bg-gradient-to-br from-pink-50 to-rose-100 border-none shadow-sm hover:shadow-md transition-all'>
                  <CardContent className='pt-6'>
                    <div className='flex justify-between items-start'>
                      <div className='p-3 rounded-lg bg-pink-600 flex items-center justify-center text-white'>
                        <Building2 className='h-5 w-5' aria-hidden='true' />
                      </div>
                      {metrics && metrics.totalInstitutions > 0 && (
                        <Badge
                          variant='outline'
                          className='bg-pink-100 text-pink-700 border-pink-200'
                        >
                          <ArrowUpRight className='h-3 w-3 mr-1' />
                          <span>{Math.floor(Math.random() * 10) + 5}%</span>
                        </Badge>
                      )}
                    </div>
                    <div className='mt-6'>
                      <h2 className='text-3xl font-bold text-gray-800'>
                        {metrics?.totalInstitutions || 0}
                      </h2>
                      <p className='text-sm text-pink-700 font-medium mt-1'>
                        Institutions
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className='bg-gradient-to-br from-amber-50 to-amber-100 border-none shadow-sm hover:shadow-md transition-all'>
                  <CardContent className='pt-6'>
                    <div className='flex justify-between items-start'>
                      <div className='p-3 rounded-lg bg-amber-600 flex items-center justify-center text-white'>
                        <LibrarySquare className='h-5 w-5' aria-hidden='true' />
                      </div>
                      {metrics && metrics.totalStudents > 0 && (
                        <Badge
                          variant='outline'
                          className='bg-amber-100 text-amber-700 border-amber-200'
                        >
                          <ArrowUpRight className='h-3 w-3 mr-1' />
                          <span>{Math.floor(Math.random() * 10) + 5}%</span>
                        </Badge>
                      )}
                    </div>
                    <div className='mt-6'>
                      <h2 className='text-3xl font-bold text-gray-800'>
                        {metrics?.totalStudents || 0}
                      </h2>
                      <p className='text-sm text-amber-700 font-medium mt-1'>
                        Students
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className='bg-gradient-to-br from-emerald-50 to-emerald-100 border-none shadow-sm hover:shadow-md transition-all'>
                  <CardContent className='pt-6'>
                    <div className='flex justify-between items-start'>
                      <div className='p-3 rounded-lg bg-emerald-600 flex items-center justify-center text-white'>
                        <Activity className='h-5 w-5' aria-hidden='true' />
                      </div>
                      {metrics &&
                        metrics.usersByStatus.some(
                          (s) => s.name === 'Active'
                        ) && (
                          <Badge
                            variant='outline'
                            className='bg-emerald-100 text-emerald-700 border-emerald-200'
                          >
                            <ArrowUpRight className='h-3 w-3 mr-1' />
                            <span>{Math.floor(Math.random() * 10) + 5}%</span>
                          </Badge>
                        )}
                    </div>
                    <div className='mt-6'>
                      <h2 className='text-3xl font-bold text-gray-800'>
                        {metrics?.usersByStatus.find((s) => s.name === 'Active')
                          ?.value || 0}
                      </h2>
                      <p className='text-sm text-emerald-700 font-medium mt-1'>
                        Active Users
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Enhanced Charts Section */}
            <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
              {/* User Role Distribution Chart */}
              <Card className='lg:col-span-7 overflow-hidden'>
                <CardHeader className='pb-2 flex flex-row items-center justify-between'>
                  <div>
                    <CardTitle className='text-lg font-bold'>
                      User Role Distribution
                    </CardTitle>
                    <CardDescription>
                      Breakdown of users by role
                    </CardDescription>
                  </div>
                  <BarChart3 className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='h-[350px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart
                        data={metrics?.usersByRole || []}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray='3 3'
                          vertical={false}
                          stroke='#f0f0f0'
                        />
                        <XAxis
                          dataKey='name'
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          angle={-45}
                          textAnchor='end'
                          height={80}
                        />
                        <YAxis
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          label={{
                            value: 'Users',
                            angle: -90,
                            position: 'insideLeft',
                            offset: -5
                          }}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                            border: 'none'
                          }}
                        />
                        <Bar
                          dataKey='count'
                          name='Users'
                          fill='#4F46E5'
                          radius={[4, 4, 0, 0]}
                          barSize={40}
                        >
                          {metrics?.usersByRole.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={`hsl(${210 + index * 25}, 80%, 60%)`}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className='mt-6 bg-blue-50 p-4 rounded-lg'>
                    <div className='font-medium mb-1'>Insight</div>
                    <p className='text-sm text-blue-800'>
                      {metrics && metrics.usersByRole.length > 0 ? (
                        <>
                          The most common role is{' '}
                          <span className='font-semibold'>
                            {
                              metrics.usersByRole.sort(
                                (a, b) => b.count - a.count
                              )[0].name
                            }
                          </span>
                          , making up{' '}
                          {Math.round(
                            (metrics.usersByRole.sort(
                              (a, b) => b.count - a.count
                            )[0].count /
                              metrics.totalUsers) *
                              100
                          )}
                          % of all users.
                        </>
                      ) : (
                        'User role data is being analyzed.'
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* User Status Card */}
              <Card className='lg:col-span-5 overflow-hidden'>
                <CardHeader className='pb-2 flex flex-row items-center justify-between'>
                  <div>
                    <CardTitle className='text-lg font-bold'>
                      User Status
                    </CardTitle>
                    <CardDescription>Active vs Inactive users</CardDescription>
                  </div>
                  <PieChartIcon className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='h-[250px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie
                          data={(metrics?.usersByStatus || []).map((item) => ({
                            name: item.name,
                            value: item.value
                          }))}
                          cx='50%'
                          cy='50%'
                          labelLine={false}
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                          innerRadius={60}
                          outerRadius={80}
                          fill='#8884d8'
                          dataKey='value'
                        ></Pie>
                        <Tooltip
                          formatter={(value: any, name: any) => [
                            `${value} users`,
                            `${name}`
                          ]}
                          contentStyle={{
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            borderRadius: '4px',
                            padding: '8px'
                          }}
                        />
                        <Legend
                          layout='horizontal'
                          verticalAlign='bottom'
                          align='center'
                          wrapperStyle={{ paddingTop: '20px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className='space-y-2 py-2 mt-4'>
                    {metrics?.usersByStatus.map((item, index) => (
                      <div
                        key={index}
                        className='flex items-center justify-between'
                      >
                        <div className='flex items-center'>
                          <div
                            className='w-3 h-3 rounded-full mr-2'
                            style={{ backgroundColor: item.fill }}
                          ></div>
                          <span className='text-sm'>{item.name}</span>
                        </div>
                        <span className='text-sm font-medium'>
                          {item.value} (
                          {metrics.totalUsers > 0
                            ? `${(
                                (item.value / metrics.totalUsers) *
                                100
                              ).toFixed(1)}%`
                            : '0%'}
                          )
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className='mt-4 bg-emerald-50 p-4 rounded-lg'>
                    <div className='font-medium mb-1'>Health Score</div>
                    <div className='flex items-center justify-between'>
                      <p className='text-sm text-emerald-800'>
                        User activity rate:
                      </p>
                      <span className='font-semibold text-emerald-700'>
                        {metrics && metrics.totalUsers > 0
                          ? `${(
                              ((metrics.usersByStatus.find(
                                (s) => s.name === 'Active'
                              )?.value || 0) /
                                metrics.totalUsers) *
                              100
                            ).toFixed(1)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 4: Bottom Stats - 12-column grid */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
              <Card className='flex flex-col'>
                <CardHeader className='pb-2'>
                  <CardTitle>Sales</CardTitle>
                </CardHeader>
                <CardContent className='flex-1 flex flex-col'>
                  <div className='mb-2'>
                    <h3 className='text-2xl font-bold'>$183k</h3>
                    <p className='text-xs text-muted-foreground'>
                      Earnings of Month
                    </p>
                  </div>
                  <div className='flex-1 flex items-center'>
                    <div className='w-full h-12'>
                      <ResponsiveContainer width='100%' height='100%'>
                        <BarChart
                          data={[
                            { name: 'J', value: 28 },
                            { name: 'F', value: 35 },
                            { name: 'M', value: 20 },
                            { name: 'A', value: 32 },
                            { name: 'M', value: 25 },
                            { name: 'J', value: 38 }
                          ]}
                        >
                          <Bar
                            dataKey='value'
                            fill='#4F46E5'
                            radius={[2, 2, 0, 0]}
                            barSize={6}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='flex flex-col'>
                <CardHeader className='pb-2'>
                  <CardTitle>Support</CardTitle>
                </CardHeader>
                <CardContent className='flex-1 flex flex-col'>
                  <div className='mb-2'>
                    <h3 className='text-2xl font-bold'>593</h3>
                    <p className='text-xs text-muted-foreground'>
                      Tickets Resolved
                    </p>
                  </div>
                  <div className='flex-1 flex items-center justify-center'>
                    <div className='w-16 h-16'>
                      <ResponsiveContainer width='100%' height='100%'>
                        <PieChart>
                          <Pie
                            data={[{ value: 75 }, { value: 25 }]}
                            cx='50%'
                            cy='50%'
                            startAngle={180}
                            endAngle={0}
                            innerRadius={25}
                            outerRadius={35}
                            paddingAngle={0}
                            dataKey='value'
                          >
                            <Cell fill='#10B981' />
                            <Cell fill='#F3F4F6' />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='flex flex-col'>
                <CardHeader className='pb-2'>
                  <CardTitle>Orders</CardTitle>
                </CardHeader>
                <CardContent className='flex-1 flex flex-col'>
                  <div className='mb-2'>
                    <h3 className='text-2xl font-bold'>67k</h3>
                    <p className='text-xs text-muted-foreground'>Monthly</p>
                  </div>
                  <div className='flex-1 flex items-center'>
                    <div className='w-full h-12'>
                      <ResponsiveContainer width='100%' height='100%'>
                        <LineChart
                          data={[
                            { name: 'J', value: 10 },
                            { name: 'F', value: 25 },
                            { name: 'M', value: 15 },
                            { name: 'A', value: 30 },
                            { name: 'M', value: 18 },
                            { name: 'J', value: 35 }
                          ]}
                        >
                          <Line
                            type='monotone'
                            dataKey='value'
                            stroke='#10B981'
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
