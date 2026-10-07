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
  AlertCircle,
  BarChart3,
  Building2,
  LayoutGrid,
  Lightbulb,
  Send,
  TrendingUp,
  Type,
  Users,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react';
import {
  ImprovementService,
  type ImprovementArea
} from '@/lib/services/improvement/improvement-service';

interface CreateIdeaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: ImprovementArea[];
  /**
   * Active departments of the viewer's institution. REQUIRED on purpose: this
   * prop was optional with an `= []` default, which let the board ship without
   * passing it — the picker rendered "Not specific" and nothing else, and 55
   * consecutive ideas were filed with a null target department, with no type
   * error, no runtime error and no log line. Keeping it required means a caller
   * that forgets it fails to compile.
   */
  departments: { id: string; name: string }[];
  onCreated: () => void;
}

/** `text-base` on phones stops iOS zooming the page when a field takes focus. */
const CONTROL = 'rounded-xl text-base sm:text-sm';

export function CreateIdeaDialog({
  open,
  onOpenChange,
  areas,
  departments,
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

  const requiredDone = [
    !!title.trim(),
    !!areaId,
    !!problem.trim(),
    !!proposedFix.trim()
  ].filter(Boolean).length;

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
      {/* Header and footer stay put; only the form scrolls. `dvh` keeps the  */}
      {/* footer above a phone's browser chrome and on-screen keyboard.       */}
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 [&>button]:text-white [&>button]:opacity-90">
        <DialogHeader className="space-y-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-600 px-4 py-5 text-left text-white sm:px-6">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Lightbulb className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-lg leading-tight text-white sm:text-xl">
                File an improvement idea
              </DialogTitle>
              <DialogDescription className="text-sm text-white/85">
                A short business case: what is wrong, what you would change, and
                which data shows it matters.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${(requiredDone / 4) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-white/90">
              {requiredDone} of 4 required
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <FieldLabel
                icon={Type}
                tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                required
              >
                Title
              </FieldLabel>
              <span className="text-muted-foreground text-xs">
                {title.length}/160
              </span>
            </div>
            <Input
              placeholder="One line that names the improvement…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className={`h-11 ${CONTROL}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel
                icon={LayoutGrid}
                tone="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                required
              >
                Area
              </FieldLabel>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className={`h-11 ${CONTROL}`}>
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
              <FieldLabel
                icon={Building2}
                tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                optional
              >
                Target department
              </FieldLabel>
              <Select
                value={departmentId || 'none'}
                onValueChange={(v) => setDepartmentId(v === 'none' ? '' : v)}
              >
                <SelectTrigger className={`h-11 ${CONTROL}`}>
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
            <FieldLabel
              icon={AlertCircle}
              tone="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              required
            >
              The problem
            </FieldLabel>
            <Textarea
              placeholder="What is not working today, and who does it affect?"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
              className={CONTROL}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel
              icon={Wrench}
              tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              required
            >
              Proposed fix
            </FieldLabel>
            <Textarea
              placeholder="What you would change, concretely."
              value={proposedFix}
              onChange={(e) => setProposedFix(e.target.value)}
              rows={3}
              className={CONTROL}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel
                icon={TrendingUp}
                tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              >
                Expected impact
              </FieldLabel>
              <Textarea
                placeholder="What improves if this is applied — time, cost, quality, experience?"
                value={expectedImpact}
                onChange={(e) => setExpectedImpact(e.target.value)}
                rows={3}
                className={CONTROL}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel
                icon={BarChart3}
                tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
              >
                Evidence — which data shows it
              </FieldLabel>
              <Textarea
                placeholder="Which numbers, feedback, or records back this up?"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={3}
                className={CONTROL}
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel
              icon={Users}
              tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
              optional
            >
              Contributors
            </FieldLabel>
            <Input
              placeholder="Who else helped, and how? (a short note)"
              value={contributorNote}
              onChange={(e) => setContributorNote(e.target.value)}
              className={`h-11 ${CONTROL}`}
            />
          </div>

          <label
            htmlFor="idea-urgent"
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
              isUrgent
                ? 'border-amber-400 bg-gradient-to-r from-amber-100 to-orange-100 dark:border-amber-700 dark:from-amber-950 dark:to-orange-950'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
            }`}
          >
            <Checkbox
              id="idea-urgent"
              checked={isUrgent}
              onCheckedChange={(v) => setIsUrgent(v === true)}
            />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Mark as urgent</span>
              <span className="text-muted-foreground block text-xs">
                Request fast-track review
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="bg-muted/40 flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:space-x-0 sm:px-6">
          <DialogClose asChild>
            <Button
              variant="outline"
              disabled={submitting}
              className="h-11 w-full sm:w-auto"
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="h-11 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 sm:w-auto"
          >
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {submitting ? 'Filing…' : 'File idea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({
  icon: Icon,
  tone,
  required,
  optional,
  children
}: {
  icon: LucideIcon;
  tone: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label className="flex items-center gap-2 text-sm font-medium">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span>
        {children}
        {required && <span className="text-red-500"> *</span>}
        {optional && (
          <span className="text-muted-foreground font-normal"> (optional)</span>
        )}
      </span>
    </Label>
  );
}
