'use client';

// =============================================================================
// Remedial-plan REVIEW dialog — the Senior Learner is the authority
// =============================================================================
// Shows the AI draft, lets the Senior Learner EDIT every field, and approves it.
// Approving captures `edited_content` distinct from `ai_draft` (the moat-loop
// edit signal) via fn_rcltp_remedial_plan_approve — the ONLY path to 'approved'.
// English only (Nattraja CBSE). Read-only once approved.
// =============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RcltpRemedialPlanClientService } from '@/lib/services/rcltp/remedial-plan-client-service';
import type {
  RcltpRemedialPlan,
  RcltpRemedialPlanDraft,
} from '@/types/rcltp';

interface Props {
  plan: RcltpRemedialPlan | null;
  learnerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
}

const EMPTY_DRAFT: RcltpRemedialPlanDraft = {
  summary: '',
  focus_areas: [],
  activities: [],
  target_band: '',
};

/** Deep clone so edits never mutate the source draft (edit-capture integrity). */
function cloneDraft(d: RcltpRemedialPlanDraft | null): RcltpRemedialPlanDraft {
  if (!d) return structuredClone(EMPTY_DRAFT);
  return {
    summary: d.summary ?? '',
    target_band: d.target_band ?? '',
    focus_areas: (d.focus_areas ?? []).map((f) => ({ area: f.area ?? '', why: f.why ?? '' })),
    activities: (d.activities ?? []).map((a) => ({
      title: a.title ?? '',
      detail: a.detail ?? '',
      cadence: a.cadence ?? '',
    })),
  };
}

