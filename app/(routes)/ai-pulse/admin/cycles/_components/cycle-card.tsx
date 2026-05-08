'use client';
// app/(routes)/ai-pulse/admin/cycles/_components/cycle-card.tsx
// Created: 2026-05-06
// Purpose: Single AI Pulse cycle row in the Champion Console list.
//          Shows status badge, demo date, featured tool, host, registrations count.
//          Click → navigates to /ai-pulse/admin/cycles/[id].

import Link from 'next/link';
import { Calendar, ExternalLink, Sparkles, User, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { AIPulseCycleRow } from '@/lib/services/ai-pulse/cycles-service';

interface CycleCardProps {
  cycle: AIPulseCycleRow;
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  planning: 'secondary',
  execution: 'secondary',
  live: 'default',
  post_event: 'secondary',
  completed: 'default',
  cancelled: 'destructive',
  archived: 'outline',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function CycleCard({ cycle }: CycleCardProps) {
  const variant = STATUS_VARIANTS[cycle.status] || 'outline';
  const toolLabel = cycle.featured_tool
    ? cycle.featured_tool.name +
      (cycle.featured_tool.vendor ? ` · ${cycle.featured_tool.vendor}` : '')
    : 'No tool set';
  const hostLabel = cycle.host
    ? cycle.host.full_name || cycle.host.email || 'Unknown'
    : 'Unassigned';

  return (
    <Link
      href={`/ai-pulse/admin/cycles/${cycle.id}`}
      className="block transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
    >
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold truncate">
                  {cycle.name || 'Untitled cycle'}
                </h3>
                <Badge variant={variant} className="capitalize">
                  {cycle.status}
                </Badge>
                {cycle.ai_pulse.external_judge_cycle && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    External judge
                  </Badge>
                )}
              </div>
              {cycle.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {cycle.description}
                </p>
              )}
            </div>
            <ExternalLink
              className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1"
              aria-hidden
            />
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  Demo date
                </div>
                <div className="truncate">{formatDate(cycle.demo_date)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  Featured tool
                </div>
                <div className="truncate" title={toolLabel}>
                  {toolLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  Host
                </div>
                <div className="truncate" title={hostLabel}>
                  {hostLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  Registrations
                </div>
                <div className="truncate">{cycle.registrations_count ?? 0}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
