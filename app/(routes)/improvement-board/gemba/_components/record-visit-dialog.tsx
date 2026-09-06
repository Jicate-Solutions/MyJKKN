'use client';

/**
 * Record-a-visit dialog — the form that finally writes to gemba_observations.
 *
 * Every rule `fn_gemba_observation_record` raises on is mirrored here through
 * `validateVisit()` so the person reads a sentence rather than a raw 500. The
 * mirror never replaces the server check: if anything slips past it, the RPC's
 * own message is shown verbatim.
 *
 * The department picker offers ONLY departments the signed-in person is
 * actively posted to. That is not a convenience — it is the RPC's own gate, and
 * offering anything else would be offering a button that always fails. Officers
 * get the full list, matching their separate lane in the function.
 *
 * `is_self_recorded` is deliberately absent from this form. It is derived
 * server-side from whether the observer holds a current role on that board, and
 * a self-visit that could mark itself independent would be worse than no
 * marking at all.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  GembaService,
  artifactLabel,
  validateVisit,
  type GembaArea,
  type GembaArtifact,
  type GembaFinding,
} from '@/lib/services/improvement/gemba-service';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time, not an ISO string. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

interface RecordVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Departments this person may record against — postings, or all for officers. */
  areas: GembaArea[];
  /** Departments they are actively posted to. Drives the client-side mirror. */
  postedAreaIds: string[];
  isOfficer: boolean;
  /** Pre-selected department, normally whatever the page is showing. */
  defaultAreaId?: string | null;
  onRecorded: () => void;
}

