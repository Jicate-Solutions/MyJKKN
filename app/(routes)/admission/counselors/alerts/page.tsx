'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAlertRules, useAlertHistory, useAlertMutations, useEventTypes } from '@/hooks/admission/use-activity-alerts';
import {
  Bell, BellRing, MessageSquare, CreditCard, FileText, UserCheck, Bot, TrendingUp,
  RefreshCw, Loader2, Clock, User, Settings2,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const EVENT_ICONS: Record<string, React.ElementType> = {
  wa_reply: MessageSquare,
  payment_initiated: CreditCard,
  application_submitted: FileText,
  lead_reengaged: UserCheck,
  document_uploaded: FileText,
  chatbot_handoff: Bot,
  score_changed: TrendingUp,
};

function AlertsPageContent() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;
  const [activeTab, setActiveTab] = useState('rules');

  const { rules, isLoading: rulesLoading, refetch } = useAlertRules(institutionId);
  const { entries: history, total: historyTotal, isLoading: historyLoading } = useAlertHistory({
    institutionId: institutionId,
    limit: 50,
  });
  const { eventTypes } = useEventTypes();
  const { initializeRules, toggleRule } = useAlertMutations();

  const handleInitialize = () => {
    if (institutionId) initializeRules.mutate(institutionId);
  };

  const handleToggle = (ruleId: string, currentState: boolean) => {
    toggleRule.mutate({ id: ruleId, isEnabled: !currentState });
  };

  if (rulesLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Activity Alerts">
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
                <CardContent><Skeleton className="h-8 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Activity Alerts">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Activity Alerts</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />Refresh
              </Button>
              {rules.length === 0 && (
                <Button onClick={handleInitialize} disabled={initializeRules.isPending}>
                  {initializeRules.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings2 className="h-4 w-4 mr-2" />}
                  Initialize Alerts
                </Button>
              )}
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BellRing className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Real-time Activity Alerts</h1>
              <p className="text-sm text-muted-foreground">
                Get instant notifications when prospects take meaningful actions
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="rules">Alert Rules</TabsTrigger>
              <TabsTrigger value="history">Alert History ({historyTotal})</TabsTrigger>
            </TabsList>

            <TabsContent value="rules" className="space-y-4">
              {rules.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No alert rules configured</p>
                    <p className="mb-4">Click "Initialize Alerts" to set up default alert rules for all event types.</p>
                    <Button onClick={handleInitialize} disabled={initializeRules.isPending}>
                      Initialize Default Rules
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {eventTypes.map(eventType => {
                    const rule = rules.find(r => r.event_type === eventType.value);
                    const Icon = EVENT_ICONS[eventType.value] || Bell;

                    return (
                      <Card key={eventType.value}>
                        <CardContent className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${rule?.is_enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                              <Icon className={`h-5 w-5 ${rule?.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <h3 className="font-medium">{eventType.label}</h3>
                              <p className="text-sm text-muted-foreground">{eventType.description}</p>
                              {rule && (
                                <div className="flex gap-2 mt-1">
                                  {rule.notify_assigned_counselor && (
                                    <Badge variant="outline" className="text-xs">Assigned Counselor</Badge>
                                  )}
                                  {rule.notification_channels.map(ch => (
                                    <Badge key={ch} variant="secondary" className="text-xs">{ch}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <Switch
                            checked={rule?.is_enabled || false}
                            onCheckedChange={() => rule && handleToggle(rule.id, rule.is_enabled)}
                            disabled={!rule}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : history.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No alerts triggered yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {history.map(entry => {
                    const Icon = EVENT_ICONS[entry.event_type] || Bell;
                    return (
                      <Card key={entry.id}>
                        <CardContent className="flex items-start gap-4 py-3">
                          <div className="p-1.5 rounded bg-primary/10 mt-0.5">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{entry.message}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />{entry.lead_name}
                              </span>
                              <span>{new Date(entry.created_at).toLocaleString()}</span>
                              <Badge variant="outline" className="text-xs">{entry.event_type.replace(/_/g, ' ')}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AlertsPage() {
  return (
    <AdmissionErrorBoundary>
      <AlertsPageContent />
    </AdmissionErrorBoundary>
  );
}
