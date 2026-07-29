'use client';

/**
 * File-an-idea dialog — the mini business-case form for the Improvement Board.
 * author_id + institution_id are set by the service from the signed-in session,
 * never trusted from this form.
 */

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ImprovementService,
  type ImprovementArea
} from '@/lib/services/improvement/improvement-service';

interface CreateIdeaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: ImprovementArea[];
  departments?: { id: string; name: string }[];
  onCreated: () => void;
}

export function CreateIdeaDialog({
  open,
  onOpenChange,
  areas,
  departments = [],
  onCreated
}: CreateIdeaDialogProps) {
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [problem, setProblem] = useState('');
  const [proposedFix, setProposedFix] = useState('');
  const [expectedImpact, setExpectedImpact] = useState('');
  const [evidence, setEvidence] = useState('');
  const [contributorNote, setContributorNote] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!title.trim() && !!areaId && !!problem.trim() && !!proposedFix.trim();

  const reset = () => {
    setTitle('');
    setAreaId('');
    setDepartmentId('');
    setProblem('');
    setProposedFix('');
    setExpectedImpact('');
    setEvidence('');
    setContributorNote('');
    setIsUrgent(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await ImprovementService.createIdea({
        title,
        area_id: areaId,
        target_department_id: departmentId || null,
        problem,
        proposed_fix: proposedFix,
        expected_impact: expectedImpact || null,
        evidence: evidence || null,
        is_urgent: isUrgent,
        contributors: contributorNote.trim()
          ? [{ learner_id: '', note: contributorNote.trim() }]
          : undefined
      });
      toast.success('Idea filed to the Improvement Board.');
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to file idea.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File an improvement idea</DialogTitle>
          <DialogDescription>
            A short business case: what is wrong, what you would change, and which
            data shows it matters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="One line that names the improvement…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Area <span className="text-red-500">*</span>
              </Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an area…" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                  {areas.length === 0 && (
                    <SelectItem value="none" disabled>
                      No areas available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target department (optional)</Label>
              <Select
                value={departmentId || 'none'}
                onValueChange={(v) => setDepartmentId(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any / not specific…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specific</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              The problem <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="What is not working today, and who does it affect?"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Proposed fix <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="What you would change, concretely."
              value={proposedFix}
              onChange={(e) => setProposedFix(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Expected impact</Label>
            <Textarea
              placeholder="What improves if this is applied — time, cost, quality, experience?"
              value={expectedImpact}
              onChange={(e) => setExpectedImpact(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Evidence — which data shows it</Label>
            <Textarea
              placeholder="Which numbers, feedback, or records back this up?"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Contributors (optional)</Label>
            <Input
              placeholder="Who else helped, and how? (a short note)"
              value={contributorNote}
              onChange={(e) => setContributorNote(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <Checkbox
              id="idea-urgent"
              checked={isUrgent}
              onCheckedChange={(v) => setIsUrgent(v === true)}
            />
            <Label htmlFor="idea-urgent" className="cursor-pointer font-normal">
              Mark as urgent — request fast-track review
            </Label>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Filing…' : 'File idea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
