// app/(routes)/meetings/availability/_components/google-read-card.tsx
//
// "Let the assistant read my Gmail and Drive" — sits beside the Google Calendar
// card. Server component: the buttons are a plain link (the connect route 302s
// to Google) and a plain form POST (disconnect), so it works without JS.
//
// Shown when the switch (ai.google_read.enabled) is on and the person may use
// the AI Assistant — OR whenever they already have a connection, so that
// Disconnect is always reachable even after the switch is turned off.

import { AlertTriangle, CheckCircle2, HardDrive, Mail, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GoogleReadCardState } from '@/lib/services/integrations/google-read/connection';

type Tone = 'ok' | 'bad' | 'warn';

const BANNERS: Record<string, { tone: Tone; text: string }> = {
  connected: {
    tone: 'ok',
    text: 'Connected. The assistant can now read your Gmail and Drive when you ask it to.',
  },
  partial: {
    tone: 'warn',
    text: 'Connected, but Google was not given both boxes. The assistant can only read what you ticked — connect again to add the other.',
  },
  declined: { tone: 'bad', text: 'Connection cancelled. Nothing was connected.' },
  invalid: {
    tone: 'bad',
    text: 'That connection link expired or was started by a different sign-in. Please try again from this page.',
  },
  failed: { tone: 'bad', text: 'Google connection failed. Please try again, or contact your MyJKKN administrator.' },
  off: { tone: 'bad', text: 'Reading Gmail and Drive is not switched on yet.' },
  not_configured: { tone: 'bad', text: 'Google is not set up on this deployment yet.' },
  forbidden: { tone: 'bad', text: 'Your role does not include the AI Assistant, so there is nothing to connect it to.' },
  disconnected: {
    tone: 'ok',
    text: 'Disconnected. MyJKKN has deleted its key and asked Google to remove the permission. The assistant can no longer read your mail or Drive.',
  },
  disconnected_kept_for_calendar: {
    tone: 'warn',
    text: 'Disconnected. MyJKKN has deleted its key, so the assistant can no longer read your mail or Drive. Google still lists MyJKKN as allowed, because your Google Calendar connection uses the same permission — removing it at Google would disconnect your calendar too. To remove it anyway, open myaccount.google.com/permissions.',
  },
  disconnected_revoke_failed: {
    tone: 'warn',
    text: 'Disconnected. MyJKKN has deleted its key, so the assistant can no longer read your mail or Drive — but Google did not confirm removing the permission. You can remove it yourself at myaccount.google.com/permissions.',
  },
  disconnect_failed: { tone: 'bad', text: 'Could not disconnect just now. Please try again.' },
};

const TONE_CLASSES: Record<Tone, string> = {
  ok: 'border-green-200 bg-green-50 text-green-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
  warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
  bad: 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
};

function Allowed({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        on ? 'text-green-700 dark:text-emerald-400' : 'text-muted-foreground'
      }`}
    >
      {on ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
      {label}: {on ? 'allowed' : 'not allowed'}
    </span>
  );
}

export function GoogleReadCard({
  state,
  flag,
}: {
  state: GoogleReadCardState;
  flag?: string;
}) {
  const conn = state.connection;
  const hasLiveConnection = conn?.status === 'active' || conn?.status === 'broken';
  const canConnect = state.enabled && state.canUseAssistant;

  const banner = flag ? BANNERS[flag] : undefined;

  // Off (or not for this person), nothing to disconnect, and nothing to report
  // back from a redirect: no card at all.
  if (!canConnect && !hasLiveConnection && !banner) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" aria-hidden />
          <HardDrive className="h-4 w-4" aria-hidden />
          Let the assistant read my Gmail and Drive
        </CardTitle>
        <CardDescription>
          Ask the AI Assistant about your own email and files — &ldquo;what did the
          principal send me about the audit?&rdquo;, &ldquo;find my fee circular
          draft&rdquo; — and it can look them up for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {banner && (
          <div role="status" className={`rounded-md border px-3 py-2 text-xs ${TONE_CLASSES[banner.tone]}`}>
            {banner.text}
          </div>
        )}

        {conn?.status === 'active' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Badge className="gap-1 bg-green-700 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-600">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> Connected
              </Badge>
              <span className="truncate text-muted-foreground">{conn.googleEmail}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Allowed label="Gmail" on={conn.mail} />
              <Allowed label="Drive" on={conn.drive} />
            </div>
          </div>
        )}
        {conn?.status === 'broken' && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden /> Stopped working
            </Badge>
            <span className="truncate text-muted-foreground">{conn.googleEmail}</span>
          </div>
        )}
        {!hasLiveConnection && <p className="text-sm text-muted-foreground">Not connected.</p>}

        {!state.enabled && hasLiveConnection && (
          <p className="text-xs text-muted-foreground">
            This has been switched off for now, so the assistant is not reading
            anything. You can still disconnect.
          </p>
        )}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Your privacy
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>
              <strong className="font-medium text-foreground">Read-only.</strong> The
              assistant can search and read. It can never send, change, move or
              delete an email or a file.
            </li>
            <li>
              <strong className="font-medium text-foreground">Only you.</strong> It
              reads only your own mail and files, and only when you ask it
              something. Nobody else — not your head, not an administrator — can
              use your connection.
            </li>
            <li>
              <strong className="font-medium text-foreground">Disconnect any time.</strong>{' '}
              MyJKKN deletes its key straight away.
            </li>
            <li>
              <strong className="font-medium text-foreground">What is logged.</strong>{' '}
              Which tool was used and when. Never the contents, your searches or
              file names.
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canConnect &&
            (state.configured ? (
              <Button asChild size="sm" variant={conn?.status === 'active' ? 'outline' : 'default'}>
                {/* Full navigation (not fetch) — the route 302s to Google. */}
                <a href="/api/integrations/google-read/connect">
                  {hasLiveConnection ? 'Connect again' : 'Connect Gmail and Drive'}
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Google is not set up on this deployment yet — connecting will be
                available soon.
              </p>
            ))}
          {hasLiveConnection && (
            <form action="/api/integrations/google-read/disconnect" method="post">
              <Button type="submit" size="sm" variant="outline">
                Disconnect
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
