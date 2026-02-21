'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import type { BroadcastStatus } from '@/lib/services/telephony/voice-broadcast-service';
import {
  useVoiceBroadcastCampaigns,
  useVoiceBroadcastStats,
  useVoiceBroadcastMutations,
} from '@/hooks/admission/use-voice-broadcast';
import {
  Megaphone, Phone, PhoneCall, Play, Pause, XCircle,
  RefreshCw, Users, TrendingUp, Clock, BarChart3,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const CAMPAIGN_STATUS_STYLES: Record<string, { color: string; icon: React.ElementType }> = {
  draft: { color: 'bg-gray-100 text-gray-800', icon: Clock },
  scheduled: { color: 'bg-purple-100 text-purple-800', icon: Clock },
  in_progress: { color: 'bg-blue-100 text-blue-800', icon: Play },
  paused: { color: 'bg-yellow-100 text-yellow-800', icon: Pause },
  completed: { color: 'bg-green-100 text-green-800', icon: PhoneCall },
  cancelled: { color: 'bg-red-100 text-red-800', icon: XCircle },
};

function VoiceBroadcastPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { campaigns, total, isLoading: campaignsLoading, refetch } = useVoiceBroadcastCampaigns({
    institutionId: institutionId || '',
    status: statusFilter !== 'all' ? statusFilter as BroadcastStatus : undefined,
    limit: 20,
  });
  const { stats, isLoading: statsLoading } = useVoiceBroadcastStats(institutionId);
  const { startCampaign, pauseCampaign, cancelCampaign } = useVoiceBroadcastMutations();

  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return `${amount.toFixed(0)}`;
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Voice Broadcast">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Voice Broadcast</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Megaphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Voice Broadcast Campaigns</h1>
              <p className="text-sm text-muted-foreground">
                Send pre-recorded voice messages to targeted lead segments
              </p>
            </div>
          </div>

          {/* Stats KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
                <Megaphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{stats.total_campaigns}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Calls Made</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{stats.total_calls_made.toLocaleString()}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Answer Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {statsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatPercent(stats.avg_answer_rate)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatCurrency(stats.total_cost)}</div>}
              </CardContent>
            </Card>
          </div>

          {/* Campaign List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Broadcast Campaigns</CardTitle>
                  <CardDescription>{total} campaigns total</CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No broadcast campaigns</p>
                  <p>Create a voice broadcast campaign to reach leads at scale.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map((campaign: any) => {
                    const statusStyle = CAMPAIGN_STATUS_STYLES[campaign.status] || CAMPAIGN_STATUS_STYLES.draft;
                    const StatusIcon = statusStyle.icon;
                    const isRunning = campaign.status === 'in_progress';
                    const isPaused = campaign.status === 'paused';
                    const isDraft = campaign.status === 'draft' || campaign.status === 'scheduled';

                    return (
                      <div key={campaign.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="p-1.5 rounded bg-primary/10 mt-0.5">
                            <StatusIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{campaign.campaign_name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={`text-xs ${statusStyle.color}`}>
                                {campaign.status.replace(/_/g, ' ')}
                              </Badge>
                              {campaign.audience_size && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="h-3 w-3" />{campaign.audience_size} leads
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(campaign.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Progress stats */}
                          <div className="flex items-center gap-4 text-sm">
                            {campaign.total_calls != null && (
                              <div className="text-center">
                                <p className="font-medium">{campaign.total_calls}</p>
                                <p className="text-xs text-muted-foreground">Calls</p>
                              </div>
                            )}
                            {campaign.answered_calls != null && (
                              <div className="text-center">
                                <p className="font-medium">{campaign.answered_calls}</p>
                                <p className="text-xs text-muted-foreground">Answered</p>
                              </div>
                            )}
                            {campaign.press_1_count != null && (
                              <div className="text-center">
                                <p className="font-medium">{campaign.press_1_count}</p>
                                <p className="text-xs text-muted-foreground">Press 1</p>
                              </div>
                            )}
                          </div>
                          {/* Action buttons */}
                          <div className="flex gap-1">
                            {isDraft && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startCampaign.mutate(campaign.id)}
                                disabled={startCampaign.isPending}
                              >
                                <Play className="h-3 w-3 mr-1" />Start
                              </Button>
                            )}
                            {isRunning && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => pauseCampaign.mutate(campaign.id)}
                                disabled={pauseCampaign.isPending}
                              >
                                <Pause className="h-3 w-3 mr-1" />Pause
                              </Button>
                            )}
                            {isPaused && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startCampaign.mutate(campaign.id)}
                                disabled={startCampaign.isPending}
                              >
                                <Play className="h-3 w-3 mr-1" />Resume
                              </Button>
                            )}
                            {(isRunning || isPaused) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive"
                                onClick={() => cancelCampaign.mutate(campaign.id)}
                                disabled={cancelCampaign.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />Cancel
                              </Button>
                            )}
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
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function VoiceBroadcastPage() {
  return (
    <AdmissionErrorBoundary>
      <VoiceBroadcastPageContent />
    </AdmissionErrorBoundary>
  );
}
