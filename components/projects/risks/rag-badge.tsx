'use client';

/**
 * RAG / severity / escalation badges for the RAID register.
 * Shared, presentational only. No data fetching.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { matrixScore } from '@/types/projects-risks';

const RAG_STYLE: Record<string, string> = {
  red: 'bg-red-100 text-red-800 border-red-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  green: 'bg-green-100 text-green-800 border-green-200',
};

const RAG_LABEL: Record<string, string> = {
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
};

export function RagBadge({ rag, className }: { rag: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(RAG_STYLE[rag] ?? 'bg-muted text-muted-foreground', className)}
    >
      {RAG_LABEL[rag] ?? rag}
    </Badge>
  );
}

/**
 * Compact severity cell for the register table. Shows simple H/M/L OR the
 * matrix score (L×I) plus the RAG band, whichever the risk uses.
 */
export function SeverityCell({
  severitySimple,
  likelihood,
  impact,
  rag,
}: {
  severitySimple: string | null;
  likelihood: number | null;
  impact: number | null;
  rag: string;
}) {
  const score = matrixScore(likelihood, impact);

  if (score != null) {
    return (
      <div className="flex items-center gap-1.5">
        <RagBadge rag={rag} />
        <span className="text-xs text-muted-foreground">
          {likelihood}×{impact}={score}
        </span>
      </div>
    );
  }

  if (severitySimple) {
    return (
      <div className="flex items-center gap-1.5">
        <RagBadge rag={rag} />
        <span className="text-xs capitalize text-muted-foreground">
          {severitySimple}
        </span>
      </div>
    );
  }

  return <RagBadge rag={rag} />;
}

export function EscalationBadge({ isEscalated }: { isEscalated: boolean }) {
  if (!isEscalated) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-red-200 bg-red-50 text-red-700"
    >
      <AlertTriangle className="h-3 w-3" />
      Escalated
    </Badge>
  );
}
