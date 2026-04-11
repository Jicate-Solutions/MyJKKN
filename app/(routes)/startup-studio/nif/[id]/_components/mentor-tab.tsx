'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  UserPlus,
  Star,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Clock,
  ArrowRight,
  Rocket,
} from 'lucide-react';
import {
  useMentorMatches,
  useSuggestedMentors,
  useCreateMatch,
  useLogSession,
} from '@/hooks/startup-studio';

// ─── Badge configs ────────────────────────────────────────────────────────────

const MENTOR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  resident:        { label: 'Resident',        color: 'bg-purple-100 text-purple-800' },
  visiting:        { label: 'Visiting',         color: 'bg-blue-100 text-blue-800' },
  industry_expert: { label: 'Industry Expert',  color: 'bg-amber-100 text-amber-800' },
  academic:        { label: 'Academic',          color: 'bg-emerald-100 text-emerald-800' },
  investor:        { label: 'Investor',          color: 'bg-cyan-100 text-cyan-800' },
  alumni:          { label: 'Alumni',            color: 'bg-indigo-100 text-indigo-800' },
  functional:      { label: 'Functional',        color: 'bg-gray-100 text-gray-800' },
};

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: 'bg-green-100 text-green-800' },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

// ─── Assign Mentor Dialog ─────────────────────────────────────────────────────

interface AssignMentorDialogProps {
  candidateId: string;
}

function AssignMentorDialog({ candidateId }: AssignMentorDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: suggestedRaw, isLoading } = useSuggestedMentors(candidateId);
  const assignMentor = useCreateMatch();

  const suggested: any   = suggestedRaw;
  const mentors: any[]   = Array.isArray(suggested) ? suggested : suggested?.data ?? [];

  const handleAssign = async (mentorId: string) => {
    await assignMentor.mutateAsync({ candidateId, data: { mentor_id: mentorId } });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Assign Mentor
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign a Mentor</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : mentors.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No suggested mentors available.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Browse the full{' '}
                <Link href="/startup-studio/mentors" className="text-primary hover:underline">
                  Mentor Network
                </Link>{' '}
                to find a match.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {mentors.length} suggested mentor{mentors.length !== 1 ? 's' : ''} based on domain match
              </p>
              {mentors.map((mentor: any) => {
                const typeConfig = MENTOR_TYPE_CONFIG[mentor.mentor_type] ?? MENTOR_TYPE_CONFIG.functional;
                const domains: string[] = Array.isArray(mentor.domain_expertise) ? mentor.domain_expertise : [];

                return (
                  <div
                    key={mentor.id}
                    className="flex items-center justify-between gap-3 border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{mentor.name}</p>
                        <Badge variant="outline" className={`text-xs ${typeConfig.color}`}>
                          {typeConfig.label}
                        </Badge>
                      </div>
                      {mentor.designation && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {mentor.designation}{mentor.organization ? `, ${mentor.organization}` : ''}
                        </p>
                      )}
                      {domains.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {domains.slice(0, 3).map((d) => (
                            <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAssign(mentor.id)}
                      disabled={assignMentor.isPending}
                    >
                      Assign
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick Log Session (inline for match card) ────────────────────────────────

function QuickLogButton({ matchId, mentorId }: { matchId: string; mentorId: string }) {
  const [open, setOpen]   = useState(false);
  const [date, setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState('');
  const logSession = useLogSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logSession.mutateAsync({
      matchId,
      data: {
        session_date: date,
        duration_minutes: duration ? Number(duration) : 30,
        topics_discussed: [],
      },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Log Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Log Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Duration (minutes)</label>
            <input
              type="number"
              min="15"
              step="15"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="60"
              className="w-full border rounded px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={logSession.isPending}>
              {logSession.isPending ? 'Logging...' : 'Log'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({ match }: { match: any }) {
  const [expanded, setExpanded] = useState(false);
  const matchStatusConfig = MATCH_STATUS_CONFIG[match.status] ?? MATCH_STATUS_CONFIG.active;
  const typeConfig = MENTOR_TYPE_CONFIG[match.mentor?.mentor_type] ?? MENTOR_TYPE_CONFIG.functional;
  const sessions: any[] = Array.isArray(match.sessions) ? match.sessions : [];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">
                {match.mentor?.name ?? 'Unknown Mentor'}
              </p>
              <Badge variant="outline" className={`text-xs ${typeConfig.color}`}>
                {typeConfig.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{match.sessions_count ?? sessions.length ?? 0} sessions</span>
              {match.satisfaction_score != null && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {Number(match.satisfaction_score).toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={matchStatusConfig.color}>
            {matchStatusConfig.label}
          </Badge>
          {match.status === 'active' && match.mentor?.id && (
            <QuickLogButton matchId={match.id} mentorId={match.mentor.id} />
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((p) => !p)}
            aria-label="Toggle session history"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Session History</p>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions logged yet.</p>
          ) : (
            sessions.map((session: any, i: number) => (
              <div key={session.id ?? i} className="text-sm border rounded p-3 bg-background space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {session.date
                      ? new Date(session.date).toLocaleDateString()
                      : 'Date not set'}
                  </span>
                  {session.duration_minutes && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {session.duration_minutes} min
                    </span>
                  )}
                </div>
                {session.focus_area && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {(session.focus_area as string).replace(/_/g, ' ')}
                  </Badge>
                )}
                {session.key_takeaways && (
                  <p className="text-muted-foreground text-xs line-clamp-2">
                    {session.key_takeaways}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main MentorTab component ─────────────────────────────────────────────────

interface MentorTabProps {
  candidateId: string;
}

export function MentorTab({ candidateId }: MentorTabProps) {
  const { data: matchesRaw, isLoading } = useMentorMatches(candidateId);

  const matches: any   = matchesRaw;
  const matchList: any[] = Array.isArray(matches) ? matches : matches?.data ?? [];

  const active    = matchList.filter((m: any) => m.status === 'active');
  const paused    = matchList.filter((m: any) => m.status === 'paused');
  const completed = matchList.filter((m: any) => m.status === 'completed');

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Mentor Assignments</h2>
          <p className="text-sm text-muted-foreground">
            {matchList.length === 0
              ? 'No mentors assigned'
              : `${active.length} active · ${paused.length} paused · ${completed.length} completed`}
          </p>
        </div>
        <AssignMentorDialog candidateId={candidateId} />
      </div>

      {matchList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No mentors assigned yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Assign a mentor to start tracking sessions and progress
            </p>
            <AssignMentorDialog candidateId={candidateId} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Active
              </h3>
              {active.map((match: any) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
          {paused.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Paused
              </h3>
              {paused.map((match: any) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Completed
              </h3>
              {completed.map((match: any) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Link to full mentor directory */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/startup-studio/mentors">
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            Browse Mentor Network
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
