// app/(routes)/accreditation/naac/narratives/[id]/page.tsx
// ============================================================================
// /accreditation/naac/narratives/[id] — read → verify → advance one narrative.
//
// Renders the AI-drafted narrative (markdown), its deterministic grounding
// verdict, the citation list, and the action controls appropriate to the row's
// status crossed with the viewer's permissions.
//
// FRAUD-CRITICAL UI RULES (enforced here AND server-side — defence in depth):
//   * grounding_verdict === 'ungrounded' → a red blocking banner lists the
//     offending tokens and EVERY advance control is withheld. An ungrounded
//     draft can never be okayed / approved / submitted from the UI.
//   * The owner (or an .edit holder) may edit the prose and okay it, but the
//     edit is re-validated server-side (okayNarrative) before it advances, so a
//     human cannot edit-in a fabricated figure and okay past the gate.
//   * Every transition is an explicit button a human clicks — nothing here
//     auto-submits.
//
// Permission keys: narrative.view (see), narrative.edit (owner edits+okays),
// narrative.approve (principal approve / director submit / request revision).
// ============================================================================

'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ArrowLeft,
  CheckCircle2,
  Send,
  Undo2,
  Quote,
  Building2,
  CalendarDays,
  User2,
  Lock,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { markdownComponents } from '@/components/ai-query/markdown-components';
import { okayNarrative } from '../_actions/okay-narrative';
import {
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  UNASSIGNED_OWNER_LABEL,
  type NarrativeStatus,
  type GroundingVerdict,
} from '../_lib/narrative-ui';

interface NarrativeDetail {
  id: string;
  institution_id: string;
  body_code: string;
  metric_code: string;
  period_label: string;
  narrative_md: string | null;
  citations: unknown;
  grounding_verdict: GroundingVerdict;
  ungrounded_tokens: unknown;
  evidence_row_count: number | null;
  model: string | null;
  generated_at: string | null;
  status: NarrativeStatus;
  owner_user_id: string | null;
  revision_note: string | null;
  // Return-edge measurement columns (20260928010000). Optional: the select('*')
  // simply omits them until the migration is applied, and the UI hides the line.
  edit_distance?: number | null;
  edit_ratio?: number | null;
  edit_measured_at?: string | null;
}

// ----------------------------------------------------------------------------
function useNarrative(id: string) {
  return useQuery({
    queryKey: ['accreditation', 'naac', 'narrative', id],
    enabled: !!id,
    queryFn: async (): Promise<NarrativeDetail | null> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_metric_narratives')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as NarrativeDetail | null;
    },
  });
}

