'use client';

// app/(routes)/meetings/notes/unmatched/_components/link-note-button.tsx
//
// The "link to meeting" picker.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
// It does not suggest a match. No "probably this one", no highlighted row, no
// sorting by how close a booking's start time is to the note's. The list is
// plain reverse-chronological and the search box is driven entirely by what the
// person types.
//
// That restraint is the feature. Ranking by time-and-attendee similarity is
// auto-matching wearing a UI — the human still clicks, but they click what the
// software pointed at, and a confident wrong suggestion is how a private
// conversation gets stapled to somebody else's meeting. Everyone who can see
// that meeting can then read it, and an un-read is not available. An unmatched
// note costs two clicks; a mis-matched one cannot be undone from the reader's
// memory.
//
// The second step exists for the same reason: picking a meeting arms the
// button, it does not fire it. The confirmation names both sides in full so the
// last thing seen before the write is "THIS note onto THIS meeting".

import { useMemo, useState, useTransition } from 'react';
import { Link2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { linkMeetingNote } from '../actions';

export interface BookingOption {
  id: string;
  title: string;
  hostName: string;
  attendeeName: string;
  startsAt: string | null;
}

interface LinkNoteButtonProps {
  noteId: string;
  noteTitle: string;
  bookings: BookingOption[];
}

function formatWhen(value: string | null): string {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export function LinkNoteButton({ noteId, noteTitle, bookings }: LinkNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bookings;
    return bookings.filter((b) =>
      `${b.title} ${b.hostName} ${b.attendeeName}`.toLowerCase().includes(needle),
    );
  }, [bookings, query]);

  const selected = bookings.find((b) => b.id === selectedId) ?? null;

  function reset() {
    setQuery('');
    setSelectedId(null);
  }

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      const result = await linkMeetingNote({ noteId, bookingId: selected.id });

      if (!result.success) {
        toast.error(result.error ?? 'Could not link this note.');
        return;
      }

      // Said plainly, because it is a consequence and not a detail: linking
      // hands the note to that meeting's invited set, and takes it out of this
      // list — and out of the linker's own view unless they were invited too.
      toast.success('Linked. This note now belongs to that meeting and its invited people.');
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Link2 className="h-4 w-4" aria-hidden />
          Link to meeting
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link these notes to a meeting</DialogTitle>
          <DialogDescription>
            Pick the meeting these notes belong to. Everyone invited to that meeting will be able
            to read them, so only link a meeting you are sure about.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-sm font-medium">{noteTitle}</p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings by title, host or attendee"
              className="pl-8"
              aria-label="Search meetings"
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
            {matches.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No meetings match that search.
              </p>
            ) : (
              matches.map((booking) => {
                const isSelected = booking.id === selectedId;
                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => setSelectedId(booking.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      isSelected ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="block font-medium">{booking.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatWhen(booking.startsAt)} &middot; {booking.hostName} with{' '}
                      {booking.attendeeName}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selected && (
            <p className="text-xs text-muted-foreground">
              Linking to <span className="font-medium text-foreground">{selected.title}</span> on{' '}
              {formatWhen(selected.startsAt)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || pending}>
            {pending ? 'Linking…' : 'Link to this meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
