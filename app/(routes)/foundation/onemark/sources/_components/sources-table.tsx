'use client';

// OneMark — the question-source list, with what each source is actually
// carrying.
//
// The counts are the point of this screen. "Retire this one" is a decision
// nobody can make without knowing whether it holds four questions or four
// hundred, and whether those questions are live or still drafts. So each row
// carries both numbers, and the questions with NO source recorded get their own
// line above the table — with 126 questions and no origin on any of them
// (production, 2026-09-07), that line is the honest headline.
//
// Retiring is a switch, not a delete, and the screen says so where the delete
// button would have been.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Info, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  DELETE_REFUSED_MESSAGE,
  type OneMarkSourceRow,
  type OneMarkSourceWithCounts,
} from '@/lib/services/onemark/sources-service';
import { SourceChips } from './source-chips';
import { SourceFormDialog } from './source-form-dialog';
import { useOneMarkSources, useUpdateSource } from '../_lib/use-sources';

function hasCounts(row: OneMarkSourceRow | OneMarkSourceWithCounts): row is OneMarkSourceWithCounts {
  return typeof (row as OneMarkSourceWithCounts).items_total === 'number';
}

export function SourcesTable() {
  const { data, isLoading, error } = useOneMarkSources({ withCounts: true });
  const update = useUpdateSource();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OneMarkSourceRow | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

  const rows = useMemo(() => data?.sources ?? [], [data]);
  const existingKeys = useMemo(() => rows.map((r) => r.key), [rows]);
  const unrecorded = data?.unrecorded ?? { total: 0, active: 0 };

  async function toggleActive(row: OneMarkSourceRow, next: boolean) {
    try {
      await update.mutateAsync({ key: row.key, is_active: next });
      toast.success(
        next
          ? `"${row.label}" is back in the pickers.`
          : `"${row.label}" is retired. It has left the pickers and stayed on its questions.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be changed.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">The source list could not be read</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : 'Unknown problem.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Where our questions come from</CardTitle>
            <CardDescription>
              {rows.length} source{rows.length === 1 ? '' : 's'}, {rows.filter((r) => r.is_active).length} in
              use. A source is switched off, never deleted.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add source
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {unrecorded.total > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                <strong>{unrecorded.total.toLocaleString()}</strong> question
                {unrecorded.total === 1 ? '' : 's'} in the bank ({unrecorded.active.toLocaleString()} live) have no
                origin recorded. They are counted as their own row in the evidence screen and are never hidden —
                but until somebody fills the origin in, no source can be judged against them.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-28 text-right">Live</TableHead>
                  <TableHead className="w-28 text-right">All</TableHead>
                  <TableHead className="w-24 text-center">Position</TableHead>
                  <TableHead className="w-28 text-center">In use</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No sources yet. Add the first one.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.key} className={cn(!row.is_active && 'opacity-60')}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.label}</span>
                          {row.is_system ? (
                            <Badge variant="outline" className="text-[10px]">
                              built in
                            </Badge>
                          ) : null}
                          {!row.is_active ? (
                            <Badge variant="secondary" className="text-[10px]">
                              retired
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1 py-0.5">{row.key}</code>
                          {row.description ? ` — ${row.description}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasCounts(row) ? row.items_active.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasCounts(row) ? row.items_total.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.sort_order}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={row.is_active}
                          disabled={row.is_system || update.isPending}
                          aria-label={`Use ${row.label} in the pickers`}
                          onCheckedChange={(v) => toggleActive(row, v === true)}
                        />
                        {row.is_system ? (
                          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                            written by name
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${row.label}`}
                          onClick={() => {
                            setEditing(row);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{DELETE_REFUSED_MESSAGE}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What a learner sees</CardTitle>
          <CardDescription>
            The same chips appear on the practice card and in vault review. Retired sources are gone from here the
            moment they are switched off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourceChips sources={rows} value={preview} onChange={setPreview} label={null} />
        </CardContent>
      </Card>

      <SourceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        existingKeys={existingKeys}
      />
    </div>
  );
}
