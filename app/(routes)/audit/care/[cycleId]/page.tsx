// app/(routes)/audit/care/[cycleId]/page.tsx
// Culture-audit detail — owner scoring sheet + live pillar/index strip +
// second-scorer invite + post-completion results & corrective-move composer.
// Spec: specs/carre-v2-upgrade-spec-2026-07-05.md §3.
//
// FRAMEWORK-AWARE: a cycle id is exactly one framework. This page loads CARRE
// first (fn_carre_get_audit); if that returns not_found it is a v1 CARE cycle,
// so it falls back to fn_care_get_audit. Historical CARE audits render with the
// 4-pillar /80 math; CARRE audits render with the 5-pillar /100 math (incl. the
// Respect override). Owner scoring + invites dispatch to the framework-matched
// RPCs. Access is RPC-enforced (no page guard) — denials render explicitly
// (rule #27). Leadership gets a read-only sheet; only the owner scores/invites.

'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  AlertCircle,
  CalendarClock,
  Copy,
  HeartHandshake,
  Link2,
  Lock,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useCareAudit,
  useCreateCareInvite,
  useUpsertCareScore,
  useCarreAudit,
  useCreateCarreInvite,
  useUpsertCarreScore,
  useCarreItemEvidence,
  useCarreParticipantRollup,
  useCarreParticipantActivity,
  useClassroomCompare,
} from '@/hooks/audit';
import {
  CareScoreSheet,
  type LiveEvidence,
  type SheetValue,
} from '../_components/care-score-sheet';
import { CareSummaryStrip } from '../_components/care-summary-strip';
import {
  ClassroomCompareCard,
  ClassroomPillarStrip,
  ClassroomSealedCommentsCard,
} from '../_components/classroom-practice-panel';
import { CareResultsPanel } from '../_components/care-results-panel';
import { careIndex } from '@/lib/services/audit/care-scoring-service';
import { carreIndex, isClassroomCatalog } from '@/lib/services/audit/carre-scoring-service';
import { SectionEyebrow, PhaseStepper } from '../../_components/redesign/kit';
import type {
  CareAuditDetail,
  CareRpcDenial,
} from '@/lib/services/audit/care-audit-service';
import type {
  CarreAuditDetail,
  CarreRpcDenial,
} from '@/lib/services/audit/carre-audit-service';

