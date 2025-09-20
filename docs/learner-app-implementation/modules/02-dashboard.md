# Module 2: Dashboard System

## 📋 Overview

This module implements an optimized dashboard for the learner application, focusing on fast loading, mobile-first design, and intelligent data fetching. The dashboard serves as the main landing page for students and provides a comprehensive overview of their academic status.

## 🎯 Objectives

- **Fast Loading**: Dashboard loads in < 2 seconds
- **Mobile-First**: Native mobile experience with touch optimization
- **Intelligent Caching**: Smart data fetching and background updates
- **Progressive Loading**: Components load incrementally for better UX
- **Real-time Updates**: Live data without page refresh
- **Offline Support**: Show cached data when offline

## 🎨 Design System & Brand Colors

Based on your current learners module, we'll maintain the same visual identity:

```css
/* Learner Module Brand Colors */
:root {
  --learner-primary: #0ea5e9;      /* Sky blue */
  --learner-secondary: #0284c7;    /* Darker sky blue */
  --learner-accent: #38bdf8;       /* Light sky blue */
  --learner-success: #10b981;      /* Emerald green */
  --learner-warning: #f59e0b;      /* Amber */
  --learner-error: #ef4444;        /* Red */

  /* Gradients */
  --learner-gradient-bg: linear-gradient(to bottom right, #f8fafc, #e0f2fe, #f0f9ff);
  --learner-gradient-card: linear-gradient(135deg, #ffffff, #f8fafc);
  --learner-gradient-primary: linear-gradient(135deg, #0ea5e9, #0284c7);
}
```

## 📁 File Structure

```
src/
├── app/
│   └── (main)/
│       ├── dashboard/
│       │   └── page.tsx                 # Main dashboard page
│       └── layout.tsx                   # Main app layout
├── components/
│   ├── dashboard/
│   │   ├── welcome-header.tsx           # Welcome header with user info
│   │   ├── summary-cards.tsx            # Key metrics cards
│   │   ├── analytics-section.tsx        # Charts and analytics
│   │   ├── quick-actions.tsx            # Quick action buttons
│   │   ├── recent-activity.tsx          # Recent activity feed
│   │   ├── progress-widgets.tsx         # Progress tracking
│   │   ├── facilitators-section.tsx     # Faculty information
│   │   ├── calendar-widget.tsx          # Mini calendar
│   │   ├── image-slider.tsx             # Promotional images
│   │   ├── fortune-card.tsx             # Daily fortune feature
│   │   └── dashboard-skeleton.tsx       # Loading skeletons
│   ├── layout/
│   │   ├── learner-layout.tsx           # Main layout wrapper
│   │   ├── learner-header.tsx           # Top navigation
│   │   ├── learner-sidebar.tsx          # Desktop sidebar
│   │   ├── learner-bottom-nav.tsx       # Mobile bottom navigation
│   │   └── breadcrumbs.tsx              # Breadcrumb navigation
│   └── ui/
│       ├── card.tsx                     # Card component
│       ├── skeleton.tsx                 # Loading skeleton
│       └── progress.tsx                 # Progress bar
├── lib/
│   ├── services/
│   │   └── dashboard-service.ts         # Dashboard data service
│   ├── stores/
│   │   └── dashboard-store.ts           # Dashboard state management
│   └── hooks/
│       ├── use-dashboard-data.ts        # Dashboard data hook
│       └── use-mobile-detection.ts      # Mobile detection hook
└── types/
    └── dashboard.ts                     # Dashboard type definitions
```

## 🚀 Implementation Steps

### Step 1: Dashboard Type Definitions

Create `src/types/dashboard.ts`:

