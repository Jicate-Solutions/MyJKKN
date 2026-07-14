'use client';

// app/(routes)/audit/cycles/[id]/parameters/page.tsx
// Cycle-scoped parameter sheet — the auditor's main working surface.
//
// Parameters are grouped into framework LANES derived from the parameter code
// (Accreditation G1–G4 · Culture/CARRE C/A/R/RS/E · Loop Health), each with its
// own coverage meter. Grouping keys off `code`, which every snapshot carries, so
// it works for already-frozen cycles even though older snapshots dropped
// `parameter_group` / `name` — those are read-enriched from the live catalog by
// code. Per-parameter status is derived live from this cycle's findings and
// attestations. Click a row → /audit/parameters/[code].

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Lock,
  Plus,
  RefreshCw,
  BookOpen,
  FlaskConical,
  Building2,
  Scale,
  Compass,
  Hand,
  Star,
  Shield,
  Sparkles,
  RotateCw,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { useAttestationsByCycle } from '@/hooks/audit/use-audit-attestations';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { LogFindingDialog } from '../../../_components/findings/log-finding-dialog';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import { StatusPill, CoverageMeter, tally, OwnerChip } from '../../../_components/redesign/kit';
import { buildParamStatusResolver, type ParamStatus } from '../../../_components/redesign/param-status';
import { cn } from '@/lib/utils';
import type {
  AuditAttestation,
  AuditFindingView,
  AuditParameterCatalogRow,
} from '@/lib/types/audit';

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Lane taxonomy — derived from the parameter code, not parameter_group (which
// older snapshots dropped and whose type can't even represent CARRE group 5).
// ---------------------------------------------------------------------------
type LaneDef = {
  key: string;
  framework: string;
  title: string;
  standard: string;
  icon: LucideIcon;
  order: number;
};

const LANES: LaneDef[] = [
  { key: 'acc-tl', framework: 'Accreditation', title: 'Teaching & Learning', standard: 'NAAC 1 · NBA CO/PO', icon: BookOpen, order: 10 },
  { key: 'acc-res', framework: 'Accreditation', title: 'Research, Outcomes & Engagement', standard: 'NAAC 3 · NIRF', icon: FlaskConical, order: 11 },
  { key: 'acc-inf', framework: 'Accreditation', title: 'Infrastructure', standard: 'NAAC 4', icon: Building2, order: 12 },
  { key: 'acc-gov', framework: 'Accreditation', title: 'Governance', standard: 'NAAC 6', icon: Scale, order: 13 },
  { key: 'carre-c', framework: 'Culture · CARRE', title: 'Clarity', standard: 'CARRE', icon: Compass, order: 20 },
  { key: 'carre-a', framework: 'Culture · CARRE', title: 'Appreciation', standard: 'CARRE', icon: Hand, order: 21 },
  { key: 'carre-r', framework: 'Culture · CARRE', title: 'Recognition', standard: 'CARRE', icon: Star, order: 22 },
  { key: 'carre-rs', framework: 'Culture · CARRE', title: 'Respect', standard: 'CARRE', icon: Shield, order: 23 },
  { key: 'carre-e', framework: 'Culture · CARRE', title: 'Empowerment', standard: 'CARRE', icon: Sparkles, order: 24 },
  { key: 'loop', framework: 'Loop Health', title: 'Self-improving loops', standard: 'NAAC 7.3 · runs automatically', icon: RotateCw, order: 30 },
  { key: 'exam', framework: 'Exam Integrity', title: 'Internal-assessment audit', standard: 'NAAC 2.5 · runs automatically', icon: ClipboardCheck, order: 31 },
  { key: 'other', framework: 'Other', title: 'Other parameters', standard: '', icon: Info, order: 99 },
];
const LANE_BY_KEY = new Map(LANES.map((l) => [l.key, l]));

function laneKeyFor(code: string): string {
  const c = code.toUpperCase();
  if (c === 'LOOP_HEALTH') return 'loop';
  if (c === 'EXAM_IA_AUDIT') return 'exam';
  if (c.startsWith('CARRE-C')) return 'carre-c';
  if (c.startsWith('CARRE-A')) return 'carre-a';
  if (c.startsWith('CARRE-RS')) return 'carre-rs'; // must precede CARRE-R
  if (c.startsWith('CARRE-R')) return 'carre-r';
  if (c.startsWith('CARRE-E')) return 'carre-e';
  if (c.startsWith('G1')) return 'acc-tl';
  if (c.startsWith('G2')) return 'acc-res';
  if (c.startsWith('G3')) return 'acc-inf';
  if (c.startsWith('G4')) return 'acc-gov';
  return 'other';
}

// ---------------------------------------------------------------------------
// Per-parameter live status — status derivation now lives in the shared kit
// (buildParamStatusResolver / ParamStatus), so every audit surface agrees.
// ---------------------------------------------------------------------------
interface EnrichedParam {
  code: string;
  name: string;
  ownerRole: string;
  isAuto: boolean;
  evidenceCount: number;
  status: ParamStatus;
}

/**
 * Pull the parameter array from a cycle snapshot. JSONB may be `{ parameters: [...] }`
 * or a bare array. Older snapshots hold only a subset of columns (no name/group/owner).
 */
function extractSnapshotParameters(
  snapshot: Record<string, unknown> | null,
): Partial<AuditParameterCatalogRow>[] | null {
  if (!snapshot) return null;
  const p = (snapshot as { parameters?: unknown[] }).parameters;
  if (Array.isArray(p)) return p as Partial<AuditParameterCatalogRow>[];
  if (Array.isArray(snapshot as unknown)) return snapshot as unknown as Partial<AuditParameterCatalogRow>[];
  return null;
}

export default function CycleParametersPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);
  // Parameter the per-row "Log finding" action pre-fills in the dialog.
  const [logParamCode, setLogParamCode] = useState<string | undefined>(undefined);
  const { canPerformAll } = usePermissions([], { waitForLoad: true });
  const canLog = canPerformAll('audit', ['finding.log']);

  const { data: cycle, isLoading: cycleLoading, error: cycleError, refetch } = useAuditCycle(id);
  const { data: systemParams = [], isLoading: systemLoading } = useSystemParameters();
  const { data: findings = [] } = useFindingsByCycle(id);
  const { data: attestations = [] } = useAttestationsByCycle(id);
  const { institutions: accessibleInstitutions } = useInstitutionsWithAccess();

  const snapshotParams = useMemo(
    () => extractSnapshotParameters(cycle?.parameter_catalog_snapshot ?? null),
    [cycle?.parameter_catalog_snapshot],
  );
  const isSnapshot = snapshotParams !== null && snapshotParams.length > 0;

  // Routing rule (Director decision): a STANDING cycle shows ONLY org-wide params
  // (institution-wide checks audited once for the whole institution); every normal
  // per-college cycle EXCLUDES them. Missing is_org_wide on older frozen snapshots
  // counts as false — so it stays in a normal cycle, and is read-enriched from the
  // live catalog when routing a standing cycle.
  const isStanding = Boolean(cycle?.is_standing);

  // Live catalog indexed by code — the read-enrichment source for frozen snapshots
  // that predate the freeze fix (they lack name / owner / discovery flag).
  const liveByCode = useMemo(() => {
    const m = new Map<string, AuditParameterCatalogRow>();
    for (const p of systemParams) if (!m.has(p.code)) m.set(p.code, p);
    return m;
  }, [systemParams]);

  // In-scope institutions form the denominator for the "cleared" rule: a
  // parameter clears only when EVERY in-scope institution has attested it. Use
  // the cycle's explicit institution scope when set; a NULL/empty scope means
  // "all institutions the viewer can access" (mirrors the attestations grid).
  const institutionIds = useMemo(() => {
    const scopeIds = cycle?.institution_ids;
    if (scopeIds && scopeIds.length > 0) return scopeIds;
    return accessibleInstitutions.map((i) => i.id);
  }, [cycle?.institution_ids, accessibleInstitutions]);

  // Per-parameter live status — derived by the shared resolver so the "cleared"
  // rule (zero open findings anywhere AND every in-scope institution signed) is
  // identical across every audit surface.
  const statusByCode = useMemo(
    () =>
      buildParamStatusResolver(
        findings as AuditFindingView[],
        attestations as AuditAttestation[],
        institutionIds,
      ),
    [findings, attestations, institutionIds],
  );

  // Preferred source rows: frozen snapshot codes, else live catalog
  const sourceRows: Partial<AuditParameterCatalogRow>[] = isSnapshot
    ? snapshotParams!
    : systemParams;

  const lanes = useMemo(() => {
    const buckets = new Map<string, EnrichedParam[]>();
    for (const raw of sourceRows) {
      const code = raw.code;
      if (!code) continue;
      const live = liveByCode.get(code);
      // Route by cycle type: standing → keep org-wide only; normal → drop org-wide.
      const isOrgWide = Boolean(raw.is_org_wide ?? live?.is_org_wide ?? false);
      if (isStanding ? !isOrgWide : isOrgWide) continue;
      const enriched: EnrichedParam = {
        code,
        name: raw.name ?? live?.name ?? code,
        ownerRole: raw.default_owner_role ?? live?.default_owner_role ?? '',
        isAuto: Boolean(live?.discovery_query_sql),
        evidenceCount: Array.isArray(raw.evidence_required)
          ? raw.evidence_required.length
          : Array.isArray(live?.evidence_required)
            ? live!.evidence_required.length
            : 0,
        status: statusByCode(code),
      };
      const key = laneKeyFor(code);
      const arr = buckets.get(key) ?? [];
      arr.push(enriched);
      buckets.set(key, arr);
    }
    return LANES.filter((l) => (buckets.get(l.key)?.length ?? 0) > 0)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        def: l,
        params: (buckets.get(l.key) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
      }));
  }, [sourceRows, liveByCode, statusByCode, isStanding]);

  const total = useMemo(() => lanes.reduce((n, l) => n + l.params.length, 0), [lanes]);
  const loading = cycleLoading || (!isSnapshot && systemLoading);

  return (
    <PermissionGuard module="audit" action="parameter.view">
      <ContentLayout title={cycle?.name ? `${cycle.name} — Parameters` : 'Cycle Parameters'}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            { label: cycle?.name ?? 'Cycle', href: `/audit/cycles/${id}` },
            { label: 'Parameters', isCurrent: true },
          ]}
        />

        <div className="space-y-5">
          {/* Header */}
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
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    Parameter sheet{cycle?.name ? ` · ${cycle.name}` : ''}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {loading ? 'Loading parameters…' : `${total} parameters, in ${lanes.length} lanes`}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                  {isSnapshot ? (
                    <Badge
                      variant="outline"
                      className="text-xs border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    >
                      <Lock className="mr-1 h-3 w-3" />
                      Snapshot frozen
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                      Preview
                    </Badge>
                  )}
                  <PermissionGuard module="audit" action="finding.log" fallback={null}>
                    <Button size="sm" onClick={() => setLogOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Log finding
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Each lane groups parameters by the standard they serve, with its own coverage. Open a
                lane, work each parameter, and log a finding where the evidence falls short.
              </p>
              {cycle?.is_standing && (
                <div className="flex w-fit items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-800/60 dark:bg-emerald-950/30">
                  <Building2 className="h-4 w-4 flex-shrink-0 text-emerald-700 dark:text-emerald-300" />
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">
                    Institution-wide checks — audited once for the whole institution.
                  </span>
                </div>
              )}
            </div>
          )}

          {!isSnapshot && !cycleError && !cycleLoading && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs dark:border-amber-800/60 dark:bg-amber-950/30">
              <Info className="h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="text-amber-900 dark:text-amber-100">
                <p className="font-medium">Snapshot not yet frozen</p>
                <p className="text-amber-800 dark:text-amber-200">
                  Showing the live catalog as a preview. When this cycle moves from{' '}
                  <em>draft</em> to <em>in-progress</em>, the catalog is captured and locked for
                  audit integrity.
                </p>
              </div>
            </div>
          )}

          {/* Lanes */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {lanes.map((lane, i) => (
                <ParameterLane
                  key={lane.def.key}
                  def={lane.def}
                  params={lane.params}
                  defaultOpen={i === 0}
                  onRowClick={(code) =>
                    router.push(`/audit/parameters/${encodeURIComponent(code)}`)
                  }
                  onLogFinding={
                    canLog
                      ? (code) => {
                          setLogParamCode(code);
                          setLogOpen(true);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        <LogFindingDialog
          open={logOpen}
          onOpenChange={(o) => {
            setLogOpen(o);
            if (!o) setLogParamCode(undefined);
          }}
          cycleId={id}
          initialParameterCode={logParamCode}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces — StatusPill / CoverageMeter / OwnerChip now come from
// the shared redesign kit.
// ---------------------------------------------------------------------------

function ParameterLane({
  def,
  params,
  defaultOpen,
  onRowClick,
  onLogFinding,
}: {
  def: LaneDef;
  params: EnrichedParam[];
  defaultOpen: boolean;
  onRowClick: (code: string) => void;
  /** When set, each row shows a "Log" action that opens the finding dialog
   *  pre-filled with that parameter (no navigating away). Omitted when the
   *  viewer can't log findings. */
  onLogFinding?: (code: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = def.icon;
  const cleared = params.filter((p) => p.status === 'cleared').length;
  const findings = params.filter((p) => p.status === 'p1' || p.status === 'p2').length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40">
            <ChevronRight
              className={cn('h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
            />
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{def.title}</div>
              <div className="text-xs text-muted-foreground">
                {def.standard ? `${def.standard} · ` : ''}
                {params.length} parameter{params.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="ml-auto hidden w-48 flex-shrink-0 sm:block">
              <div className="mb-1.5 flex justify-between text-[11px] font-medium text-muted-foreground">
                <span>
                  {cleared} cleared
                  {findings ? ` · ${findings} finding${findings === 1 ? '' : 's'}` : ''}
                </span>
                <span className="font-mono">{params.length}</span>
              </div>
              <CoverageMeter t={tally(params.map((p) => p.status))} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-32 px-4 py-2.5 text-left font-semibold">Code</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Parameter</th>
                  <th className="w-40 px-4 py-2.5 text-left font-semibold">Owner</th>
                  <th className="w-40 px-4 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr
                    key={p.code}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                    onClick={() => onRowClick(p.code)}
                  >
                    <td className="px-4 py-3 align-middle">
                      <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {p.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="font-medium">{p.name}</span>
                      {p.isAuto && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          Auto
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <OwnerChip role={p.ownerRole} />
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <StatusPill status={p.status} />
                        {onLogFinding && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLogFinding(p.code);
                            }}
                            title={`Log a finding on ${p.code}`}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Log
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
