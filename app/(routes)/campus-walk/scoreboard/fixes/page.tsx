// app/(routes)/campus-walk/scoreboard/fixes/page.tsx
// ============================================================================
// Campus Walk D9 — the fixing board. /campus-walk/scoreboard/fixes
//
// Spec: specs/campus-walk-2026-08-17.md, D9 and guardrails G1 + G2.
//
// ── THE QUESTION ────────────────────────────────────────────────────────────
// Who is fixing campus conditions, and how fast.
//
// ── THE RULING: DEPARTMENTS, NEVER NAMED PEOPLE ─────────────────────────────
// Not in a column, not in a tooltip, not in a sort key, not in anything this
// page hands to the browser. Guardrail G1 names the harm plainly: housekeeping
// and maintenance staff are the lowest-power people on campus and the easiest
// to make look bad with a chart. A board with names on it turns a maintenance
// tool into a public performance ranking, which is surveillance wearing a Lean
// costume. Gemba doctrine is go see, show respect, ask why.
//
// Three separate mechanisms hold that line, because one would be a comment:
//   1. loadStaffDepartments() selects `id, department_id` ONLY — no name
//      column is ever fetched, so no name exists in this request's memory.
//   2. buildFixBoard() consumes owner_staff_id and does not return it. The
//      FixBoardRow type has no field that could hold a person.
//   3. A department with fewer than two distinct fixers is folded into an
//      aggregate row, because a one-person department is an individual with a
//      department's name on it and everybody on campus knows who it is.
//
// ── AND THE COLUMNS THAT KEEP IT FAIR ───────────────────────────────────────
// "Waiting on approval" and "Waiting on a decision or a return" are first-class
// columns, not footnotes. A board showing only closures and overdue would
// charge a department for every day a finished job sat in the Director's queue
// (D4) or waited on a budget decision (D8). The median duration already has
// paused days subtracted for the same reason.
//
// ── GUARDRAIL G2 ────────────────────────────────────────────────────────────
// This board is never rendered beside the walking board. They are separate
// routes and there is no page that shows both. Hunters and hunted.
// ============================================================================

import { AlertCircle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  buildFixBoard,
  MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT,
  type FixBoard
} from '@/lib/campus-walk/scoreboard';
import {
  adminClient,
  BoardShell,
  DeniedCard,
  gateScoreboard,
  loadStaffDepartments,
  loadWalkTasks,
  resolveCampusOpsProjectId
} from '../_lib/scoreboard-page';

export const dynamic = 'force-dynamic';

const TITLE = 'Campus fixes by department';
const DESCRIPTION =
  'How many campus jobs each department has finished, and how long they took. Departments only — never individual people.';

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-4 border-slate-200 bg-slate-50">
      <CardContent className="flex items-start gap-3 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="space-y-1 text-sm text-slate-700">{children}</div>
      </CardContent>
    </Card>
  );
}

export default async function CampusWalkFixesBoardPage() {
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

  if (!projectId) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="Campus Operations is not set up yet"
          reason="The standing CAMPUS-OPS project does not exist, so no campus walk jobs have anywhere to sit and there is nothing to count."
        />
      </BoardShell>
    );
  }

  let board: FixBoard;
  try {
    const tasks = await loadWalkTasks(admin, projectId);
    const staffIndex = await loadStaffDepartments(
      admin,
      tasks.map((t) => t.owner_staff_id).filter((id): id is string => Boolean(id))
    );
    board = buildFixBoard(tasks, staffIndex);
  } catch {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="We could not load this board"
          reason="Something went wrong reading the campus jobs. Nothing has changed — please refresh in a moment."
        />
      </BoardShell>
    );
  }

  if (board.rows.length === 0) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <Card className="mx-auto mt-6 w-full max-w-2xl">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div>
              <p className="font-medium">No campus jobs have been recorded yet</p>
              <p className="text-sm text-muted-foreground">
                This board fills up as conditions are photographed on a walk and the fixes are
                approved. Nothing has been counted because nothing has been filed.
              </p>
            </div>
          </CardContent>
        </Card>
      </BoardShell>
    );
  }

  const { totals } = board;

  return (
    <BoardShell title={TITLE} description={DESCRIPTION}>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Finished and approved</TableHead>
              <TableHead className="text-right">Typical days to finish</TableHead>
              <TableHead className="text-right">Still open</TableHead>
              <TableHead className="text-right">Past its date</TableHead>
              <TableHead className="text-right">Waiting on approval</TableHead>
              <TableHead className="text-right">Waiting on a decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.rows.map((row) => (
              <TableRow key={row.key} className={row.isBucket ? 'bg-slate-50' : undefined}>
                <TableCell className="font-medium">
                  {row.departmentName}
                  {row.bucketReason ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {row.bucketReason}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.verifiedClosures}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.medianDaysToClose === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    row.medianDaysToClose
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.openJobs}</TableCell>
                <TableCell className="text-right tabular-nums">{row.overdueJobs}</TableCell>
                <TableCell className="text-right tabular-nums">{row.awaitingApproval}</TableCell>
                <TableCell className="text-right tabular-nums">{row.blockedJobs}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-medium">
              <TableCell>All departments</TableCell>
              <TableCell className="text-right tabular-nums">{totals.verifiedClosures}</TableCell>
              <TableCell className="text-right tabular-nums">
                {totals.medianDaysToClose === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  totals.medianDaysToClose
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{totals.openJobs}</TableCell>
              <TableCell className="text-right tabular-nums">{totals.overdueJobs}</TableCell>
              <TableCell className="text-right tabular-nums">{totals.awaitingApproval}</TableCell>
              <TableCell className="text-right tabular-nums">{totals.blockedJobs}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Note>
        <p>
          <span className="font-medium">This board counts departments, never people.</span> No
          individual&apos;s name or personal count appears here, and none is loaded to build it. A
          department is shown on its own line only when at least{' '}
          {MIN_DISTINCT_FIXERS_TO_SHOW_A_DEPARTMENT} different people in it have worked on a campus
          job; anything smaller is grouped, because a one-person department would be one person by
          another name.
          {board.suppressedDepartmentCount > 0 ? (
            <>
              {' '}
              {board.suppressedDepartmentCount} department
              {board.suppressedDepartmentCount === 1 ? ' is' : 's are'} grouped that way right now.
            </>
          ) : null}
        </p>
        <p>
          <span className="font-medium">&ldquo;Finished and approved&rdquo;</span> means a photo of
          the finished work was sent in and accepted. A job marked done without that photo is not
          counted.
        </p>
        <p>
          <span className="font-medium">
            Waiting on approval and waiting on a decision are shown separately on purpose.
          </span>{' '}
          Those are days the department could not end — the first is waiting on the approver, the
          second on money or on a colleague&apos;s return. They are excluded from &ldquo;typical
          days to finish&rdquo;, which is a middle value rather than an average so one unusual job
          cannot swing a whole department.
        </p>
      </Note>
    </BoardShell>
  );
}
