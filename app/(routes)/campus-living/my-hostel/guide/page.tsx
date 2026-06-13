'use client';

// app/(routes)/campus-living/my-hostel/guide/page.tsx
// ============================================================================
// CAMPUS LIVING — HOW IT WORKS (role-aware in-app guide)
//
// Director brief 2026-06-13: Campus Living has many personas; ONE guide should
// serve all of them. This page detects who's viewing and opens on THEIR lane
// (Resident / Warden / Mess Committee / Admin), with the other lanes they're
// entitled to available as pills. One page to maintain, everyone sees their
// own steps — no per-persona pages drifting out of sync.
//
// Pattern source: app/(routes)/ai-pulse/guide/page.tsx (the AI Pulse guide) —
// same LaneStart / GuideLink / GuideImage / glossary / print-to-PDF idioms.
//
// PLACEMENT: lives UNDER /my-hostel/ on purpose. Student-role residents are
// confined to /campus-living/my-hostel/* by CampusLivingResidentGuard, so a
// guide anywhere else would bounce them. Every RESIDENT-lane jump-link is
// therefore kept inside the resident allow-list (/my-hostel/*); staff lanes
// link freely (staff aren't confined). Reached via the "Guide" chip in the
// My Hostel nav group.
//
// FEES: the guide explains HOW to upgrade and links to the live page — it does
// NOT hard-code amounts (Director decision 2026-06-13). The price the resident
// sees is always the live one, so the guide can never go stale on money.
//
// PDF = browser print (AI Pulse pattern); a scoped @media print block isolates
// the guide from the app shell. Screenshots (when added) live in
// /public/images/campus-living-guide/.
//
// Access: any campus-living foothold (residents have allocations.view_own) OR
// any staff key OR super_admin. Pure outsiders get an explicit denied state
// (rule #27) — never a silent redirect.
// ============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';