```typescript
export interface DashboardStats {
  attendance: {
    overall_percentage: number;
    this_month: number;
    trend: 'up' | 'down' | 'stable';
    status: 'good' | 'warning' | 'critical';
  };
  billing: {
    total_outstanding: number;
    due_this_month: number;
    payment_status: 'current' | 'overdue' | 'partial';
    next_due_date: string | null;
  };
  academic: {
    current_semester: string;
    total_courses: number;
    completed_assignments: number;
    pending_assignments: number;
  };
  apps: {
    total_available: number;
    favorites_count: number;
    recently_used: number;
  };
}

export interface RecentActivity {
  id: string;
  type: 'attendance' | 'billing' | 'academic' | 'app' | 'notification';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error' | 'info';
  metadata?: Record<string, any>;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  priority: number;
  badge?: string | number;
}

export interface ProgressWidget {
  id: string;
  title: string;
  current: number;
  total: number;
  unit: string;
  color: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
}

export interface FacilitatorInfo {
  id: string;
  name: string;
  subject: string;
  avatar_url?: string;
  contact_email?: string;
  office_hours?: string;
  is_available: boolean;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_activities: RecentActivity[];
  quick_actions: QuickAction[];
  progress_widgets: ProgressWidget[];
  facilitators: FacilitatorInfo[];
  last_updated: string;
}

export interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  lastFetch: number;
  cacheExpiry: number;
}
```

### Step 2: Dashboard Service Layer

Create `src/lib/services/dashboard-service.ts`:

