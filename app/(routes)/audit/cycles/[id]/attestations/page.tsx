'use client';

// app/(routes)/audit/cycles/[id]/attestations/page.tsx
// Cycle-scoped attestation grid:
//   rows = parameter_code (from snapshot / system catalog)
//   cols = institutions in the cycle's scope
//   cells = attestation state badge + click opens a dialog with cosign actions
//
// Actions:
//   * Users with `audit.attestation.sign` can upsert the attestation level
//     and leave notes. For NAAC/NBA-mapped parameters the DB CHECK backstops
//     final attestation requiring CAO + CEO cosignatures.
//   * Users with `audit.attestation.cosign` can add their cosignature (CAO /
//     CEO / MD-CAIO) to an existing attestation row.

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
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import {
  useAttestationsByCycle,
  useSignAttestation,
  useCosignAttestation,
} from '@/hooks/audit/use-audit-attestations';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import { AttestationStateBadge } from '../../../_components/cycles/attestation-state-badge';
import type {
  AttestationLevel,
  AuditAttestation,
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
  { value: 'compliant', label: 'Compliant' },
  { value: 'partial', label: 'Partial' },
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

interface CellKey {
  parameterCode: string;
  institutionId: string;
}

interface OpenCell extends CellKey {
  attestation: AuditAttestation | null;
  parameterName: string;
  institutionName: string;
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

  // Index attestations by (param, institution) for O(1) lookup
  const byCell = useMemo(() => {
    const map = new Map<string, AuditAttestation>();
    for (const a of attestations) {
      map.set(`${a.parameter_code}:${a.institution_id}`, a);
    }
    return map;
  }, [attestations]);

  const loading =
    cycleLoading || attestationsLoading || institutionsLoading;

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
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/audit/cycles/${id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to cycle
                  </Link>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-semibold tracking-tight">
                      {cycleLoading
                        ? 'Loading cycle…'
                        : cycle?.name ?? 'Cycle attestations'}
                    </h1>
                    {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Grid of parameter × institution attestations. Click any cell
                    to sign or cosign.
                  </p>
                  {!canSign && !canCosign && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <AlertCircle className="h-3 w-3" />
                      Read-only view — you do not have sign or cosign permissions
                      for this audit.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Attestation grid
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({parameterRows.length} parameters × {scopedInstitutions.length} institutions)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : parameterRows.length === 0 || scopedInstitutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {parameterRows.length === 0
                      ? 'No parameters available for this cycle yet.'
                      : 'No institutions in scope for this cycle.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left font-medium px-3 py-2 sticky left-0 bg-muted/30 min-w-[220px]">
                          Parameter
                        </th>
                        {scopedInstitutions.map((inst) => (
                          <th
                            key={inst.id}
                            className="text-left font-medium px-3 py-2 min-w-[150px]"
                            title={inst.name}
                          >
                            <span className="truncate block max-w-[150px]">
                              {inst.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parameterRows.map((param) => (
                        <tr key={param.code} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 sticky left-0 bg-background">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{param.code}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                                {param.name}
                              </span>
                            </div>
                          </td>
                          {scopedInstitutions.map((inst) => {
                            const a =
                              byCell.get(`${param.code}:${inst.id}`) ?? null;
                            const level: AttestationLevel =
                              a?.attestation ?? 'pending';
                            return (
                              <td
                                key={inst.id}
                                className="px-3 py-2 cursor-pointer"
                                onClick={() =>
                                  setOpenCell({
                                    parameterCode: param.code,
                                    institutionId: inst.id,
                                    attestation: a,
                                    parameterName: param.name,
                                    institutionName: inst.name,
                                  })
                                }
                              >
                                <AttestationCell
                                  level={level}
                                  cosigners={a?.cosigners ?? {}}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
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

function AttestationCell({
  level,
  cosigners,
}: {
  level: AttestationLevel;
  cosigners: CosignersMap;
}) {
  const signedRoles = Object.keys(cosigners).filter(
    (k) => (cosigners as Record<string, unknown>)[k],
  );
  return (
    <div className="flex flex-col gap-1">
      <AttestationStateBadge level={level} compact />
      {signedRoles.length > 0 && (
        <span className="text-[10px] text-muted-foreground font-mono uppercase">
          {signedRoles.join(' · ')}
        </span>
      )}
    </div>
  );
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
      toast.error(
        `Failed to sign: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function handleCosign() {
    if (!existing) {
      toast.error('No attestation row exists yet — sign first.');
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
      toast.error(
        `Failed to cosign: ${err instanceof Error ? err.message : String(err)}`,
      );
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
          {existing ? (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Current state:</span>
                <AttestationStateBadge level={existing.attestation} />
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
                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                        {r.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No attestation yet. Sign below to create one.
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
                />
              </div>
              <Button
                size="sm"
                onClick={handleSign}
                disabled={submittingSign}
              >
                {submittingSign ? 'Saving…' : existing ? 'Update' : 'Sign'}
              </Button>
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
                disabled={submittingCosign}
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
