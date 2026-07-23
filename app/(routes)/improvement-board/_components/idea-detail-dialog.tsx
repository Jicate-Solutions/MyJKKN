'use client';

/**
 * Idea detail dialog — full business case + activity timeline + role actions.
 *
 * PROPOSE-ONLY: every status move goes through ImprovementService.setStatus
 * (the SECURITY DEFINER RPC). Learners may only withdraw while `logged`.
 * Managers (improvement.board.manage) review / approve / apply / verify / score.
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
import { Zap, Lock, Clock, ArrowRight } from 'lucide-react';
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

interface IdeaDetailDialogProps {
  idea: ImprovementIdeaEnriched | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  currentUserId: string;
  onChanged: () => void;
}

export function IdeaDetailDialog({
  idea,
  open,
  onOpenChange,
  canManage,
  currentUserId,
  onChanged
}: IdeaDetailDialogProps) {
  const [activity, setActivity] = useState<ImprovementIdeaActivityEnriched[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [busy, setBusy] = useState(false);

  // Manager controls
  const [moveTarget, setMoveTarget] = useState<string>('');
  const [moveNote, setMoveNote] = useState('');
  const [scoreInput, setScoreInput] = useState('');

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

  useEffect(() => {
    if (!open || !idea) return;
    setMoveTarget('');
    setMoveNote('');
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

  const targets = ALLOWED_MANAGER_TRANSITIONS[idea.status] || [];

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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <span className="leading-snug">{idea.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Badges */}
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

          <p className="text-muted-foreground text-xs">
            Filed by {idea.author_name || 'Unknown'} ·{' '}
            {new Date(idea.created_at).toLocaleString()}
          </p>

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
            <div className="space-y-3 text-sm">
              <Field label="The problem" value={idea.problem} />
              <Field label="Proposed fix" value={idea.proposed_fix} />
              <Field label="Expected impact" value={idea.expected_impact} />
              <Field label="Evidence — which data shows it" value={idea.evidence} />
              {Array.isArray(idea.contributors) && idea.contributors.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs">Contributors</Label>
                  <ul className="mt-1 list-inside list-disc">
                    {idea.contributors.map((c, i) => (
                      <li key={i}>{c.note || c.learner_id || 'Contributor'}</li>
                    ))}
                  </ul>
                </div>
              )}
              {idea.rejection_reason && (
                <Field label="Reason not pursued" value={idea.rejection_reason} />
              )}
            </div>
          )}

          {/* Activity timeline */}
          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Clock className="h-3.5 w-3.5" /> Activity
            </div>
            {loadingActivity ? (
              <p className="text-muted-foreground text-xs">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-muted-foreground text-xs">No activity yet.</p>
            ) : (
              <ol className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span className="bg-primary/60 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div>
                      <span className="font-medium">{a.actor_name || 'System'}</span>{' '}
                      <span className="text-muted-foreground">
                        {formatAction(a)}
                      </span>
                      {a.note && (
                        <p className="text-muted-foreground italic">“{a.note}”</p>
                      )}
                      <p className="text-muted-foreground/70">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Manager actions */}
          {canManage && targets.length > 0 && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium">Review actions</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={moveTarget} onValueChange={setMoveTarget}>
                  <SelectTrigger className="sm:w-56">
                    <SelectValue placeholder="Move to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((t) => (
                      <SelectItem key={t} value={t}>
                        {STATUS_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Note (optional)"
                  value={moveNote}
                  onChange={(e) => setMoveNote(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleMove} disabled={!moveTarget || busy}>
                  Apply <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Score</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="w-28"
                  placeholder="0-100"
                />
                <Button variant="outline" size="sm" onClick={handleScore} disabled={busy || scoreInput === ''}>
                  Save score
                </Button>
              </div>
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

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function formatAction(a: ImprovementIdeaActivityEnriched): string {
  if (a.from_status && a.to_status) {
    return `moved it from ${STATUS_LABEL[a.from_status]} to ${STATUS_LABEL[a.to_status]}`;
  }
  if (a.to_status) return `set status to ${STATUS_LABEL[a.to_status]}`;
  return a.action?.replace(/_/g, ' ') || 'updated the idea';
}
