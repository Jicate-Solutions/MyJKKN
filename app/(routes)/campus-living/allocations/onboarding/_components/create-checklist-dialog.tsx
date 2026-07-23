'use client';

/**
 * Create-checklist dialog. Picks one active allocation + one onboarding
 * template, then seeds a new `hostel_onboarding_checklists` row.
 *
 * `template_id` is optional in the schema — if no template exists we fall
 * back to DEFAULT_ONBOARDING_ITEMS so the user can still create.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useHostelAllocations } from '@/hooks/campus-living/use-hostel-allocations';
import {
  useCreateOnboardingChecklist,
  useOnboardingChecklists,
  useOnboardingTemplates,
} from '@/hooks/campus-living/use-hostel-onboarding';
import {
  DEFAULT_ONBOARDING_ITEMS,
  type OnboardingItem,
} from '@/types/campus-living/onboarding';

interface CreateChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
}

const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

export function CreateChecklistDialog({
  open,
  onOpenChange,
  institutionId,
}: CreateChecklistDialogProps) {
  const [allocationId, setAllocationId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('__none__');
  const [notes, setNotes] = useState('');

  const { data: allocationsResult, isLoading: allocLoading } = useHostelAllocations(
    institutionId,
    { status: 'active' as any },
  );
  const { data: templates, isLoading: tplLoading } = useOnboardingTemplates(
    institutionId,
    { activeOnly: true },
  );
  const { data: checklists } = useOnboardingChecklists(institutionId);
  const createMut = useCreateOnboardingChecklist();

  // Suppress allocations that already have a checklist — avoids duplicates.
  const existingAllocIds = useMemo(
    () => new Set((checklists ?? []).map((c) => c.allocation_id)),
    [checklists],
  );
  const availableAllocations = useMemo(
    () =>
      (allocationsResult?.data ?? []).filter(
        (a: any) => !existingAllocIds.has(a.id),
      ),
    [allocationsResult, existingAllocIds],
  );

  useEffect(() => {
    if (!open) {
      setAllocationId('');
      setTemplateId('__none__');
      setNotes('');
    }
  }, [open]);

  const handleSubmit = async () => {
    const alloc = availableAllocations.find((a: any) => a.id === allocationId);
    if (!alloc) return;
    const template =
      templateId !== '__none__'
        ? (templates ?? []).find((t) => t.id === templateId)
        : null;
    const items: OnboardingItem[] = template
      ? (template.items ?? []).map((i) => ({
          ...i,
          completed: false,
          completed_by: null,
          completed_at: null,
        }))
      : DEFAULT_ONBOARDING_ITEMS;

    await createMut.mutateAsync({
      institution_id: institutionId,
      allocation_id: alloc.id,
      learner_id: alloc.learner_id,
      template_id: template?.id ?? null,
      items,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New onboarding checklist</DialogTitle>
          <DialogDescription>
            Start an onboarding flow for an active allocation. Items are copied
            from the selected template (or a built-in default if none).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Allocation</Label>
            <Select
              value={allocationId}
              onValueChange={setAllocationId}
              disabled={allocLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    allocLoading
                      ? 'Loading allocations…'
                      : availableAllocations.length === 0
                      ? 'No allocations without an onboarding checklist'
                      : 'Select active allocation'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableAllocations.map((a: any) => {
                  const learnerName = getJoined(a, 'learner', 'full_name') || a.learner_id?.slice(0, 8);
                  const blockName = getJoined(a, 'hostel_blocks', 'name');
                  const roomNumber = getJoined(a, 'hostel_rooms', 'room_number');
                  const bedNumber = getJoined(a, 'hostel_beds', 'bed_number');
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {learnerName}
                      {blockName ? ` — ${blockName}` : ''}
                      {roomNumber ? ` / ${roomNumber}` : ''}
                      {bedNumber ? ` (bed ${bedNumber})` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {!allocLoading && availableAllocations.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Every active allocation already has a checklist.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Template</Label>
            <Select
              value={templateId}
              onValueChange={setTemplateId}
              disabled={tplLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={tplLoading ? 'Loading…' : 'Pick a template'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No template — use default items</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({(t.items ?? []).length} items)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="checklist-notes">Notes</Label>
            <Textarea
              id="checklist-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for the warden / counsellor"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!allocationId || createMut.isPending}
          >
            {createMut.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Create checklist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
