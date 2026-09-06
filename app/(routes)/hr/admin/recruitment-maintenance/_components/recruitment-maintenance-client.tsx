'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Types — these mirror fn_backfill_empty_recruitment_chains return shape.
// Names are kept English-friendly because the table renders them directly.
// ---------------------------------------------------------------------------

interface BackfillDetail {
  candidate_id: string;
  candidate_name: string | null;
  role_category: string | null;
  salary_band: string | null;
  matched_flow_name: string | null;
  would_set_chain: unknown | null;
  chain_step_count: number | null;
}

interface BackfillResult {
  dry_run: boolean;
  scanned: number;
  backfilled: number;
  no_match: number;
  details: BackfillDetail[];
}

interface OrgRow {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleCategoryLabel(key: string | null): string {
  if (!key) return '—';
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function salaryBandLabel(key: string | null): string {
  if (!key) return 'Not specified';
  switch (key) {
    case 'under_50k':
      return 'Under ₹50k/month';
    case '50k_to_1L':
      return '₹50k–₹1L/month';
    case 'over_1L':
      return 'Over ₹1L/month';
    default:
      return key;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecruitmentMaintenanceClient() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [dryRunResult, setDryRunResult] = useState<BackfillResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Org picker — pull from hr_organizations.
  const orgsQuery = useQuery({
    queryKey: ['recruitment-maintenance', 'orgs'],
    queryFn: async (): Promise<OrgRow[]> => {
      const { data, error } = await supabase
        .from('hr_organizations')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrgRow[];
    },
  });

  // Live count of empty-chain pending candidates (refetched after apply).
  const emptyCountQuery = useQuery({
    queryKey: ['recruitment-maintenance', 'empty-count', selectedOrgId],
    enabled: !!selectedOrgId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('hr_recruitment_candidates')
        .select('id', { head: true, count: 'exact' })
        .eq('hr_organization_id', selectedOrgId)
        .in('status', ['submitted', 'pending_approval'])
        .or('approval_chain.is.null,approval_chain.eq.[]');
      if (error) throw error;
      return count ?? 0;
    },
  });

  function resetPreview() {
    setDryRunResult(null);
    setConfirmChecked(false);
  }

  async function runDryRun() {
    if (!selectedOrgId) return;
    setDryRunLoading(true);
    setDryRunResult(null);
    setConfirmChecked(false);
    try {
      const res = await fetch('/api/hr/admin/recruitment/backfill-chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr_organization_id: selectedOrgId,
          dry_run: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Dry-run failed');
        return;
      }
      setDryRunResult(json as BackfillResult);
      toast.success('Dry-run complete. Review the preview below.');
    } catch (err) {
      toast.error('Dry-run failed — network error');
    } finally {
      setDryRunLoading(false);
    }
  }

  async function applyBackfill() {
    if (!selectedOrgId || !dryRunResult || !confirmChecked) return;
    setApplyLoading(true);
    try {
      const res = await fetch('/api/hr/admin/recruitment/backfill-chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr_organization_id: selectedOrgId,
          dry_run: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Apply failed');
        return;
      }
      const applied = (json as BackfillResult).backfilled;
      toast.success(
        applied === 1
          ? '1 candidate updated.'
          : `${applied} candidates updated.`
      );
      resetPreview();
      emptyCountQuery.refetch();
    } catch (err) {
      toast.error('Apply failed — network error');
    } finally {
      setApplyLoading(false);
    }
  }

  const willBackfill = dryRunResult?.backfilled ?? 0;
  const noMatch = dryRunResult?.no_match ?? 0;
  const scanned = dryRunResult?.scanned ?? 0;

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Current status
          </CardTitle>
          <CardDescription>
            Candidates waiting for approval that have no approval chain
            assigned. These are stuck — they cannot be approved through the
            normal path until their chain is filled in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedOrgId ? (
            <p className="text-sm text-muted-foreground">
              Pick an organisation below to see the count.
            </p>
          ) : emptyCountQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Counting…</p>
          ) : emptyCountQuery.error ? (
            <p className="text-sm text-destructive">
              Could not load count. Please try again.
            </p>
          ) : (
            <p className="text-sm">
              <span className="text-2xl font-semibold">
                {emptyCountQuery.data ?? 0}
              </span>{' '}
              candidate{(emptyCountQuery.data ?? 0) === 1 ? '' : 's'} with no
              approval chain in this organisation.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            Backfill empty approval chains
          </CardTitle>
          <CardDescription>
            These candidates were submitted before the chain-builder was fully
            configured. They sit in the pending queue but can&apos;t be
            approved because they have no chain. Backfilling will assign them
            their approval chain based on their role and salary band, exactly
            as the chain-builder would have at submit time. Their existing
            data is otherwise untouched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex-1">
              <label
                htmlFor="org-picker"
                className="mb-1 block text-sm font-medium"
              >
                Organisation
              </label>
              <Select
                value={selectedOrgId}
                onValueChange={(v) => {
                  setSelectedOrgId(v);
                  resetPreview();
                }}
              >
                <SelectTrigger id="org-picker" className="w-full sm:max-w-md">
                  <SelectValue placeholder="Select an organisation" />
                </SelectTrigger>
                <SelectContent>
                  {orgsQuery.isLoading && (
                    <SelectItem value="__loading" disabled>
                      Loading…
                    </SelectItem>
                  )}
                  {orgsQuery.data?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={runDryRun}
              disabled={!selectedOrgId || dryRunLoading}
              variant="secondary"
            >
              {dryRunLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running dry-run…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run dry-run (preview what will change)
                </>
              )}
            </Button>
          </div>

          {dryRunResult && (
            <div className="space-y-4 rounded-md border bg-muted/30 p-4">
              <div className="text-sm">
                <span className="font-medium">{scanned}</span> scanned ·{' '}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {willBackfill}
                </span>{' '}
                will be backfilled ·{' '}
                <span className="font-medium text-red-700 dark:text-red-400">
                  {noMatch}
                </span>{' '}
                have no matching flow
              </div>

              {scanned === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to backfill — this organisation has no stuck
                  candidates.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Role category</TableHead>
                        <TableHead>Salary band</TableHead>
                        <TableHead>Matched flow</TableHead>
                        <TableHead>Will set chain</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRunResult.details.map((d) => {
                        const matched = !!d.matched_flow_name;
                        return (
                          <TableRow
                            key={d.candidate_id}
                            className={
                              matched
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/30'
                                : 'bg-red-50/60 dark:bg-red-950/30'
                            }
                          >
                            <TableCell className="font-medium">
                              {d.candidate_name ?? '—'}
                            </TableCell>
                            <TableCell>
                              {roleCategoryLabel(d.role_category)}
                            </TableCell>
                            <TableCell>
                              {salaryBandLabel(d.salary_band)}
                            </TableCell>
                            <TableCell>
                              {matched ? (
                                d.matched_flow_name
                              ) : (
                                <span className="text-red-700 dark:text-red-400">
                                  No matching flow — needs a new flow or a
                                  salary-band correction
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {matched && d.chain_step_count != null ? (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {d.chain_step_count}-step chain
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {willBackfill > 0 && (
                <>
                  {noMatch > 0 && (
                    <Alert variant="default">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {noMatch} candidate{noMatch === 1 ? '' : 's'} will be
                        skipped
                      </AlertTitle>
                      <AlertDescription>
                        They have no matching active flow for their role and
                        salary band. Configure a flow at HR → Policies →
                        Approval Flows, then re-run dry-run.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <Checkbox
                      id="confirm-apply"
                      checked={confirmChecked}
                      onCheckedChange={(v) => setConfirmChecked(v === true)}
                    />
                    <label
                      htmlFor="confirm-apply"
                      className="text-sm leading-tight"
                    >
                      I understand this will update {willBackfill} candidate
                      row{willBackfill === 1 ? '' : 's'} in this organisation.
                      Existing approval chains (non-empty) are not touched.
                    </label>
                  </div>

                  <Button
                    onClick={applyBackfill}
                    disabled={!confirmChecked || applyLoading}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {applyLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Apply backfill ({willBackfill} candidate
                        {willBackfill === 1 ? '' : 's'})
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
