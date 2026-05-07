// app/(routes)/ai-pulse/_components/current-cycle-card.tsx
// Created: 2026-05-06 — Wave B.1

import { CalendarDays, Sparkles, Video } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AiPulseCycle } from '@/lib/services/ai-pulse/learner-service';

interface CurrentCycleCardProps {
  cycle: AiPulseCycle | null;
}

function formatThursday(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function CurrentCycleCard({ cycle }: CurrentCycleCardProps) {
  if (!cycle) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">This Week's AI Pulse</CardTitle>
          </div>
          <CardDescription>
            No active AI Pulse cycle this week. Check back Thursday at 6:55 PM IST.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const meetUrl = cycle.config?.meet_url ?? null;
  const recordingUrl = cycle.config?.recording_url ?? null;
  const status = cycle.status ?? 'draft';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">
                {cycle.name || 'AI Pulse Live Session'}
              </CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatThursday(cycle.start_date)}
            </CardDescription>
          </div>
          <Badge variant={status === 'live' ? 'default' : 'secondary'}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cycle.config?.primary_language && (
          <p className="text-sm text-muted-foreground">
            Languages: {cycle.config.primary_language?.toUpperCase()}
            {cycle.config.secondary_language
              ? ` + ${cycle.config.secondary_language.toUpperCase()}`
              : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {meetUrl && (
            <Button asChild size="sm">
              <a href={meetUrl} target="_blank" rel="noreferrer">
                <Video className="h-4 w-4 mr-2" />
                Join Live Session
              </a>
            </Button>
          )}
          {recordingUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={recordingUrl} target="_blank" rel="noreferrer">
                Watch Recording
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
