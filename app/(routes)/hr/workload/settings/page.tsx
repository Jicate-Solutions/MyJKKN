'use client';

/**
 * Workload Settings — per-institution expected weekly teaching hours and the
 * amber / red bands (Director decision 2026-09-12).
 *
 * One row per institution; each saves on its own. Whether the viewer may be
 * here is decided by the API (HR Admin or Super Admin): a 403 is shown as an
 * explicit "You don't have access" card, never a redirect, so a wrong role or a
 * typo'd link is diagnosable from the screen.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Save, Settings2, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  WorkloadSettingsRequestError,
  useSaveWorkloadSettings,
  useWorkloadSettings,
} from '@/hooks/hr/recruitment-need/use-workload-settings';
import {
  validateWorkloadSettings,
  type InstitutionWorkloadSettings,
} from '@/lib/services/hr/recruitment-need/workload-settings-service';

interface RowDraft {
  expected_weekly_hours: string;
  amber_pct: string;
  red_pct: string;
}

function draftFrom(row: InstitutionWorkloadSettings): RowDraft {
  return {
    expected_weekly_hours: row.expected_weekly_hours === null ? '' : String(row.expected_weekly_hours),
    amber_pct: row.amber_pct === null ? '' : String(row.amber_pct),
    red_pct: row.red_pct === null ? '' : String(row.red_pct),
  };
}

function sameDraft(a: RowDraft, b: RowDraft) {
  return a.expected_weekly_hours === b.expected_weekly_hours && a.amber_pct === b.amber_pct && a.red_pct === b.red_pct;
}

export default function WorkloadSettingsPage() {
  const { data: rows, isLoading, error } = useWorkloadSettings();
  const saveMut = useSaveWorkloadSettings();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  // What the server holds, as last seen — a row is "dirty" against this, and a
  // successful save moves it forward without waiting for the refetch.
  const [baseline, setBaseline] = useState<Record<string, RowDraft>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!rows) return;
    const fresh = Object.fromEntries(rows.map((r) => [r.institution_id, draftFrom(r)]));
    setBaseline(fresh);
    setDrafts(fresh);
  }, [rows]);

  function edit(id: string, field: keyof RowDraft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setSaved((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function save(row: InstitutionWorkloadSettings) {
    const draft = drafts[row.institution_id];
    const parsed = validateWorkloadSettings(draft);
    if (!parsed.ok) {
      setRowErrors((prev) => ({ ...prev, [row.institution_id]: parsed.error }));
      return;
    }
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[row.institution_id];
      return next;
    });
    setSavingId(row.institution_id);
    try {
      await saveMut.mutateAsync({ institution_id: row.institution_id, ...parsed.value });
      const savedDraft = draftFrom({ ...row, ...parsed.value });
      setBaseline((prev) => ({ ...prev, [row.institution_id]: savedDraft }));
      setDrafts((prev) => ({ ...prev, [row.institution_id]: savedDraft }));
      setSaved((prev) => ({ ...prev, [row.institution_id]: 'Saved' }));
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [row.institution_id]: err instanceof Error ? err.message : 'Could not save',
      }));
    } finally {
      setSavingId(null);
    }
  }

  const denied = error instanceof WorkloadSettingsRequestError && (error.status === 403 || error.status === 401);

  return (
    <ContentLayout title="Workload Settings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/workload">Workload</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" /> Workload Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each institution sets its own expected weekly teaching hours. A Senior Learner is
            green up to the amber percentage of that figure, amber up to the red percentage,
            and red above it. Institutions with no figure show as &quot;not set&quot; on the
            calendar Workload tab.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : denied ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-start gap-3 text-sm text-red-900">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">You don&apos;t have access</p>
                <p className="mt-1">{error.message}</p>
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-start gap-3 text-sm text-red-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p>Could not load workload settings: {error.message}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead className="text-right w-[170px]">Expected hours / week</TableHead>
                    <TableHead className="text-right w-[120px]">Amber at %</TableHead>
                    <TableHead className="text-right w-[120px]">Red at %</TableHead>
                    <TableHead className="w-[220px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No institutions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (rows ?? []).map((row) => {
                      const draft = drafts[row.institution_id] ?? draftFrom(row);
                      const dirty = !sameDraft(draft, baseline[row.institution_id] ?? draftFrom(row));
                      const rowError = rowErrors[row.institution_id];
                      const isSaving = savingId === row.institution_id;
                      return (
                        <TableRow key={row.institution_id} data-testid={`workload-settings-row-${row.institution_id}`}>
                          <TableCell className="font-medium text-sm">
                            {row.institution_name}
                            {row.expected_weekly_hours === null && (
                              <span className="ml-2 text-xs text-muted-foreground">not set</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              aria-label={`Expected weekly hours for ${row.institution_name}`}
                              className="w-24 h-8 text-right ml-auto"
                              value={draft.expected_weekly_hours}
                              placeholder="e.g. 16"
                              onChange={(e) => edit(row.institution_id, 'expected_weekly_hours', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`Amber percentage for ${row.institution_name}`}
                              className="w-20 h-8 text-right ml-auto"
                              value={draft.amber_pct}
                              placeholder="100"
                              onChange={(e) => edit(row.institution_id, 'amber_pct', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`Red percentage for ${row.institution_name}`}
                              className="w-20 h-8 text-right ml-auto"
                              value={draft.red_pct}
                              placeholder="120"
                              onChange={(e) => edit(row.institution_id, 'red_pct', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 justify-end">
                              {rowError ? (
                                <span className="text-xs text-red-600 flex items-center gap-1" role="alert">
                                  <AlertTriangle className="h-3.5 w-3.5" /> {rowError}
                                </span>
                              ) : saved[row.institution_id] && !dirty ? (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                                </span>
                              ) : null}
                              <Button
                                size="sm"
                                disabled={!dirty || isSaving}
                                onClick={() => save(row)}
                                aria-label={`Save ${row.institution_name}`}
                              >
                                {isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                                Save
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
