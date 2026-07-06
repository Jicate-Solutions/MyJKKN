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
} from '@/hooks/audit';
import { CareScoreSheet, type SheetValue } from '../_components/care-score-sheet';
import { CareSummaryStrip } from '../_components/care-summary-strip';
import { CareResultsPanel } from '../_components/care-results-panel';
import { careIndex } from '@/lib/services/audit/care-scoring-service';
import { carreIndex } from '@/lib/services/audit/carre-scoring-service';
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

  const { index } = isCarre ? carreIndex(ownerScores) : careIndex(ownerScores);
  const complete = index !== null;
  const itemCount = isCarre ? 25 : 20;
  const settingCode = isCarre
    ? (detail as CarreAuditDetail | null)?.snapshot?.setting_code
    : undefined;

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
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  <h2 className="text-lg font-semibold truncate">{d.cycle.name}</h2>
                  <Badge variant="secondary" className="uppercase text-[10px]">
                    {frameworkLabel} v{d.snapshot?.version ?? (isCarre ? '2.0' : '1.0')}
                  </Badge>
                  {isCarre && settingCode && (
                    <Badge variant="outline" className="text-[10px]">
                      {settingCode}
                    </Badge>
                  )}
                </div>
                {d.cycle.audience && (
                  <p className="text-sm text-muted-foreground">{d.cycle.audience}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Owner: <span className="font-medium">{d.cycle.owner_name ?? '—'}</span>
                  {' · '}Opened {formatDate(d.cycle.start_date)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span>
                  Re-audit {formatDate(d.cycle.re_audit_date)}
                </span>
                {overdue && (
                  <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    Overdue
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live pillar / index strip */}
        <CareSummaryStrip ownerScores={ownerScores} framework={framework} />

        {/* Second scorer */}
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

        {/* Scoring sheet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Scoring sheet — {itemCount} items, 0–4
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
              onScore={(code, score) => void handleScore(code, score)}
              onNote={(code, note) => void handleNote(code, note)}
              disabled={!d.is_owner || d.cycle.phase === 'closed'}
            />
          </CardContent>
        </Card>

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