```typescript
import { createClient } from '@/lib/supabase/client';
import type { DashboardData, DashboardStats } from '@/types/dashboard';

export class DashboardService {
  private static instance: DashboardService;
  private supabase = createClient();
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  async getDashboardData(studentId: string): Promise<DashboardData> {
    const cacheKey = `dashboard_${studentId}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      // Return cached data and refresh in background
      this.refreshInBackground(studentId);
      return cached;
    }

    return this.fetchDashboardData(studentId);
  }

  private async fetchDashboardData(studentId: string): Promise<DashboardData> {
    try {
      const [stats, activities, actions, progress, facilitators] = await Promise.all([
        this.getDashboardStats(studentId),
        this.getRecentActivities(studentId),
        this.getQuickActions(studentId),
        this.getProgressWidgets(studentId),
        this.getFacilitators(studentId),
      ]);

      const dashboardData: DashboardData = {
        stats,
        recent_activities: activities,
        quick_actions: actions,
        progress_widgets: progress,
        facilitators,
        last_updated: new Date().toISOString(),
      };

      // Cache the result
      this.setCache(`dashboard_${studentId}`, dashboardData);

      return dashboardData;
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to load dashboard data');
    }
  }

  private async getDashboardStats(studentId: string): Promise<DashboardStats> {
    // Optimized single query for all dashboard stats
    const { data, error } = await this.supabase.rpc('get_student_dashboard_stats', {
      p_student_id: studentId,
    });

    if (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }

    return data || this.getDefaultStats();
  }

  private async getRecentActivities(studentId: string) {
    const { data, error } = await this.supabase
      .from('student_activity_log')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching activities:', error);
      return [];
    }

    return data?.map(activity => ({
      id: activity.id,
      type: activity.activity_type,
      title: activity.title,
      description: activity.description,
      timestamp: activity.created_at,
      status: activity.status,
      metadata: activity.metadata,
    })) || [];
  }

  private async getQuickActions(studentId: string) {
    // Define default quick actions for students
    return [
      {
        id: 'attendance',
        title: 'View Attendance',
        description: 'Check your attendance records',
        icon: 'calendar-check',
        href: '/attendance',
        color: 'emerald',
        priority: 1,
      },
      {
        id: 'billing',
        title: 'Pay Bills',
        description: 'View and pay your bills',
        icon: 'credit-card',
        href: '/billing',
        color: 'blue',
        priority: 2,
      },
      {
        id: 'apps',
        title: 'Apps',
        description: 'Access learning apps',
        icon: 'grid-3x3',
        href: '/apps',
        color: 'purple',
        priority: 3,
      },
      {
        id: 'profile',
        title: 'Profile',
        description: 'Update your profile',
        icon: 'user',
        href: '/profile',
        color: 'orange',
        priority: 4,
      },
    ];
  }

  private async getProgressWidgets(studentId: string) {
    const { data, error } = await this.supabase.rpc('get_student_progress_data', {
      p_student_id: studentId,
    });

    if (error || !data) {
      return this.getDefaultProgressWidgets();
    }

    return data;
  }

  private async getFacilitators(studentId: string) {
    const { data, error } = await this.supabase.rpc('get_student_facilitators', {
      p_student_id: studentId,
    });

    if (error || !data) {
      return [];
    }

    return data;
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  private async refreshInBackground(studentId: string): Promise<void> {
    try {
      const freshData = await this.fetchDashboardData(studentId);
      this.setCache(`dashboard_${studentId}`, freshData);
    } catch (error) {
      console.error('Background refresh failed:', error);
    }
  }

  private getDefaultStats(): DashboardStats {
    return {
      attendance: {
        overall_percentage: 0,
        this_month: 0,
        trend: 'stable',
        status: 'warning',
      },
      billing: {
        total_outstanding: 0,
        due_this_month: 0,
        payment_status: 'current',
        next_due_date: null,
      },
      academic: {
        current_semester: 'N/A',
        total_courses: 0,
        completed_assignments: 0,
        pending_assignments: 0,
      },
      apps: {
        total_available: 0,
        favorites_count: 0,
        recently_used: 0,
      },
    };
  }

  private getDefaultProgressWidgets() {
    return [
      {
        id: 'attendance_progress',
        title: 'Attendance',
        current: 0,
        total: 100,
        unit: '%',
        color: 'emerald',
      },
      {
        id: 'semester_progress',
        title: 'Semester Progress',
        current: 0,
        total: 100,
        unit: '%',
        color: 'blue',
      },
    ];
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const dashboardService = DashboardService.getInstance();
```

### Step 3: Dashboard Store (Zustand)

Create `src/lib/stores/dashboard-store.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DashboardState, DashboardData } from '@/types/dashboard';
import { dashboardService } from '@/lib/services/dashboard-service';

interface DashboardActions {
  fetchDashboardData: (studentId: string) => Promise<void>;
  refreshData: (studentId: string) => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

type DashboardStore = DashboardState & DashboardActions;

export const useDashboardStore = create<DashboardStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      data: null,
      loading: false,
      error: null,
      lastFetch: 0,
      cacheExpiry: 5 * 60 * 1000, // 5 minutes

      // Actions
      fetchDashboardData: async (studentId: string) => {
        const state = get();

        // Check if we have recent data
        if (state.data && Date.now() - state.lastFetch < state.cacheExpiry) {
          return;
        }

        set({ loading: true, error: null });

        try {
          const data = await dashboardService.getDashboardData(studentId);
          set({
            data,
            loading: false,
            error: null,
            lastFetch: Date.now(),
          });
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load dashboard',
          });
        }
      },

      refreshData: async (studentId: string) => {
        set({ loading: true, error: null });

        try {
          dashboardService.clearCache();
          const data = await dashboardService.getDashboardData(studentId);
          set({
            data,
            loading: false,
            error: null,
            lastFetch: Date.now(),
          });
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to refresh dashboard',
          });
        }
      },

      clearError: () => set({ error: null }),
      setLoading: (loading: boolean) => set({ loading }),
    }),
    {
      name: 'dashboard-store',
    }
  )
);
```

### Step 4: Dashboard Hook

Create `src/lib/hooks/use-dashboard-data.ts`:

```typescript
import { useEffect } from 'react';
import { useDashboardStore } from '@/lib/stores/dashboard-store';
import { useAuth } from './use-auth';

