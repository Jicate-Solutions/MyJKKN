'use client';

// app/(routes)/meetings/availability/_components/booking-page-card.tsx
//
// U3 — the host's Universal Booking controls, two cards:
//   1. Google Calendar connection (status + connect/reconnect; D12/D19)
//   2. Public booking page (handle claim, headline, public switch; D1/D5/D20)
//
// The public switch is hard-gated on an ACTIVE Google connection (D20) — the
// server action re-enforces it; the UI just explains why it's disabled.
// Pattern: event-types-manager.tsx (client mutations via server actions +
// toast + useTransition).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { savePublicPage, type BookingPageState } from '../actions';

const GOOGLE_BANNERS: Record<string, { tone: 'ok' | 'bad'; text: string }> = {
  connected: { tone: 'ok', text: 'Google Calendar connected — your real calendar now protects your slots.' },
  declined: { tone: 'bad', text: 'Google connection was cancelled. Connect to enable your public page.' },
  invalid: { tone: 'bad', text: 'That connection link expired. Please try connecting again.' },
  failed: { tone: 'bad', text: 'Google connection failed. Please try again or contact an administrator.' },
};

export function BookingPageCard({
  initial,
  googleFlag,
  meetingTypeCount = 0,
}: {
  initial: BookingPageState;
  googleFlag?: string;
  /** Bookable meeting types the host has. 0 → their link can't accept bookings. */
  meetingTypeCount?: number;
}) {
  const [page, setPage] = useState(initial.page);
  const [handle, setHandle] = useState(initial.page?.handle ?? initial.suggestedHandle);
  const [headline, setHeadline] = useState(initial.page?.headline ?? '');
  const [isPublic, setIsPublic] = useState(initial.page?.isPublic ?? false);
  const [isSaving, startSave] = useTransition();

  const conn = initial.connection;
  const googleActive = conn?.status === 'active';
  const handleLocked = !!page?.isPublic; // D5 (relaxed): locks only once the page is published — a reserved/draft page stays renameable
  const publicUrl = `${initial.appUrl || 'https://www.jkkn.ai'}/meet/${handle || '…'}`;
  const banner = googleFlag ? GOOGLE_BANNERS[googleFlag] : undefined;
  // A booking link with no meeting types can't accept bookings — the public
  // page shows "not accepting bookings" (BUG-004267). Warn the host here so
  // they don't share a dead link.
  const noMeetingTypes = meetingTypeCount === 0;

  function onSave() {
    startSave(async () => {
      const res = await savePublicPage({ handle, headline, isPublic });
      if (res.success && res.data) {
        setPage(res.data);
        setIsPublic(res.data.isPublic);
        toast.success(
          res.data.isPublic
            ? 'Your booking page is live.'
            : 'Saved. Your page stays private until you switch it on.',
        );
      } else {
        toast.error(res.error ?? 'Could not save your booking page.');
        // Server is the authority on the D20 gate — reflect a refusal.
        if (!res.success) setIsPublic(page?.isPublic ?? false);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Google Calendar connection ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck2 className="h-4 w-4" aria-hidden />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Your real calendar blocks your booking slots — classes and existing
            meetings can never be double-booked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {banner && (
            <div
              role="status"
              className={`rounded-md border px-3 py-2 text-xs ${
                banner.tone === 'ok'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {banner.text}
            </div>
          )}

          {!conn && (
            <p className="text-sm text-muted-foreground">Not connected yet.</p>
          )}
          {conn && (
            <div className="flex items-center gap-2 text-sm">
              {conn.status === 'active' ? (
                <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Connected
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {conn.status === 'broken' ? 'Connection broken' : 'Disconnected'}
                </Badge>
              )}
              <span className="truncate text-muted-foreground">{conn.googleEmail}</span>
            </div>
          )}

          {/* Only protected on one calendar? Say so HERE, where the Reconnect
              button already is — the fix is one click away at the moment the
              person reads it. A connection made before 2026-08-05 was never
              granted permission to list calendars, so anything the host keeps on
              a second calendar is invisible to the slot engine and that time is
              still offered to strangers. There is no way for them to discover
              this on their own: nothing looks broken. */}
          {googleActive && conn?.allCalendarsChecked !== true && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <strong className="font-semibold">
                Only your main calendar is being checked.
              </strong>{' '}
              Meetings you keep on any other calendar are invisible here, so those
              times can still be double-booked. Reconnect below to have every
              calendar you own checked — it takes one click and changes nothing else.
            </div>
          )}

          {!initial.googleConfigured ? (
            <p className="text-xs text-muted-foreground">
              The Google integration is not set up on this deployment yet —
              connecting will be available soon.
            </p>
          ) : (
            <Button asChild size="sm" variant={googleActive ? 'outline' : 'default'}>
              {/* Full navigation (not fetch) — the route 302s to Google. */}
              <a href="/api/integrations/google-calendar/connect">
                {googleActive ? 'Reconnect' : 'Connect Google Calendar'}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Public booking page ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" aria-hidden />
            Public booking page
          </CardTitle>
          <CardDescription>
            Anyone with your link — or the JKKN directory — can book your open
            slots. You stay in control of your hours and meeting types.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {page?.autoHidden && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              <strong>Your page is temporarily hidden:</strong>{' '}
              {page.autoHiddenReason ?? 'your Google connection stopped working.'}{' '}
              Reconnect Google Calendar, then switch your page on again.
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bp-handle">Your booking address</Label>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-xs text-muted-foreground">/meet/</span>
              <Input
                id="bp-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                disabled={handleLocked}
                className="font-mono"
                placeholder="your-name"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {handleLocked
                ? 'Your page is live, so its address is locked. Contact an administrator to change it.'
                : 'You can change this any time until you switch your page on — then it locks.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-headline">
              Headline <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="bp-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={200}
              placeholder="e.g. Associate Professor, Pharmaceutics — happy to talk admissions & research"
            />
          </div>

          {noMeetingTypes && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="space-y-1">
                <p className="font-medium">No meeting types yet</p>
                <p>
                  {page?.isPublic
                    ? 'Your link is live but has nothing to book — visitors see “not accepting bookings.”'
                    : 'Your link won’t accept bookings until you add at least one meeting type.'}
                </p>
                <Link
                  href="/meetings/manage"
                  className="inline-flex font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
                >
                  Add a meeting type →
                </Link>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="bp-public" className="text-sm">
                Page is public
              </Label>
              <p className="text-xs text-muted-foreground">
                {googleActive
                  ? 'Visible in the directory; anyone can book your open slots.'
                  : 'Requires a connected Google Calendar (so you can never be double-booked).'}
              </p>
            </div>
            <Switch
              id="bp-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={!googleActive && !isPublic}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            {page?.isPublic && !page.autoHidden ? (
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate font-mono">{publicUrl}</span>
                <button
                  type="button"
                  aria-label="Copy booking link"
                  className="shrink-0 rounded p-1 hover:bg-accent"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    toast.success('Link copied');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open booking page"
                  className="shrink-0 rounded p-1 hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={onSave} disabled={isSaving || !handle}>
              {isSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
