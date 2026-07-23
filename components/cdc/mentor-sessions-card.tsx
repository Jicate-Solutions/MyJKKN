'use client';

// components/cdc/mentor-sessions-card.tsx — mentor session mapping (BUG-004198).
// Reusable across BOTH peer (cdc_mentor_pairings) and industry
// (cdc_industry_mentor_pairings) pairings. Shows the per-pairing rollup, a session
// list, and a "Log session" dialog. D4: logging disabled on a concluded pairing.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useMentorSessions, useLogMentorSession } from '@/hooks/cdc/use-cdc-mentor-sessions';
import type { MentorPairingKind } from '@/types/cdc/mentor-sessions';
import { CalendarClock, Clock, Plus, Loader2, MessageSquare, Star } from 'lucide-react';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

export function MentorSessionsCard({
  kind, pairingId, canLog, title = 'Sessions', compact = false,
}: {
  kind: MentorPairingKind;
  pairingId: string;
  canLog: boolean;
  title?: string;
  compact?: boolean;
}) {
  const { data, isLoading } = useMentorSessions(kind, pairingId);
  const log = useLogMentorSession();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('');
  const [mode, setMode] = useState('');
  const [topics, setTopics] = useState('');
  const [outcome, setOutcome] = useState('');
  const [nextDate, setNextDate] = useState('');

  const sessions = data?.sessions ?? [];
  const rollup = data?.rollup;

  async function submit() {
    if (!date) return;
    await log.mutateAsync({
      kind, pairing_id: pairingId,
      session_date: new Date(date).toISOString(),
      duration_minutes: duration ? Number(duration) : null,
      mode: mode || null,
      topics_discussed: topics.split(',').map((t) => t.trim()).filter(Boolean),
      outcome_notes: outcome.trim() || null,
      next_session_date: nextDate ? new Date(nextDate).toISOString() : null,
    });
    setOpen(false);
    setDate(''); setDuration(''); setMode(''); setTopics(''); setOutcome(''); setNextDate('');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className={compact ? 'text-sm' : 'text-base'}>{title}</CardTitle>
        <Button size="sm" disabled={!canLog} title={canLog ? 'Log a mentoring session' : 'This pairing is concluded — logging is disabled'}
          onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Log session
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Rollup */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1"><MessageSquare className="w-3 h-3" /> {rollup?.session_count ?? 0} sessions</Badge>
          <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {rollup?.total_minutes ?? 0} min total</Badge>
          <Badge variant="outline" className="gap-1"><CalendarClock className="w-3 h-3" /> Last: {fmtDate(rollup?.last_session_at ?? null)}</Badge>
          {rollup?.next_session_at && (
            <Badge variant="outline" className="gap-1 text-blue-700 border-blue-200">Next: {fmtDate(rollup.next_session_at)}</Badge>
          )}
        </div>

        {/* Session list */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No sessions logged yet.</p>
        ) : (
          <div className="divide-y border rounded-md">
            {sessions.map((s) => (
              <div key={s.id} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{fmtDate(s.session_date)}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.duration_minutes ? `${s.duration_minutes} min` : ''}{s.mode ? ` · ${s.mode}` : ''}
                  </span>
                </div>
                {s.topics_discussed?.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{s.topics_discussed.join(', ')}</p>
                )}
                {s.outcome_notes && <p className="text-xs mt-0.5">{s.outcome_notes}</p>}
                {(s.mentor_rating || s.mentee_rating) && (
                  <p className="text-xs text-amber-600 mt-0.5 inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> {s.mentor_rating ? `mentor ${s.mentor_rating}/5` : ''} {s.mentee_rating ? `mentee ${s.mentee_rating}/5` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log mentoring session</DialogTitle>
            <DialogDescription>Record when this pairing met and what came out of it.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-date">Date <span className="text-red-500">*</span></Label>
              <Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-dur">Duration (min)</Label>
              <Input id="s-dur" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-mode">Mode</Label>
              <Input id="s-mode" value={mode} onChange={(e) => setMode(e.target.value)} placeholder="in_person / virtual" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-next">Next session</Label>
              <Input id="s-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="s-topics">Topics (comma-separated)</Label>
              <Input id="s-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Resume review, Interview prep" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="s-out">Outcome notes</Label>
              <Textarea id="s-out" value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!date || log.isPending} onClick={submit}>
              {log.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Log session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
