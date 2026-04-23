// app/(routes)/audit/_components/cycle-progress-stats.tsx
// KPI strip: parameters audited / findings open / attestations signed / coverage %
// Used on dashboard + cycle detail pages.

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardCheck,
  AlertTriangle,
  Signature,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CycleProgressStatsProps {
  /** Number of system/resolved parameters expected to be audited this cycle */
  totalParameters?: number;
  /** Count of attestations with level='compliant' */
  compliant?: number;
  /** Count of attestations with level='partial' */
  partial?: number;
  /** Count of attestations with level='non-compliant' */
  nonCompliant?: number;
  /** Count of findings still open (status != 'closed') */
  findingsOpen?: number;
  /** Count of findings closed with rectification */
  findingsClosed?: number;
  isLoading?: boolean;
  className?: string;
}

interface KPICardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sublabel?: string;
  accent: string;
  progress?: number;
  isLoading?: boolean;
}

function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  accent,
  progress,
  isLoading,
}: KPICardProps) {
  return (
    <Card>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
            {sublabel && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {sublabel}
              </p>
            )}
          </div>
          <Icon className={cn('h-5 w-5', accent)} />
        </div>
        {typeof progress === 'number' && !isLoading && (
          <Progress value={progress} className="h-1.5 mt-3" />
        )}
      </CardContent>
    </Card>
  );
}

export function CycleProgressStats({
  totalParameters = 0,
  compliant = 0,
  partial = 0,
  nonCompliant = 0,
  findingsOpen = 0,
  findingsClosed = 0,
  isLoading,
  className,
}: CycleProgressStatsProps) {
  const totalAttested = compliant + partial + nonCompliant;
  const attestationCoverage =
    totalParameters > 0
      ? Math.round((totalAttested / totalParameters) * 100)
      : 0;

  const findingsTotal = findingsOpen + findingsClosed;
  const rectificationRate =
    findingsTotal > 0
      ? Math.round((findingsClosed / findingsTotal) * 100)
      : 0;

  return (
    <div
      className={cn(
        'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      <KPICard
        icon={ClipboardCheck}
        label="Parameters"
        value={totalParameters}
        sublabel="tracked in catalog"
        accent="text-indigo-600"
        isLoading={isLoading}
      />
      <KPICard
        icon={Signature}
        label="Attestations signed"
        value={totalAttested}
        sublabel={`${compliant} compliant · ${partial} partial · ${nonCompliant} non-compliant`}
        accent="text-emerald-600"
        progress={attestationCoverage}
        isLoading={isLoading}
      />
      <KPICard
        icon={AlertTriangle}
        label="Findings open"
        value={findingsOpen}
        sublabel={`${findingsClosed} rectified`}
        accent="text-amber-600"
        progress={rectificationRate}
        isLoading={isLoading}
      />
      <KPICard
        icon={Target}
        label="Coverage"
        value={`${attestationCoverage}%`}
        sublabel={`${totalAttested} / ${totalParameters} parameters`}
        accent="text-purple-600"
        progress={attestationCoverage}
        isLoading={isLoading}
      />
    </div>
  );
}
