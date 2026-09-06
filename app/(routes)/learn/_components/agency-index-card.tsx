'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAgencyIndex, useAgencyTrends } from '@/hooks/pde/use-pde';
import { pdeQueryKeys } from '@/hooks/pde/use-pde';
import type { AgencyLevel, PDEAgencyIndex } from '@/types/pde';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface AgencyIndexCardProps {
  learnerId: string;
  courseId?: string;
  className?: string;
  showTrend?: boolean;
}

const LEVEL_CONFIG: Record<AgencyLevel, { label: string; color: string; bgColor: string }> = {
  dependent: { label: 'Dependent', color: 'text-red-700', bgColor: 'bg-red-100' },
  directed: { label: 'Directed', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  independent: { label: 'Independent', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  self_directed: { label: 'Self-Directed', color: 'text-green-700', bgColor: 'bg-green-100' },
  principal: { label: 'Principal', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
};

function getScoreColor(score: number): string {
  if (score >= 60) return '#16a34a'; // green-600
  if (score >= 40) return '#ca8a04'; // yellow-600
  return '#dc2626'; // red-600
}

function getScoreTextColor(score: number): string {
  if (score >= 60) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

export function AgencyIndexCard({ learnerId, courseId, className, showTrend = true }: AgencyIndexCardProps) {
  const { data: agencyIndex, isLoading } = useAgencyIndex(learnerId, courseId);
  const { data: trends } = useAgencyTrends(learnerId);

  // T2.8 — poll-driven refresh when pde.visibility.agency_index_mode is
  // 'live' or 'live_coarse'. We hit /api/pde/agency once to read the active
  // mode (the API tags every response with `mode`), then re-invalidate the
  // React-Query cache every 30s so the existing hook re-fetches.
  // semester_end stays fully static (no polling, no extra network).
  const queryClient = useQueryClient();
  const [liveMode, setLiveMode] = useState<'live' | 'live_coarse' | null>(null);

  // Live recompute captured from the same /api/pde/agency call that reads the
  // mode. When pde_agency_index has no snapshot row for this learner (the usual
  // case today — the table is empty), this is the only real number the card
  // can show, and `has_data` is what distinguishes "produced nothing
  // measurable" (→ empty state) from "genuinely scored 0" (→ show the 0).
  const [liveOverall, setLiveOverall] = useState<number | null>(null);
  const [liveLevel, setLiveLevel] = useState<AgencyLevel | null>(null);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [liveResolved, setLiveResolved] = useState(false);

  // Single source for the live recompute — called once on mount and again on
  // every poll tick, so the "Live" badge is honest: the displayed number really
  // refreshes rather than being fetched once and left stale.
  const fetchLive = useCallback(
    async (signal?: AbortSignal) => {
      if (!learnerId) return;
      const params = new URLSearchParams({ learnerId });
      if (courseId) params.set('courseId', courseId);
      const r = await fetch(`/api/pde/agency?${params.toString()}`, {
        cache: 'no-store',
        signal,
      });
      if (!r.ok) return;
      const payload = await r.json();
      if (!payload) return;
      setLiveMode(
        payload.mode === 'live' || payload.mode === 'live_coarse' ? payload.mode : null,
      );
      const overall = payload.data?.overall;
      setLiveOverall(typeof overall === 'number' ? Math.round(overall) : null);
      setLiveLevel((payload.data?.level as AgencyLevel) ?? null);
      setHasLiveData(payload.has_data === true);
    },
    [learnerId, courseId],
  );

  // Mount fetch, with a hard 8s timeout. The card render is gated on
  // `liveResolved`, so a hung request with no timeout would spin the card
  // forever; abort/error/settle all mark it resolved and let the render fall
  // through to the snapshot / empty-state path.
  useEffect(() => {
    // No learner → nothing to fetch, but the render gate waits on liveResolved,
    // so mark it resolved or the card (a shared export) spins forever for any
    // caller that passes a falsy learnerId.
    if (!learnerId) {
      setLiveResolved(true);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    fetchLive(controller.signal)
      .catch(() => {
        /* fail-soft: unreachable/aborted → fall through to snapshot/empty */
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLiveResolved(true);
      });
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [learnerId, fetchLive]);

  // While live, actually re-run the recompute every 30s (and refresh any
  // snapshot consumer). Previously this only invalidated the snapshot query,
  // which stays empty — so the number never moved despite the "Live" badge.
  useEffect(() => {
    if (!liveMode || !learnerId) return;
    const intervalId = window.setInterval(() => {
      fetchLive().catch(() => {
        /* keep the last good value on a transient failure */
      });
      queryClient.invalidateQueries({
        queryKey: pdeQueryKeys.agencyIndex(learnerId, courseId),
      });
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [liveMode, learnerId, courseId, queryClient, fetchLive]);

  // Wait for BOTH the snapshot query and the live fetch before deciding what to
  // render. Without this, a learner with a real live score would see "No agency
  // data yet" flash into a number as the async fetch resolves — which reads as
  // a bug, not a load.
  if (isLoading || !liveResolved) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No snapshot row (the usual case: pde_agency_index is empty). Two sub-cases.
  if (!agencyIndex) {
    // Live score exists → show it, without inventing the five dimensions. There
    // is no per-dimension data behind a live recompute, so rendering the bars /
    // radar / trend would mean five `NaN`s — the exact failure this card must
    // not ship. Overall + level + a "detailed breakdown at semester end" line.
    if (hasLiveData && liveOverall !== null) {
      const liveLevelConfig = LEVEL_CONFIG[liveLevel as AgencyLevel] || LEVEL_CONFIG.dependent;
      return (
        <Card className={className}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Agency Index
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {liveMode && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
                    title={`Live mode (${liveMode}) — auto-refreshing every 30s`}
                  >
                    <RefreshCw className="h-3 w-3 animate-pulse" />
                    {liveMode === 'live_coarse' ? 'Live~' : 'Live'}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={cn('text-xs font-medium', liveLevelConfig.bgColor, liveLevelConfig.color)}
                >
                  {liveLevelConfig.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <div className={cn('text-4xl font-bold', getScoreTextColor(liveOverall))}>
                {liveOverall}
              </div>
              <p className="text-xs text-muted-foreground mt-1">out of 100</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              This grows as you attend more sessions.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Genuinely nothing measurable yet.
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Agency Index
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No agency data yet. Complete lessons and interact with AI tools to build your Agency Index.
          </p>
        </CardContent>
      </Card>
    );
  }

  const levelConfig = LEVEL_CONFIG[agencyIndex.level as AgencyLevel] || LEVEL_CONFIG.dependent;

  // Radar chart data
  const radarData = [
    { dimension: 'Initiative', value: agencyIndex.initiative, fullMark: 100 },
    { dimension: 'Self-Direction', value: agencyIndex.self_direction, fullMark: 100 },
    { dimension: 'Tool Mastery', value: agencyIndex.tool_mastery, fullMark: 100 },
    { dimension: 'Critical Eval', value: agencyIndex.critical_evaluation, fullMark: 100 },
    { dimension: 'Ethical Judgment', value: agencyIndex.ethical_judgment, fullMark: 100 },
  ];

  // Trend line data (last 5 assessments)
  const trendData = (trends || []).slice(-5).map((t: PDEAgencyIndex) => ({
    date: t.assessment_date,
    overall: t.overall,
  }));

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Agency Index
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {liveMode && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
                title={`Live mode (${liveMode}) — auto-refreshing every 30s`}
              >
                <RefreshCw className="h-3 w-3 animate-pulse" />
                {liveMode === 'live_coarse' ? 'Live~' : 'Live'}
              </span>
            )}
            <Badge variant="outline" className={cn('text-xs font-medium', levelConfig.bgColor, levelConfig.color)}>
              {levelConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="text-center">
          <div className={cn('text-4xl font-bold', getScoreTextColor(agencyIndex.overall))}>
            {Math.round(agencyIndex.overall)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">out of 100</p>
        </div>

        {/* Dimension Bars */}
        <div className="space-y-2">
          {radarData.map((dim) => (
            <div key={dim.dimension} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{dim.dimension}</span>
                <span className="font-medium">{Math.round(dim.value)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${dim.value}%`,
                    backgroundColor: getScoreColor(dim.value),
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Radar Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 10, fill: '#6b7280' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                dataKey="value"
                stroke={getScoreColor(agencyIndex.overall)}
                fill={getScoreColor(agencyIndex.overall)}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Line */}
        {showTrend && trendData.length > 1 && (
          <div>
            <div className="flex items-center gap-1 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Trend</span>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(val: string) => {
                      const d = new Date(val);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} width={25} />
                  <Tooltip
                    formatter={(value: number) => [`${Math.round(value)}`, 'Agency Index']}
                    labelFormatter={(label: string) => `Date: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="overall"
                    stroke={getScoreColor(agencyIndex.overall)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