import {
  ShieldAlert,
  Download,
  Home,
  BedDouble,
  UtensilsCrossed,
  Sparkles,
  ArrowRight,
  BookText,
  Users,
  ClipboardCheck,
  Wrench,
  CalendarCheck,
  Cog,
  ChefHat,
  DoorOpen,
  Brush,
  ArrowUpCircle,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';

// ---------------------------------------------------------------------------
// Shared "at a glance" — the campus-living journey, in four plain steps.
// ---------------------------------------------------------------------------

const JOURNEY: Array<{
  step: string;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  hero?: boolean;
}> = [
  { step: 'Step 1', title: 'You get a room & mess', body: 'When you join, a default room and mess plan are given to you automatically — by your course and year. No action needed.', Icon: Home },
  { step: 'Step 2', title: 'Check your details', body: 'Open My Hostel to see your room, block, mess plan and fees in one place.', Icon: BedDouble, hero: true },
  { step: 'Step 3', title: 'Upgrade (optional)', body: 'Want a better room or mess? Upgrade for a one-time fee shown on the page. Premium-room residents also pick their own room and roommate.', Icon: ArrowUpCircle },
  { step: 'Every day', title: 'Daily life', body: 'See your weekly menu, book room cleaning, raise requests, and apply for leave — all from My Hostel.', Icon: CalendarCheck },
];

// ---------------------------------------------------------------------------
// Reusable bits (mirrors the AI Pulse guide)
// ---------------------------------------------------------------------------

// "Why this matters" + a one-tap jump to the screen this persona works in.
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

// Screenshot slot (kept for when captures are added to
// /public/images/campus-living-guide/). Renders nothing if src is empty, so
// the guide is never broken-image while images are pending.
function GuideImage({ src, alt, caption }: { src?: string; alt: string; caption: string }) {
  if (!src) return null;
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

// Plain-language glossary — shown to every lane so undefined nouns
// (default allocation, tier, mess plan…) get decoded once, up front.
const GLOSSARY: Array<[string, string]> = [
  ['Default allocation', 'The room and mess you are given automatically by your course and year — no booking needed.'],
  ['Tier / Plan', 'The level of your room or mess (Classic, Premium, and so on). Higher tiers cost more and offer more.'],
  ['Upgrade', 'Moving from your default to a higher room or mess tier, for a one-time fee shown on the page. There is no downgrade.'],
  ['Premium Stay', 'The premium-room option where YOU choose your own room and roommate online, instead of being auto-allocated.'],
  ['Mess plan', 'Which set of food you are on — Classic or Premium. It decides the menu you see in My Meals.'],
  ['Choose Your Menu', 'When switched on, lets eligible residents pick their own meals from the menu, instead of just eating the fixed menu.'],
  ['Minimum due', 'The smallest part of your year fee you must pay to confirm a booking or upgrade (the rest follows later).'],
  ['Vacate request', 'Asking to move out of your hostel room. A warden reviews and approves it.'],
];

// ---------------------------------------------------------------------------
// Lane content
// ---------------------------------------------------------------------------

function ResidentLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="Your room, your meals, and everything you need day-to-day live in one place — My Hostel."
        href="/campus-living/my-hostel"
        label="Go to My Hostel"
      />
      <p className="text-sm leading-relaxed">
        When you join, you are given a room and a mess plan automatically. From{' '}
        <GuideLink href="/campus-living/my-hostel">My Hostel</GuideLink> you can
        see them, upgrade if you want, check your weekly menu, book room
        cleaning, and raise requests. Here&apos;s how each part works.
      </p>

      <section>
        <SectionHeading Icon={Home}>See your room &amp; mess</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Open <GuideLink href="/campus-living/my-hostel">My Hostel</GuideLink>.
          The Overview tab shows your block, room, mess plan and fees. This is
          your default allocation — given to you by your course and year, with
          no booking needed.
        </p>
      </section>

      <section>
        <SectionHeading Icon={ArrowUpCircle}>Upgrade your room or mess</SectionHeading>
        <p className="text-sm text-muted-foreground mb-2">
          Want a better room or mess? You can move up to a higher tier for a
          one-time fee. (There is no downgrade once you are allotted.)
        </p>
        <NumberedList
          items={[
            { title: 'Open the upgrade option', body: <>On <GuideLink href="/campus-living/my-hostel">My Hostel</GuideLink>, look at the Overview tab — if an upgrade is available, you&apos;ll see a card showing the next tier and its price.</> },
            { title: 'See the exact price', body: 'The fee for your upgrade is shown right there on the page — always the current amount.' },
            { title: 'Pay within 48 hours', body: 'Once the upgrade option opens, pay the upgrade fee within 48 hours, or the option closes.' },
            { title: 'Pay your minimum due', body: 'Pay at least 30% of your overall year fee by Monday 6:00 PM. Paying the upgrade fee alone does NOT confirm your upgrade.' },
            { title: 'You’re confirmed', body: 'Your upgrade is confirmed only after the minimum due is paid. If it isn’t, your spot moves to the next person on the waiting list.' },
          ]}
        />
      </section>

      <section>
        <SectionHeading Icon={BedDouble}>Pick your room &amp; roommate (Premium)</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Premium rooms are open to online booking for all colleges, courses and
          years. If you&apos;re eligible, you can{' '}
          <GuideLink href="/campus-living/my-hostel/premium/pick-room">pick your room</GuideLink>{' '}
          and{' '}
          <GuideLink href="/campus-living/my-hostel/premium/invite-roommate">invite a roommate</GuideLink>{' '}
          from the{' '}
          <GuideLink href="/campus-living/my-hostel/premium">Premium Stay</GuideLink>{' '}
          page. Classic and Deluxe rooms are auto-allocated by order within your
          course and year — those don&apos;t have a room or roommate choice.
        </p>
      </section>

      <section>
        <SectionHeading Icon={UtensilsCrossed}>Your weekly menu</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Open <GuideLink href="/campus-living/my-hostel/my-meals">My Meals</GuideLink>{' '}
          to see this week&apos;s menu for your mess plan and hostel — breakfast,
          lunch, tea and dinner, day by day. Tap any day to switch.
        </p>
      </section>

      <section>
        <SectionHeading Icon={Brush}>Book room cleaning</SectionHeading>
        <p className="text-sm text-muted-foreground">
          If your plan includes housekeeping, open{' '}
          <GuideLink href="/campus-living/my-hostel/housekeeping">Room Cleaning</GuideLink>,
          pick a date and an open time slot, and confirm. You&apos;ll see your
          upcoming bookings there too.
        </p>
      </section>

      <section>
        <SectionHeading Icon={DoorOpen}>Requests &amp; moving out</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Use the Requests tab on{' '}
          <GuideLink href="/campus-living/my-hostel">My Hostel</GuideLink> to
          raise a maintenance request or apply for leave. To move out, open a{' '}
          <GuideLink href="/campus-living/my-hostel/vacate-request">vacate request</GuideLink>{' '}
          — a warden reviews and approves it.
        </p>
      </section>
    </div>
  );
}

function WardenLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="You keep your block running — approvals, requests, and resident welfare all flow through you."
        href="/campus-living"
        label="Open Campus Living"
      />
      <p className="text-sm leading-relaxed">
        As a warden you handle the day-to-day of your block: approving who stays
        and who moves, clearing maintenance, and signing off leave. Here are the
        main things you do.
      </p>

      <section>
        <SectionHeading Icon={ClipboardCheck}>Approve allocations &amp; vacates</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Review and approve new room allocations and{' '}
          <GuideLink href="/campus-living/vacate-requests">vacate requests</GuideLink>{' '}
          for residents in your block. An approval confirms the move; a rejection
          sends the spot back to the waiting list.
        </p>
      </section>

      <section>
        <SectionHeading Icon={Wrench}>Handle maintenance &amp; requests</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Maintenance requests raised by residents come to you to assign, track
          and close, against the service-level targets your admin has set.
        </p>
      </section>

      <section>
        <SectionHeading Icon={CalendarCheck}>Approve leave</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Leave applications from your block come to you (and, where set, the
          chief warden) for approval, with parent-consent rules applied
          automatically where required.
        </p>
      </section>

      <section>
        <SectionHeading Icon={ChefHat}>Oversee the mess</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Keep an eye on the{' '}
          <GuideLink href="/campus-living/mess/menu">weekly menu</GuideLink> and{' '}
          <GuideLink href="/campus-living/mess/feedback">mess feedback</GuideLink>{' '}
          for your residents, and raise issues to the mess team.
        </p>
      </section>
    </div>
  );
}

function MessCommitteeLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="The food residents eat is shaped here — the menu, the special-day meals, and the feedback loop."
        href="/campus-living/mess/menu"
        label="Open the Mess Menu"
      />
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>A note on this role</AlertTitle>
        <AlertDescription className="text-sm">
          A dedicated &ldquo;Mess Committee&rdquo; role isn&apos;t switched on in
          the system yet. Until it is, wardens and admins do these tasks. This
          lane shows what that work looks like.
        </AlertDescription>
      </Alert>

      <section>
        <SectionHeading Icon={UtensilsCrossed}>The weekly menu</SectionHeading>
        <p className="text-sm text-muted-foreground">
          The mess menu is one shared set across all colleges, by tier (Classic /
          Premium) and by hostel (boys / girls). View it on the{' '}
          <GuideLink href="/campus-living/mess/menu">Menu</GuideLink> page; edit
          it in the{' '}
          <GuideLink href="/campus-living/mess/menu-editor/classic">Menu Editor</GuideLink>{' '}
          — 7 days × 4 meals per tier and hostel.
        </p>
      </section>

      <section>
        <SectionHeading Icon={Sparkles}>Choose Your Menu &amp; special days</SectionHeading>
        <p className="text-sm text-muted-foreground">
          When the admin switches on{' '}
          <GuideLink href="/campus-living/settings/choose-your-menu">Choose Your Menu</GuideLink>,
          eligible residents can pick their meals and vote on dishes, and special
          festival menus can be proposed for review.
        </p>
      </section>

      <section>
        <SectionHeading Icon={BookText}>Feedback loop</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Read what residents say on{' '}
          <GuideLink href="/campus-living/mess/feedback">Mess Feedback</GuideLink>{' '}
          and let it shape next week&apos;s menu — closing the loop is the point.
        </p>
      </section>
    </div>
  );
}

