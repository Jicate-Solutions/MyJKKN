'use client';

/**
 * Online Meetings — the scheduling form.
 *
 * Two things here are worth reading before changing them.
 *
 * ENGAGEMENT IS OPT-IN, PER MEETING.
 *   AI Pulse has one global policy table because it is one recurring session.
 *   A team meeting is not: most have no quiz and many have no polls. If the
 *   gate were fixed, every attendee of an ordinary meeting would be reported
 *   disengaged — a number that is not merely wrong but confidently wrong. So
 *   the organiser says what this meeting measures, and the report counts only
 *   that.
 *
 * OPEN LINK IS OFFERED, AND WARNED ABOUT.
 *   Anyone who opens an open link is recorded as whoever they say they are.
 *   That is genuinely useful for a town hall and genuinely misleading on a
 *   compliance report, so the choice carries its consequence next to it rather
 *   than in a help page.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Info, Loader2, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { MeetProvider } from '@/lib/services/online-meetings/types';

import { createMeetingAction } from '../../_actions/meeting-actions';

interface MeetingFormProps {
  institutions: Array<{ id: string; name: string }>;
  defaultInstitutionId: string;
  googleConnected: boolean;
  /** Microsoft Graph credentials present on this deployment. */
  teamsConfigured: boolean;
}

/** Local datetime string for an <input type="datetime-local"> default. */
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function plusMinutes(local: string, minutes: number): string {
  const d = new Date(local);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeetingForm({
  institutions,
  defaultInstitutionId,
  googleConnected,
  teamsConfigured,
}: MeetingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [institutionId, setInstitutionId] = useState(defaultInstitutionId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => plusMinutes(defaultStart(), 60));
  const [joinMode, setJoinMode] = useState<'invite_only' | 'open_link'>('invite_only');
  // Teams is the default, because it is what JKKN actually runs meetings on:
  // every AI Pulse cycle that has a link uses a Teams URL. When Graph is not
  // configured the choice stays on Teams and the meeting is simply created
  // without a link, with a notice saying so — the same fallback the Champion
  // lives with today. Never silently switch the organiser to another provider.
  const [meetProvider, setMeetProvider] = useState<MeetProvider>('teams');
  const [meetUrl, setMeetUrl] = useState('');
  const [requirePolls, setRequirePolls] = useState(false);
  const [requiredPollCount, setRequiredPollCount] = useState(1);
  const [requireQuiz, setRequireQuiz] = useState(false);
  const [lateThreshold, setLateThreshold] = useState(10);

  function submit() {
    if (!title.trim()) {
      toast.error('Give the meeting a title.');
      return;
    }
    if (!institutionId) {
      toast.error('Choose an institution.');
      return;
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast.error('The meeting must end after it starts.');
      return;
    }

    startTransition(async () => {
      const result = await createMeetingAction({
        institutionId,
        title: title.trim(),
        description: description.trim() || undefined,
        // The datetime-local value is wall-clock in the browser's zone; the
        // Date constructor resolves it there, and toISOString normalises it.
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        joinMode,
        meetProvider,
        meetUrl: meetUrl.trim() || undefined,
        requirePolls,
        requiredPollCount,
        requireQuiz,
        lateThresholdMinutes: lateThreshold,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // A provider that is not connected is a NOTICE, not an error: the
      // meeting exists and is usable. Reporting it as a failure would send
      // somebody hunting for a meeting that is sitting there waiting for them.
      if (result.data.meetNotice) {
        toast(result.data.meetNotice, { duration: 8000, icon: 'ℹ️' });
      } else {
        toast.success('Meeting scheduled.');
      }
      router.push(`/online-meetings/${result.data.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The meeting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="om-title">Title</Label>
            <Input
              id="om-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monthly department review"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="om-desc">What is it about? (optional)</Label>
            <Textarea
              id="om-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Shown to everyone you invite, including guests."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="om-start">Starts</Label>
            <Input
              id="om-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                if (new Date(endsAt) <= new Date(e.target.value)) {
                  setEndsAt(plusMinutes(e.target.value, 60));
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="om-end">Ends</Label>
            <Input
              id="om-end"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="om-institution">Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="om-institution">
                <SelectValue placeholder="Choose an institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="om-joinmode">Who can join</Label>
            <Select
              value={joinMode}
              onValueChange={(v) => setJoinMode(v as 'invite_only' | 'open_link')}
            >
              <SelectTrigger id="om-joinmode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invite_only">Invited people only</SelectItem>
                <SelectItem value="open_link">Anyone with the link</SelectItem>
              </SelectContent>
            </Select>
            {joinMode === 'open_link' && (
              <p className="flex items-start gap-1.5 pt-1 text-xs text-amber-700 dark:text-amber-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Anyone who opens the link is recorded as whoever they say they
                are. Fine for a briefing, weak as attendance evidence.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The video call</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="om-provider">Create the link with</Label>
            <Select
              value={meetProvider}
              onValueChange={(v) => setMeetProvider(v as MeetProvider)}
            >
              <SelectTrigger id="om-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teams">
                  Microsoft Teams {teamsConfigured ? '' : '(not connected yet)'}
                </SelectItem>
                <SelectItem value="google">
                  Google Meet {googleConnected ? '' : '(not connected)'}
                </SelectItem>
                <SelectItem value="manual">I will paste a link myself</SelectItem>
              </SelectContent>
            </Select>

            {meetProvider === 'teams' && !teamsConfigured && (
              <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Teams is the JKKN standard, but Microsoft Graph is not connected
                on this deployment yet, so no link can be generated. Paste one
                below for now. Ask IT for the Graph credentials and every
                meeting will get a Teams link automatically.
              </p>
            )}
            {meetProvider === 'google' && !googleConnected && (
              <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Your Google Calendar is not connected. Connect it under Meetings
                &rarr; My Availability &amp; Page, or paste a link below.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="om-url">
              {meetProvider === 'manual' ? 'Meeting link' : 'Link to use if none can be created'}
            </Label>
            <Input
              id="om-url"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              placeholder="https://teams.microsoft.com/l/… or any Zoom / Meet link"
            />
            <p className="text-xs text-muted-foreground">
              You can add or change this later. Attendance is recorded whether
              or not a link is set.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What to measure</CardTitle>
          <p className="text-xs text-muted-foreground">
            Joining on time and staying to the end are always recorded. Turn on
            anything else this meeting should count.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="om-late" className="font-normal">
              Count as on time if they join within
            </Label>
            <Input
              id="om-late"
              type="number"
              min={0}
              max={120}
              value={lateThreshold}
              onChange={(e) => setLateThreshold(Number(e.target.value) || 0)}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="om-polls"
              checked={requirePolls}
              onCheckedChange={(v) => setRequirePolls(v === true)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="om-polls" className="font-normal">
                Count poll answers
              </Label>
              {requirePolls && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Must answer</span>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={requiredPollCount}
                    onChange={(e) => setRequiredPollCount(Number(e.target.value) || 1)}
                    className="w-16"
                  />
                  <span className="text-xs text-muted-foreground">
                    poll(s). If you issue fewer, only those count.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="om-quiz"
              checked={requireQuiz}
              onCheckedChange={(v) => setRequireQuiz(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="om-quiz" className="font-normal">
                Count a post-meeting quiz
              </Label>
              <p className="text-xs text-muted-foreground">
                You write the questions on the meeting page afterwards. It opens
                when the meeting ends.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Video className="h-4 w-4" aria-hidden />
          )}
          Schedule meeting
        </Button>
        <Button variant="outline" onClick={() => router.push('/online-meetings')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
