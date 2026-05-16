'use client';

import { useState, useMemo } from 'react';
import {
  AlertCircle,
  Activity,
  Phone,
  PhoneOff,
  RefreshCw,
  Users,
  TrendingDown,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  usePulseKPIs,
  useCounselorPulseToday,
  useSilentCounselors,
  useLiveCallFeed,
} from '@/lib/services/admission/director-pulse-service';
import { useCounselorPulseRealtime } from '@/hooks/admission/use-counselor-pulse';

function DirectorPulseContent() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const [chosenInstitutionId, setChosenInstitutionId] = useState<string>('');

  const defaultInstitutionId = isSuperAdmin ? undefined : profile?.institution_id;
  const institutionId = chosenInstitutionId || (institutions.length <= 1 ? defaultInstitutionId : undefined);

  const isAuthorized = isSuperAdmin || isAdmissionGlobalUser;

  // Realtime subscription — invalidates cache on every new call log INSERT
  useCounselorPulseRealtime(institutionId);

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = usePulseKPIs(institutionId);
  const { data: todayBreakdown } = useCounselorPulseToday(institutionId);
  const { data: silentCounselors, isLoading: silentLoading } = useSilentCounselors(institutionId);
  const { data: liveFeed, isLoading: feedLoading } = useLiveCallFeed(institutionId, 20);

  const refreshAll = () => {
    refetchKpis();
  };

  const totalActive = kpis?.total_active_counselors || 0;
  const calledToday = kpis?.counselors_called_today || 0;
  const isCriticalSilence = totalActive > 0 && calledToday < Math.max(10, totalActive * 0.1);

  const activeBreakdown = useMemo(
    () => (todayBreakdown || []).filter((c) => c.calls_today > 0),
    [todayBreakdown]
  );

  if (!isAuthorized) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Director Pulse is restricted to super_admin and admission-global users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (kpisError) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(kpisError as Error)?.message || 'Failed to load.'}</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={refreshAll}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <ContentLayout title="Director Pulse">
      <div className="p-4 sm:p-6 space-y-4 mx-auto max-w-7xl">
        {/* Breadcrumb */}
        <Breadcrumb className="hidden sm:block">
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
              <BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Director Pulse</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-500 animate-pulse" />
              Director Pulse — Live Counselor Activity
            </h1>
            <p className="text-xs text-muted-foreground">
              Auto-refreshing every 30s · Realtime call feed via Supabase channels
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={refreshAll} disabled={kpisLoading}>
            <RefreshCw className={`h-4 w-4 ${kpisLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Institution picker for multi-institution users */}
        {institutions.length > 1 && (
          <div className="p-3 bg-muted/30 rounded-lg border">
            <Select
              value={chosenInstitutionId || '__all__'}
              onValueChange={(val) => setChosenInstitutionId(val === '__all__' ? '' : val)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[280px] text-sm">
                <SelectValue placeholder="All institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className={isCriticalSilence ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : ''}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Active Today
              </div>
              <div className={`text-3xl font-bold mt-1 ${isCriticalSilence ? 'text-red-600' : ''}`}>
                {kpisLoading ? '…' : `${calledToday} / ${totalActive}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                counselors made at least 1 call today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Total Calls Today
              </div>
              <div className="text-3xl font-bold mt-1">
                {kpisLoading ? '…' : kpis?.total_calls_today ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                avg {kpis?.calls_per_active_counselor_avg ?? 0} per active counselor
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <PhoneOff className="h-3 w-3" /> Silent 7+ Days
              </div>
              <div className="text-3xl font-bold mt-1 text-orange-600">
                {kpisLoading ? '…' : kpis?.silent_7d_count ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">no calls in 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Silent 30+ Days
              </div>
              <div className="text-3xl font-bold mt-1 text-red-700">
                {kpisLoading ? '…' : kpis?.silent_30d_count ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">deeply dormant</p>
            </CardContent>
          </Card>
        </div>

        {isCriticalSilence && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Critical activity gap</AlertTitle>
            <AlertDescription>
              Only {calledToday} of {totalActive} active counselors have called today.
              {kpis?.total_calls_today
                ? ` All ${kpis.total_calls_today} calls today are concentrated in those ${calledToday} people.`
                : ''}
            </AlertDescription>
          </Alert>
        )}

        {/* Active counselors today (top of list) */}
        {activeBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Who is calling today ({activeBreakdown.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {activeBreakdown.map((c) => (
                  <div
                    key={c.counselor_id}
                    className="px-4 py-2 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-medium">{c.name}</div>
                      {c.designation && (
                        <div className="text-xs text-muted-foreground">{c.designation}</div>
                      )}
                    </div>
                    <Badge variant="default" className="font-mono">
                      {c.calls_today} {c.calls_today === 1 ? 'call' : 'calls'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Live call feed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-red-500" />
                Live Call Feed
                <Badge variant="outline" className="text-[10px] ml-auto">
                  Realtime
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[420px] overflow-y-auto">
              {feedLoading && !liveFeed ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (liveFeed || []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No calls in the system yet.
                </div>
              ) : (
                <div className="divide-y">
                  {(liveFeed || []).map((evt) => (
                    <div key={evt.id} className="px-4 py-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          {evt.counselor_name || 'Unknown counselor'}
                        </div>
                        <Badge
                          variant={
                            evt.status === 'completed'
                              ? 'default'
                              : evt.status === 'failed' || evt.status === 'no-answer'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {evt.status || 'unknown'}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        → {evt.to_number || 'unknown'}
                        {evt.duration_seconds != null && evt.duration_seconds > 0 && (
                          <span className="ml-2">· {evt.duration_seconds}s</span>
                        )}
                        {evt.call_disposition && (
                          <span className="ml-2">· {evt.call_disposition}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {evt.created_at
                          ? formatDistanceToNow(new Date(evt.created_at), { addSuffix: true })
                          : 'unknown time'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Silent counselors */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <PhoneOff className="h-4 w-4 text-orange-500" />
                Silent Today ({silentCounselors?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[420px] overflow-y-auto">
              {silentLoading && !silentCounselors ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (silentCounselors || []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Every active counselor has called today.
                </div>
              ) : (
                <div className="divide-y">
                  {(silentCounselors || []).map((c) => (
                    <div
                      key={c.counselor_id}
                      className="px-4 py-2 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        {c.designation && (
                          <div className="text-muted-foreground truncate">{c.designation}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {c.last_call_at ? (
                          <>
                            <div
                              className={
                                c.days_since_last_call != null && c.days_since_last_call >= 7
                                  ? 'text-red-600 font-medium'
                                  : c.days_since_last_call != null && c.days_since_last_call >= 3
                                    ? 'text-orange-600'
                                    : 'text-muted-foreground'
                              }
                            >
                              {c.days_since_last_call != null && c.days_since_last_call > 0
                                ? `${c.days_since_last_call}d ago`
                                : 'recent'}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {format(new Date(c.last_call_at), 'dd MMM')}
                            </div>
                          </>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            never called
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {kpis?.computed_at && (
          <p className="text-[10px] text-muted-foreground text-right">
            Last computed:{' '}
            {format(new Date(kpis.computed_at), 'dd MMM yyyy HH:mm:ss')}
          </p>
        )}
      </div>
    </ContentLayout>
  );
}

export default function DirectorPulsePage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <DirectorPulseContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
