// app/(routes)/campus-walk/report-card/page.tsx
// ============================================================================
// Campus Walk — the weekly report card. /campus-walk/report-card?week=YYYY-MM-DD
//
// Director ruling, 30 Sep 2026: each college head gets a report card for their
// college every Monday — jobs fixed, jobs late, repeat problems (and star
// ratings, once a ratings source exists) — compared with the other colleges.
// The Director sees all colleges.
//
// The Monday bell (app/api/cron/weekly-report-card) links here. The numbers
// come from lib/campus-walk/report-card.ts; who may see what is decided in
// lib/campus-walk/report-card-run.ts (resolveReportCardViewer).
//
// ── WHY SERVICE ROLE FOR READS ──────────────────────────────────────────────
// Same reason as the scoreboards: project_* RLS is `auth.uid() IS NOT NULL`, so
// a session client would hand every job to anyone signed in. The viewer check
// below is the real boundary, and only counts ever leave this server component
// — no job title, photo, person or complaint text is sent to the browser.
//
// Every refusal renders a card with a reason (house rule #27) — no redirect.
// ============================================================================

import Link from 'next/link';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  lastCompletedWeekStart,
  parseWeekParam,
  weekFromMonday,
  type CollegeCard,
  type ReportCardBoard
} from '@/lib/campus-walk/report-card';
import {
  defaultReportCardRunDeps,
  loadReportCards,
  REPORT_CARD_PATH,
  reportCardUrl,
  resolveReportCardViewer
} from '@/lib/campus-walk/report-card-run';
import { BoardShell, DeniedCard } from '../scoreboard/_lib/scoreboard-page';

export const dynamic = 'force-dynamic';

const TITLE = 'Weekly report card';
const DESCRIPTION =
  'Campus jobs and complaints for one week, Monday to Sunday, compared across the colleges.';

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1 shadow-sm dark:shadow-none">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-4 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
      <CardContent className="flex items-start gap-3 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">{children}</div>
      </CardContent>
    </Card>
  );
}

