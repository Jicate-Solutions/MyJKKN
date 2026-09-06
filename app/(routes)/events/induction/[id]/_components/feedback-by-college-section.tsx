'use client';

// Induction feedback, split by the college of the LEARNER who submitted it
// (Director decision D5). Once a session is shared across colleges
// (event_session_institutions), "how did OUR freshers rate it" is a different
// question per college, and the stamped event_session_feedback.institution_id
// cannot answer it — that column records the write path, not the learner. It
// currently attributes 30 live rows to JKKN Main Office that were submitted by
// Arts & Science freshers. This section reads the learner-derived RPC instead.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  InductionService,
  type SessionFeedbackByCollege,
  type InductionSessionRow,
} from '@/lib/services/induction/induction-service';
import { Building2, RefreshCw, Star } from 'lucide-react';

const ALL_COLLEGES = '__all__';
const ALL_SESSIONS = '__all_sessions__';

interface CollegeTotal {
  institutionId: string | null;
  name: string;
  responses: number;
  avgRating: number;
}

/** Weighted average across the (session × college) cells of one college. */
function rollUp(rows: SessionFeedbackByCollege[]): CollegeTotal[] {
  const byCollege = new Map<string, CollegeTotal & { weighted: number }>();
  for (const r of rows) {
    const key = r.learner_institution_id ?? r.learner_institution_name;
    const cur = byCollege.get(key) ?? {
      institutionId: r.learner_institution_id,
      name: r.learner_institution_name,
      responses: 0,
      avgRating: 0,
      weighted: 0,
    };
    cur.responses += r.response_count;
    cur.weighted += Number(r.avg_rating) * r.response_count;
    byCollege.set(key, cur);
  }
  return [...byCollege.values()]
    .map((c) => ({
      institutionId: c.institutionId,
      name: c.name,
      responses: c.responses,
      avgRating: c.responses > 0 ? Math.round((c.weighted / c.responses) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.responses - a.responses);
}

export function FeedbackByCollegeSection({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<SessionFeedbackByCollege[]>([]);
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Same graceful-deny posture as the scorecard: a role outside this event's
  // scope gets a P0001 RAISE from the RPC — render a muted note, not a red toast.
  const [denied, setDenied] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const [collegeFilter, setCollegeFilter] = useState<string>(ALL_COLLEGES);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [feedback, sessionList] = await Promise.all([
        InductionService.getSessionFeedbackByCollege(eventId),
        // The session list only labels the rows; a failure here must not blank
        // the breakdown, so it degrades to raw ids.
        InductionService.listSessions(eventId).catch(() => [] as InductionSessionRow[]),
      ]);
      setRows(feedback);
      setSessions(sessionList);
      setDenied(false);
    } catch (e: any) {
      if (e?.code === 'P0001') {
        setDenied(true);
      } else {
        toast.error(`Couldn't load feedback by college: ${e?.message ?? e}`);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const sessionTitle = useMemo(() => {
    const m = new Map(sessions.map((s) => [s.id, s.title]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [sessions]);

  const colleges = useMemo(() => rollUp(rows), [rows]);

  const filtered = useMemo(
    () => rows.filter((r) =>
      (sessionFilter === ALL_SESSIONS || r.feedback_session_id === sessionFilter)
      && (collegeFilter === ALL_COLLEGES
          || (r.learner_institution_id ?? r.learner_institution_name) === collegeFilter)),
    [rows, sessionFilter, collegeFilter],
  );

  // Only sessions that actually carry feedback are worth offering as a filter.
  const sessionOptions = useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.feedback_session_id))];
    return ids.map((id) => ({ id, title: sessionTitle(id) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows, sessionTitle]);

  if (denied) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Feedback by college isn’t available for your role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Feedback by college
        </CardTitle>
        <CardDescription>
          Each college’s own read on a session, counted from the college of the fresher who
          submitted it — not from where the response was typed in. This is the split a{' '}
          <span className="font-medium text-foreground">shared</span> session needs.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No session feedback yet. <button onClick={load} className="underline">Refresh</button>.
          </p>
        ) : (
          <>
            {/* Per-college headline */}
            <div className="flex flex-wrap items-stretch gap-2">
              {colleges.map((c) => (
                <div key={c.institutionId ?? c.name} className="flex-1 min-w-[180px] rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground truncate" title={c.name}>{c.name}</div>
                  <div className="text-2xl font-bold mt-1 flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-amber-500" />{c.avgRating}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {c.responses} response{c.responses === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={sessionFilter} onValueChange={setSessionFilter}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="All sessions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SESSIONS}>All sessions</SelectItem>
                  {sessionOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={collegeFilter} onValueChange={setCollegeFilter}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="All colleges" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COLLEGES}>All colleges</SelectItem>
                  {colleges.map((c) => (
                    <SelectItem key={c.institutionId ?? c.name} value={c.institutionId ?? c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" variant="ghost" onClick={load} className="ml-auto">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {/* Session × college grid */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead className="text-right">Avg rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        No responses match that filter.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((r) => (
                    <TableRow key={`${r.feedback_session_id}-${r.learner_institution_id ?? r.learner_institution_name}`}>
                      <TableCell className="font-medium max-w-[380px] truncate" title={sessionTitle(r.feedback_session_id)}>
                        {sessionTitle(r.feedback_session_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">{r.learner_institution_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.response_count}</TableCell>
                      <TableCell className="text-right font-semibold">{r.avg_rating}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
