'use client';

// Induction sessions — day-by-day schedule editor. All reads/writes go through
// the gated DEFINER RPCs via InductionService (event_sessions RLS is admin-only).
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type InductionSessionRow,
  type ResourceLink,
} from '@/lib/services/induction/induction-service';
import { InductionSpeakersService, type DirectoryUser } from '@/lib/services/induction/induction-speakers-service';
import { PersonAvailabilityService } from '@/lib/services/availability/person-availability';
import { useAuth } from '@/hooks/use-auth';
import { AttendanceDialog } from './attendance-dialog';
import { SessionPollDialog } from './session-poll-dialog';
import { SessionSpeakerPicker } from './session-speaker-picker';
import { VenueRoomPicker } from '@/app/(routes)/meetings/manage/_components/venue-room-picker';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, MapPin, User, Target, LinkIcon, X, Star, CalendarDays } from 'lucide-react';

interface Batch { id: string; label: string; }
const COMBINED = '__combined__';

// ISO <-> <input type="datetime-local"> ('YYYY-MM-DDTHH:mm', local time)
function isoToLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function SessionsSection({ eventId, batches }: { eventId: string; batches: Batch[] }) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
  const [feedback, setFeedback] = useState<Record<string, { avg: number; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InductionSessionRow | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [day, setDay] = useState('1');
  const [batchId, setBatchId] = useState(COMBINED);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  // STRICT venue: a Resource Management room id (no free text). venueInitialName
  // holds the stored venue_text so the picker trigger shows the real room name
  // before the room list loads (and even if the room is no longer listed); for a
  // legacy session it also surfaces the pre-existing typed venue to prompt linking.
  const [venueResourceId, setVenueResourceId] = useState('');
  const [venueInitialName, setVenueInitialName] = useState('');
  const [outcome, setOutcome] = useState('');
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [speakers, setSpeakers] = useState<DirectoryUser[]>([]);
  // Guard: never write the speaker set until existing links have loaded, so a
  // save before/without a successful load can't silently wipe them.
  const [speakersLoaded, setSpeakersLoaded] = useState(false);
  // Retry-safe create: holds the id of a session created this open, so a retry
  // after a failed speaker-write updates the same row instead of duplicating it.
  const lastCreatedIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, summary] = await Promise.all([
        InductionService.listSessions(eventId),
        InductionService.getSessionFeedbackSummary(eventId).catch(() => []),
      ]);
      setSessions(rows);
      const fb: Record<string, { avg: number; count: number }> = {};
      for (const s of summary) fb[s.session_id] = { avg: Number(s.avg_rating), count: s.response_count };
      setFeedback(fb);
    } catch (e: any) { toast.error(`Couldn't load sessions: ${e.message ?? e}`); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setDay('1'); setBatchId(COMBINED); setStart(''); setEnd('');
    setTitle(''); setSpeaker(''); setVenueResourceId(''); setVenueInitialName('');
    setOutcome(''); setLinks([]); setSpeakers([]);
    setSpeakersLoaded(false);
    lastCreatedIdRef.current = null;
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setSpeakersLoaded(true);   // new session has no speakers → safe to write
    setOpen(true);
  };
  const openEdit = (s: InductionSessionRow) => {
    setEditing(s);
    setDay(String(s.day_number ?? 1));
    setBatchId(s.batch_id ?? COMBINED);
    setStart(isoToLocal(s.start_at)); setEnd(isoToLocal(s.end_at));
    setTitle(s.title); setSpeaker(s.speaker_text ?? '');
    setVenueResourceId(s.venue_resource_id ?? '');
    setVenueInitialName(s.venue_text ?? '');
    setOutcome(s.outcome_text ?? ''); setLinks(s.resource_links ?? []);
    setSpeakers([]);
    setSpeakersLoaded(false);
    InductionSpeakersService.getSessionSpeakers(s.id)
      .then((r) => { setSpeakers(r); setSpeakersLoaded(true); })
      .catch(() => setSpeakers([]));   // leave speakersLoaded false → save won't wipe
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    if (!start || !end) { toast.error('Start and end time are required.'); return; }
    if (new Date(end) <= new Date(start)) { toast.error('End must be after start.'); return; }

    // Tiered double-booking guard (availability spine, Limb 2): a meeting OR
    // event-speaking clash BLOCKS (a person can't be in two of those at once);
    // a teaching/class clash is advisory (shown as a warning in the picker, not
    // blocked). A super-admin may force past a hard block.
    if (speakers.length && start && end) {
      try {
        const rows = await PersonAvailabilityService.getPeopleConflicts(
          speakers.map((s) => s.id),
          new Date(start).toISOString(),
          new Date(end).toISOString(),
        );
        const hard = rows.filter((r) => r.source === 'meeting' || r.source === 'event');
        if (hard.length) {
          const nameById = new Map(speakers.map((s) => [s.id, s.full_name || s.email || 'Someone']));
          const who = [...new Set(hard.map((h) => (h.profile_id ? nameById.get(h.profile_id) : null) ?? 'Someone'))].join(', ');
          if (profile?.is_super_admin) {
            if (!window.confirm(`${who} already has a meeting or another event at this time. Force the assignment anyway? (admin override)`)) return;
          } else {
            toast.error(`Can't assign — ${who} already has a meeting or event at this time. Pick another time, or remove them.`);
            return;
          }
        }
      } catch {
        /* availability check failed — don't block the save on a transient hiccup */
      }
    }

    setSaving(true);
    try {
      // On a retry after a failed speaker-write, reuse the just-created id so we
      // update the same session instead of inserting a duplicate.
      const sessionId = editing?.id ?? lastCreatedIdRef.current;
      const sid = await InductionService.upsertSession({
        eventId,
        sessionId,
        dayNumber: Number(day) || null,
        batchId: batchId === COMBINED ? null : batchId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        title: title.trim(),
        speakerText: speaker.trim() || null,
        // STRICT: send only the chosen room id — the RPC derives venue_text from
        // the registry name (or clears it when no room is chosen). No free text.
        venueResourceId: venueResourceId || null,
        outcomeText: outcome.trim() || null,
        resourceLinks: links.filter((l) => l.url.trim()),
      });
      lastCreatedIdRef.current = sid;   // remember before the speaker write can fail
      // link the chosen resource persons to real user records (replace-set) —
      // only if existing links loaded, else a wipe-before-load is silent data loss
      if (speakersLoaded) {
        await InductionSpeakersService.setSessionSpeakers(sid, speakers.map((u) => u.id));
      }
      toast.success(editing ? 'Session updated.' : 'Session added.');
      setOpen(false); resetForm(); await load();
    } catch (e: any) {
      toast.error(`Couldn't save session: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const remove = async (s: InductionSessionRow) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    try { await InductionService.deleteSession(s.id); toast.success('Session deleted.'); await load(); }
    catch (e: any) { toast.error(`Couldn't delete: ${e.message ?? e}`); }
  };

  // group by day
  const byDay = new Map<number, InductionSessionRow[]>();
  for (const s of sessions) {
    const d = s.day_number ?? 0;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Sessions
              {sessions.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                  {sessions.length}
                </span>
              )}
            </CardTitle>
            <CardDescription>The day-by-day schedule — topics, speakers, venues, outcomes, and resources.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add session</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit session' : 'Add session'}</DialogTitle>
                <DialogDescription>One slot of the schedule. Combined = both batches together.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-day">Day</Label>
                    <Input id="s-day" type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Select value={batchId} onValueChange={setBatchId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={COMBINED}>Combined (all batches)</SelectItem>
                        {batches.map((b) => <SelectItem key={b.id} value={b.id}>Batch {b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-start">Start</Label>
                    <Input id="s-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-end">End</Label>
                    <Input id="s-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-title">Topic / activity</Label>
                  <Input id="s-title" placeholder="e.g. Unmute Yourself" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-speaker">Group / note (optional)</Label>
                  <Input id="s-speaker" placeholder="e.g. English Department" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Venue</Label>
                  <VenueRoomPicker
                    value={venueResourceId}
                    onChange={setVenueResourceId}
                    initialName={venueInitialName || null}
                    disabled={saving}
                    strict
                  />
                  {!venueResourceId && venueInitialName && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Current venue “{venueInitialName}” was typed in, not linked to a room. Pick the matching
                      room from the list to link it — saving without picking will clear the venue.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Resource persons (linked users)</Label>
                  <SessionSpeakerPicker
                    value={speakers}
                    onChange={setSpeakers}
                    disabled={saving}
                    sessionStart={start}
                    sessionEnd={end}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-outcome">Outcome (what this session aims to achieve)</Label>
                  <Textarea id="s-outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Resource links (slides, Drive folders)</Label>
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => setLinks([...links, { label: '', url: '' }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add link
                    </Button>
                  </div>
                  {links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Label" value={l.label}
                        onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="w-1/3" />
                      <Input placeholder="https://…" value={l.url}
                        onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add session'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-sm font-medium">No sessions yet</p>
            <p className="text-xs text-muted-foreground">Add the first one to start building the day-by-day schedule.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add session
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((d) => {
              const daySessions = byDay.get(d)!;
              return (
                <div key={d} className="space-y-2">
                  {/* Day header band */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">
                      {d === 0 ? 'Unscheduled' : `Day ${d}`}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {daySessions.length} session{daySessions.length === 1 ? '' : 's'}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* Agenda rows — time gutter + session card */}
                  <div className="space-y-2">
                    {daySessions.map((s) => (
                      <div key={s.id} className="group flex gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
                        {/* time gutter */}
                        <div className="w-14 shrink-0 pt-0.5 text-right">
                          <div className="text-sm font-semibold leading-tight tabular-nums">{fmtTime(s.start_at)}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(s.end_at)}</div>
                        </div>
                        {/* content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.title}</span>
                            <Badge variant="secondary">{s.batch_label ? `Batch ${s.batch_label}` : 'Combined'}</Badge>
                            {feedback[s.id] && (
                              <Badge variant="outline" className="gap-1" title={`${feedback[s.id].count} response(s)`}>
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {feedback[s.id].avg.toFixed(1)} · {feedback[s.id].count}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {s.venue_text && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.venue_text}</span>}
                            {s.speaker_text && <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.speaker_text}</span>}
                          </div>
                          {s.outcome_text && (
                            <p className="mt-1.5 text-xs text-muted-foreground flex items-start gap-1">
                              <Target className="h-3 w-3 mt-0.5 shrink-0" />{s.outcome_text}
                            </p>
                          )}
                          {s.resource_links?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {s.resource_links.map((l, i) => (
                                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                                  <LinkIcon className="h-3 w-3" />{l.label || 'Resource'}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* actions */}
                        <div className="flex gap-1 shrink-0">
                          <AttendanceDialog sessionId={s.id} sessionTitle={s.title} />
                          <SessionPollDialog sessionId={s.id} sessionTitle={s.title} />
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
