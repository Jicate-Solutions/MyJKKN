'use client';

/**
 * DemonstrationList — client component for /pde/learn/demonstrations.
 *
 * Renders the learner's authored PDE demonstrations as a card list with:
 *   - category badge
 *   - status pill
 *   - skill name + evidence type
 *   - submitted-at date (if any)
 *   - score (if scored)
 *   - withdraw action on draft/submitted rows
 *   - empty state with "New demonstration" CTA
 *
 * Reads server-fetched initialRows; mutates via the /api/pde/demonstrations
 * surface. State is local — no react-query wiring yet (intentionally minimal
 * for Tier 1.1; can layer caching in T1.3).
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDashed,
  FileText,
  MessageSquareHeart,
  Pencil,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';
import type {
  PDECategoryKey,
  PDEDemonstration,
  PDEDemonstrationStatus,
} from '@/lib/types/pde-demonstrations';
import { PDEAppreciationService } from '@/lib/services/pde-appreciation-service';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<PDECategoryKey, string> = {
  judgment: 'Judgment',
  embodied: 'Embodied Practice',
  problem_finding: 'Problem Finding',
  accountability: 'Accountability',
  social_leadership: 'Social & Leadership',
  cultural_civic: 'Cultural & Civic',
  credential: 'Credential',
};

const STATUS_CONFIG: Record<
  PDEDemonstrationStatus,
  { label: string; className: string; icon: typeof CircleDashed }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: CircleDashed,
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    icon: FileText,
  },
  under_review: {
    label: 'Under Review',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    icon: Sparkles,
  },
  validated: {
    label: 'Validated',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: ShieldCheck,
  },
  scored: {
    label: 'Scored',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    icon: Trophy,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    icon: XCircle,
  },
  withdrawn: {
    label: 'Withdrawn',
    className: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: Trash2,
  },
};

const WITHDRAWABLE_STATUSES: PDEDemonstrationStatus[] = ['draft', 'submitted'];

/**
 * validator_notes is a { validatorId: note } map (see PDEValidatorService).
 * Surface the note TEXT to the learner (CARE-Appreciation — feedback was
 * being written but never received); validator UUIDs stay anonymous.
 */
