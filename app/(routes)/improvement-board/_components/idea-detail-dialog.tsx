'use client';

/**
 * Idea detail dialog — full business case + activity timeline + role actions.
 *
 * PROPOSE-ONLY: every status move goes through ImprovementService.setStatus
 * (the SECURITY DEFINER RPC). Learners may only withdraw while `logged`.
 * Managers (improvement.board.manage) review / approve / apply / verify / score.
 *
 * FINDER vs FIXER: the learner who filed the idea is the finder; the learner who
 * ships the change records it here and becomes the fixer. That write also goes
 * through a SECURITY DEFINER RPC (fn_improvement_set_resolution) because the base
 * UPDATE policy does not permit a build-mode learner to write those columns.
 * Whether to offer the control is answered by fn_improvement_can_resolve() — it
 * cannot be computed in the browser.
 */

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Zap,
  Lock,
  Clock,
  ArrowRight,
  Wrench,
  ExternalLink,
  AlertCircle,
  Lightbulb,
  TrendingUp,
  BarChart3,
  Users,
  UserCheck,
  CalendarDays,
  User,
  XCircle,
  type LucideIcon
} from 'lucide-react';
import {
  ImprovementService,
  type ImprovementIdeaEnriched,
  type ImprovementIdeaActivityEnriched,
  type ImprovementIdeaStatus
} from '@/lib/services/improvement/improvement-service';
import {
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  ALLOWED_MANAGER_TRANSITIONS
} from './board-constants';
import { IdeaAssigneesEditor } from './idea-assignees-editor';
import type { ImprovementIdeaAssignee } from '@/lib/services/improvement/improvement-service';

/** Stable empty list, so the editor's "reset when the saved list changes"
 *  effect does not fire on every render of an unassigned idea. */
const NO_ASSIGNEES: ImprovementIdeaAssignee[] = [];

/** The statuses `fn_improvement_set_resolution` accepts. Kept in sync with the
 *  RPC by hand — the RPC is the authority and will refuse anything else. */
const RESOLVABLE_STATUSES: ImprovementIdeaStatus[] = [
  'approved',
  'applied',
  'verified',
  'closed'
];

interface IdeaDetailDialogProps {
  idea: ImprovementIdeaEnriched | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  currentUserId: string;
  onChanged: () => void;
  /** Who the idea is with — its assignee and its department's owners. */
  assignedTo?: string[];
  /**
   * The viewer owns this idea's department. An owner decides an idea that is
   * under review, and assigns people once it is approved — the RPCs enforce
   * both; this only decides which controls to offer.
   */
  isAreaOwner?: boolean;
}

/** What a department owner may do with an idea under review. A subset of the
 *  RPC's own owner path — keep the two together. */
const OWNER_DECISIONS: ImprovementIdeaStatus[] = [
  'approved',
  'not_pursued',
  'rejected'
];

/** Stages at which a department owner may edit who the idea is assigned to —
 *  the same list fn_improvement_set_assignees accepts from an owner. Under
 *  review is included so an owner who is not needed can be taken off by hand. */
const OWNER_ASSIGN_STATUSES: ImprovementIdeaStatus[] = [
  'under_review',
  'approved',
  'applied'
];

