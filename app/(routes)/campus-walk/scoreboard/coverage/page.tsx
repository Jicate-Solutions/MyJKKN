// app/(routes)/campus-walk/scoreboard/coverage/page.tsx
// ============================================================================
// Campus Walk D12 — the walking board. /campus-walk/scoreboard/coverage
//
// Spec: specs/campus-walk-2026-08-17.md, D12 and §5.
//
// ── THE QUESTION ────────────────────────────────────────────────────────────
// How much walking, against the standing 20,000-step objective, and how much
// of the campus the walk actually reached.
//
// ── THE THING THIS SCREEN MUST NEVER DO ─────────────────────────────────────
// Render a zero, or a flat empty chart, for a day nobody took a reading.
//
// A zero is a claim that the Director walked nowhere. An absent reading is a
// claim that nobody measured. Those are different facts about a real person's
// activity and only the second one is true, so days without a reading are left
// out entirely and the screen says so in words.
//
// ── AND THE WORDING IS LOAD-BEARING TOO ─────────────────────────────────────
// There has been no step reading since 2026-04-18. It is tempting to render
// that as "the feed is down". It is not down. Verified 2026-09-03: the sync
// job that has historically produced these readings ran that morning, its API
// token is valid, it cached fresh responses for 2026-09-01/02/03, and its own
// log line for the run is "0 written, 3 days with no ring data". The wearable
// stopped producing readings; the software did not fail. "The feed is broken"
// would send somebody to debug working code and would quietly excuse a gap
// that is not a software gap.
//
// ── AND THE GAP THIS PAGE REFUSES TO PAPER OVER ─────────────────────────────
// Nothing sends step readings to MyJKKN at all. Every reading that has ever
// existed was written by a job on the Director's own machine into a local
// Obsidian vault; a deployed web application cannot read any of that. The
// ingestion surface exists (app/api/campus-walk/scoreboard/steps) and the
// table exists, but no sender does. That is stated on the screen rather than
// hidden, because a board that looks merely empty reads as "he did not walk".
//
// ── PERSONAL HEALTH DATA STAYS OUT OF THIS REPOSITORY (§5) ──────────────────
// Steps and area coverage. Nothing else. Body measurements, lab values, sleep,
// heart rate and diet plans live in the Director's private vault.
//
// ── GUARDRAIL G2 ────────────────────────────────────────────────────────────
// Never rendered beside the fixing board. Separate routes, no combined page.
// ============================================================================

