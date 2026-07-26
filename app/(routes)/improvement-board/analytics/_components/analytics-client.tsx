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
  AlertTriangle
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  MbaAnalystService,
  type MbaAnalystView
} from '@/lib/services/mba-analyst/mba-analyst-service';

interface AnalyticsClientProps {
  userId: string;
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

  // Branch on loading FIRST so a permitted associate never sees the no-access
  // panel flash while permissions resolve.
  if (permsLoading) return <LoadingState />;
  if (!can('improvement.ideas.view')) return <NoAccessPanel />;

  return <AnalyticsBoard userId={userId} />;
}

function AnalyticsBoard({ userId }: AnalyticsClientProps) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<AreaAnalytics[]>([]);

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

      {/* Not posted to any department */}
      {sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No department assigned yet</p>
              <p className="text-muted-foreground text-sm">
                Once a manager assigns you to a department, its analytics will
                show up here.
              </p>
            </div>
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
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <Inbox className="text-muted-foreground/50 h-8 w-8" />
                    <p className="text-muted-foreground text-sm">
                      No analyst data for this department yet.
                    </p>
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
    </div>
  );
}
