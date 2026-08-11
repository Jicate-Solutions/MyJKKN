'use client';

// Unlinked Referrals — write-once cleanup screen.
// 39 of the 2026-27 consultant-type referrals carry referral_type='consultant'
// but referred_by_id IS NULL, so fn_generate_referral_commissions silently skips
// them (nobody is paid). This page lets an admission admin attach the correct
// education_consultant WRITE-ONCE via fn_link_referral_referrer. 12 of the 39
// already carry a lead-sync attribution — the screen warns before the admin
// links to a different agency (which would create a double-credit conflict).
// Linking records who is owed; it never pays anyone.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AlertTriangle, Link2, Loader2 } from 'lucide-react';
import {
  ReferralLinkingService,
  type UnlinkedConsultantReferral,
  type ActiveConsultantOption,
} from '@/lib/services/admission/referral-linking-service';

const YEAR = 2026;

export default function UnlinkedReferralsPage() {
  const [rows, setRows] = useState<UnlinkedConsultantReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [consultants, setConsultants] = useState<ActiveConsultantOption[]>([]);
  const [consultantsLoading, setConsultantsLoading] = useState(true);

  // per-row selected consultant id + in-flight link state, keyed by learner_profile_id
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await ReferralLinkingService.listUnlinkedConsultantReferrals(YEAR);
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Could not load unlinked referrals.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConsultantsLoading(true);
      try {
        const data = await ReferralLinkingService.listActiveConsultants();
        if (!cancelled) setConsultants(data);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Could not load consultants.');
      } finally {
        if (!cancelled) setConsultantsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const consultantOptions = useMemo(
    () => consultants.map((c) => ({ value: c.id, label: c.name })),
    [consultants],
  );

  async function handleLink(row: UnlinkedConsultantReferral) {
    const consultantId = selected[row.learner_profile_id];
    if (!consultantId) {
      toast.error('Choose a consultant first.');
      return;
    }
    setLinkingId(row.learner_profile_id);
    try {
      const res = await ReferralLinkingService.linkReferrer(row.learner_profile_id, consultantId);
      if (res.success) {
        const name = consultants.find((c) => c.id === consultantId)?.name || 'consultant';
        toast.success(
          res.had_conflicting_attribution
            ? `Linked to ${name}. Note: this learner already had a different attribution — review the conflict.`
            : `Linked to ${name}.`,
        );
        // remove the linked row + drop its selection
        setRows((prev) => prev.filter((r) => r.learner_profile_id !== row.learner_profile_id));
        setSelected((prev) => {
          const next = { ...prev };
          delete next[row.learner_profile_id];
          return next;
        });
      } else {
        toast.error(res.error || 'Could not link this referral.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not link this referral.');
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <ContentLayout title="Unlinked Referrals">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Unlinked Referrals</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              These {YEAR}–{String(YEAR + 1).slice(2)} consultant referrals have no agency attached, so
              they are skipped when commissions are generated. Attach the correct consultant to each —
              this is a one-time link and cannot be changed afterwards. Linking records who is owed; it
              never pays anyone.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Consultant referrals with no agency ({YEAR}–{String(YEAR + 1).slice(2)})</CardTitle>
              <CardDescription>
                Pick the agency that referred each learner, then press Link. A learner already attributed
                to a different agency is flagged — linking to another agency there would create a conflict.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : loadError ? (
                <div className="flex items-center gap-2 text-sm text-destructive py-6">
                  <AlertTriangle className="h-4 w-4" /> {loadError}
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No unlinked consultant referrals for {YEAR}–{String(YEAR + 1).slice(2)}. Nothing to do.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Learner</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead>Referred by (as entered)</TableHead>
                        <TableHead className="min-w-[240px]">Link to consultant</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const isLinking = linkingId === row.learner_profile_id;
                        const hasConflict = !!row.existing_attribution_consultant_id;
                        return (
                          <TableRow key={row.learner_profile_id}>
                            <TableCell className="font-medium">
                              {row.learner_name || '—'}
                              {hasConflict && (
                                <div className="mt-1">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500 text-amber-700 bg-amber-50 whitespace-normal text-xs font-normal"
                                  >
                                    <AlertTriangle className="h-3 w-3 mr-1 shrink-0" />
                                    Already attributed to {row.existing_attribution_consultant_name || 'another agency'} —
                                    linking to a different agency creates a conflict.
                                  </Badge>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{row.program_name || '—'}</TableCell>
                            <TableCell>{row.institution_name || '—'}</TableCell>
                            <TableCell>
                              {row.referred_by_name || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <SearchableSelect
                                value={selected[row.learner_profile_id] || ''}
                                onValueChange={(v) =>
                                  setSelected((prev) => ({ ...prev, [row.learner_profile_id]: v }))
                                }
                                options={consultantOptions}
                                loading={consultantsLoading}
                                placeholder="Choose consultant…"
                                searchPlaceholder="Search consultants…"
                                emptyMessage="No active consultants found."
                                className="w-full min-w-[220px]"
                                disabled={isLinking}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => handleLink(row)}
                                disabled={isLinking || !selected[row.learner_profile_id]}
                              >
                                {isLinking
                                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  : <Link2 className="h-4 w-4 mr-1" />}
                                Link
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {!loading && !loadError && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              After linking, generate commissions on the{' '}
              <Link href="/admission/consultants/referral-rates" className="text-primary underline">
                Referral Rates &amp; Payout Generation
              </Link>{' '}
              page.
            </p>
          )}
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
