'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Layers,
  CheckCircle2,
  FileEdit,
  Archive,
  Building2,
  ListChecks,
  IndianRupee,
  ArrowUpDown,
} from 'lucide-react';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';

type Stats = Awaited<ReturnType<typeof FeeStructureService.getStats>>;

function formatCurrency(amount: number): string {
  if (amount >= 10_00_000) return `₹${(amount / 10_00_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32 mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FeeStructureStats({ refetchKey }: { refetchKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    FeeStructureService.getStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [refetchKey]);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KPICard
        title="Total Structures"
        value={stats.total}
        subtitle={`${stats.institutions_covered} institution${stats.institutions_covered === 1 ? '' : 's'} covered`}
        icon={Layers}
        color="text-primary"
      />
      <KPICard
        title="Active"
        value={stats.active}
        subtitle={
          stats.structures_without_items > 0
            ? `${stats.structures_without_items} without items`
            : 'All have fee items'
        }
        icon={CheckCircle2}
        color="text-green-600"
      />
      <KPICard
        title="Draft"
        value={stats.draft}
        subtitle="Pending activation"
        icon={FileEdit}
        color="text-amber-500"
      />
      <KPICard
        title="Archived"
        value={stats.archived}
        subtitle="No longer in use"
        icon={Archive}
        color="text-muted-foreground"
      />
      <KPICard
        title="Avg Fee / Structure"
        value={formatCurrency(stats.avg_fee_per_structure)}
        subtitle={`${stats.avg_items_per_structure} items avg`}
        icon={IndianRupee}
        color="text-blue-600"
      />
      <KPICard
        title="Fee Range"
        value={`${formatCurrency(stats.min_fee)} – ${formatCurrency(stats.max_fee)}`}
        subtitle="Min – Max across active"
        icon={ArrowUpDown}
        color="text-violet-600"
      />
      <KPICard
        title="Mandatory Items"
        value={stats.total_mandatory_items}
        subtitle="Across all active structures"
        icon={ListChecks}
        color="text-orange-600"
      />
      <KPICard
        title="Optional Items"
        value={stats.total_optional_items}
        subtitle="Student can opt out"
        icon={Building2}
        color="text-cyan-600"
      />
    </div>
  );
}
