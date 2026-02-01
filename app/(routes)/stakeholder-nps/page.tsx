'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useNPSDashboard } from '@/hooks/stakeholder-nps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeatLoader } from 'react-spinners';
import {
  Plus,
  BarChart3,
  FileText,
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { DashboardMetrics } from './_components/dashboard-metrics';
import { SurveyFilters } from './_components/survey-filters';
import { SurveyList } from './_components/survey-list';
import { useNPSSurveys } from '@/hooks/stakeholder-nps';

export default function StakeholderNPSPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { selectedInstitutionId: institutionId, loading: institutionLoading } = useUserInstitutionAccess();

  const canViewNPS = isSuperAdmin || canAccess('stakeholder-nps', 'view');
  const canCreateSurvey = isSuperAdmin || canAccess('stakeholder-nps', 'create');

  const {
    dashboard,
    loading: dashboardLoading,
    refreshDashboard
  } = useNPSDashboard(institutionId || '');

  const {
    surveys,
    metadata,
    loading: surveysLoading,
    refetch: refetchSurveys
  } = useNPSSurveys({
    institution_id: institutionId || undefined
  });

  // Loading state
  if (permissionsLoading || institutionLoading) {
    return (
      <ContentLayout title="Stakeholder NPS">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  // Access denied
  if (!canViewNPS) {
    return (
      <ContentLayout title="Stakeholder NPS">
        <div className="text-center py-8">
          <p className="text-destructive">
            You do not have permission to view NPS data.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Stakeholder NPS">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Stakeholder NPS</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Net Promoter Score tracking for all stakeholder types
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => activeTab === 'dashboard' ? refreshDashboard() : refetchSurveys()}
              disabled={dashboardLoading || surveysLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${dashboardLoading || surveysLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canCreateSurvey && (
              <Button asChild>
                <Link href="/stakeholder-nps/surveys/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Survey
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="surveys" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Surveys
            </TabsTrigger>
            <TabsTrigger value="responses" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Responses
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard">
            <DashboardMetrics dashboard={dashboard} loading={dashboardLoading} />
          </TabsContent>

          {/* Surveys Tab */}
          <TabsContent value="surveys" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <SurveyFilters />
              </CardContent>
            </Card>

            {surveysLoading ? (
              <div className="flex items-center justify-center py-16">
                <BeatLoader color="#00e902" />
              </div>
            ) : (
              <SurveyList surveys={surveys} />
            )}
          </TabsContent>

          {/* Responses Tab */}
          <TabsContent value="responses">
            <Card>
              <CardHeader>
                <CardTitle>All Responses</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Select a survey from the Surveys tab to view its responses.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/stakeholder-nps/responses">
                    View All Responses
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
