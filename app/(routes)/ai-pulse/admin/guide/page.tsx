'use client';

// app/(routes)/ai-pulse/admin/guide/page.tsx
// ============================================================================
// AI PULSE — CHAMPION & ADMIN GUIDE (in-app handbook)
//
// Created 2026-06-13 on Director request: "do we have a guidebook on how to
// use this module? can we add it as instruction for the admins?" First in-app
// module guide on the platform — canonical copy lives at
// docs/modules/ai-pulse/2026-06-13-GUIDE-champion-admin-handbook.md; keep the
// two in sync when the weekly flow changes.
//
// Permission gate: super_admin OR aiPulse:cycles.manage OR aiPulse:lab.score
// (Champions + faculty scorers). Explicit denied state — rule #27, never a
// silent redirect. Pattern: lab/page.tsx gate shape.
// ============================================================================

import Link from 'next/link';
import { ShieldAlert, BookOpen, CalendarClock, ListChecks, Users, Wrench, Gauge } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

const RHYTHM: Array<{ when: string; what: string; who: string }> = [
  { when: 'Daily ~6:53 AM', what: "Next Thursday's cycle is created automatically (empty shell)", who: 'Automatic' },
  { when: 'Friday ~8:07 AM', what: 'Teams auto-drawn for the upcoming cycle — everyone gets a turn', who: 'Automatic' },
  { when: 'Before Thursday', what: 'Champion fills in the cycle (checklist below)', who: 'Champion' },
  { when: 'Thursday 6:40 PM', what: 'Join button unlocks (15 min before start — policy-set)', who: 'Learners' },
  { when: 'Thursday 6:55–7:30 PM', what: 'Live session — status flips to "live" by the clock', who: 'Champion hosts' },
  { when: '7:30–8:30 PM', what: 'Quiz live window (60 minutes)', who: 'Learners' },
  { when: 'Until Saturday 7:30 PM', what: 'Quiz async make-up window (48h, harder pass mark)', who: 'Learners' },
  { when: 'Sunday ~6:53 AM', what: 'Every gate-passer gets an automatic acknowledgment notification', who: 'Automatic' },
  { when: 'Monday', what: 'Offline Lab — faculty score and pick Top-2 Gold per department', who: 'Faculty scorers' },
  { when: 'After Lab', what: "Gold appears on learners' My Pulse; Top-2 publish to dept Instagram within 24h", who: 'Teams' },
];

const CHECKLIST: Array<{ step: string; detail: string }> = [
  { step: '1 · Featured tool', detail: 'Pick from the 9-tool catalog (Lovable, Cursor, GitHub Copilot, Gemini, ChatGPT, Sora, n8n, Perplexity, Claude).' },
  { step: '2 · Briefing topic', detail: 'One line for what the session covers.' },
  { step: '3 · This week’s challenge', detail: 'What teams must build and submit. Shown to every learner on My Pulse and judged by faculty on Monday — without it, Gold has no stated brief.' },
  { step: '4 · Meeting link', detail: 'Paste the Microsoft Teams link (Teams preferred — 1000-participant capacity). Without it the Join button still records attendance but opens nothing.' },
  { step: '5 · Quiz', detail: 'Author it on the cycle’s Quiz page — the AI-suggest button drafts questions from the topic. If you forget, the week honestly reports 0% engaged (Director decision, 2026-06-12).' },
  { step: '6 · You said, we changed', detail: 'Read last week’s anonymous learner feedback (bottom of the cycle page) and answer the main theme in one line — it shows on every learner’s My Pulse.' },
];

const GATES: Array<{ gate: string; detail: string }> = [
  { gate: 'Joined on time', detail: 'Pressed Join within the late threshold (policy, default 10 min).' },
  { gate: 'Polls', detail: 'Responded to the required number. Until the polls feature ships, no polls exist — this gate auto-passes and says so on screen.' },
  { gate: 'Stayed to the end', detail: 'The page heartbeats while open (5-minute tolerance). Learners must keep the live page open in a visible tab.' },
  { gate: 'Passed the quiz', detail: 'Pass mark is policy-set: default 40% in the live window, 60% in the async make-up.' },
];

const TROUBLESHOOTING: Array<{ symptom: string; fix: string }> = [
  { symptom: 'Cycle not showing on My Pulse', fix: 'Hand-made cycle missing start_date — recreate via the console, or set start_date.' },
  { symptom: 'Zero engagement despite real attendance', fix: 'Quiz never authored, or learners were given the raw meeting URL. Share the My Pulse → Open Live Session path, never the bare link.' },
  { symptom: 'Lab console empty on Monday', fix: 'Teams are drawn Friday for the upcoming cycle — expected for a cycle that had no draw before it.' },
  { symptom: 'Join button locked', fix: 'Before doors-open (6:40 PM) or after session end — expected, policy join_doors_open_minutes.' },
  { symptom: 'Quiz won’t open for a learner', fix: 'Outside both windows (60 min live / 48 h async) — expected; windows are policy-set.' },
];

