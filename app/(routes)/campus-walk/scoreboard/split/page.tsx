// app/(routes)/campus-walk/scoreboard/split/page.tsx
// ============================================================================
// Campus Walk D13 — one action, or a missing system?
// /campus-walk/scoreboard/split
//
// Spec: specs/campus-walk-2026-08-17.md, §3a.
//
// ── THE DISTINCTION, IN THE DIRECTOR'S OWN FRAMING ──────────────────────────
// A SYMPTOM is one action: "this light is broken", "this toilet is dirty".
// A SYSTEM GAP is broader work: "there is no cleaning SOP for Block C".
// The spec calls this "the decision that separates a complaint app from an
// improvement system", and the cost of getting it wrong is asymmetric: a
// mis-filed symptom is trivial, while a mis-filed system gap means a chronic
// problem gets cleaned forever and never fixed.
//
// ── NOTHING NEW IS RECORDED TO BUILD THIS SCREEN ────────────────────────────
// The distinction is already stored. campus-walk-service writes
// `metadata.kind` as 'symptom' | 'system_gap' at intake and has since the
// module shipped; the capture screen already asks for it. No column is added
// and no classifier runs here — this page only counts what is there.
//
// ── WHAT IT ADDS: MAKING A RUN OF SYMPTOMS VISIBLE ──────────────────────────
// Two different runs live in the data and neither is visible on a per-ticket
// screen, because no single ticket looks wrong:
//
//   1. ONE PROBLEM, REPEATEDLY. D7 reopens the original task rather than
//      filing a new one and increments metadata.occurrence_count, so
//      "Block C — 9th time" is one row with a number on it.
//   2. MANY PROBLEMS, ONE CAUSE. Several separate symptoms in one category
//      with no system gap ever raised against that category. This is the
//      cheaper and more common signal and the one a person cannot spot by
//      scrolling.
//
// ── IT PROPOSES. IT NEVER PROMOTES. ─────────────────────────────────────────
// The spec is explicit: "Do not let the AI create projects unattended... A
// system that silently spawns projects will spawn dozens." Nothing on this
// page writes anything. It shows candidates with their evidence and a person
// decides.
//
// It also does no fuzzy matching. lib/campus-walk/repeats.ts deliberately
// refuses to guess which tickets are "the same" — silent auto-matching would
// merge unrelated problems and hide genuine recurrences. Clusters here are
// exact category matches so that refusal is not reintroduced through a side
// door.
// ============================================================================

import { AlertCircle, Info, Layers, Repeat, UserX } from 'lucide-react';
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
  buildOwnershipBoard,
  buildSplitBoard,
  type OwnershipBoard,
  type SplitBoard
} from '@/lib/campus-walk/scoreboard';
import {
  adminClient,
  BoardShell,
  DeniedCard,
  gateScoreboard,
  loadWalkTasks,
  resolveCampusOpsProjectId
} from '../_lib/scoreboard-page';

export const dynamic = 'force-dynamic';

