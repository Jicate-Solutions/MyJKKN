'use client';

// app/(routes)/audit/cycles/[id]/attestations/page.tsx
// Cycle-scoped attestation surface — "Sign the record".
//   rows  = parameter_code (from snapshot / system catalog)
//   cols  = institutions in the cycle's scope
//   cells = attestation state → click opens a Dialog with sign + cosign actions
//
// Redesigned onto the shared audit "instrument of record" kit: an eyebrow +
// "Sign the record" title, a signed-progress meter, a brass "Attested" seal for
// every signed cell, and a full "Cycle sealed" banner once every parameter is
// signed across every institution in scope.
//
// Two Director business rules (2026-07-14) are enforced here, not just styled:
//   1. NO SIGN-OFF WITH AN OPEN PROBLEM. A cell (parameter × institution) with an
//      open finding cannot be signed or cosigned. The block reads from the
//      attestation row's `open_findings_count` AND from this cycle's live findings
//      list (so a cell with no attestation row yet is still guarded). The Sign /
//      Cosign controls disable and point the auditor at the cycle's findings.
//   2. WORST-CASE across institutions for any cycle-wide per-parameter summary:
//      the per-parameter status pill and the signed-progress tally are computed
//      with buildParamStatusResolver — any institution with an open finding makes
//      the parameter read as a finding; "cleared" needs every in-scope institution
//      signed with zero open findings.
//
// Actions:
//   * `audit.attestation.sign`   — upsert the attestation level + notes.
//   * `audit.attestation.cosign` — add a CAO / CEO / MD-CAIO cosignature.

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  RefreshCw,
  Inbox,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PenLine,
  ExternalLink,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import {
  useAttestationsByCycle,
  useSignAttestation,
  useCosignAttestation,
} from '@/hooks/audit/use-audit-attestations';
import { useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import { AttestationStateBadge } from '../../../_components/cycles/attestation-state-badge';
import {
  SectionEyebrow,
  StatusPill,
  CoverageMeter,
  tally,
  OwnerChip,
} from '../../../_components/redesign/kit';
import { buildParamStatusResolver, isOpenFinding } from '../../../_components/redesign/param-status';
import type {
  AttestationLevel,
  AuditAttestation,
  AuditFindingView,
  AuditParameterCatalogRow,
  CosignersMap,
} from '@/lib/types/audit';

interface PageProps {
  params: Promise<{ id: string }>;
}

type CosignRole = 'cao' | 'ceo' | 'md_caio';
const COSIGN_ROLES: Array<{ value: CosignRole; label: string }> = [
  { value: 'cao', label: 'CAO' },
  { value: 'ceo', label: 'CEO' },
  { value: 'md_caio', label: 'MD / CAIO' },
];

const SIGNABLE_LEVELS: Array<{
  value: Exclude<AttestationLevel, 'pending'>;
  label: string;
}> = [
  { value: 'compliant', label: 'Compliant — meets the standard' },
  { value: 'partial', label: 'Partially compliant' },
  { value: 'non-compliant', label: 'Non-compliant' },
];

function extractSnapshotParameters(
  snapshot: Record<string, unknown> | null,
): AuditParameterCatalogRow[] | null {
  if (!snapshot) return null;
  if (Array.isArray((snapshot as { parameters?: unknown[] }).parameters)) {
    return (snapshot as { parameters: AuditParameterCatalogRow[] }).parameters;
  }
  if (Array.isArray(snapshot as unknown)) {
    return snapshot as unknown as AuditParameterCatalogRow[];
  }
  return null;
}

function isAttested(a: AuditAttestation | null): boolean {
  return !!a && a.attestation !== 'pending';
}

interface CellKey {
  parameterCode: string;
  institutionId: string;
}

interface OpenCell extends CellKey {
  attestation: AuditAttestation | null;
  parameterName: string;
  institutionName: string;
  openFindingsCount: number;
}

export default function CycleAttestationsPage({ params }: PageProps) {
  const { id } = use(params);

  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const { canPerformAll } = usePermissions([], { waitForLoad: true });
  const canSign = canPerformAll('audit', ['attestation.sign']);
  const canCosign = canPerformAll('audit', ['attestation.cosign']);

  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const {
    data: cycle,
    isLoading: cycleLoading,
    error: cycleError,
    refetch,
  } = useAuditCycle(id);

  const { data: attestations = [], isLoading: attestationsLoading } =
    useAttestationsByCycle(id);
  const { data: findings = [], isLoading: findingsLoading } =
    useFindingsByCycle(id);

  const { data: systemParams = [] } = useSystemParameters();
  const { institutions: allInstitutions, loading: institutionsLoading } =
    useInstitutionsWithAccess();

  // Row source: snapshot if frozen, else system catalog
  const snapshotParams = useMemo(
    () => extractSnapshotParameters(cycle?.parameter_catalog_snapshot ?? null),
    [cycle?.parameter_catalog_snapshot],
  );
  const parameterRows: AuditParameterCatalogRow[] = useMemo(() => {
    const src = snapshotParams ?? systemParams;
    return [...src].sort((a, b) => {
      if (a.parameter_group !== b.parameter_group) {
        return a.parameter_group - b.parameter_group;
      }
      return a.code.localeCompare(b.code);
    });
  }, [snapshotParams, systemParams]);

  // Column source: cycle institution scope, else all user-accessible
  const scopedInstitutions = useMemo(() => {
    if (!cycle) return [];
    const scopeIds = cycle.institution_ids;
    if (scopeIds && scopeIds.length > 0) {
      return allInstitutions.filter((i) => scopeIds.includes(i.id));
    }
    return allInstitutions;
  }, [cycle, allInstitutions]);

  const scopedInstitutionIds = useMemo(
    () => scopedInstitutions.map((i) => i.id),
    [scopedInstitutions],
  );

  // Index attestations by (param, institution) for O(1) lookup
  const byCell = useMemo(() => {
    const map = new Map<string, AuditAttestation>();
    for (const a of attestations) {
      map.set(`${a.parameter_code}:${a.institution_id}`, a);
    }
    return map;
  }, [attestations]);

  // Rule 1 support: live open-finding count per (param, institution) cell. This
  // guards cells that have no attestation row yet (where open_findings_count is
  // unavailable). The per-cell block is the MAX of this and the row's own count.
  const openFindingsByCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of findings as AuditFindingView[]) {
      if (!isOpenFinding(f)) continue;
      const k = `${f.parameter_code}:${f.institution_id}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [findings]);

  function openCountFor(
    a: AuditAttestation | null,
    parameterCode: string,
    institutionId: string,
  ): number {
    const live = openFindingsByCell.get(`${parameterCode}:${institutionId}`) ?? 0;
    return Math.max(a?.open_findings_count ?? 0, live);
  }

  // Rule 2: WORST-CASE per-parameter status across every in-scope institution.
  const paramStatusOf = useMemo(
    () =>
      buildParamStatusResolver(
        findings as AuditFindingView[],
        attestations,
        scopedInstitutionIds,
      ),
    [findings, attestations, scopedInstitutionIds],
  );

  const statusTally = useMemo(
    () => tally(parameterRows.map((p) => paramStatusOf(p.code))),
    [parameterRows, paramStatusOf],
  );

  const totalParams = parameterRows.length;
  const signedCount = statusTally.cleared;
  const withFindings = statusTally.p1 + statusTally.p2 + statusTally.observation;
  const pct = totalParams > 0 ? Math.round((signedCount / totalParams) * 100) : 0;
  const cycleSealed =
    cycle?.phase === 'closed' || (totalParams > 0 && signedCount === totalParams);

  const loading =
    cycleLoading || attestationsLoading || findingsLoading || institutionsLoading;

  return (
    <PermissionGuard module="audit" action="attestation.view">
      <ContentLayout
        title={cycle?.name ? `${cycle.name} — Attestations` : 'Cycle Attestations'}
      >
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            {
              label: cycle?.name ?? 'Cycle',
              href: `/audit/cycles/${id}`,
            },
            { label: 'Attestations', isCurrent: true },
          ]}
        />

        <div className="space-y-6">
          {cycleError ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-destructive">Failed to load cycle</p>
                <p className="text-xs text-muted-foreground">
                  {(cycleError as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header — eyebrow + "Sign the record" */}
              <div className="flex flex-col gap-3">
                <Link
                  href={`/audit/cycles/${id}`}
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to cycle
                </Link>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <SectionEyebrow>
                      Attestations{cycle?.name ? ` · ${cycle.name}` : ''}
                    </SectionEyebrow>
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Sign the record
                    </h1>
                  </div>
                  {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Attesting a parameter is your signature that its evidence was
                  checked at that institution. When every parameter is signed and
                  every finding closed, the cycle can be sealed.
                </p>
                {!canSign && !canCosign && (
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    Read-only view — you do not have sign or cosign permissions for
                    this audit.
                  </div>
                )}
              </div>

              {/* Cycle sealed banner — full brass seal */}
              {cycleSealed && (
                <div className="flex items-center gap-5 rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-50 via-emerald-50/40 to-transparent p-5 dark:border-amber-500/40 dark:from-amber-950/40 dark:via-emerald-950/20 dark:to-transparent">
                  <BrassSeal />
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold tracking-tight">
                      Cycle sealed
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      All {totalParams} parameter{totalParams === 1 ? '' : 's'}{' '}
                      attested across every institution in scope. This record is
                      complete and ready to archive to the accreditation evidence
                      store.
                    </p>
                  </div>
                </div>
              )}

              {/* Signed-progress card */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-[240px] space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tabular-nums leading-none">
                          {signedCount}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          of {totalParams} parameter{totalParams === 1 ? '' : 's'}{' '}
                          signed off
                        </span>
                      </div>
                      <CoverageMeter t={statusTally} className="max-w-sm" />
                      <p className="text-[11.5px] text-muted-foreground">
                        {pct}% cleared for sealing
                        {withFindings > 0 && (
                          <> · {withFindings} still carrying an open finding</>
                        )}
                      </p>
                    </div>
                    <p className="max-w-[34ch] text-right text-xs text-muted-foreground">
                      A parameter clears only when every in-scope institution has
                      signed it and no finding remains open. Click a cell to sign —
                      signing stamps the record with your name and the time.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Attestation matrix */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Attestation grid
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({parameterRows.length} parameters × {scopedInstitutions.length}{' '}
                      institutions)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : parameterRows.length === 0 ||
                    scopedInstitutions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {parameterRows.length === 0
                          ? 'No parameters available for this cycle yet.'
                          : 'No institutions in scope for this cycle.'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="sticky left-0 z-10 min-w-[260px] bg-muted/30 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Parameter
                            </th>
                            {scopedInstitutions.map((inst) => (
                              <th
                                key={inst.id}
                                className="min-w-[150px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                title={inst.name}
                              >
                                <span className="block max-w-[150px] truncate">
                                  {inst.name}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parameterRows.map((param) => {
                            const status = paramStatusOf(param.code);
                            return (
                              <tr
                                key={param.code}
                                className="border-b hover:bg-muted/20"
                              >
                                <td className="sticky left-0 z-10 bg-background px-3 py-2.5 align-top">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] text-muted-foreground">
                                        {param.code}
                                      </span>
                                      <StatusPill status={status} />
                                    </div>
                                    <span className="max-w-[240px] truncate text-xs font-medium">
                                      {param.name}
                                    </span>
                                    {param.default_owner_role && (
                                      <OwnerChip role={param.default_owner_role} />
                                    )}
                                  </div>
                                </td>
                                {scopedInstitutions.map((inst) => {
                                  const a =
                                    byCell.get(`${param.code}:${inst.id}`) ?? null;
                                  const openFindingsCount = openCountFor(
                                    a,
                                    param.code,
                                    inst.id,
                                  );
                                  return (
                                    <td
                                      key={inst.id}
                                      className="cursor-pointer px-3 py-2.5 align-top"
                                      onClick={() =>
                                        setOpenCell({
                                          parameterCode: param.code,
                                          institutionId: inst.id,
                                          attestation: a,
                                          parameterName: param.name,
                                          institutionName: inst.name,
                                          openFindingsCount,
                                        })
                                      }
                                    >
                                      <AttestationCell
                                        attestation={a}
                                        openFindingsCount={openFindingsCount}
                                        canSign={canSign}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {openCell && (
          <AttestationCellDialog
            cell={openCell}
            cycleId={id}
            userId={userId}
            canSign={canSign}
            canCosign={canCosign}
            onOpenChange={(open) => {
              if (!open) setOpenCell(null);
            }}
          />
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Brass seal — a gold/amber "sealed" element rendered entirely with Tailwind /
// CSS gradients (no external assets), used both as the per-cell "Attested" chip
// and, at full size, in the "Cycle sealed" banner.
// ---------------------------------------------------------------------------
function BrassSeal() {
  return (
    <div
      className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-center text-amber-50 shadow-md ring-1 ring-amber-700/30 bg-[radial-gradient(circle_at_34%_30%,#ecd6a0_0%,#c7a253_44%,#8a6a24_100%)]"
      role="img"
      aria-label="Sealed"
    >
      <span className="pointer-events-none absolute inset-[6px] rounded-full border border-dashed border-amber-50/50" />
      <span className="relative px-1 text-[9px] font-semibold leading-tight tracking-wide drop-shadow-sm">
        JKKN IQAC
        <span className="mt-0.5 block text-[12px] font-bold tracking-[0.14em]">
          SEALED
        </span>
      </span>
    </div>
  );
}

function AttestedSealChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/70 bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 px-2 py-0.5 text-[11px] font-semibold text-amber-900 shadow-sm dark:border-amber-500/40 dark:from-amber-800/50 dark:via-amber-700/40 dark:to-amber-900/60 dark:text-amber-100">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-white shadow-inner ring-1 ring-amber-500/40">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      Attested
    </span>
  );
}

function AttestationCell({
  attestation,
  openFindingsCount,
  canSign,
}: {
  attestation: AuditAttestation | null;
  openFindingsCount: number;
  canSign: boolean;
}) {
  const attested = isAttested(attestation);
  const cosigners = attestation?.cosigners ?? {};
  const signedRoles = Object.keys(cosigners).filter(
    (k) => (cosigners as Record<string, unknown>)[k],
  );

  // Attested → brass seal + the recorded level + any cosigners.
  if (attested && attestation) {
    return (
      <div className="flex flex-col gap-1">
        <AttestedSealChip />
        <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <AttestationStateBadge level={attestation.attestation} compact />
          {signedRoles.length > 0 && (
            <span className="font-mono uppercase">{signedRoles.join(' · ')}</span>
          )}
        </span>
      </div>
    );
  }

  // Rule 1 — open finding blocks sign-off.
  if (openFindingsCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        title="Resolve the open finding first"
      >
        <AlertTriangle className="h-3 w-3" />
        {openFindingsCount} open finding{openFindingsCount === 1 ? '' : 's'}
      </span>
    );
  }

  // Ready to sign.
  if (canSign) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-emerald-400/70 bg-emerald-50/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300">
        <PenLine className="h-3 w-3" />
        Sign
      </span>
    );
  }

  return <AttestationStateBadge level="pending" compact />;
}

function AttestationCellDialog({
  cell,
  cycleId,
  userId,
  canSign,
  canCosign,
  onOpenChange,
}: {
  cell: OpenCell;
  cycleId: string;
  userId: string;
  canSign: boolean;
  canCosign: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const signMut = useSignAttestation(userId);
  const cosignMut = useCosignAttestation(userId);

  const existing = cell.attestation;
  const blocked = cell.openFindingsCount > 0; // Rule 1
  const [level, setLevel] = useState<Exclude<AttestationLevel, 'pending'>>(
    existing && existing.attestation !== 'pending'
      ? (existing.attestation as Exclude<AttestationLevel, 'pending'>)
      : 'compliant',
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? '');
  const [cosignRole, setCosignRole] = useState<CosignRole>('cao');

  const cosignersMap = existing?.cosigners ?? {};
  const signedRoles = Object.keys(cosignersMap).filter(
    (k) => (cosignersMap as Record<string, unknown>)[k],
  );

  async function handleSign() {
    if (!userId) {
      toast.error('You must be signed in to sign.');
      return;
    }
    if (blocked) {
      toast.error('Resolve the open finding before signing.');
      return;
    }
    try {
      await signMut.mutateAsync({
        audit_cycle_id: cycleId,
        parameter_code: cell.parameterCode,
        institution_id: cell.institutionId,
        attestation: level,
        notes: notes || undefined,
        expected_updated_at: existing?.updated_at,
      });
      toast.success('Attestation saved.');
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to sign: ${getErrorMessage(err)}`);
    }
  }

  async function handleCosign() {
    if (!existing) {
      toast.error('No attestation row exists yet — sign first.');
      return;
    }
    if (blocked) {
      toast.error('Resolve the open finding before cosigning.');
      return;
    }
    try {
      await cosignMut.mutateAsync({
        attestation_id: existing.id,
        role: cosignRole,
        expected_updated_at: existing.updated_at,
      });
      toast.success('Cosignature added.');
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to cosign: ${getErrorMessage(err)}`);
    }
  }

  const submittingSign = signMut.isPending;
  const submittingCosign = cosignMut.isPending;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            <span className="font-mono text-xs text-muted-foreground">
              {cell.parameterCode}
            </span>
            <span className="ml-2">{cell.parameterName}</span>
          </DialogTitle>
          <DialogDescription>
            Institution: <strong>{cell.institutionName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule 1 — open-finding block */}
          {blocked && (
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Resolve the open finding first</p>
                <p>
                  This parameter has {cell.openFindingsCount} open finding
                  {cell.openFindingsCount === 1 ? '' : 's'} at this institution.
                  Sign-off and cosign are blocked until it is closed.
                </p>
                <Link
                  href={`/audit/cycles/${cycleId}/findings`}
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
                >
                  Go to findings
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {existing ? (
            <div className="space-y-1 rounded-md border p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Current state:</span>
                <AttestationStateBadge level={existing.attestation} />
                {isAttested(existing) && <AttestedSealChip />}
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                <span>
                  Evidence: <strong>{existing.evidence_count}</strong>
                </span>
                <span>·</span>
                <span>
                  Open findings:{' '}
                  <strong>{existing.open_findings_count}</strong>
                </span>
              </div>
              {signedRoles.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Cosigned by:</span>
                  <div className="flex flex-wrap gap-1">
                    {signedRoles.map((r) => (
                      <Badge key={r} variant="outline" className="text-[10px]">
                        <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                        {r.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No attestation yet. {blocked ? 'Close the finding, then sign.' : 'Sign below to create one.'}
            </div>
          )}

          {canSign && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-xs font-medium">Sign / update attestation</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="sign-level" className="text-xs">
                    Level
                  </Label>
                  <Select
                    value={level}
                    onValueChange={(v) =>
                      setLevel(v as Exclude<AttestationLevel, 'pending'>)
                    }
                    disabled={blocked}
                  >
                    <SelectTrigger id="sign-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNABLE_LEVELS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="sign-notes" className="text-xs">
                  Notes (optional)
                </Label>
                <Textarea
                  id="sign-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Context about evidence reviewed, compensating controls, etc."
                  disabled={blocked}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSign} disabled={submittingSign || blocked}>
                  {submittingSign ? 'Saving…' : existing ? 'Update' : 'Sign & stamp'}
                </Button>
                {blocked && (
                  <span className="text-[11px] text-muted-foreground">
                    Resolve the open finding first.
                  </span>
                )}
              </div>
            </div>
          )}

          {canCosign && existing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-xs font-medium">Add cosignature</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cosign-role" className="text-xs">
                    Role
                  </Label>
                  <Select
                    value={cosignRole}
                    onValueChange={(v) => setCosignRole(v as CosignRole)}
                    disabled={blocked}
                  >
                    <SelectTrigger id="cosign-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COSIGN_ROLES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCosign}
                disabled={submittingCosign || blocked}
              >
                {submittingCosign ? 'Saving…' : 'Cosign'}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
