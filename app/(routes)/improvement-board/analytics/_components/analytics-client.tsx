'use client';

/**
 * MBA Analyst Dashboard — client.
 * Read-only. For the signed-in MBA Associate: resolve the department(s) they
 * are posted to (their own mba_associate_postings), then render the analyst
 * views for each via MbaAnalystService.getAnalystViews. All rows are already
 * k≥5-suppressed + de-identified by the SECURITY DEFINER RPC; this UI only
 * displays them.
 *
 * Gating branches on the loading state FIRST (never a denied-looking flash),
 * and a denied user gets an explicit reason instead of a silent redirect
 * (CLAUDE.md #27). Two intentional empty states:
 *   • not posted to any department  → "No department assigned yet"
 *   • posted, but the department has no mapped views → "No analyst data yet"
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  BarChart3,
  ShieldAlert,
  ArrowLeft,
  Building2,
  Lock,
  Inbox,
  AlertTriangle,
  FileWarning,
  TrendingUp,
  CheckCircle2,
  Target
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import {
  MbaAnalystService,
  type MbaAnalystView
} from '@/lib/services/mba-analyst/mba-analyst-service';
import {
  ImprovementService,
  type ImprovementArea
} from '@/lib/services/improvement/improvement-service';
import {
  MbaDataGapService,
  type MbaGapTrackRecord
} from '@/lib/services/mba-data-gap/mba-data-gap-service';
import { ReportDataGapDialog } from '../../_components/report-data-gap-dialog';
import { DeptPlaybookPanel } from './dept-playbook-panel';

interface AnalyticsClientProps {
  userId: string;
}

/** Dialog state shared by the empty-state "Report a data gap" buttons. `areaId`
 *  is left undefined when the Associate has no department selected — the dialog
 *  then shows its own department picker. */
interface GapDialogState {
  open: boolean;
  areaId?: string;
  areaLabel?: string;
}

/** A small "Report a data gap" button for the empty-analytics states. */
function ReportGapButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <FileWarning className="mr-2 h-4 w-4" />
      Report a data gap
    </Button>
  );
}

/**
 * "Your data-gap impact" — the Phase-3 measurement card for the Associate's own
 * view. Self-contained: fetches its own track record (fn_mba_gap_track_record
 * self-scopes to the caller) and renders NOTHING until the Associate has filed
 * at least one gap, so it never disturbs the existing analytics layout. Shows
 * filed → accepted → produced-an-improvement, the outcome the loop measures.
 */
function DataGapImpactCard({ userId }: { userId: string }) {
  const [record, setRecord] = useState<MbaGapTrackRecord | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await MbaDataGapService.getTrackRecord(null);
        if (alive) setRecord(rows[0] ?? null);
      } catch {
        if (alive) setRecord(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!record || record.filed <= 0) return null;

  const stats = [
    { label: 'Filed', value: record.filed, icon: FileWarning },
    { label: 'Accepted', value: record.accepted, icon: CheckCircle2 },
    { label: 'Produced an improvement', value: record.produced_improvement, icon: Target }
  ];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="text-primary h-4 w-4" />
          <h2 className="text-sm font-semibold">Your data-gap impact</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-2xl font-bold">
                <s.icon className="text-muted-foreground h-4 w-4" />
                {s.value.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-xs">{s.label}</span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Data gaps you filed that a manager accepted, and how many went on to
          produce an applied improvement. Updated after each measurement run.
        </p>
      </CardContent>
    </Card>
  );
}

/** One posted-to department plus its resolved analyst views. */
interface AreaAnalytics {
  areaId: string;
  areaLabel: string;
  views: MbaAnalystView[];
  error: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shared shells                                                              */
/* -------------------------------------------------------------------------- */

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}

function NoAccessPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="font-medium">You don&apos;t have access to this page</p>
          <p className="text-muted-foreground text-sm">
            The MBA Analyst dashboard needs the &ldquo;View Improvement
            Board&rdquo; permission. Ask an Improvement Board manager if you need
            access.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the Improvement Board
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic view renderer                                                      */
/* -------------------------------------------------------------------------- */

