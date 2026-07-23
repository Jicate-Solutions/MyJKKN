'use client';

/**
 * ClosureReportForm — PIR (post-implementation review) card.
 *
 * Manages the project_closure_reports row: closure_type, checklist, outcome
 * summary, impact summary, and the Finalize action.  Once finalized the form
 * enters read-only mode and shows a "Finalized" badge.
 *
 * finalized_by is always null here (deferred wiring — no auth-profile helper
 * is threaded through yet; see PR notes).  The column is nullable in DB so
 * this is a safe forward-compatible default.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PirChecklist } from './pir-checklist';
import { CLOSURE_TYPES, DEFAULT_CHECKLIST_ITEMS } from './types';
import type { ChecklistItem } from './types';
import {
  useClosureReport,
  useUpsertClosureReport,
  useUpdateClosureReport,
  useFinalizeClosureReport,
} from '@/hooks/projects/use-closure';
import type { ProjectClosureReport } from '@/types/projects';

interface ClosureReportFormProps {
  projectId: string;
}

function checklistFromReport(report: ProjectClosureReport | null | undefined): ChecklistItem[] {
  if (!report?.checklist) return DEFAULT_CHECKLIST_ITEMS;
  const stored = report.checklist as Record<string, unknown>;
  if (Array.isArray(stored.items)) {
    return stored.items as ChecklistItem[];
  }
  return DEFAULT_CHECKLIST_ITEMS;
}

export function ClosureReportForm({ projectId }: ClosureReportFormProps) {
  const { data: report, isLoading } = useClosureReport(projectId);
  const upsert = useUpsertClosureReport();
  const update = useUpdateClosureReport();
  const finalize = useFinalizeClosureReport();
  const { toast } = useToast();

  const isFinalized = report?.is_finalized ?? false;

  const [closureType, setClosureType] = useState<string>('planned');
  const [outcomeSummary, setOutcomeSummary] = useState('');
  const [impactSummary, setImpactSummary] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST_ITEMS);
  const [isDirty, setIsDirty] = useState(false);

  // Sync form when report loads
  useEffect(() => {
    if (report) {
      setClosureType(report.closure_type ?? 'planned');
      setOutcomeSummary(report.outcome_summary ?? '');
      setImpactSummary(report.impact_summary ?? '');
      setChecklistItems(checklistFromReport(report));
      setIsDirty(false);
    }
  }, [report]);

  function handleChecklistChange(items: ChecklistItem[]) {
    setChecklistItems(items);
    setIsDirty(true);
  }

  async function handleSave() {
    try {
      const payload = {
        project_id: projectId,
        closure_type: closureType,
        checklist: { items: checklistItems },
        outcome_summary: outcomeSummary || null,
        impact_summary: impactSummary || null,
      };

      if (report) {
        await update.mutateAsync({ id: report.id, input: payload, projectId });
      } else {
        await upsert.mutateAsync(payload);
      }

      setIsDirty(false);
      toast({ title: 'PIR report saved' });
    } catch (err) {
      toast({ title: 'Failed to save report', variant: 'destructive' });
      console.error(err);
    }
  }

  async function handleFinalize() {
    if (!report) return;
    try {
      await finalize.mutateAsync({ id: report.id, finalizedBy: null });
      toast({ title: 'Report finalized', description: 'This PIR is now read-only.' });
    } catch (err) {
      toast({ title: 'Failed to finalize', variant: 'destructive' });
      console.error(err);
    }
  }

  const isSaving = upsert.isPending || update.isPending;
  const isFinalizing = finalize.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading PIR report…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Post-Implementation Review</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Record the outcome and close the project formally.
          </p>
        </div>
        {isFinalized && (
          <Badge variant="secondary" className="gap-1.5 text-green-700 bg-green-50 border-green-200">
            <Lock className="h-3 w-3" />
            Finalized
          </Badge>
        )}
      </div>

      <Separator />

      {/* Closure type */}
      <div className="space-y-1.5">
        <Label htmlFor="closure-type">Closure type</Label>
        <Select
          value={closureType}
          onValueChange={(v) => { setClosureType(v); setIsDirty(true); }}
          disabled={isFinalized}
        >
          <SelectTrigger id="closure-type" className="w-56">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {CLOSURE_TYPES.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* PIR Checklist */}
      <div className="space-y-2">
        <Label>Review checklist</Label>
        <PirChecklist
          items={checklistItems}
          isFinalized={isFinalized}
          onChange={handleChecklistChange}
        />
      </div>

      {/* Outcome summary */}
      <div className="space-y-1.5">
        <Label htmlFor="outcome-summary">Outcome summary</Label>
        <Textarea
          id="outcome-summary"
          placeholder="What was achieved? Did the project meet its stated objectives?"
          value={outcomeSummary}
          onChange={(e) => { setOutcomeSummary(e.target.value); setIsDirty(true); }}
          disabled={isFinalized}
          rows={4}
        />
      </div>

      {/* Impact summary */}
      <div className="space-y-1.5">
        <Label htmlFor="impact-summary">Impact summary</Label>
        <Textarea
          id="impact-summary"
          placeholder="What measurable impact did the project deliver? Quantify where possible."
          value={impactSummary}
          onChange={(e) => { setImpactSummary(e.target.value); setIsDirty(true); }}
          disabled={isFinalized}
          rows={4}
        />
      </div>

      {/* Actions */}
      {!isFinalized && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            size="sm"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          {report && (
            <Button
              variant="default"
              onClick={handleFinalize}
              disabled={isFinalizing}
              size="sm"
              className="bg-green-700 hover:bg-green-800"
            >
              {isFinalizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Finalize PIR
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
