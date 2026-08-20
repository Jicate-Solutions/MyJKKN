'use client';

// Individual session feedback — who rated which session, what they scored it, and
// what they wrote. The sessions section already shows the per-session AVERAGE; this
// is the drill-down behind it, plus the XLSX export coordinators ask for.
//
// Rows are RESPONSES, not enrollees: a fresher who never rated anything does not
// appear here. Coverage ("how many of the cohort responded") is the method-mix
// section's job — conflating the two would make a 62% response rate look like a
// complete roster.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  InductionService, type SessionFeedbackDetailRow,
} from '@/lib/services/induction/induction-service';
import { exportSessionFeedbackToExcel } from '@/lib/utils/induction-feedback-export';
import {
  MessageSquare, RefreshCw, Star, Download, Search,
} from 'lucide-react';

const ALL_SESSIONS = '__all_sessions__';
const ALL_RATINGS = '__all_ratings__';
const ALL_METHODS = '__all_methods__';
const PAGE = 50;

function sessionLabel(r: { day_number: number | null; session_title: string | null }): string {
  const title = r.session_title?.trim() || 'Untitled session';
  return r.day_number == null ? title : `D${r.day_number} · ${title}`;
}

/** Low scores are the ones worth finding, so colour carries the signal. */
function ratingTone(rating: number): string {
  if (rating <= 2) return 'text-red-600 dark:text-red-400';
  if (rating === 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

export function SessionFeedbackSection({
  eventId, eventName,
}: { eventId: string; eventName?: string | null }) {
  const [rows, setRows] = useState<SessionFeedbackDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  // Same graceful-deny posture as the scorecard: a role outside this event's scope
  // gets a P0001 RAISE from the RPC — render a muted note, not a red toast.
  const [denied, setDenied] = useState(false);

  const [sessionFilter, setSessionFilter] = useState(ALL_SESSIONS);
  const [ratingFilter, setRatingFilter] = useState(ALL_RATINGS);
  const [methodFilter, setMethodFilter] = useState(ALL_METHODS);
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await InductionService.getSessionFeedbackDetail(eventId));
      setDenied(false);
    } catch (e: any) {
      if (e?.code === 'P0001') {
        setDenied(true);
      } else {
        toast.error(`Couldn't load session feedback: ${e?.message ?? e}`);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // A narrowed filter must not leave the reader paged deep into a shorter list.
  useEffect(() => {
    setLimit(PAGE);
  }, [sessionFilter, ratingFilter, methodFilter, commentsOnly, search]);

  // Session axis in RPC order (day → session_order → start), so the dropdown reads
  // like the programme runs rather than alphabetically.
  const sessionOptions = useMemo(
    () => [...new Map(rows.map((r) => [r.session_id, r])).values()],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sessionFilter !== ALL_SESSIONS && r.session_id !== sessionFilter) return false;
      if (ratingFilter !== ALL_RATINGS && r.rating !== Number(ratingFilter)) return false;
      if (methodFilter !== ALL_METHODS) {
        const isSelf = methodFilter === 'self';
        if (r.is_self !== isSelf) return false;
      }
      if (commentsOnly && (r.comment ?? '').trim() === '') return false;
      if (q) {
        const hay = [
          r.learner_name, r.register_number, r.roll_number,
          r.college_email, r.student_email, r.student_mobile,
          r.department_name, r.program_name, r.comment,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sessionFilter, ratingFilter, methodFilter, commentsOnly, search]);

  const stats = useMemo(() => {
    const n = filtered.length;
    const avg = n ? filtered.reduce((a, r) => a + r.rating, 0) / n : 0;
    return {
      responses: n,
      learners: new Set(filtered.map((r) => r.learner_id)).size,
      avg: n ? avg.toFixed(2) : '—',
      withComment: filtered.filter((r) => (r.comment ?? '').trim() !== '').length,
    };
  }, [filtered]);

  // Export what is on screen, not the raw pull — otherwise a coordinator who filtered
  // to "1-star with comments" silently gets all 1,185 rows in the file.
  const handleExport = async () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export with the current filters.');
      return;
    }
    setExporting(true);
    try {
      await exportSessionFeedbackToExcel(filtered, eventName || 'induction');
      toast.success(`Exported ${filtered.length} response${filtered.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      toast.error(`Couldn't build the export: ${e?.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  if (denied) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Individual session feedback isn’t available for your role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Session feedback
          </CardTitle>
          <CardDescription>
            Every individual response — who rated which session, the score, and what they
            wrote. Feedback here is attributed, not anonymous: the kiosk flow records it on
            behalf of a named fresher.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport}
          disabled={exporting || loading || filtered.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          {exporting ? 'Building…' : 'Export to Excel'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No session feedback yet — it fills in as freshers rate sessions from their phone
            or a volunteer captures it at the kiosk.{' '}
            <button onClick={load} className="underline">Refresh</button>.
          </p>
        ) : (
          <>
            {/* Headline for the CURRENT filter */}
            <div className="flex flex-wrap items-stretch gap-2">
              {[
                { label: 'Responses', value: String(stats.responses), hint: `from ${stats.learners} learner${stats.learners === 1 ? '' : 's'}` },
                { label: 'Average', value: stats.avg, hint: 'rating 1–5' },
                { label: 'With comment', value: String(stats.withComment), hint: 'free text left' },
              ].map((s) => (
                <div key={s.label} className="flex-1 min-w-[140px] rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-2xl font-bold mt-1">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, comment…" className="h-9 w-[260px] pl-8" />
              </div>

              <Select value={sessionFilter} onValueChange={setSessionFilter}>
                <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder="All sessions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SESSIONS}>All sessions</SelectItem>
                  {sessionOptions.map((s) => (
                    <SelectItem key={s.session_id} value={s.session_id}>{sessionLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Any rating" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_RATINGS}>Any rating</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} star{n === 1 ? '' : 's'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Any capture" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_METHODS}>Any capture</SelectItem>
                  <SelectItem value="self">Self (own login)</SelectItem>
                  <SelectItem value="kiosk">Volunteer kiosk</SelectItem>
                </SelectContent>
              </Select>

              <Button size="sm" variant={commentsOnly ? 'default' : 'outline'}
                onClick={() => setCommentsOnly((v) => !v)}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comments only
              </Button>

              <Button size="sm" variant="ghost" onClick={load} className="ml-auto">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {/* Responses */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Department / Program</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Captured</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No responses match those filters.
                      </TableCell>
                    </TableRow>
                  ) : filtered.slice(0, limit).map((r) => (
                    <TableRow key={r.feedback_id}>
                      <TableCell className="font-medium">
                        <div className="leading-tight">
                          <div>{r.learner_name ?? '— unnamed —'}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.register_number || r.roll_number || r.college_email || ''}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="leading-tight">
                          <div className="truncate" title={r.department_name ?? ''}>
                            {r.department_name ?? '—'}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate"
                            title={r.program_name ?? ''}>
                            {r.program_name ?? ''}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate" title={sessionLabel(r)}>
                        {sessionLabel(r)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center gap-1 font-semibold ${ratingTone(r.rating)}`}>
                          <Star className="h-3.5 w-3.5" />{r.rating}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        {(r.comment ?? '').trim()
                          ? <span className="whitespace-pre-wrap break-words">{r.comment}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.is_self ? 'secondary' : 'outline'} className="font-normal">
                          {r.is_self ? 'Self' : 'Kiosk'}
                        </Badge>
                        {!r.is_self && r.submitted_by_name && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[140px] truncate"
                            title={r.submitted_by_name}>
                            by {r.submitted_by_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.submitted_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filtered.length > limit && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Showing {limit} of {filtered.length} responses — the export includes all {filtered.length}.
                </span>
                <Button size="sm" variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - limit)} more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
