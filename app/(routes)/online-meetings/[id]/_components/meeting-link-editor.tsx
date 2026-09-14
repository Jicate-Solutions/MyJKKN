'use client';

/**
 * Online Meetings — set or change the video link, after the meeting exists.
 *
 * WHY THIS EXISTS
 *   The scheduling form offers a Google Meet link, but a host with no Google
 *   Calendar connection gets a notice and a meeting with `meet_url = null`.
 *   Until this component there was no way to add one afterwards: the Overview
 *   said "No video link yet" and the live page said "not published yet", and
 *   neither offered the host anything to do about it. A host looking at their
 *   own meeting could not fix it without a database edit.
 *
 *   That is the exact failure shape this codebase keeps re-learning — a
 *   blocked state must be explicit AND leave the person a way forward. Being
 *   explicit on its own is only half of it.
 *
 * Host-only by props. The server action re-checks, and the RLS policy checks
 * again, so this gate decides what is OFFERED and never what is allowed.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Check, Link2, Loader2, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnlineMeeting } from '@/lib/services/online-meetings/types';

import {
  provisionMeetLinkAction,
  updateMeetingLinkAction,
} from '../../_actions/meeting-actions';

interface Props {
  meeting: OnlineMeeting;
  /** Whether this meeting's host has an active Google Calendar connection. */
  googleConnected: boolean;
  /** Microsoft Graph credentials present on this deployment. */
  teamsConfigured: boolean;
}

export function MeetingLinkEditor({ meeting, googleConnected, teamsConfigured }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(meeting.meet_url ?? '');

  const hasLink = !!meeting.meet_url;
  const dirty = url.trim() !== (meeting.meet_url ?? '');

  function save() {
    startTransition(async () => {
      const r = await updateMeetingLinkAction(meeting.id, url.trim());
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(
        url.trim() ? 'Meeting link saved. Everyone invited can now open it.' : 'Meeting link cleared.',
      );
      router.refresh();
    });
  }

  function generate(provider: 'teams' | 'google') {
    startTransition(async () => {
      const r = await provisionMeetLinkAction(meeting.id, provider);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setUrl(r.data.meetUrl);
      toast.success(
        provider === 'teams'
          ? 'Microsoft Teams link created and added to the meeting.'
          : 'Google Meet link created and added to the meeting.',
      );
      router.refresh();
    });
  }

  return (
    <Card className={hasLink ? undefined : 'border-amber-500/50'}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {hasLink ? 'Video link' : 'This meeting has no video link yet'}
        </CardTitle>
        {!hasLink && (
          <p className="text-xs text-muted-foreground">
            People can still join and their attendance is recorded, but there is
            nowhere for them to go. Paste a Teams, Zoom or Meet link, or create
            a Google Meet link.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="meet-url">Meeting link</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="meet-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://teams.microsoft.com/l/… or any Zoom / Meet link"
              className="min-w-[260px] flex-1"
            />
            <Button onClick={save} disabled={pending || !dirty} className="gap-1.5">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          {(teamsConfigured || googleConnected) && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Teams first: it is the JKKN standard and the only provider
                  whose attendance report the platform could later read. */}
              {teamsConfigured && (
                <Button
                  variant="outline"
                  onClick={() => generate('teams')}
                  disabled={pending}
                  className="gap-1.5"
                >
                  <Video className="h-4 w-4" aria-hidden />
                  {hasLink ? 'Replace with a Teams link' : 'Create a Teams link'}
                </Button>
              )}
              {googleConnected && (
                <Button
                  variant="outline"
                  onClick={() => generate('google')}
                  disabled={pending}
                  className="gap-1.5"
                >
                  <Video className="h-4 w-4" aria-hidden />
                  {hasLink ? 'Replace with a Google Meet link' : 'Create a Google Meet link'}
                </Button>
              )}
            </div>
          )}

          {!teamsConfigured && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Microsoft Teams is the JKKN standard, but Graph is not connected
                on this deployment, so a Teams link cannot be generated. Paste
                one above. Ask IT for the Microsoft Graph credentials and every
                meeting will get one automatically.
              </span>
            </p>
          )}
          {!googleConnected && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Google Calendar is not connected for this meeting&rsquo;s host.
                It can be connected under Meetings &rarr; My Availability &amp;
                Page.
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
