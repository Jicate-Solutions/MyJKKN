// app/(routes)/audit/care/[cycleId]/page.tsx
// CARE audit detail — owner scoring sheet + live pillar/index strip +
// second-scorer invite + post-completion results & corrective-move composer.
// Spec: specs/care-audit-module-spec-2026-06-12.md §5.
//
// Access: owner + leadership via fn_care_get_audit (RPC-enforced, no page
// guard — denials render explicitly per rule #27). Leadership gets a
// read-only sheet; only the owner can score and invite.

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
} from '@/hooks/audit';
import { CareScoreSheet, type SheetValue } from '../_components/care-score-sheet';
import { CareSummaryStrip } from '../_components/care-summary-strip';
import { CareResultsPanel } from '../_components/care-results-panel';
import {
  careIndex,
  type CareScoreInput,
} from '@/lib/services/audit/care-scoring-service';
import type {
  CareAuditDetail,
  CareRpcDenial,
} from '@/lib/services/audit/care-audit-service';

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

export default function CareAuditDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = use(params);
  const { profile } = useAuth();
  const { data, isLoading, error } = useCareAudit(cycleId);
  const upsertScore = useUpsertCareScore();
  const createInvite = useCreateCareInvite();
  const [invitedEmail, setInvitedEmail] = useState('');

  const detail = data && data.success ? (data as CareAuditDetail) : null;

  const ownerScores = useMemo<CareScoreInput[]>(
    () =>
      (detail?.scores ?? [])
        .filter((s) => s.scorer_role === 'owner')
        .map((s) => ({ parameter_code: s.parameter_code, score: s.score })),
    [detail],
  );

  const participantScores = useMemo<CareScoreInput[]>(
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

  const { index } = careIndex(ownerScores);
  const complete = index !== null;

  async function handleScore(code: string, score: number) {
    if (!detail?.is_owner) return;
    const existingNote = sheetValues[code]?.evidence_note ?? null;
    const result = await upsertScore.mutateAsync({
      cycleId,
      parameterCode: code,
      score,
      evidenceNote: existingNote,
    });
    if (!result.success) {
      toast.error(`Could not save score (${(result as CareRpcDenial).reason})`);
    }
  }

  async function handleNote(code: string, note: string) {
    if (!detail?.is_owner) return;
    const existingScore = sheetValues[code]?.score;
    if (existingScore === undefined) return; // note saves ride the score row
    const result = await upsertScore.mutateAsync({
      cycleId,
      parameterCode: code,
      score: existingScore,
      evidenceNote: note,
    });
    if (!result.success) {
      toast.error(`Could not save note (${(result as CareRpcDenial).reason})`);
    }
  }

  async function handleInvite() {
    const result = await createInvite.mutateAsync({
      cycleId,
      invitedEmail: invitedEmail.trim() || undefined,
    });
    if (!result.success) {
      toast.error(`Could not create invite (${(result as CareRpcDenial).reason})`);
      return;
    }
    toast.success(result.existing ? 'Existing invite link loaded' : 'Invite link created');
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/audit/care/score/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success('Scoring link copied — share it with your second scorer');
  }

  // --------------------------------------------------------------------
  // Loading / denial states (rule #27 — explicit, never a silent redirect)
  // --------------------------------------------------------------------
  if (isLoading) {
    return (
      <ContentLayout title="CARE Audit">
        <div className="space-y-4 max-w-5xl">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !data || !data.success) {
    const reason = data && !data.success ? (data as CareRpcDenial).reason : 'error';
    const copyByReason: Record<string, string> = {
      not_found: 'This CARE audit does not exist (or was deleted).',
      forbidden:
        'You do not have access to this CARE audit. It is visible to its owner and to audit leadership — contact the initiative owner if you believe you should see it.',
      not_authenticated: 'Your session expired. Re-login and try again.',
      error: (error as Error)?.message ?? 'Could not load this CARE audit.',
    };
    return (
      <ContentLayout title="CARE Audit">
        <div className="max-w-xl">
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Cannot open this CARE audit</p>
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

  const d = detail!;
  const overdue = new Date(d.cycle.re_audit_date) < new Date();

  return (
    <ContentLayout title="CARE Audit">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'CARE', href: `/audit/care/${cycleId}` },
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
                    CARE v{d.snapshot?.version ?? '1.0'}
                  </Badge>
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
        <CareSummaryStrip ownerScores={ownerScores} />

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
              same 20 items <strong>blind</strong> — they never see your scores
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
                      {participantScores.length > 0 ? `Scored ${participantScores.length}/20` : 'Opened — not yet scored'}
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
                <Button size="sm" onClick={handleInvite} disabled={createInvite.isPending}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {createInvite.isPending ? 'Creating…' : 'Generate scoring link'}
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
              Scoring sheet — 20 items, 0–4
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
              onScore={(code, score) => void handleScore(code, score)}
              onNote={(code, note) => void handleNote(code, note)}
              disabled={!d.is_owner || d.cycle.phase === 'closed'}
            />
          </CardContent>
        </Card>

        {/* Results + corrective moves (only once all 20 owner scores exist) */}
        {complete && (
          <CareResultsPanel
            cycleId={cycleId}
            ownerScores={ownerScores}
            participantScores={participantScores}
            institutionId={profile?.institution_id ?? null}
            requesterId={profile?.id ?? null}
          />
        )}
      </div>
    </ContentLayout>
  );
}
