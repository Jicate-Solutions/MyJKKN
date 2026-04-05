'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, ShieldCheck } from 'lucide-react';
import { useAgencyIndex, useAgencyTrends } from '@/hooks/pde/use-pde';
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

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!agencyIndex) {
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
          <Badge variant="outline" className={cn('text-xs font-medium', levelConfig.bgColor, levelConfig.color)}>
            {levelConfig.label}
          </Badge>
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
