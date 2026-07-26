'use client';

/**
 * Report-a-data-gap dialog. An MBA Associate opens this from an empty analytics
 * state to file a structured gap. When the caller already knows the department
 * (a manager who has picked one), pass `areaId` + `areaLabel` and the picker is
 * hidden; otherwise the dialog loads the department list so the Associate can
 * choose which one the gap is about.
 *
 * filed_by + institution_id are set by the RPC from the signed-in session — the
 * form never sends them.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import {
  MbaDataGapService,
  type DataGapType
} from '@/lib/services/mba-data-gap/mba-data-gap-service';

interface ReportDataGapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected department; when set, the picker is hidden. */
  areaId?: string;
  areaLabel?: string;
  /** Called after a gap is filed successfully. */
  onFiled?: () => void;
}

const GAP_TYPES: { value: DataGapType; label: string }[] = [
  { value: 'not_captured', label: "I don't think it's captured" },
  { value: 'not_surfaced', label: "It's captured but there's no view" },
  { value: 'unsure', label: 'Not sure' }
];

export function ReportDataGapDialog({
  open,
  onOpenChange,
  areaId,
  areaLabel,
  onFiled
}: ReportDataGapDialogProps) {
  const [title, setTitle] = useState('');
  const [gapType, setGapType] = useState<DataGapType>('unsure');
  const [whatMissing, setWhatMissing] = useState('');
  const [whatAnalysis, setWhatAnalysis] = useState('');
  const [whatDecision, setWhatDecision] = useState('');
  const [candidateSource, setCandidateSource] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only used when no department was pre-selected.
  const [areas, setAreas] = useState<ImprovementArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [pickedAreaId, setPickedAreaId] = useState('');

  const needsPicker = !areaId;
  const effectiveAreaId = areaId ?? pickedAreaId;

  // Load the department list only when the dialog is open and no area is fixed.
  useEffect(() => {
    if (!open || !needsPicker) return;
    let alive = true;
    (async () => {
      setAreasLoading(true);
      try {
        const list = await ImprovementService.listAreas();
        if (alive) setAreas(list);
      } finally {
        if (alive) setAreasLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, needsPicker]);

  const canSubmit = useMemo(
    () => !!effectiveAreaId && !!title.trim() && !!whatMissing.trim(),
    [effectiveAreaId, title, whatMissing]
  );

  const reset = () => {
    setTitle('');
    setGapType('unsure');
    setWhatMissing('');
    setWhatAnalysis('');
    setWhatDecision('');
    setCandidateSource('');
    setPickedAreaId('');
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await MbaDataGapService.fileDataGap({
        area_id: effectiveAreaId,
        gap_type: gapType,
        title,
        what_missing: whatMissing,
        what_analysis: whatAnalysis || null,
        what_decision: whatDecision || null,
        candidate_source: candidateSource || null
      });
      toast.success('Data gap reported. A manager will review it.');
      reset();
      onOpenChange(false);
      onFiled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to report the data gap.');
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a data gap</DialogTitle>
          <DialogDescription>
            Tell us what you expected to analyse here and could not find. A
            manager reviews every report; if it is accepted it becomes an
            improvement idea on the board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {needsPicker ? (
            <div className="space-y-2">
              <Label>
                Department <span className="text-red-500">*</span>
              </Label>
              <Select
                value={pickedAreaId}
                onValueChange={setPickedAreaId}
                disabled={areasLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      areasLoading ? 'Loading departments…' : 'Choose a department…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                  {!areasLoading && areas.length === 0 && (
                    <SelectItem value="none" disabled>
                      No departments available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="bg-muted/40 rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">Department: </span>
              <span className="font-medium">{areaLabel ?? 'Selected department'}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="One line naming the missing data…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
            />
          </div>

          <div className="space-y-2">
            <Label>Which kind of gap is this?</Label>
            <RadioGroup
              value={gapType}
              onValueChange={(v) => setGapType(v as DataGapType)}
              className="gap-2"
            >
              {GAP_TYPES.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`gap-${opt.value}`}
                  className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md border p-2.5"
                >
                  <RadioGroupItem id={`gap-${opt.value}`} value={opt.value} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              What is missing? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="What did you expect to see, and could not find here?"
              value={whatMissing}
              onChange={(e) => setWhatMissing(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>What analysis would it enable?</Label>
            <Textarea
              placeholder="If you had this data, what could you work out from it?"
              value={whatAnalysis}
              onChange={(e) => setWhatAnalysis(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>What decision would it inform?</Label>
            <Textarea
              placeholder="What would this help someone decide or do differently?"
              value={whatDecision}
              onChange={(e) => setWhatDecision(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Where might the data live? (optional)</Label>
            <Input
              placeholder="A system, form, register, or team that may already hold it…"
              value={candidateSource}
              onChange={(e) => setCandidateSource(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Reporting…' : 'Report data gap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
