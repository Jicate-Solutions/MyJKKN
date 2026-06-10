'use client';

import { Users, Activity, WifiOff, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthSummaryTilesProps {
  total: number;
  active: number;
  dormant: number;
  disconnected: number;
  avgHealthScore: number;
  loading?: boolean;
}

interface TileProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  colorClass: string;
}

function Tile({ label, value, sub, icon, colorClass }: TileProps) {
  return (
    <Card className={`border ${colorClass}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        <div className="opacity-70">{icon}</div>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function HealthSummaryTiles({
  total,
  active,
  dormant,
  disconnected,
  avgHealthScore,
  loading = false,
}: HealthSummaryTilesProps) {
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <Tile
        label="Total Accounts"
        value={total}
        sub="across all institutions"
        icon={<Users className="h-4 w-4" />}
        colorClass="border-border"
      />
      <Tile
        label="Active"
        value={active}
        sub={`${total > 0 ? Math.round((active / total) * 100) : 0}% of total`}
        icon={<Activity className="h-4 w-4 text-green-600" />}
        colorClass="border-green-200 dark:border-green-800"
      />
      <Tile
        label="Dormant"
        value={dormant}
        sub="no posts in 14+ days"
        icon={<Activity className="h-4 w-4 text-yellow-600" />}
        colorClass="border-yellow-200 dark:border-yellow-800"
      />
      <Tile
        label="Disconnected"
        value={disconnected}
        sub="token expired / revoked"
        icon={<WifiOff className="h-4 w-4 text-red-600" />}
        colorClass="border-red-200 dark:border-red-800"
      />
      <Tile
        label="Avg Health Score"
        value={`${avgHealthScore}/100`}
        sub="across active accounts"
        icon={<AlertTriangle className="h-4 w-4 text-blue-600" />}
        colorClass="border-blue-200 dark:border-blue-800"
      />
    </div>
  );
}
