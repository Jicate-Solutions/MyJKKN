'use client';

// app/(routes)/ai-pulse/admin/guide/page.tsx
// ============================================================================
// AI PULSE — HOW IT WORKS (in-app guide for Champions, scorers & admins)
//
// Director brief 2026-06-13: in-app only (no separate written handbook); must
// be intuitive enough for a 12th-grader; downloadable as PDF to share; show
// real screenshots. First in-app module guide on the platform.
//
// PDF = browser print (window.print, the counselor-briefing pattern). A scoped
// @media print block isolates this guide from the app shell so the PDF is
// clean. Screenshots live in /public/images/ai-pulse-guide/ (recapture when
// the matching screens change).
//
// Permission gate: super_admin OR aiPulse:cycles.manage OR aiPulse:lab.score,
// with an explicit denied state (rule #27 — never a silent redirect).
// ============================================================================

import {
  ShieldAlert,
  Download,
  CalendarClock,
  Rocket,
  Radio,
  Trophy,
  ClipboardList,
  Eye,
  Users,
  Cog,
  HelpCircle,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

// --- The week, as four beats (truer than 7 equal days) ---------------------
const TIMELINE: Array<{
  when: string;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  hero?: boolean;
}> = [
  {
    when: 'Mon–Wed',
    title: 'Get the week ready',
    body: 'The Champion fills in this week’s session: the tool, the topic, the challenge, the meeting link and the quiz.',
    Icon: ClipboardList,
  },
  {
    when: 'Thursday 6:55 PM',
    title: 'Live session',
    body: 'Everyone joins one online session for 35 minutes. Students earn “engaged” by joining on time, staying, and passing the quiz.',
    Icon: Radio,
    hero: true,
  },
  {
    when: 'Fri–Sun',
    title: 'Teams build',
    body: 'Teams use the tool on this week’s challenge and post their work. Students who missed Thursday can still take the quiz for 48 hours.',
    Icon: Rocket,
  },
  {
    when: 'Monday',
    title: 'Faculty pick the best',
    body: 'Faculty score the work in the Lab and pick the top 2 “Gold” teams per department. Winners show up for everyone to see.',
    Icon: Trophy,
  },
];

// --- The Champion's pre-Thursday checklist ---------------------------------
const CHECKLIST: Array<{ n: number; title: string; body: string }> = [
  { n: 1, title: 'Pick the featured tool', body: 'Choose this week’s AI tool from the list (Lovable, Cursor, Gemini, ChatGPT, and more).' },
  { n: 2, title: 'Write the briefing topic', body: 'One short line for what the session will cover.' },
  { n: 3, title: 'Write this week’s challenge', body: 'What every team must build and submit. Students see this, and faculty judge the winners against it. Skip it and there’s nothing to judge.' },
  { n: 4, title: 'Paste the meeting link', body: 'Use a Microsoft Teams link — Teams allows up to 1,000 people in one call.' },
  { n: 5, title: 'Create the quiz', body: 'Open the cycle’s Quiz page and use the ✨ suggest button to draft questions. If you forget, the whole week shows 0% engaged — on purpose.' },
  { n: 6, title: 'Answer last week’s feedback', body: 'Read the anonymous comments at the bottom of the page and reply in one line in “You said, we changed.” Students see it.' },
];

const ROLES: Array<{ role: string; does: string }> = [
  { role: 'Champion', does: 'Sets up each week and hosts the Thursday session.' },
  { role: 'Class Incharge', does: 'Marks team attendance and follows up on absences.' },
  { role: 'Faculty scorer', does: 'On Monday, scores the work and picks the Gold teams.' },
  { role: 'HOD / Principal', does: 'Watches their department’s weekly participation.' },
  { role: 'Admin', does: 'Sets the timings and rules; reviews flagged activity.' },
];

const AUTOMATIC = [
  'Creating next Thursday’s session',
  'Drawing the teams every Friday',
  'Turning the session “live” and then “finished” by the clock',
  'Thanking every student who passed all the gates',
  'Sending the Director the weekly summary',
];

const TROUBLE: Array<{ q: string; a: string }> = [
  { q: 'A student says nothing happened when they attended', a: 'They probably opened the meeting link directly. Tell them to go through My Pulse → Open Live Session — that page is what records attendance.' },
  { q: 'The week shows 0% engaged', a: 'Usually the quiz was never created. Passing the quiz is one of the four required gates.' },
  { q: 'The Monday Lab is empty', a: 'Teams are drawn on Friday for the upcoming week, so a session that had no draw before it will have no teams.' },
  { q: 'The Join button is greyed out', a: 'It only turns on 15 minutes before the session and turns off when the session ends.' },
];

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #ai-pulse-guide-print, #ai-pulse-guide-print * { visibility: visible; }
  #ai-pulse-guide-print {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`;

function GuideImage({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-3">
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full h-auto block" />
      </div>
      <figcaption className="mt-1.5 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

export default function AiPulseGuidePage() {
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
            This guide is for AI Pulse Champions, faculty scorers, and admins.
            If you believe this is a mistake, ask an admin to grant{' '}
            <code className="bg-muted px-1 rounded">aiPulse:cycles.manage</code>{' '}
            or <code className="bg-muted px-1 rounded">aiPulse:lab.score</code>.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse — Guide">
      <style>{PRINT_CSS}</style>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Guide' },
        ]}
        className="print:hidden"
      />

      <div id="ai-pulse-guide-print" className="mt-4 max-w-4xl space-y-8">
        {/* Header + download */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">AI Pulse — How it works</h1>
            <p className="text-sm text-muted-foreground mt-1">
              A simple guide for Champions, faculty, and admins. Every week is
              called a <strong>cycle</strong>.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="print:hidden shrink-0"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>

        {/* What is it */}
        <section>
          <p className="text-sm leading-relaxed">
            AI Pulse is a weekly habit that helps every student get better with
            AI tools. Each Thursday evening, all colleges join one online
            session about one AI tool. During the week, teams use that tool to
            build something real for their department and post it publicly. On
            Monday, faculty pick the best work. The platform quietly measures
            who truly took part — not just who showed up.
          </p>
        </section>

        {/* Weekly rhythm */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">The week at a glance</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIMELINE.map((t) => (
              <div
                key={t.when}
                className={
                  t.hero
                    ? 'rounded-xl border-2 border-primary bg-primary/5 p-4'
                    : 'rounded-xl border bg-card p-4'
                }
              >
                <t.Icon
                  className={
                    t.hero
                      ? 'h-6 w-6 text-primary mb-2'
                      : 'h-6 w-6 text-muted-foreground mb-2'
                  }
                  aria-hidden
                />
                <p
                  className={
                    t.hero
                      ? 'text-xs font-semibold uppercase tracking-wide text-primary'
                      : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                  }
                >
                  {t.when}
                </p>
                <p className="font-medium text-sm mt-0.5">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Champion checklist + screenshot */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">
              If you&apos;re the Champion: 6 things before Thursday
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Open <strong>AI Pulse → Champion · Cycles</strong> and click this
            week&apos;s cycle. You&apos;ll see this form — fill it in top to
            bottom:
          </p>
          <ol className="space-y-2.5">
            {CHECKLIST.map((c) => (
              <li key={c.n} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {c.n}
                </span>
                <span className="text-sm">
                  <span className="font-medium">{c.title}.</span>{' '}
                  <span className="text-muted-foreground">{c.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <GuideImage
            src="/images/ai-pulse-guide/champion-checklist.png"
            alt="The cycle setup form showing featured tool, briefing topic, meeting link, this week's challenge, and you-said-we-changed fields"
            caption="The cycle setup form. Each field above maps to a step in the checklist."
          />
        </section>

        {/* What learners see */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">What your students see</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            On <strong>My Pulse</strong>, each student sees this week&apos;s
            card — the challenge, your reply to last week&apos;s feedback, and a
            green <strong>Open Live Session</strong> button. They must use this
            button (not the raw meeting link) so attendance is recorded.
          </p>
          <GuideImage
            src="/images/ai-pulse-guide/my-pulse-card.png"
            alt="A student's My Pulse card showing the challenge, the you-said-we-changed reply, and the Open Live Session button"
            caption="The student's weekly card on My Pulse."
          />
          <p className="text-sm text-muted-foreground mt-4 mb-1">
            During the session, the student watches four lights. They count as{' '}
            <strong>“engaged”</strong> only when <strong>all four</strong> turn
            green: joined on time, answered the polls, stayed to the end, and
            passed the quiz. (If no polls were set, that light passes on its
            own.)
          </p>
          <GuideImage
            src="/images/ai-pulse-guide/engagement-gates.png"
            alt="The four engagement gates: joined on time, polls, stayed until the end, passed the quiz"
            caption="The four gates. “Engaged” needs all four — this is the number the pilot is judged on (target 70%)."
          />
        </section>

        {/* Roles */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Who does what</h2>
          </div>
          <ul className="space-y-1.5">
            {ROLES.map((r) => (
              <li key={r.role} className="text-sm">
                <span className="font-medium">{r.role}</span>
                <span className="text-muted-foreground"> — {r.does}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Automatic */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Cog className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">
              The system does these for you
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            You never have to do these by hand:
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {AUTOMATIC.map((a) => (
              <li key={a} className="text-sm flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span className="text-muted-foreground">{a}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Troubleshooting */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">If something looks wrong</h2>
          </div>
          <div className="space-y-3">
            {TROUBLE.map((t) => (
              <div key={t.q} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">{t.q}</p>
                <p className="text-sm text-muted-foreground mt-1">{t.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Only the Gold teams faculty pick count toward NAAC evidence and the
          PDE Agency Index — numbers a team reports about itself never do. Use
          the <strong>Download PDF</strong> button at the top to save or share
          this guide.
        </p>
      </div>
    </ContentLayout>
  );
}