function AdminLane() {
  return (
    <div className="space-y-6">
      <LaneStart
        why="You set the rules everyone else follows — tiers, fees, categories, and which features are switched on."
        href="/campus-living/settings/fee-config"
        label="Open Settings"
      />
      <p className="text-sm leading-relaxed">
        As an admin you configure how Campus Living works for every resident.
        Most of this lives under the Settings tab; changes apply on the next page
        load, no deploy needed.
      </p>

      <section>
        <SectionHeading Icon={Cog}>Tiers, fees &amp; categories</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Set room-type fees and upgrade amounts in{' '}
          <GuideLink href="/campus-living/settings/fee-config">Fee Configuration</GuideLink>,
          and manage the room and{' '}
          <GuideLink href="/campus-living/mess/categories">mess categories</GuideLink>{' '}
          residents can be on. Adding a mess category surfaces it everywhere
          automatically — the menu and settings follow the categories page.
        </p>
      </section>

      <section>
        <SectionHeading Icon={UtensilsCrossed}>Choose Your Menu</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Turn the whole engagement layer on or off, and choose which tiers can
          personalize, vote and propose, from{' '}
          <GuideLink href="/campus-living/settings/choose-your-menu">Choose Your Menu settings</GuideLink>.
          A live preview shows exactly what residents will experience before you
          save.
        </p>
      </section>

      <section>
        <SectionHeading Icon={BedDouble}>Premium stay &amp; economics</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Configure who can book premium rooms and how, and track the money side
          on the{' '}
          <GuideLink href="/campus-living/premium/dashboard">Bed Economics dashboard</GuideLink>{' '}
          — ROI, margin and payback per block.
        </p>
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

export default function CampusLivingGuidePage() {
  const { isSuperAdmin, can, isLoading } = usePermissions();
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';

  const lanes = useMemo<Lane[]>(() => {
    const all: Array<Lane & { show: boolean }> = [
      {
        id: 'admin',
        label: 'Admin',
        Icon: Cog,
        Content: AdminLane,
        show: isSuperAdmin || can('campus_living.mess.menu.approve') || can('campus_living.community.manage'),
      },
      {
        id: 'mess',
        label: 'Mess Committee',
        Icon: ChefHat,
        Content: MessCommitteeLane,
        show: isSuperAdmin || can('campus_living.mess.menu.publish'),
      },
      {
        id: 'warden',
        label: 'Warden',
        Icon: Users,
        Content: WardenLane,
        show:
          isSuperAdmin ||
          can('campus_living.allocations.approve') ||
          can('campus_living.leave.warden_approve') ||
          can('campus_living.blocks.warden_assign'),
      },
      {
        id: 'resident',
        label: 'Resident',
        Icon: Home,
        Content: ResidentLane,
        show: true, // everyone gets the resident lane as the universal fallback
      },
    ];
    return all.filter((l) => l.show).map(({ show, ...l }) => l);
  }, [isSuperAdmin, can]);

  // Default to the most specific lane the viewer has — EXCEPT a student-role
  // resident always opens on Resident even if they hold a stray staff key.
  const defaultId = isStudent ? 'resident' : lanes[0]?.id ?? 'resident';
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? defaultId;
  const ActiveContent =
    lanes.find((l) => l.id === activeId)?.Content ?? ResidentLane;
  const activeLabel = lanes.find((l) => l.id === activeId)?.label ?? 'Resident';

  if (isLoading) {
    return (
      <ContentLayout title="Campus Living — Guide">
        <Skeleton className="h-64 w-full" />
      </ContentLayout>
    );
  }

  // Access = any campus-living foothold. Residents hold allocations.view_own;
  // staff hold their own keys. Pure outsiders get an explicit denied state.
  const hasAccess =
    isSuperAdmin ||
    isStudent ||
    can('campus_living.allocations.view_own') ||
    can('campus_living.allocations.view') ||
    can('campus_living.mess.view') ||
    can('campus_living.mess.menu.view') ||
    can('campus_living.leave.view_own') ||
    can('campus_living.dashboard.view');

  if (!hasAccess) {
    return (
      <ContentLayout title="Campus Living — Guide">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>You don&apos;t have access to Campus Living.</AlertTitle>
          <AlertDescription>
            Ask an admin to add you so you can see your hostel and mess. Once you
            have access, this guide opens on your role automatically.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const showSwitcher = lanes.length > 1;

  return (
    <ContentLayout title="Campus Living — Guide">
      <style>{`
@media print {
  body * { visibility: hidden; }
  #campus-living-guide-print, #campus-living-guide-print * { visibility: visible; }
  #campus-living-guide-print {
    position: absolute; left: 0; top: 0; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .campus-living-guide-noprint { display: none !important; }
}
`}</style>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Guide' },
        ]}
        className="print:hidden"
      />

      <div id="campus-living-guide-print" className="mt-4 max-w-4xl space-y-8">
        {/* Header + download */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Campus Living — How it works</h1>
            <p className="text-sm text-muted-foreground mt-1">
              A simple guide to your hostel and mess. You&apos;re reading the{' '}
              <strong>{activeLabel}</strong> view.
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
          <div className="campus-living-guide-noprint flex flex-wrap gap-2">
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

        {/* The journey — shared context for every lane */}
        <section>
          <SectionHeading Icon={CalendarCheck}>The journey at a glance</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((t) => (
              <div
                key={t.step}
                className={
                  t.hero
                    ? 'rounded-xl border-2 border-primary bg-primary/5 p-4'
                    : 'rounded-xl border bg-card p-4'
                }
              >
                <t.Icon className={t.hero ? 'h-6 w-6 text-primary mb-2' : 'h-6 w-6 text-muted-foreground mb-2'} aria-hidden />
                <p className={t.hero ? 'text-xs font-semibold uppercase tracking-wide text-primary' : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'}>
                  {t.step}
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
          {showSwitcher ? 'Switch roles with the buttons above. ' : ''}
          Use <strong>Download PDF</strong> at the top to save or share this
          guide. A Tamil version is planned — English only for now.
        </p>
      </div>
    </ContentLayout>
  );
}
