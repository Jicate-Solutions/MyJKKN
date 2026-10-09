'use client';

/**
 * Campus Walk — the CCTV report form (Director decisions, 9 Oct 2026).
 *
 * The CCTV operator files what the cameras saw: which room, when, and what.
 * Routing is the server's (lib/campus-walk/cctv.ts): the room's HOD, the CAO
 * for a shared place, the Controller of Examinations for exam copying.
 *
 * Room and time only. Seat and names appear ONLY when "Exam copying" is
 * picked, and the server refuses them for anything else.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CCTV_CATEGORIES, type CctvCategory } from '@/lib/campus-walk/cctv-categories';

interface RoomOption {
  id: string;
  label: string;
  department: string | null;
}

interface DeptOption {
  id: string;
  label: string;
}

const OWNER_LABEL: Record<string, string> = {
  hod: 'the HOD of that room',
  cao_shared_place: 'the CAO, because the room has no department',
  controller_of_examinations: 'the Controller of Examinations, with the HOD copied',
  principal_no_hod: 'the principal, because no HOD is on record for that department',
  cao_no_hod: 'the CAO, because no HOD or principal is on record',
  unresolved: 'the estate office, because nobody else is on record'
};

/** Now, as the value a datetime-local input wants, in the browser's own time. */
function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CctvForm() {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<CctvCategory | null>(null);
  const [observedAt, setObservedAt] = useState(nowLocal());
  const [roomQuery, setRoomQuery] = useState('');
  const [room, setRoom] = useState<RoomOption | null>(null);
  const [typedRoom, setTypedRoom] = useState(false);
  const [deptId, setDeptId] = useState('');
  const [note, setNote] = useState('');
  const [seat, setSeat] = useState('');
  const [names, setNames] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | {
    room: string;
    ownerSource: string;
    ownerName: string | null;
    dueDate: string | null;
    repeatCount: number;
  }>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/campus-walk/cctv')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok) {
          setLoadError(j?.error ?? 'The room list could not be loaded.');
          return;
        }
        setRooms(j.rooms ?? []);
        setDepts(j.departments ?? []);
      })
      .catch(() => alive && setLoadError('No connection. The room list could not be loaded.'));
    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = roomQuery.trim().toLowerCase();
    if (q.length < 2 || room) return [];
    return rooms.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 8);
  }, [roomQuery, rooms, room]);

  const isExam = category === 'exam_copying';
  const roomReady = typedRoom ? roomQuery.trim().length > 1 : Boolean(room);
  const canSend = Boolean(category) && roomReady && Boolean(observedAt) && (!isExam || seat.trim()) && !sending;

  function reset() {
    setCategory(null);
    setObservedAt(nowLocal());
    setRoomQuery('');
    setRoom(null);
    setTypedRoom(false);
    setDeptId('');
    setNote('');
    setSeat('');
    setNames('');
    setError(null);
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/campus-walk/cctv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          observed_at: new Date(observedAt).toISOString(),
          resource_id: typedRoom ? null : room?.id ?? null,
          room_label: typedRoom ? roomQuery.trim() : null,
          department_id: typedRoom && deptId ? deptId : null,
          note: note.trim() || null,
          seat: isExam ? seat.trim() : undefined,
          names: isExam ? names.trim() : undefined
        })
      });
      const j = await res.json().catch(() => ({}) as any);
      if (res.ok && j?.ok) {
        setDone({
          room: j.room,
          ownerSource: j.owner_source,
          ownerName: j.owner_name ?? null,
          dueDate: j.due_date ?? null,
          repeatCount: Number(j.repeat_count ?? 1)
        });
        reset();
        return;
      }
      setError(j?.error ?? 'That did not go through. Please try again.');
    } catch {
      setError('No connection. Nothing was sent — try again when you have signal.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Card className="mt-4">
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-5 w-5 text-green-700" />
            <div>
              <p className="font-medium">Sent — {done.room}</p>
              <p className="text-sm text-muted-foreground">
                It went to {done.ownerName ? `${done.ownerName}, ` : ''}
                {OWNER_LABEL[done.ownerSource] ?? 'the owner'}
                {done.dueDate ? `. Reply due ${done.dueDate}.` : '.'}
              </p>
              {done.repeatCount >= 3 && (
                <p className="mt-1 text-sm text-amber-800">
                  This room has had {done.repeatCount} CCTV reports in 30 days. The principal has been told, and it
                  is on the Director&apos;s Monday list.
                </p>
              )}
            </div>
          </div>
          <Button className="h-11 w-full" onClick={() => setDone(null)}>
            Report another
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="space-y-5 pt-6">
        {loadError && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label>What was seen?</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CCTV_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                type="button"
                variant={category === c.key ? 'default' : 'outline'}
                className="h-auto min-h-11 justify-start whitespace-normal text-left"
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cctv-room">Which room?</Label>
          {room && !typedRoom ? (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{room.label}</p>
                <p className="text-muted-foreground">{room.department ?? 'No department — goes to the CAO'}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRoom(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="cctv-room"
                value={roomQuery}
                onChange={(e) => setRoomQuery(e.target.value)}
                placeholder={typedRoom ? 'Type the room name, e.g. CP IP room' : 'Start typing the room name'}
                autoComplete="off"
              />
              {!typedRoom && matches.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setRoom(m);
                          setRoomQuery(m.label);
                        }}
                      >
                        <span className="font-medium">{m.label}</span>
                        <span className="block text-muted-foreground">{m.department ?? 'No department'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setTypedRoom(!typedRoom);
                  setRoom(null);
                }}
              >
                {typedRoom ? 'Pick from the room list instead' : 'Room not in the list? Type it instead'}
              </button>
              {typedRoom && (
                <div className="space-y-1.5">
                  <Label htmlFor="cctv-dept">Department of that room</Label>
                  <select
                    id="cctv-dept"
                    className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                  >
                    <option value="">No department (shared place) — goes to the CAO</option>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cctv-time">When was it seen?</Label>
          <Input
            id="cctv-time"
            type="datetime-local"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
            className="h-11"
          />
        </div>

        {isExam && (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">
              Exam copying goes to the Controller of Examinations today. Seat and names are allowed here, and only
              here.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cctv-seat">Seat number</Label>
              <Input id="cctv-seat" value={seat} onChange={(e) => setSeat(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cctv-names">Names, if known (optional)</Label>
              <Input id="cctv-names" value={names} onChange={(e) => setNames(e.target.value)} maxLength={300} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="cctv-note">What happened? (optional)</Label>
          <Textarea
            id="cctv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Five learners on phones during the lecture, back two rows."
          />
          {!isExam && <p className="text-xs text-muted-foreground">Room and time only — please do not write names.</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button className="h-14 w-full text-base" onClick={() => void send()} disabled={!canSend}>
          {sending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
          {sending ? 'Sending…' : 'Send CCTV report'}
        </Button>
      </CardContent>
    </Card>
  );
}
