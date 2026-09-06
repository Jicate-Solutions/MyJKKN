'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Lightbulb, Loader2 } from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useCrossDomainAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

export default function CrossDomainAnalyticsPage() {
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';
  const { data, isLoading, error } = useCrossDomainAnalytics(institutionId);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Cross-Domain Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Cross-Domain Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load cross-domain correlations: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const correlations = data?.correlations ?? [];
  const signals = data?.signals;
  const domainScores = data?.domain_scores;

  const radarData = domainScores
    ? [
        { domain: 'Attendance', score: domainScores.attendance },
        { domain: 'Maintenance', score: domainScores.maintenance },
        { domain: 'Safety', score: domainScores.safety },
        { domain: 'Fees', score: domainScores.fees },
        { domain: 'Mess', score: domainScores.mess },
      ]
    : [];

  return (
    <ContentLayout title="Cross-Domain Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="cross-domain risk correlation"
          note="Domain health scores and correlation signals are now derived from live attendance, maintenance, incident, fee and mess feedback data over the last 30 days. The signals are heuristic, not a statistical model."
        />
        <div>
          <h1 className="text-2xl font-bold">Cross-Domain Risk Correlation</h1>
          <p className="text-muted-foreground">
            Correlation analysis across attendance, mess, maintenance, safety, and fees
          </p>
          {data?.period && (
            <p className="text-xs text-muted-foreground mt-1">
              Period: {data.period.from} → {data.period.to}
            </p>
          )}
        </div>

        {signals && (
          <Card>
            <CardHeader><CardTitle>30-Day Signal Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Attendance</p>
                  <p className="text-lg font-semibold">{signals.attendance_pct}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Curfew Violations</p>
                  <p className="text-lg font-semibold">{signals.curfew_violations}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">SLA Breaches</p>
                  <p className="text-lg font-semibold">{signals.maintenance_sla_breached}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Open Incidents</p>
                  <p className="text-lg font-semibold">{signals.incidents_open}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Serious Incidents</p>
                  <p className="text-lg font-semibold">{signals.incidents_serious}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Defaulters</p>
                  <p className="text-lg font-semibold">{signals.fee_defaulters} / {signals.allocations_total}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mess Complaints</p>
                  <p className="text-lg font-semibold">{signals.mess_complaints}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Mess Rating</p>
                  <p className="text-lg font-semibold">{signals.mess_avg_rating || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Domain Health Dashboard</CardTitle></CardHeader>
          <CardContent>
            {radarData.length === 0 ? (
              <div className="h-[350px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No domain data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="domain" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Insights & Correlations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {correlations.map((item, idx) => (
                <div key={idx} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{item.title}</h4>
                    <Badge className={
                      item.risk === 'high' ? 'bg-red-100 text-red-800 hover:bg-red-100' :
                      item.risk === 'medium' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' :
                      'bg-green-100 text-green-800 hover:bg-green-100'
                    }>
                      {item.risk} risk
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-medium text-primary">Recommended: {item.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
