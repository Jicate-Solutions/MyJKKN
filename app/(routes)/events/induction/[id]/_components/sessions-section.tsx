'use client';

// Induction sessions — day-by-day schedule editor. All reads/writes go through
// the gated DEFINER RPCs via InductionService (event_sessions RLS is admin-only).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type InductionSessionRow,
  type ResourceLink,
} from '@/lib/services/induction/induction-service';
import { AttendanceDialog } from './attendance-dialog';
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
import { Plus, Pencil, Trash2, Clock, MapPin, User, Target, LinkIcon, X } from 'lucide-react';

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
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
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
  const [venue, setVenue] = useState('');
  const [outcome, setOutcome] = useState('');
  const [links, setLinks] = useState<ResourceLink[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSessions(await InductionService.listSessions(eventId)); }
    catch (e: any) { toast.error(`Couldn't load sessions: ${e.message ?? e}`); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setDay('1'); setBatchId(COMBINED); setStart(''); setEnd('');
    setTitle(''); setSpeaker(''); setVenue(''); setOutcome(''); setLinks([]);
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setOpen(true); };
  const openEdit = (s: InductionSessionRow) => {
    setEditing(s);
    setDay(String(s.day_number ?? 1));
    setBatchId(s.batch_id ?? COMBINED);
    setStart(isoToLocal(s.start_at)); setEnd(isoToLocal(s.end_at));
    setTitle(s.title); setSpeaker(s.speaker_text ?? ''); setVenue(s.venue_text ?? '');
    setOutcome(s.outcome_text ?? ''); setLinks(s.resource_links ?? []);
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    if (!start || !end) { toast.error('Start and end time are required.'); return; }
    if (new Date(end) <= new Date(start)) { toast.error('End must be after start.'); return; }
    setSaving(true);
    try {
      await InductionService.upsertSession({
        eventId,
        sessionId: editing?.id ?? null,
        dayNumber: Number(day) || null,
        batchId: batchId === COMBINED ? null : batchId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        title: title.trim(),
        speakerText: speaker.trim() || null,
        venueText: venue.trim() || null,
        outcomeText: outcome.trim() || null,
        resourceLinks: links.filter((l) => l.url.trim()),
      });
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
            <CardTitle className="text-base">Sessions</CardTitle>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-speaker">Resource person</Label>
                    <Input id="s-speaker" placeholder="e.g. English Department" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-venue">Venue</Label>
                    <Input id="s-venue" placeholder="e.g. Senthuraj Hall" value={venue} onChange={(e) => setVenue(e.target.value)} />
                  </div>
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
          <p className="text-sm text-muted-foreground">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet. Add the first one to start building the schedule.</p>
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d}>
                <h3 className="text-sm font-semibold mb-2">{d === 0 ? 'Unscheduled' : `Day ${d}`}</h3>
                <div className="space-y-2">
                  {byDay.get(d)!.map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.title}</span>
                            <Badge variant="secondary">{s.batch_label ? `Batch ${s.batch_label}` : 'Combined'}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(s.start_at)}–{fmtTime(s.end_at)}</span>
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
                        <div className="flex gap-1 shrink-0">
                          <AttendanceDialog sessionId={s.id} sessionTitle={s.title} />
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