const TITLE = 'One action, or a missing system?';
const DESCRIPTION =
  'How campus reports split between a single fix and a wider gap — and where a run of small problems suggests one cause.';

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function CampusWalkSplitBoardPage() {
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
          reason="The standing CAMPUS-OPS project does not exist, so no campus reports have anywhere to sit and there is nothing to split."
        />
      </BoardShell>
    );
  }

  let board: SplitBoard;
  let ownership: OwnershipBoard;
  try {
    // One read, two independent views of it. Guardrail G2 is untouched:
    // neither of these is a leaderboard, and the fixing board — the one that
    // ranks departments — still lives on its own route and is never rendered
    // beside anything.
    const rows = await loadWalkTasks(admin, projectId);
    board = buildSplitBoard(rows);
    ownership = buildOwnershipBoard(rows);
  } catch {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <DeniedCard
          heading="We could not load this board"
          reason="Something went wrong reading the campus reports. Nothing has changed — please refresh in a moment."
        />
      </BoardShell>
    );
  }

  const total = board.symptomCount + board.systemGapCount;

  if (total === 0) {
    return (
      <BoardShell title={TITLE} description={DESCRIPTION}>
        <Card className="mx-auto mt-6 w-full max-w-2xl">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div>
              <p className="font-medium">No campus reports have been filed yet</p>
              <p className="text-sm text-muted-foreground">
                This board fills up as conditions are photographed on a walk. Nothing has been
                counted because nothing has been filed.
              </p>
            </div>
          </CardContent>
        </Card>
      </BoardShell>
    );
  }

  return (
    <BoardShell title={TITLE} description={DESCRIPTION}>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="One action to fix"
          value={String(board.symptomCount)}
          hint="A single job: clean this, replace that. Expected to be the large majority."
        />
        <Stat
          label="A wider gap"
          value={String(board.systemGapCount)}
          hint="No procedure exists, or the procedure is not working. Rarer, and worth more."
        />
      </div>

      {/* ── One problem, repeatedly ───────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Repeat className="h-5 w-5 text-slate-500" />
          The same problem, coming back
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Single fixes that have now been reported {board.threshold} times or more. Fixing the same
          thing repeatedly usually means something behind it was never fixed.
        </p>

        {board.repeatingSymptoms.length === 0 ? (
          <Card className="mt-3">
            <CardContent className="py-5 text-sm text-muted-foreground">
              Nothing has come back {board.threshold} times or more yet.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What was reported</TableHead>
                  <TableHead>Kind of problem</TableHead>
                  <TableHead className="text-right">Times reported</TableHead>
                  <TableHead>Where it stands</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.repeatingSymptoms.map((s) => (
                  <TableRow key={s.taskId}>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>
                      {s.category ?? <span className="text-muted-foreground">Not recorded</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.occurrenceCount}</TableCell>
                    <TableCell>{s.statusKey}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Many problems, one cause ──────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Layers className="h-5 w-5 text-slate-500" />
          Different problems that may share one cause
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kinds of problem with {board.threshold} or more separate single fixes, where nobody has
          yet raised a wider gap. Each of these is worth asking about — is there a procedure for
          this, and has anyone checked it is being followed?
        </p>

        {board.candidateClusters.length === 0 ? (
          <Card className="mt-3">
            <CardContent className="py-5 text-sm text-muted-foreground">
              No kind of problem has built up {board.threshold} or more single fixes without a
              wider gap already being raised for it.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind of problem</TableHead>
                  <TableHead className="text-right">Separate single fixes</TableHead>
                  <TableHead>Wider gap raised?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.candidateClusters.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="font-medium">{c.category}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.symptomCount}</TableCell>
                    <TableCell>Not yet</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Where nobody is attached ──────────────────────────────────────
          A MISSING SYSTEM, which is this board's question — not an incident.
          The fact was already recorded on every observation
          (metadata.accountable_routed_to_eao_no_owner) and shown nowhere.

          Deliberately a section on a screen and NOT a message. The Director
          chose on 2026-09-04 to be copied on every unsafe alert; adding a
          second per-event notification on top of that choice would defeat it.
          Routing hygiene is fixed at a desk, not on a phone.

          D9: kinds of work and places, never a named person. See the row
          types in lib/campus-walk/scoreboard.ts — they have nowhere to put a
          name. ───────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserX className="h-5 w-5 text-slate-500" />
          Where nobody is attached
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reports that arrived with nobody responsible for them, and so were passed to the
          Executive Admin Officer by default. This lists kinds of work and where they were seen.
          It never names a person.
        </p>

        {ownership.everyObservationIsUnowned ? (
          <Card className="mt-3 border-slate-200 bg-slate-50">
            <CardContent className="space-y-2 py-5 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                Nothing has an owner yet, because nothing asks for one
              </p>
              <p>
                {ownership.observations === 1
                  ? 'The one report filed so far is on this list.'
                  : `All ${ownership.observations} reports filed so far are on this list.`}{' '}
                That is not a gap in a record of who looks after what — no such record exists.
                The capture screen does not ask who owns a condition and nothing sends one, so
                every report goes to the Executive Admin Officer.
              </p>
              <p>
                Agreeing who owns each kind of work is the thing to do first. As soon as some
                reports start arriving with an owner, this table stops being everything and
                starts being the gaps.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {ownership.unownedByCategory.length === 0 ? (
          <Card className="mt-3">
            <CardContent className="py-5 text-sm text-muted-foreground">
              Every report filed so far arrived with somebody responsible for it.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind of problem</TableHead>
                  <TableHead className="text-right">Reports with nobody attached</TableHead>
                  <TableHead className="text-right">Of those, unsafe</TableHead>
                  <TableHead className="text-right">Separate spots</TableHead>
                  <TableHead>Most recent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownership.unownedByCategory.map((r) => (
                  <TableRow key={r.category ?? '__uncategorised__'}>
                    <TableCell className="font-medium">
                      {r.category ?? <span className="text-muted-foreground">Not recorded</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.unownedCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.unsafeCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.distinctSpots}</TableCell>
                    <TableCell>{r.lastSeenAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* The case a delivered Director copy hides: an unsafe alert went out
            and somebody got it, so "nobody was paged" is correctly silent —
            but the person who must ACT was not reached. Read straight off
            metadata.urgent_alert.attempts[]; nothing here alerts anyone. */}
        <div className="mt-5">
          <h3 className="text-sm font-semibold">
            Unsafe alerts that did not reach the person responsible
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The alert was sent and the Director received it — he is copied on every one — but the
            person expected to act was not reached. Almost always a missing or wrong phone number
            on their record.
          </p>

          {ownership.unreachableOwners.length === 0 ? (
            <Card className="mt-2">
              <CardContent className="py-4 text-sm text-muted-foreground">
                No unsafe alert has failed to reach the person responsible.
              </CardContent>
            </Card>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What was reported</TableHead>
                    <TableHead>Kind of problem</TableHead>
                    <TableHead>Why they were not reached</TableHead>
                    <TableHead>Did anyone receive it?</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownership.unreachableOwners.map((r) => (
                    <TableRow key={r.taskId}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell>
                        {r.category ?? <span className="text-muted-foreground">Not recorded</span>}
                      </TableCell>
                      <TableCell>
                        {r.reason === 'no_usable_number'
                          ? 'No usable phone number on their record'
                          : 'The message could not be delivered to their number'}
                      </TableCell>
                      <TableCell>
                        {r.someoneElseWasReached
                          ? 'Yes — the Director'
                          : 'No — a separate alarm was raised'}
                      </TableCell>
                      <TableCell>{r.at ? r.at.slice(0, 10) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Nobody is messaged about anything in this section. It is a record to work through, not
          an alarm — the alarm for a dangerous condition nobody was told about already exists and
          is unchanged.
        </p>
      </section>

      <Card className="mt-6 border-slate-200 bg-slate-50">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              <span className="font-medium">Nothing on this page changes anything.</span> It only
              points at things worth a second look. Turning one of these into a project stays a
              decision a person makes.
            </p>
            <p>
              Reports are grouped only when they were recorded under exactly the same kind of
              problem. Nothing here guesses that two differently-worded reports are the same
              thing — that guess would merge unrelated problems and hide genuine repeats.
            </p>
          </div>
        </CardContent>
      </Card>
    </BoardShell>
  );
}
