'use client';

// app/(routes)/meetings/availability/_components/integration-prefs-card.tsx
//
// Universal Booking Wave-3 — the host's "Video provider" setting.
//
// When a meeting type is ONLINE, this controls how the join link is created:
//   • Google Meet  — via the host's existing Google connection (default)
//   • Zoom         — via the institution's Zoom app
//   • Microsoft Teams — via the institution's Teams app
//
// A provider the institution hasn't enabled (env-gated, surfaced via
// availability.{zoom,teams}) is shown but disabled with a plain explanation —
// a host can never pick a provider that would produce no link. The server
// action re-enforces this gate.
//
// Pattern mirrors booking-page-card.tsx: client mutation through a server
// action + toast + useTransition. MyJKKN green for the selected provider.

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  Loader2,
  Lock,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  saveIntegrationPref,
  type IntegrationPrefsState,
  type VideoProvider,
} from './integration-prefs-actions';

type ProviderMeta = {
  id: VideoProvider;
  name: string;
  blurb: string;
  /** Whether this provider asks for a per-host identity (email / UPN). */
  identity?: { label: string; placeholder: string; help: string };
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'google',
    name: 'Google Meet',
    blurb: 'Uses your own Google connection above. The simplest option — no extra setup.',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    blurb: 'Your institution’s Zoom account creates the meeting link.',
    identity: {
      label: 'Your Zoom host email',
      placeholder: 'you@jkkn.ac.in',
      help: 'The Zoom user that should host your meetings. Leave blank to use the account default.',
    },
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    blurb: 'Your institution’s Microsoft Teams account creates the meeting link.',
    identity: {
      label: 'Your Teams sign-in (optional)',
      placeholder: 'you@jkkn.ac.in',
      help: 'For your reference only — Teams meetings are organised by the institution account.',
    },
  },
];

export function IntegrationPrefsCard({ initial }: { initial: IntegrationPrefsState }) {
  const [selected, setSelected] = useState<VideoProvider>(initial.videoProvider);
  const [identity, setIdentity] = useState(initial.providerHostIdentity ?? '');
  const [saved, setSaved] = useState<VideoProvider>(initial.videoProvider);
  const [noteInTitle, setNoteInTitle] = useState(initial.showNoteInTitle);
  const [savedNoteInTitle, setSavedNoteInTitle] = useState(initial.showNoteInTitle);
  const [isSaving, startSave] = useTransition();

  const avail = initial.availability;
  const isAvailable = (id: VideoProvider) =>
    id === 'google' ? true : Boolean(avail[id]);

  const selectedMeta = PROVIDERS.find((p) => p.id === selected);
  const dirty =
    selected !== saved ||
    (initial.noteInTitleSupported && noteInTitle !== savedNoteInTitle) ||
    (selected !== 'google' && identity.trim() !== (initial.providerHostIdentity ?? ''));

  function onSave() {
    if (!isAvailable(selected)) {
      toast.error('That option isn’t enabled by your institution yet.');
      return;
    }
    startSave(async () => {
      const res = await saveIntegrationPref({
        videoProvider: selected,
        providerHostIdentity: selected === 'google' ? undefined : identity,
        showNoteInTitle: initial.noteInTitleSupported ? noteInTitle : undefined,
      });
      if (res.success && res.data) {
        setSaved(res.data.videoProvider);
        setSelected(res.data.videoProvider);
        setIdentity(res.data.providerHostIdentity ?? '');
        setNoteInTitle(res.data.showNoteInTitle);
        setSavedNoteInTitle(res.data.showNoteInTitle);
        toast.success('Saved. Your online meetings will use this provider.');
      } else {
        toast.error(res.error ?? 'Could not save your video settings.');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" aria-hidden />
          Video provider
        </CardTitle>
        <CardDescription>
          For online meetings, choose how your join link is created. This only
          affects meeting types you’ve set as online.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset className="space-y-2" aria-label="Video provider">
          {PROVIDERS.map((p) => {
            const available = isAvailable(p.id);
            const active = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!available}
                onClick={() => available && setSelected(p.id)}
                className={[
                  'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-green-600 bg-green-50'
                    : 'border-input hover:bg-accent',
                  available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-green-600' : 'border-muted-foreground/40',
                  ].join(' ')}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-green-600" />}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.id === 'google' && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Default
                      </span>
                    )}
                    {active && available && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden />
                    )}
                    {!available && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" aria-hidden />
                        Not enabled by your institution yet
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </button>
            );
          })}
        </fieldset>

        {/* Per-host identity for the selected non-google provider. */}
        {selectedMeta?.identity && isAvailable(selected) && (
          <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2.5">
            <Label htmlFor="ip-identity" className="text-sm">
              {selectedMeta.identity.label}
            </Label>
            <Input
              id="ip-identity"
              type="email"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder={selectedMeta.identity.placeholder}
              maxLength={320}
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">{selectedMeta.identity.help}</p>
          </div>
        )}

        {/* Where the guest's booking note shows up. It is always in the event
            body; the title is opt-in because the guest can see it. */}
        {initial.noteInTitleSupported && (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="ip-note-title" className="text-sm">
                Show the discussion note in the calendar event title
              </Label>
              <p className="text-xs text-muted-foreground">
                What the guest wrote when booking is always in the event
                description. Turn this on to put it in the title too — the guest
                is invited to the event, so they can see the title on their own
                phone and calendar.
              </p>
            </div>
            <Switch
              id="ip-note-title"
              checked={noteInTitle}
              onCheckedChange={setNoteInTitle}
            />
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={onSave} disabled={isSaving || !dirty || !isAvailable(selected)}>
            {isSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
