'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Heart,
  RefreshCw,
  Smile,
  Meh,
  Frown,
  AlertTriangle,
  Activity,
  TrendingUp,
  Clock,
  User,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  useTodayMoodKPIs,
  useMoodDistributionByCounselor,
  useTopConcerns,
  useAnxiousLeads,
  useLeadMoodRealtime,
} from '@/hooks/admission/use-lead-mood';

function sentimentBadge(sentiment: string | null, score: number | null) {
  const s = (sentiment || '').toLowerCase();
  if (['negative', 'angry', 'frustrated'].includes(s) || (score != null && score < 0.2)) {
    return (
      <Badge variant="destructive" className="text-[10px] capitalize">
        {sentiment || `score ${score?.toFixed(2)}`}
      </Badge>
    );
  }
  if (['concerned', 'anxious'].includes(s) || (score != null && score < 0.3)) {
    return (
      <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] capitalize">
        {sentiment || `score ${score?.toFixed(2)}`}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] capitalize">
      {sentiment || (score != null ? `score ${score.toFixed(2)}` : 'unknown')}
    </Badge>
  );
}

function LeadMoodContent() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const [chosenInstitutionId, setChosenInstitutionId] = useState<string>('');

  const defaultInstitutionId = isSuperAdmin ? undefined : profile?.institution_id;
  const institutionId =
    chosenInstitutionId || (institutions.length <= 1 ? defaultInstitutionId : undefined);

  const isAuthorized = isSuperAdmin || isAdmissionGlobalUser;

  // Realtime — invalidates lead-mood caches on intelligence INSERT/UPDATE
  useLeadMoodRealtime(institutionId);

  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = useTodayMoodKPIs(institutionId);
  const { data: distribution, isLoading: distLoading } = useMoodDistributionByCounselor(institutionId);
  const { data: topConcerns, isLoading: concernsLoading } = useTopConcerns(1, institutionId);
  const { data: anxiousLeads, isLoading: anxiousLoading } = useAnxiousLeads(50, institutionId);

  const refreshAll = () => {
    refetchKpis();
  };

  const analyzedToday = kpis?.analyzed_today ?? 0;
  const totalCallsToday = kpis?.total_calls_today ?? 0;
  const isEmpty = analyzedToday === 0;
  const analyzeProgress = totalCallsToday > 0 ? Math.round((analyzedToday / totalCallsToday) * 100) : 0;

  const distributionMaxTotal = useMemo(
    () => Math.max(1, ...(distribution || []).map((d) => d.total)),
    [distribution],
  );

  if (!isAuthorized) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Lead Mood Digest is restricted to super_admin and admission-global users.
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
    <ContentLayout title="Lead Mood Digest">
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
              <BreadcrumbPage>Lead Mood Digest</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              Lead Mood Digest — Today's Sentiment
            </h1>
            <p className="text-xs text-muted-foreground">
              Auto-refreshing every 30s · Sentiment captured by analyze-calls cron (every 15 min)
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={refreshAll} disabled={kpisLoading}>
            <RefreshCw className={`h-4 w-4 ${kpisLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Institution picker */}
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
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> Analyzed Today
              </div>
              <div className="text-3xl font-bold mt-1">
                {kpisLoading ? '…' : `${analyzedToday} / ${totalCallsToday}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {analyzeProgress}% of today's calls analyzed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Smile className="h-3 w-3 text-green-600" /> Positive
              </div>
              <div className="text-3xl font-bold mt-1 text-green-700">
                {kpisLoading ? '…' : `${kpis?.positive_pct ?? 0}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis?.positive_count ?? 0} {kpis?.positive_count === 1 ? 'call' : 'calls'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Meh className="h-3 w-3 text-slate-500" /> Neutral
              </div>
              <div className="text-3xl font-bold mt-1 text-slate-600">
                {kpisLoading ? '…' : `${kpis?.neutral_pct ?? 0}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis?.neutral_count ?? 0} {kpis?.neutral_count === 1 ? 'call' : 'calls'}
              </p>
            </CardContent>
          </Card>

          <Card
            className={
              (kpis?.concerned_count ?? 0) > 0
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                : ''
            }
          >
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Frown className="h-3 w-3 text-red-600" /> Concerned/Anxious
              </div>
              <div className="text-3xl font-bold mt-1 text-red-700">
                {kpisLoading ? '…' : `${kpis?.concerned_pct ?? 0}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis?.concerned_count ?? 0} {kpis?.concerned_count === 1 ? 'lead' : 'leads'} need attention
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Empty state — no analyzed calls yet */}
        {isEmpty && !kpisLoading && (
          <Card className="border-dashed border-2 border-muted-foreground/30 bg-muted/20">
            <CardContent className="p-8 text-center space-y-3">
              <div className="flex justify-center">
                <Activity className="h-10 w-10 text-muted-foreground animate-pulse" />
              </div>
              <h3 className="font-semibold text-base">Mood data is being captured</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                The analyze pipeline runs every 15 minutes against new completed calls.
                Sentiment, summary, and category data will appear here automatically once the
                first batch finishes processing.
              </p>
              <p className="text-xs text-muted-foreground">
                Cron status:{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                  /api/cron/analyze-calls
                </code>
              </p>
              {totalCallsToday > 0 && (
                <p className="text-xs text-muted-foreground">
                  {totalCallsToday} {totalCallsToday === 1 ? 'call' : 'calls'} placed today and
                  waiting to be analyzed.
                </p>
              )}
              <Button size="sm" variant="outline" onClick={refreshAll} className="mt-2">
                <RefreshCw className="h-3 w-3 mr-1" /> Check Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mood distribution stacked bar (by counselor) */}
        {!isEmpty && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Mood Distribution by Counselor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {distLoading && !distribution ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (distribution || []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No counselor-attributed analyzed calls yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {(distribution || []).map((d) => (
                    <div key={d.bucket_id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-medium truncate flex-1">{d.bucket_name}</div>
                        <div className="text-muted-foreground shrink-0 ml-2">
                          {d.total} {d.total === 1 ? 'call' : 'calls'}
                        </div>
                      </div>
                      <div className="flex h-5 rounded-full overflow-hidden bg-muted">
                        {d.positive > 0 && (
                          <div
                            className="bg-green-500"
                            style={{ width: `${(d.positive / distributionMaxTotal) * 100}%` }}
                            title={`Positive: ${d.positive}`}
                          />
                        )}
                        {d.neutral > 0 && (
                          <div
                            className="bg-slate-400"
                            style={{ width: `${(d.neutral / distributionMaxTotal) * 100}%` }}
                            title={`Neutral: ${d.neutral}`}
                          />
                        )}
                        {d.negative > 0 && (
                          <div
                            className="bg-red-500"
                            style={{ width: `${(d.negative / distributionMaxTotal) * 100}%` }}
                            title={`Negative: ${d.negative}`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-green-500" /> Positive
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-400" /> Neutral
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" /> Negative
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Concerns */}
          {!isEmpty && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Top Concerns (last 24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {concernsLoading && !topConcerns ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
                ) : (topConcerns || []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No category data captured yet.
                  </div>
                ) : (
                  <div className="divide-y">
                    {(topConcerns || []).map((c, idx) => (
                      <div
                        key={c.category}
                        className="px-4 py-2 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums w-5">
                            {idx + 1}.
                          </span>
                          <span className="font-medium capitalize">{c.category}</span>
                        </div>
                        <Badge variant="outline" className="font-mono">
                          {c.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Anxious Leads */}
          {!isEmpty && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Frown className="h-4 w-4 text-red-500" />
                  Anxious Leads ({anxiousLeads?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[480px] overflow-y-auto">
                {anxiousLoading && !anxiousLeads ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
                ) : (anxiousLeads || []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No anxious leads detected. All recent calls show positive or neutral sentiment.
                  </div>
                ) : (
                  <div className="divide-y">
                    {(anxiousLeads || []).map((lead) => (
                      <div key={lead.intelligence_id} className="px-4 py-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm flex items-center gap-1 min-w-0">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {lead.lead_name || lead.lead_phone || 'Unknown lead'}
                            </span>
                          </div>
                          {sentimentBadge(lead.sentiment, lead.sentiment_score)}
                        </div>
                        {lead.summary_excerpt && (
                          <div className="text-muted-foreground italic line-clamp-2">
                            "{lead.summary_excerpt}…"
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lead.call_created_at), { addSuffix: true })}
                            {lead.counselor_name && (
                              <span className="ml-2">· {lead.counselor_name}</span>
                            )}
                          </div>
                          {lead.lead_id && (
                            <Link
                              href={`/admission/leads/${lead.lead_id}`}
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              Open lead <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Full anxious-leads table when there are many — shown below the side-by-side grid */}
        {!isEmpty && (anxiousLeads?.length ?? 0) > 10 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Anxious Leads ({anxiousLeads?.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Counselor</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(anxiousLeads || []).map((lead) => (
                    <TableRow key={lead.intelligence_id}>
                      <TableCell className="font-medium">
                        {lead.lead_name || lead.lead_phone || 'Unknown'}
                      </TableCell>
                      <TableCell>{sentimentBadge(lead.sentiment, lead.sentiment_score)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lead.counselor_name || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lead.call_created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        {lead.lead_id ? (
                          <Link
                            href={`/admission/leads/${lead.lead_id}`}
                            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {kpis?.computed_at && (
          <p className="text-[10px] text-muted-foreground text-right">
            Last computed: {new Date(kpis.computed_at).toLocaleString()}
          </p>
        )}
      </div>
    </ContentLayout>
  );
}

export default function LeadMoodPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <LeadMoodContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
