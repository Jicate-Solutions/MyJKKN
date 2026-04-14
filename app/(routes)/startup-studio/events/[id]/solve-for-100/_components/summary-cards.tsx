'use client';

import { Rocket, TrendingUp, AlertTriangle, Calendar, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSolve100Dashboard } from '@/hooks/startup-studio/use-solve100-weekly';
import { SOLVE100_WEEKS } from '@/lib/constants/startup-studio/solve100';

interface SummaryCardsProps {
  eventId: string;
  totalAllTeams?: number; // full event registrations (for % comparison)
  currentWeek: number;
}

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  secondary?: string;
  color: string;
  loading?: boolean;
}

function KPICard({ icon, label, value, secondary, color, loading }: KPICardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className={cn('p-1.5 rounded-md', color)}>{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {secondary && (
              <p className="text-xs text-muted-foreground mt-0.5">{secondary}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ eventId, totalAllTeams, currentWeek }: SummaryCardsProps) {
  const { data: dashboard, isLoading } = useSolve100Dashboard(eventId);

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalTeams = dashboard?.totalTeams ?? 0;
  const totalPaidUsers = dashboard?.totalPaidUsers ?? 0;
  const teamsWithBlockers = dashboard?.teamsWithBlockers ?? 0;
  const avgPaidUsers = dashboard?.avgPaidUsers ?? 0;

  const pctOfAllTeams = totalAllTeams && totalAllTeams > 0
    ? Math.round((totalTeams / totalAllTeams) * 100)
    : null;

  const pctBlocked = totalTeams > 0
    ? Math.round((teamsWithBlockers / totalTeams) * 100)
    : 0;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        icon={<Rocket className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        label="Total Teams"
        value={totalTeams}
        secondary={
          pctOfAllTeams !== null
            ? `${pctOfAllTeams}% of ${totalAllTeams} event teams`
            : 'declared Solve for 100'
        }
        color="bg-blue-100 dark:bg-blue-950/40"
      />
      <KPICard
        icon={<TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        label="Verified Paid Users"
        value={totalPaidUsers}
        secondary={
          totalTeams > 0
            ? `Avg ${avgPaidUsers.toFixed(1)} per team`
            : 'across all teams'
        }
        color="bg-emerald-100 dark:bg-emerald-950/40"
      />
      <KPICard
        icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
        label="Teams with Blockers"
        value={teamsWithBlockers}
        secondary={`${pctBlocked}% of tracked teams`}
        color="bg-amber-100 dark:bg-amber-950/40"
      />
      <KPICard
        icon={<Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
        label="Current Week"
        value={`${currentWeek} / ${SOLVE100_WEEKS}`}
        secondary={getPhaseLabel(currentWeek)}
        color="bg-purple-100 dark:bg-purple-950/40"
      />
    </div>
  );
}

function getPhaseLabel(week: number): string {
  if (week <= 0) return 'Not started yet';
  if (week <= 4) return 'Traction Sprint (Wk 1-4)';
  if (week <= 20) return 'Scale Phase (Wk 5-20)';
  if (week <= SOLVE100_WEEKS) return 'Business Phase';
  return 'Post program';
}
