'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useChatbotConfig } from '@/hooks/admission/use-chatbot-config';
import { useChatbotAnalytics } from '@/hooks/admission/use-chatbot-analytics';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  BarChart3,
  MessageSquare,
  ArrowUpRight,
  TrendingUp,
  Brain,
  Users,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

function AnalyticsContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const { config, isLoading: configLoading } = useChatbotConfig(selectedInstitutionId || undefined);
  const { analytics, isLoading: analyticsLoading } = useChatbotAnalytics({
    chatbot_id: config?.id || '',
  });

  const isLoading = accessLoading || configLoading || analyticsLoading;

  if (isLoading) {
    return (
      <ContentLayout title="Chatbot Analytics">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16" /></CardContent></Card>
            ))}
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!config) {
    return (
      <ContentLayout title="Chatbot Analytics">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Please configure the chatbot first to view analytics.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const maxSessionsByDay = Math.max(
    ...(analytics?.sessions_by_day || []).map((d: any) => d.count),
    1
  );

  return (
    <ContentLayout title="Chatbot Analytics">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/marketing/chatbot">AI Chatbot</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Analytics</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.total_sessions || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics?.active_sessions || 0} currently active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Messages/Session</CardTitle>
              <Brain className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.avg_message_count || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Handoff Rate</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.handoff_rate || 0}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics?.handed_off_sessions || 0} sessions handed off
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lead Conversion</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.lead_conversion_rate || 0}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg intent score: {analytics?.avg_intent_score || 0}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Session Volume Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Session Volume
              </CardTitle>
              <CardDescription>Sessions per day</CardDescription>
            </CardHeader>
            <CardContent>
              {!analytics?.sessions_by_day || analytics.sessions_by_day.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No session data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {analytics.sessions_by_day.slice(-14).map((day: any) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-muted-foreground shrink-0">
                        {new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(day.count / maxSessionsByDay) * 100}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs font-medium text-right">{day.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Questions / Intents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" /> Top Question Categories
              </CardTitle>
              <CardDescription>Most common inquiry types</CardDescription>
            </CardHeader>
            <CardContent>
              {!analytics?.top_intents || analytics.top_intents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No intent data yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.top_intents.map((intent: any, idx: number) => {
                    const maxCount = analytics.top_intents[0]?.count || 1;
                    const intentLabel = intent.intent
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c: string) => c.toUpperCase());

                    return (
                      <div key={intent.intent} className="flex items-center gap-3">
                        <div className="w-6 text-xs text-muted-foreground text-right">
                          {idx + 1}.
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate">{intentLabel}</span>
                            <span className="text-xs text-muted-foreground ml-2">{intent.count}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${(intent.count / maxCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Session Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Session Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg border">
                <div className="text-3xl font-bold text-green-600">{analytics?.active_sessions || 0}</div>
                <p className="text-sm text-muted-foreground mt-1">Active</p>
                <Badge variant="outline" className="mt-2">
                  {analytics?.total_sessions
                    ? Math.round(((analytics.active_sessions || 0) / analytics.total_sessions) * 100)
                    : 0}%
                </Badge>
              </div>
              <div className="text-center p-4 rounded-lg border">
                <div className="text-3xl font-bold text-orange-600">{analytics?.handed_off_sessions || 0}</div>
                <p className="text-sm text-muted-foreground mt-1">Handed Off</p>
                <Badge variant="outline" className="mt-2">
                  {analytics?.handoff_rate || 0}%
                </Badge>
              </div>
              <div className="text-center p-4 rounded-lg border">
                <div className="text-3xl font-bold text-gray-600">{analytics?.ended_sessions || 0}</div>
                <p className="text-sm text-muted-foreground mt-1">Ended</p>
                <Badge variant="outline" className="mt-2">
                  {analytics?.total_sessions
                    ? Math.round(((analytics.ended_sessions || 0) / analytics.total_sessions) * 100)
                    : 0}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function ChatbotAnalyticsPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <AnalyticsContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
