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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useCampaignROI, useROISummary, useChannelComparison } from '@/hooks/admission/use-campaign-roi';
import {
  BarChart3, TrendingUp, DollarSign, Target, Users, ArrowRight,
  Mail, MessageSquare, Phone, RefreshCw, Loader2,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';
import type { AttributionChannel } from '@/lib/services/admission/campaign-roi-service';

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  call: Phone,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'bg-blue-500',
  sms: 'bg-green-500',
  whatsapp: 'bg-emerald-500',
  call: 'bg-purple-500',
};

function CampaignROIPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const { summary, isLoading: summaryLoading, refetch: refetchSummary } = useROISummary({
    institutionId,
  });
  const { channels, isLoading: channelsLoading } = useChannelComparison({ institutionId });
  const { campaigns, total, isLoading: campaignsLoading, refetch } = useCampaignROI({
    institutionId: institutionId || '',
    channel: channelFilter !== 'all' ? channelFilter as AttributionChannel : undefined,
    limit: 20,
  });

  const isLoading = summaryLoading || channelsLoading || campaignsLoading;

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return `${amount.toFixed(0)}`;
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Campaign ROI">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission/re-engagement">Campaigns</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>ROI Attribution</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="outline" size="sm" onClick={() => { refetch(); refetchSummary(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Campaign ROI Attribution</h1>
              <p className="text-sm text-muted-foreground">
                Track campaign performance from send to enrollment
              </p>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{summary.total_campaigns}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatCurrency(summary.total_spent)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Cost per Enrollment</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatCurrency(summary.avg_cost_per_enrollment)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Best Channel</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold capitalize">{summary.best_performing_channel || 'N/A'}</div>}
              </CardContent>
            </Card>
          </div>

          {/* Channel Comparison */}
          {channels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Channel Comparison</CardTitle>
                <CardDescription>Performance metrics by communication channel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Channel</th>
                        <th className="text-right py-2 font-medium">Campaigns</th>
                        <th className="text-right py-2 font-medium">Sent</th>
                        <th className="text-right py-2 font-medium">Delivery %</th>
                        <th className="text-right py-2 font-medium">Open %</th>
                        <th className="text-right py-2 font-medium">Applications</th>
                        <th className="text-right py-2 font-medium">Enrollments</th>
                        <th className="text-right py-2 font-medium">Cost/Lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map(ch => {
                        const Icon = CHANNEL_ICONS[ch.channel] || Mail;
                        return (
                          <tr key={ch.channel} className="border-b">
                            <td className="py-2 flex items-center gap-2 capitalize">
                              <div className={`w-2 h-2 rounded-full ${CHANNEL_COLORS[ch.channel]}`} />
                              <Icon className="h-4 w-4" />
                              {ch.channel}
                            </td>
                            <td className="text-right py-2">{ch.total_campaigns}</td>
                            <td className="text-right py-2">{ch.total_sent.toLocaleString()}</td>
                            <td className="text-right py-2">{ch.avg_delivery_rate.toFixed(1)}%</td>
                            <td className="text-right py-2">{ch.avg_open_rate.toFixed(1)}%</td>
                            <td className="text-right py-2">{ch.applications}</td>
                            <td className="text-right py-2">{ch.enrollments}</td>
                            <td className="text-right py-2">{formatCurrency(ch.cost_per_lead)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campaign List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campaign Performance</CardTitle>
                  <CardDescription>{total} campaigns total</CardDescription>
                </div>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No campaign data available yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map(campaign => (
                    <div key={campaign.campaign_id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${CHANNEL_COLORS[campaign.channel]}`} />
                        <div>
                          <p className="font-medium text-sm">{campaign.campaign_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs capitalize">{campaign.channel}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(campaign.campaign_date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="font-medium">{campaign.total_sent}</p>
                          <p className="text-xs text-muted-foreground">Sent</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{campaign.open_rate.toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground">Opened</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{campaign.applications}</p>
                          <p className="text-xs text-muted-foreground">Applied</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{campaign.enrollments}</p>
                          <p className="text-xs text-muted-foreground">Enrolled</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CampaignROIPage() {
  return (
    <AdmissionErrorBoundary>
      <CampaignROIPageContent />
    </AdmissionErrorBoundary>
  );
}
