'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useCampaignMonitoringDashboard } from '@/hooks/admission/use-campaign-monitoring';
import {
  CampaignStatsCards,
  DeliveryChart,
  DripProgressTable,
  ExecutionLogFeed,
} from '@/components/admission/campaign-monitoring';
import { RefreshCw, Loader2, Settings, Plus, Activity } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

function CampaignMonitoringDashboardContent() {
  const { profile, isLoading: authLoading } = useAuth();
  const institutionId = profile?.institution_id;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    stats,
    deliveryMetrics,
    activeSequences,
    recentLogs,
    isLoading,
    isConnected,
    refetchAll,
  } = useCampaignMonitoringDashboard(institutionId);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      refetchAll();
      toast.success('Dashboard refreshed');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const loading = authLoading || isLoading;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Campaign Monitoring">
        <div className="space-y-6">
          {/* Header with Breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/re-engagement">Campaigns</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Monitoring</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-2">
              {/* Connection Status */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span>{isConnected ? 'Live' : 'Polling'}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || loading}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>

              <Button variant="outline" size="sm" asChild>
                <Link href="/admission/re-engagement">
                  <Settings className="h-4 w-4 mr-2" />
                  Manage
                </Link>
              </Button>

              <Button asChild>
                <Link href="/admission/re-engagement">
                  <Plus className="h-4 w-4 mr-2" />
                  New Campaign
                </Link>
              </Button>
            </div>
          </div>

          {/* Page Title with Activity Indicator */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Campaign Monitoring Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Real-time tracking of campaign performance and message delivery
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <CampaignStatsCards stats={stats} isLoading={loading} />

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Delivery Chart - Takes 1 column */}
            <DeliveryChart metrics={deliveryMetrics} isLoading={loading} />

            {/* Drip Progress Table - Takes 2 columns */}
            <div className="lg:col-span-2">
              <DripProgressTable sequences={activeSequences} isLoading={loading} />
            </div>
          </div>

          {/* Execution Log - Full Width */}
          <ExecutionLogFeed
            logs={recentLogs}
            isLoading={loading}
            isConnected={isConnected}
            onRefresh={refetchAll}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CampaignMonitoringPage() {
  return (
    <AdmissionErrorBoundary>
      <CampaignMonitoringDashboardContent />
    </AdmissionErrorBoundary>
  );
}
