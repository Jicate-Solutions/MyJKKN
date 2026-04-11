'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Trophy, TrendingUp, Star } from 'lucide-react';
import { useSF100PublicStats } from '@/hooks/startup-studio';

interface SF100PublicStatsProps {
  programId: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="bg-white border-0 shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SF100PublicStats({ programId }: SF100PublicStatsProps) {
  const { data: raw, isLoading } = useSF100PublicStats(programId);
  const stats = (raw as any)?.data ?? raw ?? {};

  if (isLoading) return <StatsSkeleton />;

  const totalTeams = stats.total_teams ?? stats.totalTeams ?? 0;
  const totalPaidUsers = stats.total_paid_users ?? stats.totalPaidUsers ?? 0;
  const graduatedTeams = stats.graduated_teams ?? stats.total_graduated ?? stats.graduatedTeams ?? 0;
  const activeTeams = stats.active_teams ?? stats.activeTeams ?? totalTeams;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        icon={Users}
        label="Total Teams"
        value={totalTeams}
        color="bg-blue-100 text-blue-700"
      />
      <StatCard
        icon={TrendingUp}
        label="Total Paid Users"
        value={totalPaidUsers}
        color="bg-[#0b6d41]/10 text-[#0b6d41]"
      />
      <StatCard
        icon={Trophy}
        label="Graduated"
        value={graduatedTeams}
        color="bg-amber-100 text-amber-700"
      />
      <StatCard
        icon={Star}
        label="Active Teams"
        value={activeTeams}
        color="bg-purple-100 text-purple-700"
      />
    </div>
  );
}