import { AlertCircle, Info, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { buildCoverageBoard } from '@/lib/campus-walk/scoreboard';
import {
  adminClient,
  BoardShell,
  DeniedCard,
  gateScoreboard,
  loadStepDays,
  loadWalkTasks,
  resolveCampusOpsProjectId
} from '../_lib/scoreboard-page';

export const dynamic = 'force-dynamic';

const TITLE = 'Walking and area covered';
const DESCRIPTION =
  'Steps against the 20,000-a-day objective, and how much of the campus the walks reached.';

function Stat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function CampusWalkCoverageBoardPage() {
  const gate = await gateScoreboard();
  if (!gate.ok) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard heading={gate.heading} reason={gate.reason} />
      </BoardShell>
    );
  }

  const admin = adminClient();
  const projectId = await resolveCampusOpsProjectId(admin);

  // The two halves are independent on purpose: steps come from readings sent
  // in, area coverage from the observations already recorded. Neither being
  // empty may blank the other.
  let tasks: Awaited<ReturnType<typeof loadWalkTasks>> = [];
  let taskReadFailed = false;
  if (projectId) {
    try {
      tasks = await loadWalkTasks(admin, projectId);
    } catch {
      taskReadFailed = true;
    }
  }

  const stepDays = await loadStepDays(admin, gate.profileId);
  const board = buildCoverageBoard(tasks, stepDays);
  const { feed, coverage } = board;

  const feedIsEmpty = feed.state === 'never_reported';

  return (
    <BoardShell title={TITLE} description={DESCRIPTION}>
      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h2 className="text-lg font-semibold">Steps</h2>

        <Card
          className={`mt-3 ${feedIsEmpty || feed.state === 'stale' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}
        >
          <CardContent className="flex items-start gap-3 py-5">
            <AlertCircle
              className={`mt-0.5 h-5 w-5 shrink-0 ${feedIsEmpty || feed.state === 'stale' ? 'text-amber-600' : 'text-emerald-700'}`}
            />
            <div className="space-y-1">
              <p className="font-medium">{feed.headline}</p>
              <p className="text-sm text-muted-foreground">{feed.detail}</p>
              {feed.latestReadingDate ? (
                <p className="text-sm text-muted-foreground">
                  Most recent reading held here: <span className="font-medium">{feed.latestReadingDate}</span>.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {feedIsEmpty ? (
          <Card className="mt-3 border-slate-200 bg-slate-50">
            <CardContent className="space-y-2 py-5 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Why there is nothing to show</p>
              <p>
                Nothing currently sends step readings to MyJKKN. Readings have always been written
                by a program running on a personal machine, into a personal notes folder. This
                website runs on a server and cannot reach either of those, so no number can arrive
                on its own.
              </p>
              <p>
                The place for a reading to arrive already exists — anything that can make a web
                request can send one day&apos;s count to{' '}
                <code className="rounded bg-white px-1 py-0.5 text-xs">
                  /api/campus-walk/scoreboard/steps
                </code>
                . What does not exist yet is something that does the sending. Until it is built,
                this section stays empty rather than showing a made-up figure.
              </p>
              <p>
                Separately, and recorded outside MyJKKN: the wearable that has produced these
                readings in the past last recorded one on{' '}
                <span className="font-medium">{feed.lastReadingDateOutsideMyJKKN}</span> and has
                produced none since, which means no reading was taken. The program that collects
                them was checked on 3 September 2026 and is running normally.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Days with a reading"
                value={String(board.daysWithAReading)}
                hint="Days with no reading are left out, never counted as zero."
              />
              <Stat
                label={`Days at ${board.goalPerDay.toLocaleString('en-IN')} or more`}
                value={String(board.daysMeetingGoal)}
                hint="Out of the days that have a reading."
              />
              <Stat
                label="Typical day"
                value={
                  board.medianStepsOnDaysWithAReading === null
                    ? '—'
                    : board.medianStepsOnDaysWithAReading.toLocaleString('en-IN')
                }
                hint="Middle value across days with a reading."
              />
            </div>

            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Steps</TableHead>
                    <TableHead className="text-right">
                      Reached {board.goalPerDay.toLocaleString('en-IN')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.days
                    .slice()
                    .reverse()
                    .map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="font-medium">{d.date}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.steps.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right">{d.metGoal ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* ── Area coverage ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Area covered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Worked out from the observations already recorded on the walks — no separate tracking.
        </p>

        {taskReadFailed ? (
          <Card className="mt-3 border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 py-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Area figures could not be loaded</p>
                <p className="text-sm text-muted-foreground">
                  Something went wrong reading the observations. Nothing has changed — please
                  refresh in a moment.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : !projectId ? (
          <Card className="mt-3 border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 py-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Campus Operations is not set up yet</p>
                <p className="text-sm text-muted-foreground">
                  The standing CAMPUS-OPS project does not exist, so no observations have anywhere
                  to sit and none can be counted.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Distinct spots visited"
                value={String(coverage.distinctAreas)}
                hint="Each spot is roughly a 110-metre square — about one building."
              />
              <Stat label="Observations recorded" value={String(coverage.observations)} />
              <Stat
                label="Colleges reached"
                value={String(coverage.distinctInstitutions)}
                hint="From the college recorded on each observation."
              />
              <Stat
                label="Kinds of problem seen"
                value={String(coverage.distinctCategories)}
              />
            </div>

            {coverage.observationsWithoutLocation > 0 ? (
              <Card className="mt-3 border-slate-200 bg-slate-50">
                <CardContent className="flex items-start gap-3 py-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <p className="text-sm text-slate-700">
                    {coverage.observationsWithoutLocation} observation
                    {coverage.observationsWithoutLocation === 1 ? '' : 's'} saved without a location
                    fix, so {coverage.observationsWithoutLocation === 1 ? 'it is' : 'they are'} not
                    counted in the spots above. The capture screen saves an observation even when
                    the phone cannot get a location, which is deliberate — the photo matters more
                    than the map pin.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </section>

      <Card className="mt-6 border-slate-200 bg-slate-50">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-sm text-slate-700">
            Only steps and area covered are recorded here. Nothing else about anyone&apos;s health
            is stored in this system.
          </p>
        </CardContent>
      </Card>
    </BoardShell>
  );
}