export function useDashboardData() {
  const { student } = useAuth();
  const dashboardState = useDashboardStore();

  useEffect(() => {
    if (student?.id && !dashboardState.data && !dashboardState.loading) {
      dashboardState.fetchDashboardData(student.id);
    }
  }, [student?.id]);

  const refresh = () => {
    if (student?.id) {
      dashboardState.refreshData(student.id);
    }
  };

  const isStale = () => {
    return Date.now() - dashboardState.lastFetch > dashboardState.cacheExpiry;
  };

  return {
    ...dashboardState,
    refresh,
    isStale: isStale(),
    hasData: !!dashboardState.data,
  };
}
```

### Step 5: Main Dashboard Page

Create `src/app/(main)/dashboard/page.tsx`:

```typescript
'use client';

import { Suspense } from 'react';
import { WelcomeHeader } from '@/components/dashboard/welcome-header';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { AnalyticsSection } from '@/components/dashboard/analytics-section';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { ProgressWidgets } from '@/components/dashboard/progress-widgets';
import { FacilitatorsSection } from '@/components/dashboard/facilitators-section';
import { ImageSlider } from '@/components/dashboard/image-slider';
import { FortuneCard } from '@/components/dashboard/fortune-card';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useDashboardData } from '@/lib/hooks/use-dashboard-data';
import { performanceMonitor } from '@/lib/utils/performance';
import { useEffect } from 'react';

export default function DashboardPage() {
  useEffect(() => {
    performanceMonitor.startMark('dashboard-load');
    return () => {
      performanceMonitor.endMark('dashboard-load');
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-learner-50/20 relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.3),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.3),transparent_50%),radial-gradient(circle_at_40%_40%,rgba(2,132,199,0.3),transparent_50%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 space-y-6 md:space-y-8">
        <ErrorBoundary>
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardContent />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { data, loading, error, refresh } = useDashboardData();

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Unable to load dashboard
          </h3>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Welcome Header */}
      <WelcomeHeader />

      {/* Image Slider */}
      <div className="w-full">
        <ImageSlider />
      </div>

      {/* Main Content Container */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-4 space-y-6 sm:space-y-8 pb-8">
        {/* Dashboard Overview Cards */}
        <div className="w-full">
          <SummaryCards stats={data?.stats} loading={loading} />
        </div>

        {/* Progress Section */}
        <div className="w-full">
          <ProgressWidgets widgets={data?.progress_widgets} loading={loading} />
        </div>

        {/* Analytics Section */}
        <div className="w-full">
          <AnalyticsSection stats={data?.stats} loading={loading} />
        </div>

        {/* Facilitators Section */}
        <div className="w-full">
          <FacilitatorsSection facilitators={data?.facilitators} loading={loading} />
        </div>

        {/* Recent Activity with Fortune Card & Calendar */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* Recent Activity - Takes 2/3 width */}
          <div className="xl:col-span-2">
            <RecentActivity activities={data?.recent_activities} loading={loading} />
          </div>

          {/* Fortune Card & Calendar - Takes 1/3 width */}
          <div className="xl:col-span-1 space-y-6">
            <FortuneCard />
            <CalendarWidget />
          </div>
        </div>

        {/* Quick Actions Section */}
        <div className="w-full">
          <QuickActions actions={data?.quick_actions} loading={loading} />
        </div>
      </div>
    </>
  );
}
```

### Step 6: Welcome Header Component

Create `src/components/dashboard/welcome-header.tsx`:

```typescript
'use client';

import { useAuth } from '@/lib/hooks/use-auth';
import { useDashboardData } from '@/lib/hooks/use-dashboard-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Bell } from 'lucide-react';
import { format } from 'date-fns';

