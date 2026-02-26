'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Brain,
  RefreshCw,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
} from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAIInsightsDashboard } from '@/hooks/admission/use-ai-insights';
import {
  InsightCard,
  RecommendationsList,
  TrendIndicators,
  AnomalyAlerts,
} from '@/components/admission/insights';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function AIInsightsPage() {
  const { selectedInstitutionId: institutionId, loading: institutionLoading } = useUserInstitutionAccess();

  const {
    insights,
    countByPriority,
    recommendations,
    trends,
    anomalies,
    isLoading,
    isGenerating,
    isDismissing,
    generateInsights,
    dismissInsight,
    refetch,
  } = useAIInsightsDashboard(institutionId || '');

  // Auto-generate insights on first load if none exist
  useEffect(() => {
    if (institutionId && !isLoading && insights.length === 0) {
      generateInsights();
    }
  }, [institutionId, isLoading, insights.length, generateInsights]);

  if (institutionLoading) {
    return (
      <PermissionGuard module="admission" action="view">
      <ContentLayout title="Insights">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Insights</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </ContentLayout>
      </PermissionGuard>
    );
  }

  if (!institutionId) {
    return (
      <PermissionGuard module="admission" action="view">
      <ContentLayout title="Insights">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Insights</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">No Institution Selected</h2>
              <p className="text-muted-foreground">
                Please select an institution to view AI insights.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
    <ContentLayout title="Insights">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Insights</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Brain className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Insights</h1>
              <p className="text-sm text-muted-foreground">
                Intelligent recommendations to optimize your admissions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={generateInsights}
              disabled={isGenerating}
            >
              <Sparkles className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-pulse' : ''}`} />
              {isGenerating ? 'Generating...' : 'Generate Insights'}
            </Button>
          </div>
        </div>

        {/* Priority Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Critical</p>
                  <p className="text-2xl font-bold text-red-700">
                    {countByPriority.critical}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">High Priority</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {countByPriority.high}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Medium</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {countByPriority.medium}
                  </p>
                </div>
                <Info className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Low Priority</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {countByPriority.low}
                  </p>
                </div>
                <Lightbulb className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Active Insights */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Active Insights
                    {insights.length > 0 && (
                      <Badge variant="secondary">{insights.length}</Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : insights.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Brain className="h-16 w-16 mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-2">No Active Insights</h3>
                    <p className="text-sm mb-4">
                      Click "Generate Insights" to analyze your data and get
                      actionable recommendations.
                    </p>
                    <Button onClick={generateInsights} disabled={isGenerating}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Insights
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={dismissInsight}
                        isDismissing={isDismissing}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Recommendations, Trends, Anomalies */}
          <div className="space-y-6">
            <RecommendationsList
              recommendations={recommendations}
              isLoading={isLoading}
              maxItems={4}
            />

            <TrendIndicators trends={trends} isLoading={isLoading} />

            <AnomalyAlerts anomalies={anomalies} isLoading={isLoading} maxItems={3} />
          </div>
        </div>

        {/* Quick Actions - Compact Insights */}
        {insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {insights
                  .filter((i) => i.priority === 'critical' || i.priority === 'high')
                  .slice(0, 6)
                  .map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismissInsight}
                      isDismissing={isDismissing}
                      compact
                    />
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