function validatorFeedback(notes: Record<string, unknown> | null | undefined): string[] {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return [];
  return Object.values(notes).filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DemonstrationListProps {
  initialRows: PDEDemonstration[];
  initialError: string | null;
}

export function DemonstrationList({ initialRows, initialError }: DemonstrationListProps) {
  const router = useRouter();
  const [rows, setRows] = useState<PDEDemonstration[]>(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [thankedIds, setThankedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Learner → validator thanks (CARE corrective move A — A5: two-way
  // appreciation channel). One in-app notification per validator on the row.
  const handleThanks = async (row: PDEDemonstration) => {
    setPendingId(row.id);
    try {
      await PDEAppreciationService.sendThanks({
        demonstrationId: row.id,
        validatorIds: row.validator_ids ?? [],
        skillName: row.skill_name,
      });
      setThankedIds((prev) => new Set(prev).add(row.id));
      toast.success('Thanks sent to your validator.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send thanks.');
    } finally {
      setPendingId(null);
    }
  };

  const handleWithdraw = async (id: string) => {
    if (pendingId) return;
    setPendingId(id);
    try {
      const res = await fetch(`/api/pde/demonstrations/${id}/withdraw`, {
        method: 'POST',
      });
      if (!res.ok) {
        // Self-service withdraw isn't available for this submission yet. Show a
        // friendly, actionable message instead of leaking the HTTP status or any
        // implementation detail to the learner.
        if (res.status === 404) {
          toast(
            'This submission can’t be withdrawn here yet — please contact support to withdraw it.',
            { icon: 'ℹ️' }
          );
          return;
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Sorry, we couldn’t withdraw this submission. Please try again or contact support.');
      }
      const { data } = (await res.json()) as { data: PDEDemonstration };
      setRows((prev) => prev.map((r) => (r.id === id ? data : r)));
      toast.success('Demonstration withdrawn.');
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to withdraw.');
    } finally {
      setPendingId(null);
    }
  };

  // ---- Header + new-demo CTA ----
  const Header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My PDE Demonstrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Evidence you&apos;ve submitted across the seven durable-value categories. Drafts
          stay private until you submit them for review.
        </p>
      </div>
      <Link href="/pde/learn/demonstrations/new">
        <Button className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
          <PlusCircle className="h-4 w-4 mr-2" />
          New demonstration
        </Button>
      </Link>
    </div>
  );

  if (initialError) {
    return (
      <>
        {Header}
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="py-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <p className="font-medium text-rose-800">Could not load demonstrations.</p>
              <p className="text-sm text-rose-700 mt-1">{initialError}</p>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {Header}
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No demonstrations yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Capture evidence of a skill you&apos;ve demonstrated — a video, an OSCE score,
              a credential PDF, an artifact link, or a community project write-up.
            </p>
            <Link href="/pde/learn/demonstrations/new" className="inline-block mt-5">
              <Button className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
                <PlusCircle className="h-4 w-4 mr-2" />
                Start your first demonstration
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {Header}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((row) => {
          const statusCfg = STATUS_CONFIG[row.status];
          const StatusIcon = statusCfg.icon;
          const canWithdraw = WITHDRAWABLE_STATUSES.includes(row.status);
          const categoryLabel = CATEGORY_LABELS[row.category_key] ?? row.category_key;
          // A draft carrying validator feedback was returned via "Request
          // changes" (#9b) — offer the edit/resubmit path.
          const feedback = validatorFeedback(row.validator_notes);
          const wasReturned = row.status === 'draft' && feedback.length > 0;

          return (
            <Card key={row.id} className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel}
                      </Badge>
                      <Badge className={cn('text-xs gap-1', statusCfg.className)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <CardTitle className="text-base font-semibold leading-tight">
                      {row.skill_name || <span className="text-muted-foreground italic">Untitled skill</span>}
                    </CardTitle>
                  </div>
                  {row.weighted_score !== null && row.weighted_score !== undefined && (
                    <div className="flex items-center gap-1 text-sm font-semibold text-[#0b6d41] dark:text-emerald-400 shrink-0">
                      <Trophy className="h-4 w-4" />
                      {Number(row.weighted_score).toFixed(1)}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {row.rubric_policy_key && (
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    rubric: {row.rubric_policy_key}
                  </p>
                )}
                {row.evidence_type && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Evidence type:</span>{' '}
                    <span className="font-medium">{row.evidence_type}</span>
                  </p>
                )}
                {typeof row.evidence?.notes === 'string' && row.evidence.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{row.evidence.notes}</p>
                )}

                {/* Validator feedback. When the demo was RETURNED (#9b — a draft
                    that carries a note), frame it as "changes requested" with an
                    edit/resubmit CTA. Otherwise it's the appreciation loop. */}
                {feedback.length > 0 && (
                  wasReturned ? (
                    <div className="rounded-md bg-[#ffde59]/20 border border-amber-300 p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Changes requested
                      </p>
                      {feedback.map((note, i) => (
                        <p key={i} className="text-sm text-amber-900/90 whitespace-pre-wrap">
                          {note}
                        </p>
                      ))}
                      <Link href={`/pde/learn/demonstrations/new?edit=${row.id}`}>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#ffde59] text-amber-900 hover:bg-[#ffde59]/90 border border-amber-300"
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit &amp; resubmit
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 p-3 space-y-1.5">
                      <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <MessageSquareHeart className="h-3.5 w-3.5" />
                        Validator feedback
                      </p>
                      {feedback.map((note, i) => (
                        <p key={i} className="text-sm text-emerald-900/90 dark:text-emerald-100/90 whitespace-pre-wrap">
                          {note}
                        </p>
                      ))}
                      {(row.validator_ids?.length ?? 0) > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-emerald-800 hover:text-emerald-900 hover:bg-emerald-100/60 dark:text-emerald-300"
                          onClick={() => handleThanks(row)}
                          disabled={thankedIds.has(row.id) || pendingId === row.id}
                        >
                          <MessageSquareHeart className="h-3 w-3 mr-1" />
                          {thankedIds.has(row.id)
                            ? 'Thanks sent'
                            : pendingId === row.id
                              ? 'Sending…'
                              : 'Thank your validator'}
                        </Button>
                      )}
                    </div>
                  )
                )}

                <Separator />

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {row.submitted_at ? `Submitted ${formatDate(row.submitted_at)}` : `Created ${formatDate(row.created_at)}`}
                    </span>
                    {row.passed === true && (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Passed
                      </span>
                    )}
                  </div>
                  {canWithdraw && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8 text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                      onClick={() => handleWithdraw(row.id)}
                      disabled={pendingId === row.id}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {pendingId === row.id ? 'Withdrawing…' : 'Withdraw'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