/** "6 Aug 2026, 2:47 pm" — one readable format for every timestamp here. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function IdeaDetailDialog({
  idea,
  open,
  onOpenChange,
  canManage,
  currentUserId,
  onChanged,
  assignedTo = [],
  isAreaOwner = false
}: IdeaDetailDialogProps) {
  const [activity, setActivity] = useState<ImprovementIdeaActivityEnriched[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [busy, setBusy] = useState(false);

  // Manager controls
  const [moveTarget, setMoveTarget] = useState<string>('');
  const [moveNote, setMoveNote] = useState('');
  const [scoreInput, setScoreInput] = useState('');

  // Fixer controls — "record the fix"
  const [canResolve, setCanResolve] = useState<boolean | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');

  // Author edit controls
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editProblem, setEditProblem] = useState('');
  const [editFix, setEditFix] = useState('');
  const [editImpact, setEditImpact] = useState('');
  const [editEvidence, setEditEvidence] = useState('');

  const isAuthor = !!idea && idea.author_id === currentUserId;
  const canWithdraw = isAuthor && idea?.status === 'logged';
  const canEdit = isAuthor && idea?.status === 'logged';

  /** Statuses the RPC accepts a resolution on. `approved` is the pick-up state:
   *  recording the fix there also advances the idea to `applied`. */
  const resolvableStatus =
    !!idea && RESOLVABLE_STATUSES.includes(idea.status);

  /* Viewer-scoped capability probe — one round trip, kept for the dialog's
     lifetime. Not idea-scoped: the answer is about the viewer, not the row. */
  useEffect(() => {
    if (!open || canResolve !== null) return;
    let cancelled = false;
    ImprovementService.canRecordResolution().then((v) => {
      if (!cancelled) setCanResolve(v);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canResolve]);

  useEffect(() => {
    if (!open || !idea) return;
    setMoveTarget('');
    setMoveNote('');
    setResolutionInput(idea.resolution_ref || '');
    setScoreInput(idea.score != null ? String(idea.score) : '');
    setEditing(false);
    setEditTitle(idea.title || '');
    setEditProblem(idea.problem || '');
    setEditFix(idea.proposed_fix || '');
    setEditImpact(idea.expected_impact || '');
    setEditEvidence(idea.evidence || '');

    let cancelled = false;
    setLoadingActivity(true);
    ImprovementService.listActivity(idea.id)
      .then((rows) => {
        if (!cancelled) setActivity(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, idea]);

  if (!idea) return null;

  const targets = canManage
    ? ALLOWED_MANAGER_TRANSITIONS[idea.status] || []
    : isAreaOwner && idea.status === 'under_review'
      ? OWNER_DECISIONS
      : [];
  const canAssign =
    canManage || (isAreaOwner && OWNER_ASSIGN_STATUSES.includes(idea.status));

  const handleMove = async () => {
    if (!moveTarget || busy) return;
    setBusy(true);
    try {
      await ImprovementService.setStatus(
        idea.id,
        moveTarget as ImprovementIdeaStatus,
        moveNote.trim() || undefined
      );
      toast.success(`Moved to “${STATUS_LABEL[moveTarget as ImprovementIdeaStatus]}”.`);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ImprovementService.setStatus(idea.id, 'withdrawn', 'Withdrawn by author');
      toast.success('Idea withdrawn.');
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to withdraw.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordResolution = async () => {
    const ref = resolutionInput.trim();
    if (!ref || busy) return;
    setBusy(true);
    try {
      await ImprovementService.setResolution(idea.id, ref);
      toast.success('Fix recorded — you are credited as the fixer.');
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record the fix.');
    } finally {
      setBusy(false);
    }
  };

  const handleScore = async () => {
    const val = Number(scoreInput);
    if (Number.isNaN(val) || busy) return;
    setBusy(true);
    try {
      await ImprovementService.scoreIdea(idea.id, val);
      toast.success('Score saved.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save score.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editProblem.trim() || !editFix.trim() || busy) return;
    setBusy(true);
    try {
      await ImprovementService.updateIdea(idea.id, {
        title: editTitle.trim(),
        problem: editProblem.trim(),
        proposed_fix: editFix.trim(),
        expected_impact: editImpact.trim() || null,
        evidence: editEvidence.trim() || null
      });
      toast.success('Changes saved.');
      setEditing(false);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      {/* Header stays put; only the body scrolls. */}
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 [&>button]:text-white [&>button]:opacity-90">
        <DialogHeader className="space-y-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-600 px-4 py-5 text-left text-white sm:px-6">
          <div className="flex items-start gap-3 pr-8">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 sm:flex">
              <Lightbulb className="h-5 w-5" aria-hidden="true" />
            </span>
            <DialogTitle className="text-lg leading-snug text-white sm:text-xl">
              {idea.title}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Status and who-has-it sit just under the title and never scroll away. */}
        <div className="bg-muted/40 space-y-2.5 border-b px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={STATUS_BADGE_CLASS[idea.status]}>
              {STATUS_LABEL[idea.status]}
            </Badge>
            {idea.area_label && <Badge variant="secondary">{idea.area_label}</Badge>}
            {idea.is_urgent && (
              <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                <Zap className="mr-1 h-3 w-3" /> Urgent · fast-track
              </Badge>
            )}
            {idea.visibility === 'sensitive' && (
              <Badge className="border-purple-200 bg-purple-100 text-purple-800">
                <Lock className="mr-1 h-3 w-3" /> Sensitive
              </Badge>
            )}
            {idea.score != null && (
              <Badge variant="outline">Score {idea.score}</Badge>
            )}
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              Filed by{' '}
              <span className="text-foreground font-medium">
                {idea.author_name || 'Unknown'}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {formatWhen(idea.created_at)}
            </span>
            {assignedTo.length > 0 && (
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Assigned to{' '}
                <span className="text-foreground font-medium">
                  {assignedTo.join(', ')}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {editing ? (
            /* ---- Author inline edit (logged only) ---- */
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>The problem</Label>
                <Textarea value={editProblem} onChange={(e) => setEditProblem(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>Proposed fix</Label>
                <Textarea value={editFix} onChange={(e) => setEditFix(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>Expected impact</Label>
                <Textarea value={editImpact} onChange={(e) => setEditImpact(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>Evidence</Label>
                <Textarea value={editEvidence} onChange={(e) => setEditEvidence(e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={busy || !editTitle.trim() || !editProblem.trim() || !editFix.trim()}
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          ) : (
            /* ---- Read view ---- */
            <div className="space-y-3">
              <Field
                icon={AlertCircle}
                tone="rose"
                label="The problem"
                value={idea.problem}
              />
              <Field
                icon={Lightbulb}
                tone="amber"
                label="Proposed fix"
                value={idea.proposed_fix}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  icon={TrendingUp}
                  tone="emerald"
                  label="Expected impact"
                  value={idea.expected_impact}
                />
                <Field
                  icon={BarChart3}
                  tone="sky"
                  label="Evidence — which data shows it"
                  value={idea.evidence}
                />
              </div>
              {Array.isArray(idea.contributors) && idea.contributors.length > 0 && (
                <div className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Users className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold">Contributors</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {idea.contributors.map((c, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {c.note || c.learner_id || 'Contributor'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {idea.rejection_reason && (
                <Field
                  icon={XCircle}
                  tone="red"
                  label="Reason not pursued"
                  value={idea.rejection_reason}
                />
              )}
            </div>
          )}

          {/* Credit — finder vs fixer. The finder is always known (the author);
              the fixer appears once a build-mode learner records the change. */}
          {idea.resolution_ref && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
                <Wrench className="h-3.5 w-3.5" /> Fix shipped
              </div>
              <a
                href={idea.resolution_ref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
              >
                {idea.resolution_ref}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <p className="mt-1 text-xs text-emerald-900/80">
                Fixed by {idea.resolver_name || 'a learner'}
                {idea.resolved_at
                  ? ` · ${formatWhen(idea.resolved_at)}`
                  : ''}
                {' · found by '}
                {idea.author_name || 'a learner'}
              </p>
            </div>
          )}

          {/* Activity timeline */}
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">Activity</span>
              {activity.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activity.length}
                </Badge>
              )}
            </div>
            {loadingActivity ? (
              <p className="text-muted-foreground text-xs">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-muted-foreground text-xs">No activity yet.</p>
            ) : (
              <ol className="border-border ml-1.5 space-y-4 border-l pl-5">
                {activity.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="bg-primary ring-background absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4" />
                    <p className="leading-snug">
                      <span className="font-medium">{a.actor_name || 'System'}</span>{' '}
                      <span className="text-muted-foreground">
                        {formatAction(a)}
                      </span>
                    </p>
                    {a.note && (
                      <p className="bg-muted/50 text-muted-foreground mt-1.5 rounded-md px-3 py-2 text-xs whitespace-pre-wrap">
                        {a.note}
                      </p>
                    )}
                    <p className="text-muted-foreground/70 mt-1 text-xs">
                      {formatWhen(a.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Who it is with — a manager at any stage, the owner from Under Review on. */}
          {canAssign && (
            <IdeaAssigneesEditor
              ideaId={idea.id}
              current={idea.assignees ?? NO_ASSIGNEES}
              onSaved={() => {
                onOpenChange(false);
                onChanged();
              }}
            />
          )}

          {/* Review actions — a manager's, or a department owner's decision. */}
          {targets.length > 0 && (
            <div className="space-y-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 p-4 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-sky-950/40">
              <p className="text-sm font-semibold">
                {canManage ? 'Review actions' : 'Your decision'}
              </p>
              <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="idea-move-target" className="text-xs">
                    Move to
                  </Label>
                  <Select value={moveTarget} onValueChange={setMoveTarget}>
                    <SelectTrigger id="idea-move-target" className="bg-background">
                      <SelectValue placeholder="Choose a stage…" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t} value={t}>
                          {STATUS_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="idea-move-note" className="text-xs">
                    Note{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="idea-move-note"
                    placeholder="Why this move? The person who filed the idea sees this on the timeline."
                    value={moveNote}
                    onChange={(e) => setMoveNote(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="bg-background resize-y"
                  />
                  <p className="text-muted-foreground text-right text-[11px]">
                    {moveNote.length}/1000
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                {/* Scoring is a board manager's call, not an owner's. */}
                {canManage ? (
                  <div className="flex items-end gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="idea-score" className="text-xs">
                        Score
                      </Label>
                      <Input
                        id="idea-score"
                        type="number"
                        step="0.1"
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        className="bg-background w-28"
                        placeholder="0-100"
                      />
                    </div>
                    <Button variant="outline" onClick={handleScore} disabled={busy || scoreInput === ''}>
                      Save score
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground max-w-sm text-xs">
                    Approve it to take it on — you then pick the people who will
                    carry it out.
                  </p>
                )}
                <Button onClick={handleMove} disabled={!moveTarget || busy} className="h-10 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 sm:w-auto">
                  Apply move <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Record the fix — build-mode learners and board managers.
              The RPC is the authority; this block only decides what to offer. */}
          {resolvableStatus && canResolve !== false && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Wrench className="h-3.5 w-3.5" />
                {idea.resolution_ref ? 'Update the fix link' : 'Record the fix'}
              </p>
              {canResolve === null ? (
                <div className="bg-muted h-9 w-full animate-pulse rounded-md" />
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="https://github.com/… (link to the shipped change)"
                      value={resolutionInput}
                      onChange={(e) => setResolutionInput(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleRecordResolution}
                      disabled={busy || !resolutionInput.trim()}
                    >
                      {busy ? 'Saving…' : 'Record fix'}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    You are credited as the fixer. The learner who filed the idea
                    keeps their finder credit.
                    {idea.status === 'approved' &&
                      ' Recording the fix also moves this idea to Applied.'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Author actions */}
          {(canEdit || canWithdraw) && !editing && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                  Edit
                </Button>
              )}
              {canWithdraw && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={handleWithdraw}
                  disabled={busy}
                >
                  Withdraw
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One colour per section, so the business case can be scanned by colour. */
const TONES = {
  rose: {
    card: 'border-l-rose-500',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  },
  amber: {
    card: 'border-l-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  },
  emerald: {
    card: 'border-l-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  },
  sky: {
    card: 'border-l-sky-500',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
  },
  red: {
    card: 'border-l-red-500',
    chip: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
  }
} as const;

function Field({
  label,
  value,
  icon: Icon,
  tone
}: {
  label: string;
  value: string | null;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  if (!value) return null;
  return (
    <div className={`bg-card rounded-xl border border-l-4 p-4 shadow-sm ${TONES[tone].card}`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone].chip}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <FieldText value={value} />
    </div>
  );
}

/** A leading "* ", "- " or "• " marks a bullet, as filers type them. */
const BULLET = /^\s*[*\-•]\s+/;

/**
 * Filers write plain text, and often type a list as lines starting with "* ".
 * Runs of such lines render as a real list; everything else stays a paragraph.
 */
function FieldText({ value }: { value: string }) {
  const blocks: { bullets: boolean; lines: string[] }[] = [];
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const bullets = BULLET.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.bullets === bullets && bullets) last.lines.push(line);
    else blocks.push({ bullets, lines: [line] });
  }
  return (
    <div className="text-foreground/90 space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) =>
        block.bullets ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {block.lines.map((line, j) => (
              <li key={j}>{line.replace(BULLET, '')}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.lines[0]}</p>
        )
      )}
    </div>
  );
}

// Exported for test only: the coherence rule below is the whole point of
// this function and deserves a direct guard rather than one inferred
// through a full dialog render.
export function formatAction(a: ImprovementIdeaActivityEnriched): string {
  if (a.action === 'resolution_recorded') {
    return a.to_status
      ? `recorded the fix and moved it to ${STATUS_LABEL[a.to_status]}`
      : 'recorded the fix';
  }
  // A transition is only claimed when the two statuses actually DIFFER.
  //
  // A presence check is not enough here. 17 of the 46 rows in
  // improvement_idea_activity carry from_status = to_status with both non-null
  // (filed 6 Aug - 2 Sep, every one action='status_change'). A NULL would have
  // fallen through and rendered nothing, which is honestly invisible; two equal
  // non-null values passed the old `from_status && to_status` guard and produced
  // a confident falsehood — "moved it from Under Review to Under Review" — on
  // 37% of the log.
  //
  // Those rows are NOT repairable: 16 of the 17 are the only activity row their
  // idea has, so there is no predecessor to reconstruct the real from_status
  // from. Suppressing the claim IS the whole fix.
  //
  // to_status stays trustworthy on those rows — the defect wrote the NEW status
  // into from_status, it did not corrupt the destination — so they fall through
  // to "set status to X" below, which states where the idea landed without
  // inventing where it came from.
  //
  // The leak is closed at the source, verified by mechanism rather than by
  // observation: of the seven functions writing this table, four never write
  // from_status at all, and fn_improvement_set_resolution /
  // fn_improvement_set_verified_value always write to_status NULL by design, so
  // neither can make the two equal. Only fn_improvement_set_status writes
  // action='status_change' with both, and it now reads v_from_status from the
  // idea BEFORE its UPDATE (PR #3242). Newest status_change row, 9 Sep: clean.
  if (a.from_status && a.to_status && a.from_status !== a.to_status) {
    return `moved it from ${STATUS_LABEL[a.from_status]} to ${STATUS_LABEL[a.to_status]}`;
  }
  if (a.to_status) return `set status to ${STATUS_LABEL[a.to_status]}`;
  return a.action?.replace(/_/g, ' ') || 'updated the idea';
}
