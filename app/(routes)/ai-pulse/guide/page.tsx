'use client';

// app/(routes)/ai-pulse/guide/page.tsx
// ============================================================================
// AI PULSE — HOW IT WORKS (role-aware in-app guide)
//
// Director brief 2026-06-13: AI Pulse has ~7 personas; one guide should serve
// all of them. This page detects who's viewing and opens on THEIR lane
// (Student / Champion / Faculty / Class Incharge / HOD / Admin), with the
// other lanes they're entitled to available as pills. One page to maintain,
// everyone sees their own steps — no per-persona pages drifting out of sync.
//
// Moved here from /ai-pulse/admin/guide so STUDENTS (aiPulse:view.self) can
// reach it — it's not an admin page. Surfaced as a "Guide" chip in the AI
// Pulse tab nav (route manifest); also linked from My Pulse / Lab / Dept.
//
// PDF = browser print (counselor-briefing pattern); scoped @media print block
// isolates the guide from the app shell. Screenshots in
// /public/images/ai-pulse-guide/ (recapture when those screens change).
//
// Access: anyone with aiPulse:view.self OR any staff key OR super_admin.
// Pure no-access users get an explicit denied state (rule #27).
// ============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';

import {
  ShieldAlert,
  Download,
  CalendarClock,
  ClipboardList,
  Radio,
  Rocket,
  Trophy,
  GraduationCap,
  Megaphone,
  Award,
  UserCheck,
  BarChart3,
  Cog,
  ArrowRight,
  BookText,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Shared bits (every lane sees these)
// ---------------------------------------------------------------------------

const TIMELINE: Array<{
  when: string;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  hero?: boolean;
}> = [
  { when: 'Mon–Wed', title: 'Get the week ready', body: 'The Champion sets up this week’s session — tool, topic, challenge, link, quiz.', Icon: ClipboardList },
  { when: 'Thursday 6:55 PM', title: 'Live session', body: 'Everyone joins one online session for 35 minutes.', Icon: Radio, hero: true },
  { when: 'Fri–Sun', title: 'Teams build', body: 'Teams use the tool on the week’s challenge and post their work.', Icon: Rocket },
  { when: 'Monday', title: 'Faculty pick the best', body: 'Faculty score the work and pick the top 2 “Gold” teams per department.', Icon: Trophy },
];

// "Why this matters" + a one-tap jump to the screen this persona works in.
// href/label optional — Class Incharge has no single console, so it shows the
// why line only.
function LaneStart({ why, href, label }: { why: string; href?: string; label?: string }) {
  return (
    <div className="rounded-lg border bg-primary/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">
        <span className="font-medium">Why this matters: </span>
        <span className="text-muted-foreground">{why}</span>
      </p>
      {href && label && (
        <Button asChild size="sm" className="shrink-0 print:hidden">
          <Link href={href}>
            {label}
            <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}

// Plain-language glossary — shown to every lane so undefined nouns
// (Domain-Sync, Gold, NAAC…) get decoded once, up front.
const GLOSSARY: Array<[string, string]> = [
  ['Cycle', 'One week of AI Pulse — a Thursday session plus the work that follows.'],
  ['Engaged', 'A student who passed all four gates that week: joined on time, answered polls, stayed to the end, passed the quiz.'],
  ['Gold Standard', 'The top 2 team projects per department, chosen by faculty on Monday.'],
  ['Domain-Sync', 'The thing a team builds and submits each week using that week’s AI tool.'],
  ['Champion', 'The staff member who runs AI Pulse — sets up the week and hosts Thursday.'],
  ['Async make-up', 'A 48-hour window after the session to take the quiz if you missed it live.'],
  ['NAAC', 'The national college-accreditation body — Gold work becomes evidence for it.'],
];

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

// A clickable jump-to-the-screen link. Opens in the same tab; the guide is a
// reference users leave and come back to via the Guide chip.
function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}

function SectionHeading({ Icon, children }: { Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-5 w-5 text-primary" aria-hidden />
      <h2 className="text-lg font-semibold">{children}</h2>
    </div>
  );
}

function NumberedList({ items }: { items: Array<{ title: string; body: React.ReactNode }> }) {
  return (
    <ol className="space-y-2.5">
      {items.map((c, i) => (
        <li key={c.title} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {i + 1}
          </span>
          <span className="text-sm">
            <span className="font-medium">{c.title}.</span>{' '}
            <span className="text-muted-foreground">{c.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Lane content
// ---------------------------------------------------------------------------

function StudentLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="Every engaged week adds to your streak and your AI skills profile — and the best team work gets shown across the whole institution."
        href="/ai-pulse/my-pulse"
        label="Go to My Pulse"
      />
      <p className="text-sm leading-relaxed">
        Each week you join a short online session about one AI tool, then your
        team uses it to build something for your department. Here&apos;s how to
        take part and get counted.
      </p>

      <section>
        <SectionHeading Icon={Radio}>How to join</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Go to <GuideLink href="/ai-pulse/my-pulse">My Pulse</GuideLink> and
          press the green <strong>Open Live Session</strong> button — not the
          meeting link someone shares. Only this button records that you
          attended. It opens 15 minutes before the session starts.
        </p>
        <GuideImage
          src="/images/ai-pulse-guide/my-pulse-card.png"
          alt="The My Pulse card with this week's challenge and the Open Live Session button"
          caption="Your weekly card on My Pulse — challenge, updates, and the Join button."
        />
      </section>

      <section>
        <SectionHeading Icon={Award}>How you get marked “engaged”</SectionHeading>
        <p className="text-sm text-muted-foreground mb-1">
          You count as <strong>engaged</strong> only when{' '}
          <strong>all four</strong> lights turn green: you joined on time,
          answered the polls, stayed to the end, and passed the quiz. (If there
          were no polls that week, that light passes on its own.) Missed the
          live session? You can still take the quiz for 48 hours.
        </p>
        <GuideImage
          src="/images/ai-pulse-guide/engagement-gates.png"
          alt="The four engagement gates"
          caption="Watch these four lights during the session — all four green means you’re engaged."
        />
      </section>

      <section>
        <SectionHeading Icon={Rocket}>Your team’s challenge</SectionHeading>
        <p className="text-sm text-muted-foreground">
          The week&apos;s challenge is on your My Pulse card. During the week,
          your team builds it with the tool and submits a link. The best two
          teams per department become &ldquo;Gold&rdquo; and are shown to
          everyone.
        </p>
      </section>
    </div>
  );
}

function ChampionLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="A fully set-up week is the difference between real engagement and a week that scores 0%."
        href="/ai-pulse/admin/cycles"
        label="Open Champion · Cycles"
      />
      <p className="text-sm leading-relaxed">
        You set up each week and host the Thursday session. Open{' '}
        <GuideLink href="/ai-pulse/admin/cycles">Champion · Cycles</GuideLink>{' '}
        and click this week&apos;s cycle. Fill the form top to bottom:
      </p>
      <NumberedList
        items={[
          { title: 'Pick the featured tool', body: 'Choose this week’s AI tool (Lovable, Cursor, Gemini, ChatGPT, and more).' },
          { title: 'Write the briefing topic', body: 'One short line for what the session covers.' },
          { title: 'Write this week’s challenge', body: 'What every team must build and submit. Students see it; faculty judge against it. Skip it and there’s nothing to judge.' },
          { title: 'Paste the meeting link', body: 'Use a Microsoft Teams link — Teams allows up to 1,000 people in one call.' },
          { title: 'Create the quiz', body: 'Open the cycle’s Quiz page and use the ✨ suggest button. If you forget, the whole week shows 0% engaged — on purpose.' },
          { title: 'Answer last week’s feedback', body: 'Read the anonymous comments at the bottom and reply in one line in “You said, we changed.” Students see it.' },
        ]}
      />
      <GuideImage
        src="/images/ai-pulse-guide/champion-checklist.png"
        alt="The cycle setup form"
        caption="The cycle setup form — each field maps to a step above."
      />
    </div>
  );
}

function FacultyLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="Your picks are the only work that counts as Gold for accreditation — your judgement is the scoreboard."
        href="/ai-pulse/lab"
        label="Open the Lab"
      />
      <p className="text-sm leading-relaxed">
        On Monday you judge the week&apos;s work and pick the best teams.
      </p>
      <NumberedList
        items={[
          { title: 'Open the Lab', body: <>Go to <GuideLink href="/ai-pulse/lab">Lab</GuideLink>. It opens on the most recent session whose Thursday has passed.</> },
          { title: 'Read each team’s submission', body: 'Judge it against the week’s stated challenge — does it actually solve the problem?' },
          { title: 'Score and pick the top 2 per department', body: 'These become the “Gold Standard” teams.' },
        ]}
      />
      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-300">
        Only the teams <strong>you</strong> pick count as Gold in NAAC evidence
        and the Agency Index. Numbers a team claims about itself never do —
        your judgment is the only score that carries weight.
      </div>
    </div>
  );
}

function InchargeLane() {
  return (
    <div className="space-y-6">
      <LaneStart why="Your section only gets counted if attendance is marked — you keep everyone on the board." />
      <p className="text-sm leading-relaxed">
        You keep your section&apos;s participation on track.
      </p>
      <NumberedList
        items={[
          { title: 'Mark attendance', body: 'Record which teams took part in the live and follow-up activities.' },
          { title: 'Follow up on absences', body: 'When a learner misses, the system flags it — chase it up or escalate to the Champion and HOD.' },
          { title: 'Teams are drawn for you', body: 'The Friday draw assigns teams automatically — “everyone gets a turn.” You don’t pick them by hand.' },
        ]}
      />
    </div>
  );
}

function HodLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="The heatmap is your early warning — a row of misses is where you step in before it becomes a problem."
        href="/ai-pulse/dept"
        label="Open the Heatmap"
      />
      <p className="text-sm leading-relaxed">
        You watch how your department is taking part, week over week.
      </p>
      <NumberedList
        items={[
          { title: 'Open the heatmap', body: <>Go to <GuideLink href="/ai-pulse/dept">Dept</GuideLink>. Each row is a department; each cell is a week. Green = engaged, faded = missed.</> },
          { title: 'Spot the pattern', body: 'A row of misses for your department is the signal to step in — the system tiers this from a nudge to a flag.' },
          { title: 'Intervene', body: 'Use the intervene action to start an HOD conversation when a department keeps missing.' },
        ]}
      />
    </div>
  );
}

function AdminLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="These settings shape how the whole program behaves and stays fair."
        href="/ai-pulse/admin/policies"
        label="Open Policies"
      />
      <p className="text-sm leading-relaxed">
        You set the rules the whole program runs on, and keep it honest.
      </p>
      <NumberedList
        items={[
          { title: 'Policies', body: <><GuideLink href="/ai-pulse/admin/policies">Admin · Policies</GuideLink> sets session times, pass marks, the join doors-open window, and consequence thresholds.</> },
          { title: 'Anomalies', body: <>Review flagged activity (unusual scores, reach, or rotation) at <GuideLink href="/ai-pulse/admin/anomalies">Champion · Anomalies</GuideLink>.</> },
          { title: 'NAAC evidence', body: <>Export the accreditation evidence pack at <GuideLink href="/ai-pulse/evidence/naac">NAAC Evidence</GuideLink> when needed.</> },
        ]}
      />
      <section>
        <SectionHeading Icon={Cog}>The system does these for you</SectionHeading>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {[
            'Creating next Thursday’s session',
            'Drawing the teams every Friday',
            'Turning the session live then finished by the clock',
            'Thanking every student who passed the gates',
            'Sending the Director the weekly summary',
          ].map((a) => (
            <li key={a} className="text-sm flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span className="text-muted-foreground">{a}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lane registry (order = default priority: most specific first)
// ---------------------------------------------------------------------------

interface Lane {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  Content: React.ComponentType;
}

export default function AiPulseGuidePage() {
  const { isSuperAdmin, can, isLoading } = usePermissions();

  const lanes = useMemo<Lane[]>(() => {
    const all: Array<Lane & { show: boolean }> = [
      { id: 'admin', label: 'Admin', Icon: Cog, Content: AdminLane, show: isSuperAdmin || can('aiPulse:policies.manage') },
      { id: 'champion', label: 'Champion', Icon: Megaphone, Content: ChampionLane, show: isSuperAdmin || can('aiPulse:cycles.manage') },
      { id: 'faculty', label: 'Faculty', Icon: Award, Content: FacultyLane, show: isSuperAdmin || can('aiPulse:lab.score') },
      { id: 'hod', label: 'HOD', Icon: BarChart3, Content: HodLane, show: isSuperAdmin || can('aiPulse:dept.heatmap') },
      { id: 'incharge', label: 'Class Incharge', Icon: UserCheck, Content: InchargeLane, show: isSuperAdmin || can('aiPulse:attendance.mark') },
      { id: 'student', label: 'Student', Icon: GraduationCap, Content: StudentLane, show: true },
    ];
    return all.filter((l) => l.show).map(({ show, ...l }) => l);
  }, [isSuperAdmin, can]);

  // Default to the most specific lane the viewer has (admin → … → student).
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? lanes[0]?.id ?? 'student';
  const ActiveContent =
    lanes.find((l) => l.id === activeId)?.Content ?? StudentLane;
  const activeLabel = lanes.find((l) => l.id === activeId)?.label ?? 'Student';

  if (isLoading) {
    return (
      <ContentLayout title="AI Pulse — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  // Access = any AI Pulse foothold (students have view.self). Pure outsiders
  // get an explicit denied state, never a silent redirect (rule #27).
  const hasAccess =
    isSuperAdmin ||
    can('aiPulse:view.self') ||
    can('aiPulse:cycles.manage') ||
    can('aiPulse:lab.score') ||
    can('aiPulse:dept.heatmap') ||
    can('aiPulse:attendance.mark') ||
    can('aiPulse:policies.manage');

  if (!hasAccess) {
    return (
      <ContentLayout title="AI Pulse — Guide">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>You don&apos;t have access to AI Pulse.</AlertTitle>
          <AlertDescription>
            Ask an admin to enrol you so you can see your weekly cycle. Once
            you have access, this guide opens on your role automatically.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const showSwitcher = lanes.length > 1;

  return (
    <ContentLayout title="AI Pulse — Guide">
      <style>{`
@media print {
  body * { visibility: hidden; }
  #ai-pulse-guide-print, #ai-pulse-guide-print * { visibility: visible; }
  #ai-pulse-guide-print {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ai-pulse-guide-noprint { display: none !important; }
}
`}</style>
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
              A simple guide. Every week is called a <strong>cycle</strong>.
              You&apos;re reading the <strong>{activeLabel}</strong> view.
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

        {/* Lane switcher */}
        {showSwitcher && (
          <div className="ai-pulse-guide-noprint flex flex-wrap gap-2">
            {lanes.map((l) => {
              const active = l.id === activeId;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelected(l.id)}
                  className={
                    active
                      ? 'inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                      : 'inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted'
                  }
                >
                  <l.Icon className="h-3.5 w-3.5" aria-hidden />
                  {l.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Weekly rhythm — shared context for every lane */}
        <section>
          <SectionHeading Icon={CalendarClock}>The week at a glance</SectionHeading>
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
                <t.Icon className={t.hero ? 'h-6 w-6 text-primary mb-2' : 'h-6 w-6 text-muted-foreground mb-2'} aria-hidden />
                <p className={t.hero ? 'text-xs font-semibold uppercase tracking-wide text-primary' : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'}>
                  {t.when}
                </p>
                <p className="font-medium text-sm mt-0.5">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Active lane */}
        <section>
          <ActiveContent />
        </section>

        {/* Words to know — shared glossary so jargon is decoded once */}
        <section>
          <SectionHeading Icon={BookText}>Words to know</SectionHeading>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {GLOSSARY.map(([term, def]) => (
              <div key={term} className="text-sm">
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted-foreground">{def}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="text-xs text-muted-foreground border-t pt-4">
          {showSwitcher
            ? 'Switch roles with the buttons above. '
            : ''}
          Use <strong>Download PDF</strong> at the top to save or share this guide.
          {' '}A Tamil version is planned — English only for now.
        </p>
      </div>
    </ContentLayout>
  );
}
