'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Rocket,
  BarChart2,
  ShieldAlert,
  AlertTriangle,
  Eye,
  Filter,
  CheckCircle,
  GraduationCap,
  ChevronRight,
} from 'lucide-react';
import { usePortfolioDashboard } from '@/hooks/startup-studio';
import { TrlDistributionChart } from './trl-distribution-chart';
import { RiskHeatmap } from './risk-heatmap';
import { AttentionList } from './attention-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiData {
  active_startups?: number;
  avg_trl?: number;
  avg_risk_score?: number;
  at_risk_count?: number;
}

interface StageCount {
  stage: string;
  count: number;
}

interface TrlDataPoint {
  trl_level: number;
  count: number;
}

interface RiskHeatmapPoint {
  candidate_id: string;
  startup_name: string;
  overall_risk_score: number;
  current_trl: number;
  overall_risk_level: string;
}

interface AttentionCandidate {
  id: string;
  startup_name: string;
  stage: string;
  current_trl: number;
  risk_level?: string;
}

interface DashboardData {
  kpis?: KpiData;
  stage_counts?: StageCount[];
  trl_distribution?: TrlDataPoint[];
  risk_heatmap?: RiskHeatmapPoint[];
  attention_needed?: AttentionCandidate[];
}

// ─── Pipeline Funnel ──────────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: 'identified', label: 'Identified', icon: Eye, color: 'bg-gray-200 text-gray-700' },
  { key: 'screened', label: 'Screened', icon: Filter, color: 'bg-blue-100 text-blue-700' },
  { key: 'shortlisted', label: 'Shortlisted', icon: CheckCircle, color: 'bg-amber-100 text-amber-700' },
  { key: 'incubating', label: 'Incubating', icon: Rocket, color: 'bg-purple-100 text-purple-700' },
  { key: 'graduated', label: 'Graduated', icon: GraduationCap, color: 'bg-emerald-100 text-emerald-700' },
];

interface PipelineFunnelProps {
  stageCounts: StageCount[];
}

function PipelineFunnel({ stageCounts }: PipelineFunnelProps) {
  const countMap: Record<string, number> = {};
  for (const s of stageCounts) {
    countMap[s.stage] = s.count;
  }

  const total = FUNNEL_STAGES.reduce((sum, s) => sum + (countMap[s.key] ?? 0), 0);

  return (
    <div className="flex items-stretch gap-0.5 w-full overflow-x-auto pb-1">
      {FUNNEL_STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const count = countMap[stage.key] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-[90px]">
            <div className={`flex-1 rounded-md p-3 text-center ${stage.color}`}>
              <Icon className="h-4 w-4 mx-auto mb-1 opacity-70" />
              <p className="text-lg font-bold leading-tight">{count}</p>
              <p className="text-xs font-medium truncate">{stage.label}</p>
              {total > 0 && (
                <p className="text-xs opacity-60 mt-0.5">{pct}%</p>
              )}
            </div>
            {i < FUNNEL_STAGES.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconClass?: string;
  subtext?: string;
}

function KpiCard({ title, value, icon: Icon, iconClass, subtext }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconClass ?? 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PortfolioDashboard() {
  const { data: rawData, isLoading } = usePortfolioDashboard();

  // Normalise the response envelope — API may return { data: {...} } or the object directly
  const dashboard: DashboardData = (rawData as any)?.data ?? rawData ?? {};

  const kpis = dashboard.kpis ?? {};
  const stageCounts: StageCount[] = dashboard.stage_counts ?? [];
  const trlDistribution: TrlDataPoint[] = dashboard.trl_distribution ?? [];
  const riskHeatmap: RiskHeatmapPoint[] = dashboard.risk_heatmap ?? [];
  const attentionNeeded: AttentionCandidate[] = dashboard.attention_needed ?? [];

  // ── Empty state ──────────────────────────────────────────────────────────────
  const isEmpty =
    !isLoading &&
    (kpis.active_startups ?? 0) === 0 &&
    stageCounts.length === 0 &&
    trlDistribution.length === 0;

  if (isEmpty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Rocket className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No portfolio data available</p>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Portfolio intelligence will appear here once NIF candidates are added and assessed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── KPI value helpers ─────────────────────────────────────────────────────────
  const avgTrl = kpis.avg_trl != null ? kpis.avg_trl.toFixed(1) : '—';
  const avgRisk = kpis.avg_risk_score != null ? kpis.avg_risk_score.toFixed(1) : '—';

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              title="Active Startups"
              value={kpis.active_startups ?? 0}
              icon={Rocket}
              iconClass="text-emerald-500"
              subtext="Currently in pipeline"
            />
            <KpiCard
              title="Average TRL"
              value={avgTrl}
              icon={BarChart2}
              iconClass="text-blue-500"
              subtext="Technology readiness (1–9)"
            />
            <KpiCard
              title="Avg Risk Score"
              value={avgRisk}
              icon={ShieldAlert}
              iconClass="text-amber-500"
              subtext="4M framework average (1–10)"
            />
            <KpiCard
              title="At-Risk Count"
              value={kpis.at_risk_count ?? 0}
              icon={AlertTriangle}
              iconClass="text-red-500"
              subtext="Any dimension below threshold"
            />
          </>
        )}
      </div>

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-md" />
              ))}
            </div>
          ) : (
            <PipelineFunnel stageCounts={stageCounts} />
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* TRL Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base font-semibold">TRL Distribution</CardTitle>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Valley of Death = TRL 4–6
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-md" />
            ) : trlDistribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                <BarChart2 className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">TRL data not yet available</p>
              </div>
            ) : (
              <TrlDistributionChart data={trlDistribution} />
            )}
          </CardContent>
        </Card>

        {/* Risk Heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Risk Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-md" />
            ) : riskHeatmap.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                <ShieldAlert className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Risk assessments pending</p>
              </div>
            ) : (
              <RiskHeatmap data={riskHeatmap} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attention Needed */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base font-semibold">Attention Needed</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AttentionList candidates={attentionNeeded} />
          )}
        </CardContent>
      </Card>

    </div>
  );
}
