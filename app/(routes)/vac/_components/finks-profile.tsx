'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';
import type { FinksProfile } from '@/types/vac';

interface FinksProfileProps {
  profile: FinksProfile | null;
}

interface DimensionConfig {
  key: keyof FinksProfile;
  label: string;
  color: string;
  bgColor: string;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: 'foundational_knowledge',
    label: 'Foundational Knowledge',
    color: 'bg-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-950/40',
  },
  {
    key: 'application',
    label: 'Application',
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/40',
  },
  {
    key: 'integration',
    label: 'Integration',
    color: 'bg-violet-500',
    bgColor: 'bg-violet-100 dark:bg-violet-950/40',
  },
  {
    key: 'human_dimension',
    label: 'Human Dimension',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-950/40',
  },
  {
    key: 'caring',
    label: 'Caring',
    color: 'bg-rose-500',
    bgColor: 'bg-rose-100 dark:bg-rose-950/40',
  },
  {
    key: 'learning_how_to_learn',
    label: 'Learning How to Learn',
    color: 'bg-cyan-500',
    bgColor: 'bg-cyan-100 dark:bg-cyan-950/40',
  },
];

function DimensionBar({ dimension, value }: { dimension: DimensionConfig; value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{dimension.label}</span>
        <span className="text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className={`h-2.5 w-full rounded-full ${dimension.bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${dimension.color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function FinksProfileChart({ profile }: FinksProfileProps) {
  if (!profile) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <BrainCircuit className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No Fink&apos;s Taxonomy profile available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BrainCircuit className="h-4 w-4 text-primary" />
          Fink&apos;s Taxonomy Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {DIMENSIONS.map((dim) => (
          <DimensionBar key={dim.key} dimension={dim} value={profile[dim.key]} />
        ))}
      </CardContent>
    </Card>
  );
}