function days(n: number | null): string {
  if (n === null) return '—';
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

function OwnCard({ card, board }: { card: CollegeCard; board: ReportCardBoard }) {
  const collegeCount = board.cards.length;
  return (
    <section className="mt-4 space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{card.name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Reported" value={String(card.reportsReceived)} hint="problems this week" />
        <Tile label="Fixed" value={String(card.fixed)} hint="fix photo approved" />
        <Tile
          label="Fixed on time"
          value={card.fixedOnTimePct === null ? '—' : `${card.fixedOnTimePct}%`}
          hint={
            card.fixedJudged > 0
              ? `${card.fixedOnTime} of ${card.fixedJudged} by the due date`
              : card.fixed > 0
                ? 'no fix had a due date'
                : 'nothing fixed yet'
          }
        />
        <Tile label="Past the date" value={String(card.lateNow)} hint="still open, due date gone" />
        <Tile label="Oldest open job" value={days(card.oldestOpenDays)} hint="paused jobs left out" />
        <Tile label="Came back" value={String(card.repeats)} hint="same problem, same place" />
        <Tile label="Typical time to fix" value={days(card.typicalDaysToFix)} />
        {card.ratings ? (
          <Tile
            label="Star rating"
            value={`${card.ratings.average.toFixed(1)} ★`}
            hint={`${card.ratings.count} ratings`}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Complaints in" value={String(card.complaintsReceived)} />
        <Tile label="Resolved" value={String(card.complaintsResolved)} />
        <Tile label="Overdue" value={String(card.complaintsOverdue)} />
      </div>
      <p className="text-sm text-muted-foreground">
        {card.rankOnTime !== null
          ? `Fixing on time: ${ordinal(card.rankOnTime)} of the ${board.rankedOnTimeCount} ${board.rankedOnTimeCount === 1 ? 'college' : 'colleges'} that fixed something.`
          : card.fixed > 0
            ? 'No fix this week had a due date, so there is no on-time place.'
            : 'Nothing was fixed this week, so there is no on-time place.'}{' '}
        {`Fewest jobs past the date: ${ordinal(card.rankLate)} of ${collegeCount}.`}
      </p>
    </section>
  );
}

function ComparisonTable({
  board,
  highlightId
}: {
  board: ReportCardBoard;
  highlightId: string;
}) {
  const showRatings = board.cards.some((c) => c.ratings !== null);
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-foreground mb-2">All colleges</h2>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>College</TableHead>
              <TableHead className="text-right">Fixed</TableHead>
              <TableHead className="text-right">On time</TableHead>
              <TableHead className="text-right">Past the date</TableHead>
              <TableHead className="text-right">Came back</TableHead>
              <TableHead className="text-right">Complaints overdue</TableHead>
              {showRatings ? <TableHead className="text-right">Stars</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.cards.map((c) => (
              <TableRow
                key={c.institutionId}
                className={c.institutionId === highlightId ? 'bg-muted font-medium' : undefined}
              >
                <TableCell className="min-w-[10rem]">
                  {c.name}
                  {c.institutionId === highlightId ? (
                    <span className="ml-2 text-xs text-muted-foreground">(your college)</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">{c.fixed}</TableCell>
                <TableCell className="text-right">
                  {c.fixedOnTimePct === null ? '—' : `${c.fixedOnTimePct}%`}
                </TableCell>
                <TableCell className="text-right">{c.lateNow}</TableCell>
                <TableCell className="text-right">{c.repeats}</TableCell>
                <TableCell className="text-right">{c.complaintsOverdue}</TableCell>
                {showRatings ? (
                  <TableCell className="text-right">
                    {c.ratings ? c.ratings.average.toFixed(1) : '—'}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default async function WeeklyReportCardPage({
  searchParams
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="You are not signed in"
          reason="Sign in with your JKKN account to see the weekly report card."
        />
      </BoardShell>
    );
  }

  const admin = createServiceRoleClient();
  const viewer = await resolveReportCardViewer(admin, user.id, defaultReportCardRunDeps);
  if (viewer.scope === 'none') {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="This report card is for college heads and the Director"
          reason="Each college's principal sees their own college's card, and the Director sees every college. Your account is not recorded as either."
        />
      </BoardShell>
    );
  }

  const now = new Date();
  const { week: weekRaw } = await searchParams;
  const parsed = parseWeekParam(weekRaw, now);
  if (!parsed.week) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="That week could not be read"
          reason={`The address asked for week "${String(weekRaw).slice(0, 20)}". Weeks are written as a date like 2026-09-22. Open the report card again from the menu to see last week.`}
        />
      </BoardShell>
    );
  }
  const week = parsed.week;

  let board: ReportCardBoard;
  try {
    board = (await loadReportCards(admin, week, now)).board;
  } catch {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="We could not load the report card"
          reason="Something went wrong reading this week's numbers. Nothing has changed — please refresh in a moment."
        />
      </BoardShell>
    );
  }

  const own =
    viewer.scope === 'college'
      ? board.cards.find((c) => c.institutionId === viewer.institutionId) ?? null
      : null;

  // A principal of a school or an office is not a college head: refuse here,
  // and show NOTHING else — not the all-colleges table either.
  if (viewer.scope === 'college' && !own) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="Your college is not in this list"
          reason="The report card covers active colleges. Your institution is not recorded as one, so there is no card for it."
        />
      </BoardShell>
    );
  }
  const prevWeek = weekFromMonday(addDaysTo(week.weekStart, -7));
  const nextMonday = addDaysTo(week.weekStart, 7);
  const nextAvailable = nextMonday <= lastCompletedWeekStart(now);

  return (
    <BoardShell title={TITLE} description={DESCRIPTION}>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-medium text-foreground">
          Week of {shortDay(week.weekStart)} – {shortDay(week.weekEnd)} {week.weekEnd.slice(0, 4)}
        </p>
        <div className="flex gap-2 text-sm">
          <Link
            className="rounded-md border px-3 py-2 hover:bg-muted"
            href={reportCardUrl(prevWeek.weekStart)}
          >
            Previous week
          </Link>
          {nextAvailable ? (
            <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={reportCardUrl(nextMonday)}>
              Next week
            </Link>
          ) : null}
        </div>
      </div>

      {parsed.snapped ? (
        <Note>
          <p>That date was not a Monday, so this shows the week that starts on Monday {shortDay(week.weekStart)}.</p>
        </Note>
      ) : null}
      {parsed.notFinished ? (
        <Note>
          <p>This week has not finished yet, so these numbers will still change.</p>
        </Note>
      ) : null}

      {own ? <OwnCard card={own} board={board} /> : null}

      <ComparisonTable board={board} highlightId={own?.institutionId ?? ''} />

      {viewer.scope === 'all' ? (
        <Note>
          <p>
            <strong>College not known: {board.collegeNotKnown.jobs}</strong>{' '}
            {board.collegeNotKnown.jobs === 1 ? 'job' : 'jobs'} this week (
            {board.collegeNotKnown.reportsReceived} reported, {board.collegeNotKnown.lateNow} past
            the date). No item, fixer, department or reporter on these jobs names an institution, so they
            are on no college&apos;s card.
          </p>
          {board.unassigned.reportsReceived > 0 || board.unassigned.lateNow > 0 ? (
            <p>
              Schools and offices (not a college): {board.unassigned.reportsReceived} reported this
              week, {board.unassigned.lateNow} past the date.
            </p>
          ) : null}
          {board.complaintsTruncated ? (
            <p>
              The complaint list was too long to read in full, so complaint counts may be short.
            </p>
          ) : null}
        </Note>
      ) : null}

      <Note>
        <p>
          &quot;Fixed&quot; means the fix photo was approved during the week. &quot;Past the
          date&quot; counts jobs still open at the end of the week whose due date had gone; a
          job paused for a budget decision or approved leave is never counted as late.
          &quot;Typical time to fix&quot; leaves out time paused for a budget decision or approved
          leave.
          &quot;Came back&quot; means someone reported the same problem again, or a new report
          was filed at the same place for the same kind of problem within 90 days of a fix.
          Complaints count all complaints except those that go only to the Internal Complaints
          Committee. A job counts for the college of the item or room it is about; failing that,
          the college of the person responsible for fixing it, then of the department, then of the
          person who reported it. &quot;Fixed on time&quot; leaves out fixes that had no due date.
        </p>
      </Note>

      <p className="mt-4 text-xs text-muted-foreground">
        <Link className="underline" href={REPORT_CARD_PATH}>
          Back to last week
        </Link>
      </p>
    </BoardShell>
  );
}

function addDaysTo(monday: string, offsetDays: number): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
