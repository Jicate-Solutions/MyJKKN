'use client';

/**
 * CEO Rounds Log — client list.
 * Cards per daily round (theme, decision, participation rollup, summary state).
 * Facilitators (ceo_rounds.log) log rounds + grade participation + approve
 * summaries; the assigned Associate (ceo_rounds.summary.write) writes the summary.
 */

import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Plus, Users, Activity, FileCheck2, ClipboardList } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CeoRoundsService,
  type CeoRoundEnriched
} from '@/lib/services/ceo-rounds/ceo-rounds-service';
import { CreateRoundDialog } from './create-round-dialog';
import { RoundDetailDialog } from './round-detail-dialog';

const SUMMARY_BADGE: Record<
  CeoRoundEnriched['summary_status'],
  { label: string; className: string }
> = {
  pending: { label: 'Summary pending', className: 'bg-muted text-muted-foreground' },
  submitted: { label: 'Summary submitted', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Summary approved', className: 'bg-primary/10 text-primary' }
};

function formatDate(iso: string): string {
  // iso is a plain 'YYYY-MM-DD' date — render without timezone drift.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

interface CeoRoundsClientProps {
  userId: string;
  institutionId: string;
  initialRounds: CeoRoundEnriched[];
}

export function CeoRoundsClient({ userId, institutionId, initialRounds }: CeoRoundsClientProps) {
  const { can } = usePermissions();
  const canLog = can('ceo_rounds.log');

  const [rounds, setRounds] = useState<CeoRoundEnriched[]>(initialRounds);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRounds(await CeoRoundsService.listRounds());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList className="text-primary h-6 w-6" />
            CEO Rounds
          </h1>
          <p className="text-muted-foreground mt-1">
            The daily round: what was discussed, who took part, what was decided, and
            who owns the follow-through.
          </p>
        </div>
        {canLog && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Log a round
          </Button>
        )}
      </div>

      {rounds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ClipboardList className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No rounds logged yet</p>
              <p className="text-muted-foreground text-sm">
                {canLog
                  ? 'Log the first daily round to start the record.'
                  : 'The daily rounds record will appear here.'}
              </p>
            </div>
            {canLog && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Log a round
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rounds.map((r) => {
            const summary = SUMMARY_BADGE[r.summary_status];
            return (
              <Card
                key={r.id}
                className="cursor-pointer transition-shadow hover:shadow-sm"
                onClick={() => setDetailId(r.id)}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(r.round_date)}
                    </span>
                    <Badge
                      variant="outline"
                      className={r.status === 'closed' ? 'text-muted-foreground' : ''}
                    >
                      {r.status === 'closed' ? 'Closed' : 'Open'}
                    </Badge>
                  </div>

                  <p className="line-clamp-2 font-medium leading-snug">{r.theme}</p>

                  {r.decision && (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      <span className="font-medium">Decision:</span> {r.decision}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {r.attendee_count} present
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" />
                      {r.participation_total} participation pts
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <FileCheck2 className="text-muted-foreground h-3.5 w-3.5" />
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${summary.className}`}
                    >
                      {summary.label}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateRoundDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
        onCreated={refresh}
      />

      <RoundDetailDialog
        roundId={detailId}
        open={!!detailId}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        canLog={canLog}
        currentUserId={userId}
        institutionId={institutionId}
        onChanged={refresh}
      />
    </div>
  );
}
