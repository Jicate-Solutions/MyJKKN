'use client';

/**
 * HR Intelligence — Tab 8: Capacity Planning
 *
 * Data source: hr_recruitment_signal_cache (via useRecruitmentSignals hook).
 * Shows projected hiring needs per institution based on signal status.
 * Cards: Red/Amber signal counts, estimated positions needed, link to recruitment.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Briefcase, AlertCircle, AlertTriangle, Users, ArrowRight, BarChart3 } from 'lucide-react';
import { useRecruitmentSignals } from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

export function CapacityPlanningTab() {
  const { data: signals, isLoading, isError } = useRecruitmentSignals({});
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => { map[inst.id] = inst.name; });
    return map;
  }, [institutions]);

  const analysis = useMemo(() => {
    if (!signals || signals.length === 0) return null;

    const redSignals = signals.filter((s) => s.overall_status === 'red');
    const amberSignals = signals.filter((s) => s.overall_status === 'amber');
    const greenSignals = signals.filter((s) => s.overall_status === 'green');
    const blockedSignals = signals.filter((s) => s.overall_status === 'blocked' || s.overall_status === 'insufficient_data');

    // Group by institution
    const byInst: Record<string, { red: number; amber: number; green: number; blocked: number; total: number }> = {};

    for (const s of signals) {
      const instId = s.institution_id;
      if (!byInst[instId]) byInst[instId] = { red: 0, amber: 0, green: 0, blocked: 0, total: 0 };
      byInst[instId].total += 1;
      if (s.overall_status === 'red') byInst[instId].red += 1;
      else if (s.overall_status === 'amber') byInst[instId].amber += 1;
      else if (s.overall_status === 'green') byInst[instId].green += 1;
      else byInst[instId].blocked += 1;
    }

    const instBreakdown = Object.entries(byInst)
      .map(([instId, counts]) => ({
        instId,
        name: institutionNames[instId] ?? instId.slice(0, 8),
        ...counts,
        urgency: counts.red > 0 ? 'critical' : counts.amber > 0 ? 'moderate' : 'healthy',
      }))
      .sort((a, b) => b.red - a.red || b.amber - a.amber);

    // Estimated positions: red signals × 2 (rough heuristic) + amber × 1
    const estimatedPositions = redSignals.length * 2 + amberSignals.length;

    return {
      redCount: redSignals.length,
      amberCount: amberSignals.length,
      greenCount: greenSignals.length,
      blockedCount: blockedSignals.length,
      totalSignals: signals.length,
      estimatedPositions,
      instBreakdown,
    };
  }, [signals, institutionNames]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-24" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load signal data for capacity planning.
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Capacity Planning
          </CardTitle>
          <CardDescription>
            Projected hiring needs based on recruitment need signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Briefcase className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Signal Data</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Compute recruitment need signals via the Recruitment Need tab first.
              Capacity planning derives from signal status per institution/program.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/hr/intelligence?tab=recruitment-need">
                Go to Recruitment Need
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5 text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Red Signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{analysis.redCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Immediate hiring need</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Amber Signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{analysis.amberCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Upcoming need</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Est. Positions Needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.estimatedPositions}</div>
            <p className="text-xs text-muted-foreground mt-1">Based on signal severity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Total Signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.totalSignals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analysis.greenCount} green, {analysis.blockedCount} blocked
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-institution breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Hiring Needs by Institution
              </CardTitle>
              <CardDescription>
                Red = immediate, Amber = upcoming, Green = healthy
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="text-xs gap-1.5">
              <Link href="/hr/recruitment">
                Recruitment Pipeline
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analysis.instBreakdown.map((inst) => (
              <div
                key={inst.instId}
                className={`rounded-lg p-3 border ${
                  inst.urgency === 'critical'
                    ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10'
                    : inst.urgency === 'moderate'
                      ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10'
                      : 'border-green-200 bg-green-50/50 dark:bg-green-900/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate max-w-[50%]">{inst.name}</span>
                  <div className="flex items-center gap-2">
                    {inst.red > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {inst.red} red
                      </Badge>
                    )}
                    {inst.amber > 0 && (
                      <Badge className="text-[10px] bg-amber-500 hover:bg-amber-600">
                        {inst.amber} amber
                      </Badge>
                    )}
                    {inst.green > 0 && (
                      <Badge className="text-[10px] bg-green-600 hover:bg-green-700">
                        {inst.green} green
                      </Badge>
                    )}
                    {inst.blocked > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {inst.blocked} blocked
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  {/* Mini bar showing signal distribution */}
                  {inst.total > 0 && (
                    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-muted">
                      {inst.red > 0 && (
                        <div
                          className="bg-red-500"
                          style={{ width: `${(inst.red / inst.total) * 100}%` }}
                        />
                      )}
                      {inst.amber > 0 && (
                        <div
                          className="bg-amber-500"
                          style={{ width: `${(inst.amber / inst.total) * 100}%` }}
                        />
                      )}
                      {inst.green > 0 && (
                        <div
                          className="bg-green-500"
                          style={{ width: `${(inst.green / inst.total) * 100}%` }}
                        />
                      )}
                      {inst.blocked > 0 && (
                        <div
                          className="bg-gray-300"
                          style={{ width: `${(inst.blocked / inst.total) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