export function RecordVisitDialog({
  open,
  onOpenChange,
  areas,
  postedAreaIds,
  isOfficer,
  defaultAreaId,
  onRecorded,
}: RecordVisitDialogProps) {
  const [areaId, setAreaId] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [finding, setFinding] = useState<GembaFinding>('matches');
  const [notes, setNotes] = useState('');
  const [observedAt, setObservedAt] = useState(() => toLocalInputValue(new Date()));
  const [artifacts, setArtifacts] = useState<GembaArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reopen resets the form to a clean visit against whatever is on screen.
  useEffect(() => {
    if (!open) return;
    setAreaId(defaultAreaId || (areas.length === 1 ? areas[0].id : ''));
    setArtifactId('');
    setFinding('matches');
    setNotes('');
    setObservedAt(toLocalInputValue(new Date()));
  }, [open, defaultAreaId, areas]);

  // The document list is scoped to the chosen department, so it is impossible
  // to vouch for a document belonging to somewhere you did not go.
  useEffect(() => {
    if (!open || !areaId) {
      setArtifacts([]);
      return;
    }
    let cancelled = false;
    setArtifactsLoading(true);
    GembaService.listArtifacts(areaId)
      .then((rows) => {
        if (cancelled) return;
        setArtifacts(rows);
      })
      .finally(() => {
        if (!cancelled) setArtifactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, areaId]);

  const parsedObservedAt = useMemo(() => {
    if (!observedAt) return null;
    const d = new Date(observedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [observedAt]);

  const validationError = useMemo(
    () =>
      validateVisit(
        {
          areaId,
          artifactId: artifactId || null,
          finding,
          notes,
          observedAt: parsedObservedAt,
        },
        postedAreaIds,
        isOfficer
      ),
    [areaId, artifactId, finding, notes, parsedObservedAt, postedAreaIds, isOfficer]
  );

  const handleSubmit = async () => {
    if (submitting) return;
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await GembaService.recordVisit({
        areaId,
        artifactId: artifactId || null,
        finding,
        notes,
        observedAt: parsedObservedAt,
      });
      toast.success(
        finding === 'matches'
          ? 'Visit recorded. A named document you vouched for is now official.'
          : 'Visit recorded. The official badge is cleared and an improvement idea has been raised.'
      );
      onOpenChange(false);
      onRecorded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the visit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a gemba visit</DialogTitle>
          <DialogDescription>
            You went and looked. Say what you found. A document you vouch for
            becomes official; a mismatch clears that badge and opens an
            improvement idea.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Department -------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="gemba-area">Department you visited</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="gemba-area">
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isOfficer && (
              <p className="text-muted-foreground text-xs">
                Only departments you are currently posted to are listed.
              </p>
            )}
          </div>

          {/* Document ---------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="gemba-artifact">
              Document you checked{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select
              value={artifactId || 'none'}
              onValueChange={(v) => setArtifactId(v === 'none' ? '' : v)}
              disabled={!areaId || artifactsLoading}
            >
              <SelectTrigger id="gemba-artifact">
                <SelectValue
                  placeholder={
                    artifactsLoading ? 'Loading documents…' : 'A general visit'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  A general visit — no specific document
                </SelectItem>
                {artifacts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {artifactLabel(a.artifact_type)} (v{a.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              A general visit is recorded, but makes nothing official on its own.
            </p>
          </div>

          {/* What to look for -------------------------------------------- */}
          {/*
            Why this block exists, and why it is visible rather than hidden
            behind a disclosure: measured on production 2026-08-10, 54 actively
            posted associates had produced 2 gemba visits between them, both
            'matches', none 'differs'. Two readings, and this addresses both —
            an observer who does not know what counts as a difference records
            nothing, and an observer standing in the department with no prompt
            in front of them defaults to agreeing with the document.

            These four are the questions that make a difference visible. They
            are prompts, not fields: nothing here is stored, because the moment
            it is stored it becomes something to fill in rather than something
            to look for.
          */}
          <div className="bg-muted/40 space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Before you answer, check these four</p>
            <ul className="text-muted-foreground space-y-1.5 text-xs">
              <li>
                <span className="text-foreground font-medium">Done twice.</span>{' '}
                Did you watch the same number get written in two places, or a form
                filled from another form?
              </li>
              <li>
                <span className="text-foreground font-medium">Waiting on one person.</span>{' '}
                Did anything sit still because a single signature was not there?
              </li>
              <li>
                <span className="text-foreground font-medium">The private workaround.</span>{' '}
                Is something kept in a notebook, a spreadsheet or WhatsApp because
                the official way hurts too much?
              </li>
              <li>
                <span className="text-foreground font-medium">Quiet failure.</span>{' '}
                Is something producing output nobody reads — a printout filed
                unopened, a report nobody has looked at for weeks?
              </li>
            </ul>
            <p className="text-muted-foreground text-xs">
              A workaround that everyone uses and the document does not mention is a{' '}
              <span className="text-foreground font-medium">difference</span>, not a
              detail. The document describes the official process; you are checking
              the real one.
            </p>
          </div>

          {/* Finding ----------------------------------------------------- */}
          <div className="space-y-2">
            <Label>What you found</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFinding('matches')}
                className={`flex items-start gap-2 rounded-md border p-3 text-left text-sm transition ${
                  finding === 'matches'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'hover:bg-muted/50 border-border'
                }`}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium">Matches</span>
                  <span className="block text-xs opacity-80">
                    What happens here is what the document says.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFinding('differs')}
                className={`flex items-start gap-2 rounded-md border p-3 text-left text-sm transition ${
                  finding === 'differs'
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'hover:bg-muted/50 border-border'
                }`}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium">Differs</span>
                  <span className="block text-xs opacity-80">
                    The document and the practice disagree.
                  </span>
                </span>
              </button>
            </div>
            {/*
              'Matches' is the consequential answer, not the safe one — it is
              what stamps official_until and turns a proposal into an official
              document. Every visit recorded on this project so far has chosen
              it, so the weight of that choice is stated where it is made rather
              than left to be discovered on the analytics page afterwards.
            */}
            {finding === 'matches' && (
              <p className="text-muted-foreground text-xs">
                This is the answer that makes the document official, and it stays
                official until it expires. Choose it because you checked, not
                because nothing stood out.
              </p>
            )}
          </div>

          {/* Notes ------------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="gemba-notes">
              What you saw
              {finding === 'differs' && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              id="gemba-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                finding === 'differs'
                  ? 'Say what differed — a finding nobody can act on is not a finding.'
                  : 'Optional: anything worth the department reading.'
              }
            />
            {finding === 'differs' && (
              <p className="text-muted-foreground text-xs">
                Required. This becomes the problem statement on the improvement
                idea raised automatically from this visit.
              </p>
            )}
          </div>

          {/* When -------------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="gemba-when">When you went</Label>
            <Input
              id="gemba-when"
              type="datetime-local"
              value={observedAt}
              max={toLocalInputValue(new Date())}
              onChange={(e) => setObservedAt(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              When you actually walked in, not when you are typing this up. A
              future date is not accepted.
            </p>
          </div>

          {validationError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !!validationError}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
