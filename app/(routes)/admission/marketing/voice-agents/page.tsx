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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useVoiceAgentConfigs,
  useVoiceAgentCalls,
  useVoiceAgentAnalytics,
  useVoiceAgentMutations,
  useAgentTypeInfo,
} from '@/hooks/admission/use-voice-agents';
import {
  Bot, Phone, PhoneCall, PhoneOff, Settings2, RefreshCw, Loader2,
  Clock, User, FileText, TrendingUp, CheckCircle2, XCircle,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const AGENT_TYPE_ICONS: Record<string, React.ElementType> = {
  lead_qualifier: CheckCircle2,
  lead_reactivator: RefreshCw,
  auto_reminder: Clock,
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  no_answer: 'bg-yellow-100 text-yellow-800',
  busy: 'bg-orange-100 text-orange-800',
  scheduled: 'bg-purple-100 text-purple-800',
};

function VoiceAgentsPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [activeTab, setActiveTab] = useState('agents');
  const [callStatusFilter, setCallStatusFilter] = useState<string>('all');

  const { configs, isLoading: configsLoading, refetch } = useVoiceAgentConfigs(institutionId);
  const { calls, total: callsTotal, isLoading: callsLoading } = useVoiceAgentCalls({
    institutionId: institutionId || '',
    callStatus: callStatusFilter !== 'all' ? callStatusFilter as any : undefined,
    limit: 20,
  });
  const { analytics, isLoading: analyticsLoading } = useVoiceAgentAnalytics({
    institutionId,
  });
  const { initializeConfigs, toggleAgent, isInitializing } = useVoiceAgentMutations();
  const { agentTypes } = useAgentTypeInfo();

  const handleInitialize = () => {
    if (institutionId) initializeConfigs.mutate(institutionId);
  };

  const handleToggle = (configId: string, currentState: boolean) => {
    toggleAgent.mutate({ id: configId, isEnabled: !currentState });
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="AI Voice Agents">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>AI Voice Agents</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />Refresh
              </Button>
              {configs.length === 0 && (
                <Button onClick={handleInitialize} disabled={isInitializing}>
                  {isInitializing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings2 className="h-4 w-4 mr-2" />}
                  Initialize Agents
                </Button>
              )}
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Voice Agents</h1>
              <p className="text-sm text-muted-foreground">
                Automated voice agents for lead qualification, reactivation, and reminders
              </p>
            </div>
          </div>

          {/* Analytics KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{analytics.total_calls}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{analytics.completed_calls}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatDuration(analytics.avg_duration_seconds)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Qualification Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{analytics.qualification_rate.toFixed(1)}%</div>}
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="agents">Agent Configs</TabsTrigger>
              <TabsTrigger value="calls">Call Logs ({callsTotal})</TabsTrigger>
            </TabsList>

            {/* Agent Configs Tab */}
            <TabsContent value="agents" className="space-y-4">
              {configsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : configs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No voice agents configured</p>
                    <p className="mb-4">Click &quot;Initialize Agents&quot; to set up default voice agent configurations.</p>
                    <Button onClick={handleInitialize} disabled={isInitializing}>
                      Initialize Default Agents
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {configs.map(config => {
                    const typeInfo = agentTypes.find(t => t.value === config.agent_type);
                    const Icon = AGENT_TYPE_ICONS[config.agent_type] || Bot;

                    return (
                      <Card key={config.id}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className={`p-2 rounded-lg mt-0.5 ${config.is_enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                                <Icon className={`h-5 w-5 ${config.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                              </div>
                              <div>
                                <h3 className="font-medium">{typeInfo?.label || config.agent_type}</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {typeInfo?.description || 'Voice agent configuration'}
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                  <Badge variant="outline" className="text-xs">
                                    Max {config.max_retries} retries
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {config.calling_hours_start}:00 - {config.calling_hours_end}:00
                                  </Badge>
                                  <Badge variant={config.is_enabled ? 'default' : 'secondary'} className="text-xs">
                                    {config.is_enabled ? 'Active' : 'Disabled'}
                                  </Badge>
                                </div>
                                {config.ai_system_prompt && (
                                  <details className="mt-2">
                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                      View system prompt
                                    </summary>
                                    <pre className="mt-1 text-xs bg-muted p-2 rounded whitespace-pre-wrap max-h-32 overflow-y-auto">
                                      {config.ai_system_prompt}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                            <Switch
                              checked={config.is_enabled}
                              onCheckedChange={() => handleToggle(config.id, config.is_enabled)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Call Logs Tab */}
            <TabsContent value="calls" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{callsTotal} total calls</p>
                <Select value={callStatusFilter} onValueChange={setCallStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="no_answer">No Answer</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {callsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : calls.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No call logs available</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {calls.map((call: any) => (
                    <Card key={call.id}>
                      <CardContent className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded bg-primary/10">
                            {call.call_status === 'completed' ? (
                              <PhoneCall className="h-4 w-4 text-green-600" />
                            ) : call.call_status === 'failed' || call.call_status === 'no_answer' ? (
                              <PhoneOff className="h-4 w-4 text-red-600" />
                            ) : (
                              <Phone className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{call.lead_name || call.phone_number}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs capitalize">
                                {(call.agent_type || '').replace(/_/g, ' ')}
                              </Badge>
                              <span>{new Date(call.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {call.duration_seconds != null && (
                            <div className="text-center">
                              <p className="font-medium">{formatDuration(call.duration_seconds)}</p>
                              <p className="text-xs text-muted-foreground">Duration</p>
                            </div>
                          )}
                          <Badge className={`text-xs ${STATUS_COLORS[call.call_status] || 'bg-gray-100 text-gray-800'}`}>
                            {(call.call_status || 'unknown').replace(/_/g, ' ')}
                          </Badge>
                          {call.transcript_summary && (
                            <details className="relative">
                              <summary className="cursor-pointer">
                                <FileText className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </summary>
                              <div className="absolute right-0 top-6 z-10 w-80 p-3 bg-popover border rounded-lg shadow-lg text-xs">
                                <p className="font-medium mb-1">Summary</p>
                                <p className="text-muted-foreground">{call.transcript_summary}</p>
                              </div>
                            </details>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function VoiceAgentsPage() {
  return (
    <AdmissionErrorBoundary>
      <VoiceAgentsPageContent />
    </AdmissionErrorBoundary>
  );
}