type AnyDetail = CareAuditDetail | CarreAuditDetail;
type ScoreInput = { parameter_code: string; score: number };

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function CultureAuditDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = use(params);
  const { profile } = useAuth();

  // Load CARRE first; fall back to CARE only when CARRE says not_found.
  const carreQ = useCarreAudit(cycleId);
  const carreData = carreQ.data;
  const carreNotFound =
    !!carreData && !carreData.success && (carreData as CarreRpcDenial).reason === 'not_found';
  const careQ = useCareAudit(carreNotFound ? cycleId : undefined);
  const careData = careQ.data;

  const isCarre = !!(carreData && carreData.success);
  const framework: 'CARE' | 'CARRE' = isCarre ? 'CARRE' : 'CARE';

  const detail: AnyDetail | null = isCarre
    ? (carreData as CarreAuditDetail)
    : careData && careData.success
      ? (careData as CareAuditDetail)
      : null;

  const upsertCareScore = useUpsertCareScore();
  const upsertCarreScore = useUpsertCarreScore();
  const createCareInvite = useCreateCareInvite();
  const createCarreInvite = useCreateCarreInvite();
  const [invitedEmail, setInvitedEmail] = useState('');

  const ownerScores = useMemo<ScoreInput[]>(
    () =>
      (detail?.scores ?? [])
        .filter((s) => s.scorer_role === 'owner')
        .map((s) => ({ parameter_code: s.parameter_code, score: s.score })),
    [detail],
  );

  const participantScores = useMemo<ScoreInput[]>(
    () =>
      (detail?.scores ?? [])
        .filter((s) => s.scorer_role === 'participant')
        .map((s) => ({ parameter_code: s.parameter_code, score: s.score })),
    [detail],
  );

  const sheetValues = useMemo<Record<string, SheetValue>>(() => {
    const values: Record<string, SheetValue> = {};
    for (const s of detail?.scores ?? []) {
      if (s.scorer_role === 'owner') {
        values[s.parameter_code] = {
          score: s.score,
          evidence_note: s.evidence_note ?? undefined,
        };
      }
    }
    return values;
  }, [detail]);

  // Classroom Practice (13 items) shares this page but not its scoring model:
  // no /100 index, no doctrine caps, per-pillar medians instead. Detected from
  // the frozen snapshot, so an in-flight cycle keeps the shape it was created
  // with even if the catalogs change later.
  const snapshot = isCarre ? (detail as CarreAuditDetail | null)?.snapshot : undefined;
  const isClassroom = isCarre && isClassroomCatalog(snapshot);
  const snapshotParameters = snapshot?.parameters ?? [];

  const { index } = isCarre ? carreIndex(ownerScores) : careIndex(ownerScores);
  const complete = index !== null && !isClassroom;
  const itemCount = isClassroom
    ? snapshotParameters.length
    : isCarre
      ? 25
      : 20;
  const settingCode = isCarre ? snapshot?.setting_code : undefined;

  // The owner-side reveal reads the SCF drip, not the sealed participant
  // lane; every gate on it is server-side.
  const compareQ = useClassroomCompare(isClassroom ? cycleId : undefined);

  // Live evidence + doctrine caps and the sealed k≥3 participant rollup —
  // CARRE only; both RPCs self-gate (lead auditor / leadership) and return
  // nothing for everyone else, so no page-level guard is needed.
  // Doctrine caps are a CARRE-initiative mechanism and their evidence probes key
  // on CARRE-* codes; a Classroom Practice cycle neither needs nor matches them.
  const evidenceQ = useCarreItemEvidence(isCarre && !isClassroom ? cycleId : undefined);
  const rollupQ = useCarreParticipantRollup(isCarre ? cycleId : undefined);
  // Cycle-level participation line — appears once >= 3 distinct learners have
  // scored ANYTHING in the sealed lane, even before any per-item group hits k.
  const activityQ = useCarreParticipantActivity(isCarre ? cycleId : undefined);
  const evidenceByCode = useMemo(() => {
    const map: Record<string, LiveEvidence> = {};
    for (const row of evidenceQ.data ?? []) {
      map[row.parameter_code] = { evidence: row.evidence, cap: row.cap };
    }
    return map;
  }, [evidenceQ.data]);
  const sealedRollup = rollupQ.data ?? [];
  const sealedActivity = activityQ.data ?? null;

  async function handleScore(code: string, score: number) {
    if (!detail?.is_owner) return;
    const existingNote = sheetValues[code]?.evidence_note ?? null;
    const input = { cycleId, parameterCode: code, score, evidenceNote: existingNote };
    const result = isCarre
      ? await upsertCarreScore.mutateAsync(input)
      : await upsertCareScore.mutateAsync(input);
    if (!result.success) {
      toast.error(`Could not save score (${(result as CareRpcDenial).reason})`);
    }
  }

  async function handleNote(code: string, note: string) {
    if (!detail?.is_owner) return;
    const existingScore = sheetValues[code]?.score;
    if (existingScore === undefined) return; // note saves ride the score row
    const input = { cycleId, parameterCode: code, score: existingScore, evidenceNote: note };
    const result = isCarre
      ? await upsertCarreScore.mutateAsync(input)
      : await upsertCareScore.mutateAsync(input);
    if (!result.success) {
      toast.error(`Could not save note (${(result as CareRpcDenial).reason})`);
    }
  }

  async function handleInvite() {
    const input = { cycleId, invitedEmail: invitedEmail.trim() || undefined };
    const result = isCarre
      ? await createCarreInvite.mutateAsync(input)
      : await createCareInvite.mutateAsync(input);
    if (!result.success) {
      toast.error(`Could not create invite (${(result as CareRpcDenial).reason})`);
      return;
    }
    toast.success(result.existing ? 'Existing invite link loaded' : 'Invite link created');
  }

  const invitePending = isCarre ? createCarreInvite.isPending : createCareInvite.isPending;

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/audit/care/score/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success('Scoring link copied — share it with your second scorer');
  }

  // --------------------------------------------------------------------
  // Loading / denial states (rule #27 — explicit, never a silent redirect)
  // --------------------------------------------------------------------
  const isLoading = carreQ.isLoading || (carreNotFound && careQ.isLoading);

  if (isLoading) {
    return (
      <ContentLayout title="Culture Audit">
        <div className="space-y-4 max-w-5xl">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!detail) {
    // Resolve which response drives the denial: a non-not_found CARRE denial,
    // else the CARE fallback's denial, else genuinely not found.
    const denial: CareRpcDenial | CarreRpcDenial | null =
      carreData && !carreData.success && (carreData as CarreRpcDenial).reason !== 'not_found'
        ? (carreData as CarreRpcDenial)
        : careData && !careData.success
          ? (careData as CareRpcDenial)
          : null;
    const reason = denial?.reason ?? (carreQ.error || careQ.error ? 'error' : 'not_found');
    const copyByReason: Record<string, string> = {
      not_found: 'This culture audit does not exist (or was deleted).',
      forbidden:
        'You do not have access to this audit. It is visible to its owner and to audit leadership — contact the initiative owner if you believe you should see it.',
      not_authenticated: 'Your session expired. Re-login and try again.',
      error: ((carreQ.error || careQ.error) as Error)?.message ?? 'Could not load this culture audit.',
    };
    return (
      <ContentLayout title="Culture Audit">
        <div className="max-w-xl">
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Cannot open this culture audit</p>
                <p className="text-xs text-muted-foreground">
                  {copyByReason[reason] ?? copyByReason.error}
                </p>
                <Link href="/audit/dashboard" className="text-xs underline underline-offset-2">
                  ← Back to audit dashboard
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const d = detail;
  const frameworkLabel = d.snapshot?.framework ?? framework;
  const overdue = new Date(d.cycle.re_audit_date) < new Date();

  return (
    <ContentLayout title="Culture Audit">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: frameworkLabel, href: `/audit/care/${cycleId}` },
        ]}
      />

      <div className="space-y-6 max-w-5xl">
        {/* Header — eyebrow + heading + meta + phase spine */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <SectionEyebrow>
                  {frameworkLabel} v{d.snapshot?.version ?? (isCarre ? '2.0' : '1.0')}
                  {isCarre && settingCode ? ` · ${settingCode}` : ''} · Culture audit
                </SectionEyebrow>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {d.cycle.name}
                  </h1>
                  {isClassroom && (
                    <Badge
                      variant="outline"
                      className="border-violet-300 bg-violet-50 text-[10px] text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"
                    >
                      {'Classroom Practice · one Senior Learner'}
                    </Badge>
                  )}
                </div>
                {d.cycle.audience && (
                  <p className="text-sm text-muted-foreground">{d.cycle.audience}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Owner{' '}
                    <span className="font-medium text-foreground">
                      {d.cycle.owner_name ?? '—'}
                    </span>
                  </span>
                  <span>Opened {formatDate(d.cycle.start_date)}</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Re-audit {formatDate(d.cycle.re_audit_date)}
                  </span>
                  {overdue && (
                    <Badge
                      variant="outline"
                      className="border-red-300 bg-red-50 text-[10px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                    >
                      Overdue
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Phase spine */}
          <Card>
            <CardContent className="py-4">
              <PhaseStepper phase={d.cycle.phase} />
            </CardContent>
          </Card>
        </div>

        {/* Live pillar / index strip */}
        <section className="space-y-3">
          <SectionEyebrow>{isClassroom ? 'Your own reading' : 'Live score'}</SectionEyebrow>
          {isClassroom ? (
            <ClassroomPillarStrip
              parameters={snapshotParameters}
              ownerScores={ownerScores}
            />
          ) : (
            <CareSummaryStrip ownerScores={ownerScores} framework={framework} />
          )}
        </section>

        {/* Second scorer — the blind token-invite lane. A Classroom Practice
            cycle gets its second opinion from the sealed learner sheet instead,
            so this card would offer a competing mechanism for the same job. */}
        {!isClassroom && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Second scorer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Invite ONE participant representative (staff or learner) to score the
              same {itemCount} items <strong>blind</strong> — they never see your scores
              before submitting. A gap of ≥ 2 on any item becomes a Clarity finding.
            </p>
            {d.invite ? (
              <div className="rounded-md border p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono truncate max-w-[16rem]">
                    /audit/care/score/{d.invite.token.slice(0, 10)}…
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    expires {formatDate(d.invite.expires_at)}
                  </Badge>
                  {d.invite.accepted_by ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                      {participantScores.length > 0 ? `Scored ${participantScores.length}/${itemCount}` : 'Opened — not yet scored'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Not yet opened
                    </Badge>
                  )}
                  {d.is_owner && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => copyInviteLink(d.invite!.token)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy link
                    </Button>
                  )}
                </div>
                {d.invite.invited_email && (
                  <p className="text-muted-foreground">Invited: {d.invite.invited_email}</p>
                )}
              </div>
            ) : d.is_owner ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                  placeholder="Participant email (optional, for your records)"
                  className="max-w-xs text-xs h-8"
                />
                <Button size="sm" onClick={handleInvite} disabled={invitePending}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {invitePending ? 'Creating…' : 'Generate scoring link'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No invite issued yet.</p>
            )}
          </CardContent>
        </Card>
        )}

        {/* Scoring sheet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isClassroom ? 'Score yourself' : 'Scoring sheet'} — {itemCount} items, 0–4
              {!d.is_owner && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  Read-only (you are not the owner)
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.cycle.phase === 'closed' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs mb-4 flex items-start gap-2 dark:border-amber-900 dark:bg-amber-950">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-700" />
                <span>This audit is closed — scores are frozen.</span>
              </div>
            )}
            <CareScoreSheet
              parameters={d.snapshot?.parameters ?? []}
              values={sheetValues}
              settingCode={settingCode}
              evidenceByCode={
                isCarre && Object.keys(evidenceByCode).length > 0
                  ? evidenceByCode
                  : undefined
              }
              onScore={(code, score) => void handleScore(code, score)}
              onNote={(code, note) => void handleNote(code, note)}
              disabled={!d.is_owner || d.cycle.phase === 'closed'}
            />
          </CardContent>
        </Card>

        {/* Classroom Practice: self-score beside the sealed learner medians,
            with the three gates named in plain words while they hold. */}
        {isClassroom && (
          <ClassroomCompareCard
            parameters={snapshotParameters}
            compare={compareQ.data}
          />
        )}

        {/* Classroom Practice sealed comments — Principal & Director only.
            NOT mounted for the cycle's owner: the server refuses them anyway
            (owner_never_reads_comments, before any role check), but not even
            issuing the request keeps the owner's network tab as quiet as
            their screen. The card renders nothing for anyone else the server
            turns away, so leadership visibility is decided server-side only. */}
        {isClassroom && !d.is_owner && (
          <ClassroomSealedCommentsCard
            cycleId={cycleId}
            parameters={snapshotParameters}
          />
        )}

        {/* Sealed participant voice — k≥3 aggregates only, never identities.
            Renders when the cycle-level participation line exists (>= 3
            distinct sealed scorers) OR any per-item group has hit k. */}
        {isCarre && !isClassroom && (sealedActivity !== null || sealedRollup.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Sealed participant voice
                <Badge variant="outline" className="text-[10px]">
                  k≥3 · identities sealed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sealedActivity && (
                <p className="text-sm">
                  <strong>{sealedActivity.scorers} learners</strong> have spoken
                  through the sealed lane (
                  {sealedActivity.items_scored}{' '}
                  {sealedActivity.items_scored === 1 ? 'item' : 'items'} touched)
                  — per-item medians appear once an item&apos;s lane (lived
                  experience or observer) reaches 3 scorers.
                  {sealedActivity.last_activity && (
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      Last activity {formatDate(sealedActivity.last_activity)}.
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Learners scored these items through the sealed lane. Only groups
                with <strong>3 or more scorers</strong> appear — a lone voice can
                never be isolated — and scorer identities are visible to no one
                below the Director seal. This is measured participant experience;
                it never overwrites your human score.
              </p>
              {sealedRollup.length > 0 && (
                <div className="rounded-md border divide-y">
                  {sealedRollup.map((r) => (
                    <div
                      key={`${r.parameter_code}-${r.lane}`}
                      className="flex items-center gap-3 p-2.5 text-xs"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground w-16 flex-shrink-0">
                        {r.parameter_code.replace(/^CARR?E-/, '')}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.lane === 'own' ? 'lived experience' : 'observer'}
                      </Badge>
                      <span className="text-muted-foreground">
                        {r.scorers} scorers
                      </span>
                      <span className="ml-auto font-semibold tabular-nums">
                        median {Number(r.median_score)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results + corrective moves (only once all owner scores exist) */}
        {complete && (
          <CareResultsPanel
            cycleId={cycleId}
            ownerScores={ownerScores}
            participantScores={participantScores}
            institutionId={profile?.institution_id ?? null}
            requesterId={profile?.id ?? null}
            framework={framework}
          />
        )}
      </div>
    </ContentLayout>
  );
}
