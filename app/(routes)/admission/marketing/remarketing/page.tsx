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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useRemarketingRules,
  useAdAccountStatus,
  useSyncHistory,
  useRemarketingMutations,
} from '@/hooks/admission/use-remarketing';
import {
  Target, RefreshCw, Loader2, Users, Globe, CheckCircle2,
  XCircle, Clock, ArrowRightLeft, Zap, AlertTriangle,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const PLATFORM_STYLES: Record<string, { color: string; label: string }> = {
  google_ads: { color: 'bg-blue-100 text-blue-800', label: 'Google Ads' },
  facebook_ads: { color: 'bg-indigo-100 text-indigo-800', label: 'Facebook Ads' },
  meta_ads: { color: 'bg-indigo-100 text-indigo-800', label: 'Meta Ads' },
};

const SYNC_STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  in_progress: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

function RemarketingPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [activeTab, setActiveTab] = useState('rules');
  const [selectedRuleId, setSelectedRuleId] = useState<string | undefined>();

  const { rules, isLoading: rulesLoading, refetch } = useRemarketingRules({
    institutionId: institutionId || '',
  });
  const { accounts, isLoading: accountsLoading } = useAdAccountStatus();
  const { history, isLoading: historyLoading } = useSyncHistory(selectedRuleId);
  const { syncAudience, deleteRule, isSyncing } = useRemarketingMutations();

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Remarketing">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Remarketing</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Strategic Remarketing</h1>
              <p className="text-sm text-muted-foreground">
                Sync lead segments to Google Ads and Facebook/Meta for targeted ad campaigns
              </p>
            </div>
          </div>

          {/* Ad Account Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accountsLoading ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : accounts.length === 0 ? (
              <Card className="col-span-2">
                <CardContent className="py-6 text-center text-muted-foreground">
                  <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No ad accounts connected. Configure API keys in environment settings.</p>
                </CardContent>
              </Card>
            ) : (
              accounts.map((account: any) => {
                const platformStyle = PLATFORM_STYLES[account.platform] || { color: 'bg-gray-100 text-gray-800', label: account.platform };
                return (
                  <Card key={account.platform}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Globe className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-medium">{platformStyle.label}</h3>
                          <p className="text-xs text-muted-foreground">
                            {account.account_id ? `Account: ${account.account_id}` : 'Not configured'}
                          </p>
                        </div>
                      </div>
                      <Badge className={account.connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {account.connected ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>
                        ) : (
                          <><XCircle className="h-3 w-3 mr-1" />Disconnected</>
                        )}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="rules">Audience Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="history">Sync History</TabsTrigger>
            </TabsList>

            {/* Audience Rules Tab */}
            <TabsContent value="rules" className="space-y-4">
              {rulesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : rules.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No audience rules configured</p>
                    <p>Create rules to automatically sync lead segments to ad platforms.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {rules.map((rule: any) => {
                    const platformStyle = PLATFORM_STYLES[rule.platform] || { color: 'bg-gray-100 text-gray-800', label: rule.platform };
                    return (
                      <Card key={rule.id}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{rule.rule_name}</h3>
                                <Badge className={`text-xs ${platformStyle.color}`}>
                                  {platformStyle.label}
                                </Badge>
                                <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {rule.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                              {rule.description && (
                                <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {rule.audience_size != null && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />{rule.audience_size} leads
                                  </span>
                                )}
                                {rule.last_synced_at && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Last synced: {new Date(rule.last_synced_at).toLocaleString()}
                                  </span>
                                )}
                                {rule.sync_frequency && (
                                  <span className="flex items-center gap-1">
                                    <ArrowRightLeft className="h-3 w-3" />
                                    Every {rule.sync_frequency}
                                  </span>
                                )}
                              </div>
                              {/* Filters display */}
                              {rule.filters && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {rule.filters.stages && (
                                    <Badge variant="outline" className="text-xs">
                                      Stages: {rule.filters.stages.join(', ')}
                                    </Badge>
                                  )}
                                  {rule.filters.min_score && (
                                    <Badge variant="outline" className="text-xs">
                                      Score &ge; {rule.filters.min_score}
                                    </Badge>
                                  )}
                                  {rule.filters.tags && (
                                    <Badge variant="outline" className="text-xs">
                                      Tags: {rule.filters.tags.join(', ')}
                                    </Badge>
                                  )}
                                  {rule.filters.sources && (
                                    <Badge variant="outline" className="text-xs">
                                      Sources: {rule.filters.sources.join(', ')}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  syncAudience.mutate(rule.id);
                                }}
                                disabled={isSyncing}
                              >
                                {isSyncing ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3 mr-1" />
                                )}
                                Sync Now
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedRuleId(rule.id);
                                  setActiveTab('history');
                                }}
                              >
                                <Clock className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Sync History Tab */}
            <TabsContent value="history" className="space-y-4">
              {selectedRuleId ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing sync history for selected rule
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRuleId(undefined)}>
                      Clear filter
                    </Button>
                  </div>
                  {historyLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : history.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p>No sync history for this rule</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {history.map((entry: any) => (
                        <Card key={entry.id}>
                          <CardContent className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded ${
                                entry.status === 'success' ? 'bg-green-100' :
                                entry.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                              }`}>
                                {entry.status === 'success' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : entry.status === 'failed' ? (
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                ) : (
                                  <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">
                                    {entry.audience_size != null ? `${entry.audience_size} contacts synced` : 'Sync attempt'}
                                  </p>
                                  <Badge className={`text-xs ${SYNC_STATUS_STYLES[entry.status] || ''}`}>
                                    {entry.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(entry.created_at).toLocaleString()}
                                </p>
                                {entry.error && (
                                  <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Select an audience rule to view its sync history</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function RemarketingPage() {
  return (
    <AdmissionErrorBoundary>
      <RemarketingPageContent />
    </AdmissionErrorBoundary>
  );
}