/** "v_area_attendance" / "attendance_summary" → "Attendance Summary". */
function humanizeName(raw: string): string {
  return raw
    .replace(/^(v_|vw_|mv_)/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : '—';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Renders an array of JSONB rows as a table, columns derived from the union
 *  of keys (first-seen order). Assumes the RPC has already suppressed small
 *  groups, so an empty `rows` means "nothing that survived k≥5 suppression". */
function ViewTable({ rows }: { rows: Record<string, any>[] }) {
  const columns = useMemo(() => {
    const seen: string[] = [];
    const set = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!set.has(key)) {
          set.add(key);
          seen.push(key);
        }
      }
    }
    return seen;
  }, [rows]);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No rows to show. Small groups are hidden to protect privacy.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="whitespace-nowrap">
                {humanizeName(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col} className="whitespace-nowrap">
                  {formatCell(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ViewCard({ view }: { view: MbaAnalystView }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {view.is_sensitive ? (
            <Lock className="h-4 w-4 text-purple-500" />
          ) : (
            <BarChart3 className="text-primary h-4 w-4" />
          )}
          <h3 className="text-sm font-semibold">{humanizeName(view.view_name)}</h3>
        </div>
        {view.is_sensitive && (
          <Badge
            variant="outline"
            className="shrink-0 border-purple-200 bg-purple-50 text-xs text-purple-700"
          >
            Financial — de-identified, k≥5 suppressed
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <ViewTable rows={view.rows ?? []} />
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry + board                                                              */
/* -------------------------------------------------------------------------- */

export function AnalyticsClient({ userId }: AnalyticsClientProps) {
  const { can, isLoading: permsLoading } = usePermissions();

  // Branch on loading FIRST so a permitted user never sees the no-access panel
  // flash while permissions resolve.
  if (permsLoading) return <LoadingState />;

  const canManage = can('improvement.board.manage');
  const canView = can('improvement.ideas.view');
  // The officers who act on a department playbook from this page — assigning role
  // holders is an institution-wide action held under its own permission, separate
  // from managing the board. Without them the page was reachable only because
  // improvement.board.manage happens to be granted to the CAO and the Executive
  // Administrative Officers, and neither is a board manager: revoking it for the
  // right reason would lock all three out of the page they are meant to use.
  //
  // improvement.area_policy.approve is registered and granted by PR #2598 (department
  // policy as a fourth artifact). Naming it here is deliberate: this is an OR, so
  // until that lands the clause is simply false and nobody's access changes, and once
  // it lands a policy approver reaches this page without a follow-up change here.
  const canActAsOfficer =
    can('improvement.area_role.assign') || can('improvement.area_policy.approve');

  if (!canView && !canManage && !canActAsOfficer) return <NoAccessPanel />;

  // A board manager / MBA Faculty sees a department PICKER — they can read ANY
  // department's analytics (financial views included), because the delivery RPC
  // bypasses the posting gate and returns money views for managers. An MBA
  // Associate without manage rights keeps the "my assigned departments" view.
  //
  // An officer must land here too. The board below it is scoped to the viewer's own
  // MBA postings, and an officer has none — widening only the gate above would let
  // them in and then show them an empty page.
  if (canManage || canActAsOfficer) return <ManagerAnalyticsBoard />;

  return <AnalyticsBoard userId={userId} />;
}

function AnalyticsBoard({ userId }: AnalyticsClientProps) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<AreaAnalytics[]>([]);
  const [gap, setGap] = useState<GapDialogState>({ open: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // "My" postings: RLS already scopes an associate to their own rows, but
        // we filter by userId too so a manager opening this page still sees only
        // the departments they personally cover.
        const postings = await MbaAnalystService.listPostings();
        const mine = postings.filter((p) => p.associate_user_id === userId);

        // De-duplicate by area (an associate holds one posting per area, but be
        // defensive) and keep a stable order by label.
        const byArea = new Map<string, string>();
        for (const p of mine) {
          if (!byArea.has(p.area_id)) {
            byArea.set(p.area_id, p.area_label ?? 'Department');
          }
        }
        const areaEntries = Array.from(byArea.entries()).sort((a, b) =>
          a[1].localeCompare(b[1])
        );

        const resolved = await Promise.all(
          areaEntries.map(async ([areaId, areaLabel]): Promise<AreaAnalytics> => {
            try {
              const result = await MbaAnalystService.getAnalystViews(areaId);
              return { areaId, areaLabel, views: result.views, error: false };
            } catch {
              return { areaId, areaLabel, views: [], error: true };
            }
          })
        );

        if (alive) setSections(resolved);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Improvement Board
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="text-primary h-6 w-6" />
          My Department Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Read-only analytics for the department(s) you cover as an MBA
          Associate. Figures are de-identified and small groups are hidden to
          protect privacy.
        </p>
      </div>

      {/* Phase-3 measurement: the Associate's own data-gap track record. */}
      <DataGapImpactCard userId={userId} />

      {/* Not posted to any department */}
      {sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No department assigned yet</p>
              <p className="text-muted-foreground text-sm">
                Once a manager assigns you to a department, its analytics will
                show up here. Missing something you expected to analyse? Report a
                data gap and a manager will review it.
              </p>
            </div>
            <ReportGapButton onClick={() => setGap({ open: true })} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.areaId} className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="text-muted-foreground h-5 w-5" />
                <h2 className="text-lg font-semibold">{section.areaLabel}</h2>
                {section.views.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {section.views.length}{' '}
                    {section.views.length === 1 ? 'view' : 'views'}
                  </Badge>
                )}
              </div>

              {/* Playbook first: the analytics tables below can run to thousands
                  of rows, so the department's playbook sits above them. */}
              <DeptPlaybookPanel
                areaId={section.areaId}
                areaLabel={section.areaLabel}
                canManage={false}
              />

              {section.error ? (
                <Card>
                  <CardContent className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Couldn&apos;t load analytics for this department. Please try
                    again shortly.
                  </CardContent>
                </Card>
              ) : section.views.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <Inbox className="text-muted-foreground/50 h-8 w-8" />
                    <p className="text-muted-foreground text-sm">
                      No analyst data for this department yet.
                    </p>
                    <ReportGapButton
                      onClick={() =>
                        setGap({
                          open: true,
                          areaId: section.areaId,
                          areaLabel: section.areaLabel
                        })
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {section.views.map((view) => (
                    <ViewCard key={view.view_name} view={view} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <ReportDataGapDialog
        open={gap.open}
        onOpenChange={(o) => setGap((g) => ({ ...g, open: o }))}
        areaId={gap.areaId}
        areaLabel={gap.areaLabel}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Manager / MBA Faculty view — department picker (any department)            */
/* -------------------------------------------------------------------------- */

/**
 * For a board manager / MBA Faculty (improvement.board.manage): a picker over
 * ALL departments. On selection, the delivery RPC returns that department's
 * de-identified, k≥5-suppressed views — financial views included, because the
 * RPC bypasses the posting gate for managers. This does NOT change the RPC; it
 * only lets a manager choose which department to read.
 */
function ManagerAnalyticsBoard() {
  const [areas, setAreas] = useState<ImprovementArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [views, setViews] = useState<MbaAnalystView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError] = useState(false);
  const [gap, setGap] = useState<GapDialogState>({ open: false });

  // Load the department list once.
  useEffect(() => {
    let alive = true;
    (async () => {
      setAreasLoading(true);
      try {
        const list = await ImprovementService.listAreas();
        if (alive) setAreas(list);
      } finally {
        if (alive) setAreasLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Fetch analytics whenever the selected department changes.
  useEffect(() => {
    if (!selectedAreaId) {
      setViews([]);
      setViewsError(false);
      return;
    }
    let alive = true;
    (async () => {
      setViewsLoading(true);
      setViewsError(false);
      try {
        const result = await MbaAnalystService.getAnalystViews(selectedAreaId);
        if (alive) setViews(result.views);
      } catch {
        if (alive) {
          setViews([]);
          setViewsError(true);
        }
      } finally {
        if (alive) setViewsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedAreaId]);

  const selectedLabel = useMemo(
    () => areas.find((a) => a.id === selectedAreaId)?.label ?? null,
    [areas, selectedAreaId]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/improvement-board">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Improvement Board
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="text-primary h-6 w-6" />
          Department Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Pick a department to read its analytics. Figures are de-identified and
          small groups are hidden to protect privacy. As a manager you can read
          every department, financial views included.
        </p>
      </div>

      {/* Department picker */}
      <div className="max-w-sm">
        {areasLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : areas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No departments are available to read yet.
          </p>
        ) : (
          <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
            <SelectTrigger>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                <SelectValue placeholder="Choose a department…" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Playbook first: the analytics tables below can run to thousands of
          rows, so the playbook sits above them. Still gated on a chosen
          department — nothing shows until one is picked. */}
      {selectedAreaId && (
        <DeptPlaybookPanel
          areaId={selectedAreaId}
          areaLabel={selectedLabel ?? 'Department'}
          canManage
        />
      )}

      {/* Results */}
      {!selectedAreaId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">Choose a department to begin</p>
              <p className="text-muted-foreground text-sm">
                Its de-identified analytics will show up here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : viewsError ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Couldn&apos;t load analytics for this department. Please try again
            shortly.
          </CardContent>
        </Card>
      ) : views.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Inbox className="text-muted-foreground/50 h-8 w-8" />
            <p className="text-muted-foreground text-sm">
              No analyst data for {selectedLabel ?? 'this department'} yet.
            </p>
            <ReportGapButton
              onClick={() =>
                setGap({
                  open: true,
                  areaId: selectedAreaId,
                  areaLabel: selectedLabel ?? undefined
                })
              }
            />
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="text-muted-foreground h-5 w-5" />
            <h2 className="text-lg font-semibold">{selectedLabel}</h2>
            <Badge variant="secondary" className="text-xs">
              {views.length} {views.length === 1 ? 'view' : 'views'}
            </Badge>
          </div>
          <div className="grid gap-4">
            {views.map((view) => (
              <ViewCard key={view.view_name} view={view} />
            ))}
          </div>
        </section>
      )}

      <ReportDataGapDialog
        open={gap.open}
        onOpenChange={(o) => setGap((g) => ({ ...g, open: o }))}
        areaId={gap.areaId}
        areaLabel={gap.areaLabel}
      />
    </div>
  );
}
