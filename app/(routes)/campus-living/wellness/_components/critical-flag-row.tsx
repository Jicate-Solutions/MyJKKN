'use client';

/**
 * CriticalFlagRow — one critical-flag entry in the warden inbox.
 *
 * Respects the per-config anonymous_mode flag: when true, learner_id is
 * suppressed and replaced with an anonymized token derived from the
 * response id (stable per-response, not reversible).
 */

import { AlertTriangle, ShieldOff, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { HostelPulseResponseWithConfig } from '@/types/campus-living/wellness';

interface CriticalFlagRowProps {
  response: HostelPulseResponseWithConfig;
}

function anonymousLabel(id: string): string {
  // Stable last-6 of the response id; UUIDs are random enough that this
  // doesn't leak ordering.
  return `anon-${id.slice(-6)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function CriticalFlagRow({ response }: CriticalFlagRowProps) {
  const anonymous = response.config?.questions?.anonymous_mode === true;
  const moodText =
    response.overall_mood == null ? '—' : `${response.overall_mood}/5`;

  return (
    <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-red-900">
            {response.config?.title ?? 'Pulse response'}
          </span>
          <Badge
            variant="secondary"
            className="bg-red-100 text-red-800 hover:bg-red-100"
          >
            mood {moodText}
          </Badge>
          {anonymous ? (
            <Badge variant="outline" className="text-xs">
              <ShieldOff className="h-3 w-3 mr-1" />
              anonymous
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
          <User className="h-3 w-3" />
          <span className="font-mono">
            {anonymous ? anonymousLabel(response.id) : response.learner_id}
          </span>
          <span>·</span>
          <span>submitted {formatDate(response.submitted_at)}</span>
          <span>·</span>
          <span>period {response.period_start}</span>
        </div>
      </div>
    </div>
  );
}
