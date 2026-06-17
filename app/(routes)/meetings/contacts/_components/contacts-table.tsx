'use client';

// app/(routes)/meetings/contacts/_components/contacts-table.tsx
//
// Client surface for M6 Contacts: a roster table + a per-contact drawer
// (scheduling-activity timeline + editable private notes + "Share availability").
//
// The roster rows are passed in pre-computed from the server page. Opening a
// contact lazily fetches their booking timeline via getContactDetailAction
// (keeps the initial payload small even for hosts with hundreds of contacts).

import { useState, useTransition } from 'react';
import {
  Calendar,
  Loader2,
  Mail,
  NotebookPen,
  Phone,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type {
  ContactBooking,
  MeetingContact,
} from '@/lib/services/meetings/meeting-contacts-service';
import { getContactDetailAction, saveContactNotes } from '../actions';

interface ContactsTableProps {
  contacts: MeetingContact[];
  /** Absolute /meet/<handle> link, or null if the host has no public page. */
  shareUrl: string | null;
}

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  completed: 'outline',
  no_show: 'outline',
  cancelled: 'destructive',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ContactsTable({ contacts, shareUrl }: ContactsTableProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MeetingContact | null>(null);
  const [bookings, setBookings] = useState<ContactBooking[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, startSaving] = useTransition();

  async function openContact(contact: MeetingContact) {
    setActive(contact);
    setNotes(contact.notes ?? '');
    setName(contact.displayName === contact.email ? '' : contact.displayName);
    setPhone(contact.phone ?? '');
    setBookings(null);
    setOpen(true);
    setLoadingDetail(true);
    try {
      const detail = await getContactDetailAction(contact.email);
      setBookings(detail?.bookings ?? []);
    } catch {
      setBookings([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleSave() {
    if (!active) return;
    startSaving(async () => {
      const result = await saveContactNotes({
        email: active.email,
        notes,
        name: name || null,
        phone: phone || null,
      });
      if (result.success) {
        toast.success('Notes saved');
        // reflect locally so the table icon/notes stay current without a reload
        active.notes = notes.trim() ? notes.trim() : null;
        active.hasNotes = !!active.notes;
      } else {
        toast.error(result.error ?? 'Could not save notes');
      }
    });
  }

  async function copyShareLink() {
    if (!shareUrl) {
      toast.error('Set up your public booking page first (Meetings → Manage).');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Availability link copied', { description: shareUrl });
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
    }
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="text-center">Bookings</TableHead>
              <TableHead className="hidden md:table-cell">Last booked</TableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow
                key={c.email}
                className="cursor-pointer"
                onClick={() => openContact(c)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {initials(c.displayName)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground sm:hidden">
                        {c.email}
                      </div>
                    </div>
                    {c.hasNotes && (
                      <NotebookPen
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Has notes"
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {c.email}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{c.totalBookings}</Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {formatDate(c.lastBookedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openContact(c);
                    }}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          {active && (
            <>
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {initials(active.displayName)}
                  </span>
                  <span className="truncate">{active.displayName}</span>
                </SheetTitle>
                <SheetDescription className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <Mail className="h-3 w-3" aria-hidden />
                    {active.email}
                  </span>
                  {active.phone && (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Phone className="h-3 w-3" aria-hidden />
                      {active.phone}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              {/* quick stats */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="text-lg font-semibold">{active.totalBookings}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-lg font-semibold">{active.confirmedBookings}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Confirmed</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-lg font-semibold">{active.cancelledBookings}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">Cancelled</div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={copyShareLink}
              >
                <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Share availability
              </Button>

              <Separator className="my-4" />

              {/* scheduling activity */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                  Scheduling activity
                </h4>
                {loadingDetail ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Loading bookings…
                  </div>
                ) : !bookings || bookings.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">No bookings found.</p>
                ) : (
                  <ul className="space-y-2">
                    {bookings.map((b) => (
                      <li key={b.uid} className="rounded-md border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {b.meetingTitle ?? 'Meeting'}
                          </span>
                          <Badge variant={STATUS_BADGE[b.status] ?? 'outline'}>
                            {b.status}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" aria-hidden />
                          {formatDateTime(b.startTime)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator className="my-4" />

              {/* editable enrichment */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                  Your notes
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Corrected name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <Textarea
                  placeholder="Private notes about this contact — only you can see these."
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <SheetFooter className="mt-4">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                  Save notes
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