// Metric name + institution name + owner name — enriched from lookup tables.
// Keyed on primitives so the query key stays stable across renders.
function useNarrativeMeta(n: NarrativeDetail | null | undefined) {
  const metricCode = n?.metric_code ?? '';
  const institutionId = n?.institution_id ?? '';
  const ownerId = n?.owner_user_id ?? '';
  return useQuery({
    queryKey: ['accreditation', 'naac', 'narrative-meta', metricCode, institutionId, ownerId],
    enabled: !!n,
    queryFn: async () => {
      const sb = createClientSupabaseClient() as any;
      const [metricRes, instRes, ownerRes] = await Promise.all([
        sb
          .from('sh_accreditation_metrics')
          .select('metric_name')
          .eq('metric_type', 'NAAC')
          .eq('metric_code', metricCode)
          .maybeSingle(),
        sb.from('institutions').select('name').eq('id', institutionId).maybeSingle(),
        ownerId
          ? sb.from('profiles').select('full_name').eq('id', ownerId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        metricName: metricRes?.data?.metric_name ?? metricCode,
        institutionName: instRes?.data?.name ?? '—',
        ownerName: ownerRes?.data?.full_name ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ----------------------------------------------------------------------------
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

interface CitationItem {
  marker?: string;
  source_id?: string;
  source_ids?: unknown;
  paragraph?: unknown;
}

function NarrativeMarkdown({ md }: { md: string }) {
  return (
    <div className="max-w-none text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {md}
      </ReactMarkdown>
    </div>
  );
}

// ----------------------------------------------------------------------------
export default function NAACNarrativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const {
    can,
    isSuperAdmin,
    isLoading: permsLoading,
    userProfile,
  } = usePermissions();

  const { data: narrative, isLoading: narrativeLoading, error } = useNarrative(id);
  const { data: meta } = useNarrativeMeta(narrative);

  // Edit + action local state.
  const [editedMd, setEditedMd] = useState<string | null>(null); // null = not started editing
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevision, setShowRevision] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [liveUngrounded, setLiveUngrounded] = useState<string[] | null>(null);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['accreditation', 'naac', 'narrative', id] });
    await qc.invalidateQueries({ queryKey: ['accreditation', 'naac', 'narratives', 'list'] });
  };

  // Direct client RPC for the non-okay transitions (session-scoped in browser).
  async function runTransition(action: string, note?: string) {
    setBusy(action);
    try {
      const sb = createClientSupabaseClient() as any;
      const { error: rpcErr } = await sb.rpc('fn_accreditation_narrative_transition', {
        p_id: id,
        p_action: action,
        p_note: note ?? null,
      });
      if (rpcErr) throw rpcErr;
      toast.success('Done.');
      setShowRevision(false);
      setRevisionNote('');
      await invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  // Owner okay — routes through the server action so the edited text is
  // re-validated against the evidence before it advances.
  async function handleOkay(currentText: string) {
    setBusy('owner_okay');
    setLiveUngrounded(null);
    try {
      const res = await okayNarrative(id, currentText);
      if (!res.ok) {
        if (res.ungroundedTokens && res.ungroundedTokens.length > 0) {
          setLiveUngrounded(res.ungroundedTokens);
          toast.error('Your edit added figures the evidence cannot account for. Fix them before okaying.');
        } else {
          toast.error(res.error ?? 'Okay failed.');
        }
        return;
      }
      toast.success('Narrative okayed.');
      setEditedMd(null);
      await invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? 'Okay failed.');
    } finally {
      setBusy(null);
    }
  }

  // ── Loading / not-found gating (branch on loading BEFORE reading perms) ────
  if (narrativeLoading || permsLoading) {
    return (
      <ContentLayout title="NAAC Narrative">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !narrative) {
    // Explicit — never a silent bounce (CLAUDE.md #27). RLS-denied and truly
    // missing both land here; the message covers both without leaking which.
    return (
      <ContentLayout title="NAAC Narrative">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'NAAC', href: '/accreditation/naac' },
            { label: 'AI Narratives', href: '/accreditation/naac/narratives' },
          ]}
        />
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Lock className="h-5 w-5" />
              <span className="font-medium">Narrative not available</span>
            </div>
            <p className="text-sm text-muted-foreground">
              This narrative could not be found, or you do not have access to it.
              If you believe you should, contact your IQAC coordinator.
            </p>
            <Link href="/accreditation/naac/narratives">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to narratives
              </Button>
            </Link>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isOwner = !!userProfile?.id && narrative.owner_user_id === userProfile.id;
  const canEditOrOwn =
    isSuperAdmin || can('accreditation.naac.narrative.edit') || isOwner;
  const canApprove = isSuperAdmin || can('accreditation.naac.narrative.approve');

  const isUngrounded = narrative.grounding_verdict === 'ungrounded';
  const isGrounded = narrative.grounding_verdict === 'grounded';

  const ungroundedTokens = asStringArray(narrative.ungrounded_tokens);
  const citations: CitationItem[] = Array.isArray(narrative.citations)
    ? (narrative.citations as CitationItem[])
    : [];

  const status = narrative.status;
  const baseText = narrative.narrative_md ?? '';
  const editorText = editedMd ?? baseText;

  // Action gates (advance is impossible while ungrounded — the whole section is
  // withheld below in that case).
  const canOwnerOkay =
    !isUngrounded &&
    isGrounded &&
    (status === 'ai_drafted' || status === 'revision_requested') &&
    canEditOrOwn;
  const canPrincipalApprove = !isUngrounded && status === 'owner_okayed' && canApprove;
  const canDirectorSubmit =
    !isUngrounded && status === 'principal_approved' && canApprove;
  const canRequestRevision =
    !isUngrounded &&
    (status === 'owner_okayed' || status === 'principal_approved') &&
    canApprove;

  const anyAction =
    canOwnerOkay || canPrincipalApprove || canDirectorSubmit || canRequestRevision;

  return (
    <ContentLayout title={`NAAC ${narrative.metric_code} — AI Narrative`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'AI Narratives', href: '/accreditation/naac/narratives' },
          {
            label: narrative.metric_code,
            href: `/accreditation/naac/narratives/${id}`,
          },
        ]}
      />

      <div className="space-y-6">
        <Link href="/accreditation/naac/narratives">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All narratives
          </Button>
        </Link>

        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <span className="font-mono text-sm text-muted-foreground">
                    {narrative.metric_code}
                  </span>
                  {meta?.metricName ?? narrative.metric_code}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {meta?.institutionName ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {narrative.period_label}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User2 className="h-3.5 w-3.5" />
                    {narrative.owner_user_id
                      ? meta?.ownerName ?? 'Owner assigned'
                      : UNASSIGNED_OWNER_LABEL}
                  </span>
                </div>
              </div>
              <Badge className={STATUS_BADGE_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <span>
              {narrative.evidence_row_count ?? 0} evidence record
              {(narrative.evidence_row_count ?? 0) === 1 ? '' : 's'} cited
            </span>
            {narrative.model ? <span> · drafted by {narrative.model}</span> : null}
            {narrative.edit_ratio != null ? (
              <span>
                {' '}· {Math.round(Number(narrative.edit_ratio) * 100)}% edited
                from the AI draft at okay
              </span>
            ) : null}
          </CardContent>
        </Card>

        {/* Grounding banner */}
        {isUngrounded ? (
          <Card className="border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <ShieldAlert className="h-6 w-6" />
                <span className="text-base font-semibold">
                  Ungrounded — this draft is blocked
                </span>
              </div>
              <p className="text-sm text-red-800/90 dark:text-red-200/90">
                The grounding gate found figures, dates, or codes in this draft
                that cannot be traced to the cited evidence. It cannot be okayed,
                approved, or submitted. It must be re-drafted from evidence before
                it can advance.
              </p>
              {ungroundedTokens.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
                    Ungrounded tokens
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ungroundedTokens.map((t, i) => (
                      <span
                        key={`${t}-${i}`}
                        className="rounded border border-red-300 bg-red-100 px-2 py-0.5 font-mono text-xs text-red-800 dark:border-red-700 dark:bg-red-900/50 dark:text-red-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : isGrounded ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <ShieldCheck className="h-5 w-5 flex-shrink-0" />
            <span>
              Grounded — every figure, date, and code traces to the cited evidence.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
            <ShieldQuestion className="h-5 w-5 flex-shrink-0" />
            <span>Not yet validated by the grounding gate.</span>
          </div>
        )}

        {/* Revision note (when a reviewer sent it back) */}
        {narrative.revision_note && status === 'revision_requested' && (
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <Undo2 className="h-4 w-4" />
                Revision requested
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-900/90 dark:text-amber-100/90">
              {narrative.revision_note}
            </CardContent>
          </Card>
        )}

        {/* Narrative body — editor when the owner may edit, else read-only */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Narrative</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canOwnerOkay ? (
              <>
                {liveUngrounded && liveUngrounded.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
                      <ShieldAlert className="h-4 w-4" />
                      Your edit is not grounded — these tokens are not in the evidence:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {liveUngrounded.map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="rounded border border-red-300 bg-red-100 px-2 py-0.5 font-mono text-xs text-red-800 dark:border-red-700 dark:bg-red-900/50 dark:text-red-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="narrative-editor">
                    Edit the narrative (citation markers like [E1] are kept)
                  </Label>
                  <Textarea
                    id="narrative-editor"
                    value={editorText}
                    onChange={(e) => setEditedMd(e.target.value)}
                    rows={16}
                    className="font-mono text-sm"
                  />
                </div>
                <details className="rounded-lg border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Preview
                  </summary>
                  <div className="mt-3">
                    <NarrativeMarkdown md={editorText} />
                  </div>
                </details>
              </>
            ) : baseText ? (
              <NarrativeMarkdown md={baseText} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                This narrative has no drafted text yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Citations */}
        {citations.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Quote className="h-4 w-4 text-muted-foreground" />
                Citations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {citations.map((c, i) => {
                  const sources = c.source_id
                    ? [c.source_id]
                    : asStringArray(c.source_ids);
                  return (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      {c.marker && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                          {c.marker}
                        </span>
                      )}
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {sources.length > 0 ? sources.join(', ') : JSON.stringify(c)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Actions — withheld entirely while ungrounded */}
        {!isUngrounded && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === 'director_submitted' ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  Submitted by the Director. This narrative is final for the period.
                </div>
              ) : !anyAction ? (
                <p className="text-sm text-muted-foreground">
                  No actions are available to you at this stage.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canOwnerOkay && (
                    <Button
                      onClick={() => handleOkay(editorText)}
                      disabled={busy !== null}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {busy === 'owner_okay' ? 'Checking…' : 'Okay this narrative'}
                    </Button>
                  )}
                  {canPrincipalApprove && (
                    <Button
                      onClick={() => runTransition('principal_approve')}
                      disabled={busy !== null}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve (Principal)
                    </Button>
                  )}
                  {canDirectorSubmit && (
                    <Button
                      onClick={() => runTransition('director_submit')}
                      disabled={busy !== null}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit (Director)
                    </Button>
                  )}
                  {canRequestRevision && (
                    <Button
                      variant="outline"
                      onClick={() => setShowRevision((v) => !v)}
                      disabled={busy !== null}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Request revision
                    </Button>
                  )}
                </div>
              )}

              {/* Revision note composer */}
              {canRequestRevision && showRevision && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label htmlFor="revision-note">
                    Reason for revision (sent back to the owner)
                  </Label>
                  <Textarea
                    id="revision-note"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    rows={3}
                    placeholder="What needs to change before this can be approved?"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => runTransition('request_revision', revisionNote)}
                      disabled={busy !== null || revisionNote.trim().length === 0}
                    >
                      Send back for revision
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
