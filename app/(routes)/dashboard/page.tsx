import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getCurrentUser,
  getDashboardConfigurations,
  getAvailableWidgetTypes
} from './_data/get-dashboard-data';
import { DashboardBentoGrid } from './_components/dashboard-bento-grid';
import { DashboardControls } from './_components/dashboard-controls';
import {
  DashboardSkeleton,
  BentoGridSkeleton,
  DashboardWidgetsSkeleton
} from './_components/dashboard-skeleton';

interface DashboardPageProps {
  searchParams: Promise<{
    config?: string;
  }>;
}

export default async function DashboardPage({
  searchParams
}: DashboardPageProps) {
  const params = await searchParams;

  // Log dashboard page access
  console.log('[Dashboard Page] 🏠 Dashboard page loaded');
  console.log('[Dashboard Page] Search params:', params);

  return (
    <ContentLayout title='Dashboard'>
      <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
        {/* BentoGrid Section - Server rendered with Suspense */}
        <Suspense fallback={<BentoGridSkeleton />}>
          <BentoGridSection />
        </Suspense>

        {/* Dashboard Controls */}
        <Suspense
          fallback={
            <div className='flex justify-between items-center px-2 sm:px-4'>
              <div className='h-9 w-48 bg-muted animate-pulse rounded' />
              <div className='h-9 w-24 bg-muted animate-pulse rounded' />
            </div>
          }
        >
          <DashboardControlsSection configId={params.config} />
        </Suspense>

        {/* Configurable Dashboard Widgets */}
        <Suspense fallback={<DashboardWidgetsSkeleton />}>
          <DashboardWidgetsSection configId={params.config} />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

/**
 * BentoGrid Section - Async Server Component
 */
async function BentoGridSection() {
  const user = await getCurrentUser();
  const currentUser = user?.fullName || 'User';

  return (
    <div className='w-full'>
      <DashboardBentoGrid currentUser={currentUser} />
    </div>
  );
}

/**
 * Dashboard Controls Section - Async Server Component
 */
async function DashboardControlsSection({
  configId
}: {
  configId?: string;
}) {
  const configurations = await getDashboardConfigurations();

  return (
    <DashboardControls
      configurations={configurations}
      currentConfigurationId={
        configId || configurations.find((c) => c.is_default)?.id
      }
    />
  );
}

/**
 * Dashboard Widgets Section - Async Server Component
 */
async function DashboardWidgetsSection({ configId }: { configId?: string }) {
  const configurations = await getDashboardConfigurations();
  const currentConfiguration =
    configurations.find((c) => c.id === configId) ||
    configurations.find((c) => c.is_default) ||
    configurations[0] ||
    null;

  if (!currentConfiguration) {
    return <EmptyDashboard />;
  }

  if (configurations.length === 0) {
    return <ErrorDashboard message='No dashboard configurations found' />;
  }

  return (
    <div className='px-1 sm:px-2 lg:px-4'>
      <DashboardLayout
        configuration={currentConfiguration}
        isEditing={false}
      />
    </div>
  );
}

/**
 * Empty Dashboard State
 */
function EmptyDashboard() {
  return (
    <div className='flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] max-w-[600px] mx-auto p-4 sm:p-6 bg-muted/50 rounded-lg border border-border'>
      <div className='text-muted-foreground mb-4'>
        <AlertCircle size={32} className='sm:w-10 sm:h-10' />
      </div>
      <h2 className='text-lg sm:text-xl font-semibold mb-2 text-center'>
        No Dashboard Configured
      </h2>
      <p className='text-muted-foreground text-center mb-4 sm:mb-6 text-sm sm:text-base px-2'>
        Get started by creating your first dashboard configuration.
      </p>
    </div>
  );
}

/**
 * Error Dashboard State
 */
function ErrorDashboard({ message }: { message: string }) {
  return (
    <div className='flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] max-w-[600px] mx-auto p-4 sm:p-6 bg-red-50 rounded-lg border border-red-200'>
      <div className='text-red-500 mb-4'>
        <AlertCircle size={32} className='sm:w-10 sm:h-10' />
      </div>
      <h2 className='text-lg sm:text-xl font-semibold mb-2 text-center'>
        Error Loading Dashboard
      </h2>
      <p className='text-destructive text-center mb-4 sm:mb-6 text-sm sm:text-base px-2'>
        {message}
      </p>
      <Button className='flex items-center gap-2 w-full sm:w-auto'>
        <RefreshCw className='h-4 w-4' />
        Retry
      </Button>
    </div>
  );
}
