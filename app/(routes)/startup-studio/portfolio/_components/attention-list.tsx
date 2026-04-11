'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, AlertTriangle } from 'lucide-react';

interface AttentionCandidate {
  id: string;
  startup_name: string;
  stage: string;
  current_trl: number;
  risk_level?: string;
}

interface AttentionListProps {
  candidates: AttentionCandidate[];
}

const STAGE_COLORS: Record<string, string> = {
  identified: 'bg-gray-100 text-gray-700',
  screened: 'bg-blue-100 text-blue-700',
  shortlisted: 'bg-amber-100 text-amber-700',
  incubating: 'bg-purple-100 text-purple-700',
  graduated: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export function AttentionList({ candidates }: AttentionListProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No startups currently need immediate attention.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {candidates.slice(0, 5).map((c) => {
        const stageColor = STAGE_COLORS[c.stage?.toLowerCase()] ?? STAGE_COLORS.identified;
        const riskKey = c.risk_level?.toLowerCase() ?? '';
        const riskColor = RISK_COLORS[riskKey];

        return (
          <li key={c.id}>
            <Link
              href={`/startup-studio/nif/${c.id}`}
              className="flex items-center gap-3 px-1 py-3 rounded-md hover:bg-muted/50 transition-colors group"
            >
              {/* Warning icon */}
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />

              {/* Startup info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {c.startup_name || 'Unnamed Startup'}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${stageColor}`}>
                    {c.stage
                      ? c.stage.charAt(0).toUpperCase() + c.stage.slice(1).toLowerCase()
                      : 'Unknown'}
                  </Badge>
                  {riskColor && (
                    <Badge variant="outline" className={`text-xs ${riskColor}`}>
                      {c.risk_level
                        ? c.risk_level.charAt(0).toUpperCase() + c.risk_level.slice(1).toLowerCase() + ' Risk'
                        : ''}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">TRL {c.current_trl ?? '—'}</span>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