export default function AiPulseAdminGuidePage() {
  const { isSuperAdmin, can, isLoading } = usePermissions();
  const canView =
    isSuperAdmin || can('aiPulse:cycles.manage') || can('aiPulse:lab.score');

  if (isLoading) {
    return (
      <ContentLayout title="AI Pulse — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="AI Pulse — Guide">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>You don&apos;t have access to the module guide.</AlertTitle>
          <AlertDescription>
            This handbook is for AI Pulse Champions, faculty scorers, and
            admins. If you believe this is a mistake, ask an admin to grant{' '}
            <code className="bg-muted px-1 rounded">aiPulse:cycles.manage</code>{' '}
            or <code className="bg-muted px-1 rounded">aiPulse:lab.score</code>.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse — Guide">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Guide' },
        ]}
      />

      <div className="mt-4 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">What AI Pulse is</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              A weekly institutional AI-literacy rhythm: every Thursday evening
              all colleges join one live briefing on a featured AI tool, teams
              practice with it during the week on a stated challenge, publish
              proof publicly, and faculty pick the best work each Monday. The
              platform measures <strong>engaged attendance</strong> (not just
              presence) and turns the best work into recognition and
              accreditation evidence.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">The weekly rhythm</CardTitle>
            </div>
            <CardDescription>
              Automatic steps need nobody — don&apos;t do them by hand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">When</th>
                    <th className="py-1.5 pr-3 font-medium">What happens</th>
                    <th className="py-1.5 font-medium">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {RHYTHM.map((r) => (
                    <tr key={r.when} className="border-b last:border-0 align-top">
                      <td className="py-1.5 pr-3 whitespace-nowrap font-medium">{r.when}</td>
                      <td className="py-1.5 pr-3">{r.what}</td>
                      <td className="py-1.5 text-muted-foreground whitespace-nowrap">{r.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">
                The Champion&apos;s pre-Thursday checklist
              </CardTitle>
            </div>
            <CardDescription>
              All on{' '}
              <Link href="/ai-pulse/admin/cycles" className="underline">
                Champion · Cycles
              </Link>{' '}
              → this week&apos;s cycle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {CHECKLIST.map((c) => (
                <li key={c.step} className="text-sm">
                  <span className="font-medium">{c.step}.</span>{' '}
                  <span className="text-muted-foreground">{c.detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">
                How a learner earns &ldquo;engaged&rdquo; (the 4-AND gate)
              </CardTitle>
            </div>
            <CardDescription>
              All four must pass. Learners watch the lights turn green on the
              live page. The engaged-attendance rate is the Phase-2 pilot
              metric (≥70%).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {GATES.map((g) => (
                <li key={g.gate} className="text-sm">
                  <span className="font-medium">{g.gate}:</span>{' '}
                  <span className="text-muted-foreground">{g.detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">Roles at a glance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <p><span className="font-medium">Champion / co-Champion</span> — owns the checklist, hosts Thursday, answers feedback.</p>
            <p><span className="font-medium">Class Incharge</span> — marks per-team attendance, handles absence escalations.</p>
            <p><span className="font-medium">Faculty scorers</span> — Monday Lab: score teams, pick Top-2 Gold per department at <Link href="/ai-pulse/lab" className="underline">Lab</Link>.</p>
            <p><span className="font-medium">HOD / Principal</span> — department compliance heatmap at <Link href="/ai-pulse/dept" className="underline">Dept</Link>.</p>
            <p><span className="font-medium">Admins</span> — thresholds and session times at <Link href="/ai-pulse/admin/policies" className="underline">Admin · Policies</Link>; anomaly review at <Link href="/ai-pulse/admin/anomalies" className="underline">Champion · Anomalies</Link>.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">Troubleshooting</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {TROUBLESHOOTING.map((t) => (
                <li key={t.symptom} className="text-sm">
                  <span className="font-medium">{t.symptom}</span>
                  <span className="text-muted-foreground"> — {t.fix}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Canonical copy: docs/modules/ai-pulse/2026-06-13-GUIDE-champion-admin-handbook.md
          — keep both in sync when the weekly flow changes. Only faculty-picked
          Gold carries score weight into NAAC evidence and the PDE Agency Index;
          self-reported metrics never do.
        </p>
      </div>
    </ContentLayout>
  );
}