export function RemedialPlanReviewDialog({
  plan,
  learnerName,
  open,
  onOpenChange,
  onApproved,
}: Props) {
  const isApproved = plan?.status === 'approved';

  const [draft, setDraft] = useState<RcltpRemedialPlanDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // Seed a fresh working copy whenever a different plan is opened (edits to one
  // plan never leak into another). Prefer an already-edited version if present.
  useEffect(() => {
    if (open && plan) {
      setDraft(cloneDraft(plan.edited_content ?? plan.ai_draft ?? null));
    }
  }, [open, plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSummary = (v: string) => setDraft((d) => ({ ...d, summary: v }));
  const setTargetBand = (v: string) => setDraft((d) => ({ ...d, target_band: v }));

  const updateFocus = (i: number, key: 'area' | 'why', v: string) =>
    setDraft((d) => {
      const focus_areas = d.focus_areas.slice();
      focus_areas[i] = { ...focus_areas[i], [key]: v };
      return { ...d, focus_areas };
    });
  const addFocus = () =>
    setDraft((d) => ({ ...d, focus_areas: [...d.focus_areas, { area: '', why: '' }] }));
  const removeFocus = (i: number) =>
    setDraft((d) => ({ ...d, focus_areas: d.focus_areas.filter((_, j) => j !== i) }));

  const updateActivity = (i: number, key: 'title' | 'detail' | 'cadence', v: string) =>
    setDraft((d) => {
      const activities = d.activities.slice();
      activities[i] = { ...activities[i], [key]: v };
      return { ...d, activities };
    });
  const addActivity = () =>
    setDraft((d) => ({
      ...d,
      activities: [...d.activities, { title: '', detail: '', cadence: '' }],
    }));
  const removeActivity = (i: number) =>
    setDraft((d) => ({ ...d, activities: d.activities.filter((_, j) => j !== i) }));

  async function handleApprove() {
    if (!plan) return;
    if (!draft.summary.trim() || draft.activities.length === 0) {
      toast.error('A plan needs a summary and at least one activity before approval.');
      return;
    }
    setSaving(true);
    try {
      await RcltpRemedialPlanClientService.approve(plan.id, draft);
      toast.success('Remedial plan approved.');
      onOpenChange(false);
      onApproved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not approve the plan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Sparkles className='h-4 w-4 text-primary' aria-hidden='true' />
            Remedial reading plan — {learnerName}
          </DialogTitle>
          <DialogDescription>
            {isApproved ? (
              <span className='flex items-center gap-1 text-primary'>
                <CheckCircle2 className='h-3.5 w-3.5' aria-hidden='true' />
                Approved{plan?.approved_at ? ` on ${new Date(plan.approved_at).toLocaleDateString()}` : ''}.
              </span>
            ) : (
              'AI drafted this plan from the learner’s reading data. Review and edit it, then approve — your edits are saved as the approved version.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-5 py-1'>
          {/* Summary */}
          <div className='space-y-1.5'>
            <Label htmlFor='rp-summary'>Summary</Label>
            <Textarea
              id='rp-summary'
              value={draft.summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              disabled={isApproved || saving}
            />
          </div>

          {/* Focus areas */}
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label>Focus areas</Label>
              {!isApproved && (
                <Button type='button' size='sm' variant='ghost' onClick={addFocus}>
                  <Plus className='mr-1 h-3.5 w-3.5' aria-hidden='true' /> Add
                </Button>
              )}
            </div>
            {draft.focus_areas.length === 0 && (
              <p className='text-xs text-muted-foreground'>No focus areas.</p>
            )}
            {draft.focus_areas.map((f, i) => (
              <div key={i} className='space-y-1.5 rounded-lg border border-border p-3'>
                <div className='flex items-start gap-2'>
                  <Input
                    aria-label={`Focus area ${i + 1} title`}
                    placeholder='Skill to strengthen'
                    value={f.area}
                    onChange={(e) => updateFocus(i, 'area', e.target.value)}
                    disabled={isApproved || saving}
                  />
                  {!isApproved && (
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => removeFocus(i)}
                      aria-label={`Remove focus area ${i + 1}`}
                    >
                      <Trash2 className='h-4 w-4 text-destructive' aria-hidden='true' />
                    </Button>
                  )}
                </div>
                <Textarea
                  aria-label={`Focus area ${i + 1} rationale`}
                  placeholder='Why this matters for this learner'
                  value={f.why}
                  onChange={(e) => updateFocus(i, 'why', e.target.value)}
                  rows={2}
                  disabled={isApproved || saving}
                />
              </div>
            ))}
          </div>

          <Separator />

          {/* Activities */}
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label>Activities</Label>
              {!isApproved && (
                <Button type='button' size='sm' variant='ghost' onClick={addActivity}>
                  <Plus className='mr-1 h-3.5 w-3.5' aria-hidden='true' /> Add
                </Button>
              )}
            </div>
            {draft.activities.map((a, i) => (
              <div key={i} className='space-y-1.5 rounded-lg border border-border p-3'>
                <div className='flex items-start gap-2'>
                  <Input
                    aria-label={`Activity ${i + 1} title`}
                    placeholder='Activity name'
                    value={a.title}
                    onChange={(e) => updateActivity(i, 'title', e.target.value)}
                    disabled={isApproved || saving}
                  />
                  {!isApproved && (
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => removeActivity(i)}
                      aria-label={`Remove activity ${i + 1}`}
                    >
                      <Trash2 className='h-4 w-4 text-destructive' aria-hidden='true' />
                    </Button>
                  )}
                </div>
                <Textarea
                  aria-label={`Activity ${i + 1} detail`}
                  placeholder='What the Senior Learner does with the learner'
                  value={a.detail}
                  onChange={(e) => updateActivity(i, 'detail', e.target.value)}
                  rows={2}
                  disabled={isApproved || saving}
                />
                <Input
                  aria-label={`Activity ${i + 1} cadence`}
                  placeholder='Cadence (e.g. 3x per week, 10 min)'
                  value={a.cadence}
                  onChange={(e) => updateActivity(i, 'cadence', e.target.value)}
                  disabled={isApproved || saving}
                />
              </div>
            ))}
          </div>

          {/* Target band */}
          <div className='space-y-1.5'>
            <Label htmlFor='rp-target'>Target band (next cycle)</Label>
            <Input
              id='rp-target'
              value={draft.target_band}
              onChange={(e) => setTargetBand(e.target.value)}
              disabled={isApproved || saving}
            />
          </div>

          {plan?.ai_model && (
            <p className='text-[11px] text-muted-foreground'>
              Drafted by AI ({plan.ai_model}). Provisional support plan — pending MyJKKN validation.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            {isApproved ? 'Close' : 'Cancel'}
          </Button>
          {!isApproved && (
            <Button onClick={handleApprove} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className='mr-1.5 h-4 w-4 animate-spin' aria-hidden='true' /> Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className='mr-1.5 h-4 w-4' aria-hidden='true' /> Approve plan
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