export function WelcomeHeader() {
  const { profile, student } = useAuth();
  const { refresh, loading, isStale, lastFetch } = useDashboardData();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getStatusBadge = () => {
    if (!student) return null;

    const statusConfig = {
      active: { label: 'Active', variant: 'success' as const },
      pending: { label: 'Pending', variant: 'warning' as const },
      inactive: { label: 'Inactive', variant: 'secondary' as const },
      graduated: { label: 'Graduated', variant: 'success' as const },
      exited: { label: 'Exited', variant: 'destructive' as const },
    };

    const config = statusConfig[student.status] || statusConfig.inactive;

    return (
      <Badge variant={config.variant} className="ml-2">
        {config.label}
      </Badge>
    );
  };

  if (!profile) {
    return (
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-4 py-4 md:py-6">
        <div className="flex items-center justify-between">
          {/* Welcome Message */}
          <div className="space-y-1">
            <div className="flex items-center">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                {getGreeting()}, {profile.full_name.split(' ')[0]}! 👋
              </h1>
              {getStatusBadge()}
            </div>
            <p className="text-sm md:text-base text-gray-600">
              Welcome back to your learning dashboard
            </p>
            {lastFetch > 0 && (
              <p className="text-xs text-gray-500">
                Last updated: {format(new Date(lastFetch), 'MMM dd, h:mm a')}
                {isStale && (
                  <span className="ml-1 text-amber-600 font-medium">
                    (Update available)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* Notifications */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:flex items-center"
            >
              <Bell className="h-4 w-4" />
              <span className="ml-2 hidden md:inline">Notifications</span>
            </Button>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="flex items-center"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-2 hidden sm:inline">
                {loading ? 'Updating...' : 'Refresh'}
              </span>
            </Button>
          </div>
        </div>

        {/* Quick Stats Bar (Mobile) */}
        <div className="mt-4 grid grid-cols-3 gap-4 sm:hidden">
          <div className="text-center">
            <div className="text-lg font-semibold text-learner-600">85%</div>
            <div className="text-xs text-gray-500">Attendance</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">₹0</div>
            <div className="text-xs text-gray-500">Due Amount</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600">12</div>
            <div className="text-xs text-gray-500">Apps</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 7: Summary Cards Component

Create `src/components/dashboard/summary-cards.tsx`:

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardStats } from '@/types/dashboard';
import {
  Calendar,
  CreditCard,
  BookOpen,
  Grid3X3,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

interface SummaryCardsProps {
  stats?: DashboardStats;
  loading?: boolean;
}

export function SummaryCards({ stats, loading }: SummaryCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Attendance',
      value: `${stats.attendance.overall_percentage}%`,
      subtitle: `${stats.attendance.this_month}% this month`,
      icon: Calendar,
      color: 'emerald',
      trend: stats.attendance.trend,
      status: stats.attendance.status,
    },
    {
      title: 'Outstanding Bills',
      value: `₹${stats.billing.total_outstanding.toLocaleString()}`,
      subtitle: `₹${stats.billing.due_this_month.toLocaleString()} due this month`,
      icon: CreditCard,
      color: 'blue',
      status: stats.billing.payment_status,
    },
    {
      title: 'Academic Progress',
      value: `${stats.academic.total_courses} Courses`,
      subtitle: `${stats.academic.completed_assignments}/${stats.academic.completed_assignments + stats.academic.pending_assignments} assignments done`,
      icon: BookOpen,
      color: 'purple',
    },
    {
      title: 'Available Apps',
      value: `${stats.apps.total_available}`,
      subtitle: `${stats.apps.favorites_count} favorites`,
      icon: Grid3X3,
      color: 'orange',
    },
  ];

  const getStatusBadge = (status: string, type: string) => {
    if (type === 'attendance') {
      const variants = {
        good: 'success',
        warning: 'warning',
        critical: 'destructive',
      } as const;
      return <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>;
    }

    if (type === 'billing') {
      const variants = {
        current: 'success',
        overdue: 'destructive',
        partial: 'warning',
      } as const;
      return <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>;
    }

    return null;
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
        <span className="text-sm text-gray-500">Real-time data</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {cards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            emerald: 'bg-emerald-500 text-white',
            blue: 'bg-blue-500 text-white',
            purple: 'bg-purple-500 text-white',
            orange: 'bg-orange-500 text-white',
          };

          return (
            <Card
              key={index}
              className="border-0 shadow-lg bg-white/90 backdrop-blur-sm hover:shadow-xl transition-all duration-300 group cursor-pointer"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {card.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${colorClasses[card.color as keyof typeof colorClasses]} group-hover:scale-110 transition-transform`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </div>
                  {card.trend && getTrendIcon(card.trend)}
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {card.subtitle}
                  </p>
                  {card.status && getStatusBadge(card.status, card.title.toLowerCase())}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

### Step 8: Dashboard Skeleton Component

Create `src/components/dashboard/dashboard-skeleton.tsx`:

```typescript
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-learner-50/20">
      <div className="space-y-6 md:space-y-8">
        {/* Header Skeleton */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-48" />
              </div>
              <div className="flex space-x-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </div>
        </div>

        {/* Image Slider Skeleton */}
        <div className="w-full">
          <Skeleton className="w-full h-48 md:h-64" />
        </div>

        {/* Content Container */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-4 space-y-6 sm:space-y-8 pb-8">
          {/* Summary Cards Skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                    <Skeleton className="h-8 w-16" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Progress Widgets Skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <Skeleton className="h-5 w-24 mb-4" />
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Analytics Section Skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-36" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Activity & Calendar Skeleton */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            {/* Recent Activity */}
            <div className="xl:col-span-2">
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Fortune & Calendar */}
            <div className="xl:col-span-1 space-y-6">
              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-28" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Quick Actions Skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
                  <CardContent className="p-6 text-center">
                    <Skeleton className="h-12 w-12 rounded-lg mx-auto mb-4" />
                    <Skeleton className="h-5 w-20 mx-auto mb-2" />
                    <Skeleton className="h-4 w-16 mx-auto" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## ✅ Performance Optimizations

### 1. Lazy Loading Strategy

```typescript
// Implement component lazy loading
const AnalyticsSection = lazy(() => import('@/components/dashboard/analytics-section'));
const RecentActivity = lazy(() => import('@/components/dashboard/recent-activity'));

// Use with Suspense
<Suspense fallback={<ComponentSkeleton />}>
  <AnalyticsSection />
</Suspense>
```

### 2. Virtual Scrolling for Lists

```typescript
// For large lists like recent activities
import { FixedSizeList as List } from 'react-window';

const ActivityList = memo(({ activities }) => (
  <List
    height={400}
    itemCount={activities.length}
    itemSize={60}
    itemData={activities}
  >
    {ActivityItem}
  </List>
));
```

### 3. Image Optimization

```typescript
// Optimized image component
import Image from 'next/image';

const OptimizedImage = ({ src, alt, ...props }) => (
  <Image
    src={src}
    alt={alt}
    loading="lazy"
    placeholder="blur"
    blurDataURL="data:image/jpeg;base64,..."
    {...props}
  />
);
```

## 📊 Performance Targets

| Metric | Target | Implementation |
|--------|---------|----------------|
| Dashboard FCP | < 1.5s | Component lazy loading |
| Data Load Time | < 2s | Intelligent caching |
| Memory Usage | < 100MB | Optimized stores |
| Bundle Size | < 500KB | Code splitting |
| Mobile Score | > 95 | Mobile-first design |

## ✅ Testing & Verification Checklist

- [ ] Dashboard loads in < 2 seconds
- [ ] All components render correctly on mobile
- [ ] Data caching works properly
- [ ] Background refresh works
- [ ] Error states are handled gracefully
- [ ] Loading skeletons match actual components
- [ ] Touch interactions work smoothly
- [ ] Offline detection works
- [ ] Performance monitoring is active
- [ ] Memory leaks are prevented

## 🚀 Next Steps

After completing this module:

1. **Test dashboard performance thoroughly**
2. **Proceed to [Attendance Module](./03-attendance.md)**
3. **Monitor real-world performance metrics**
4. **Collect user feedback on dashboard experience**

---

**Module Completion Time**: 3-4 days
**Dependencies**: Authentication Module
**Next Module**: [Attendance](./03-attendance.md)