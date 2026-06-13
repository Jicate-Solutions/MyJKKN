'use client';

/**
 * Change Request Form Dialog
 *
 * Creates a new project change request. Fields: change_type (select),
 * title, description, impact_summary, is_major (toggle).
 * requested_by is left null (no auth helper in this layer — deferred).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useCreateChangeRequest } from '@/hooks/projects/use-changes';

const CHANGE_TYPES = [
  { value: 'scope', label: 'Scope' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'budget', label: 'Budget' },
  { value: 'resource', label: 'Resource' },
  { value: 'technical', label: 'Technical' },
  { value: 'process', label: 'Process' },
  { value: 'other', label: 'Other' },
];

interface ChangeRequestFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeRequestFormDialog({
  projectId,
  open,
  onOpenChange,
}: ChangeRequestFormDialogProps) {
  const createChangeRequest = useCreateChangeRequest();

  const [changeType, setChangeType] = useState('scope');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impactSummary, setImpactSummary] = useState('');
  const [isMajor, setIsMajor] = useState(false);

  function resetForm() {
    setChangeType('scope');
    setTitle('');
    setDescription('');
    setImpactSummary('');
    setIsMajor(false);
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    createChangeRequest.mutate(
      {
        project_id: projectId,
        change_type: changeType,
        title: title.trim(),
        description: description.trim() || null,
        impact_summary: impactSummary.trim() || null,
        is_major: isMajor,
        status: 'pending',
        requested_by: null,
      },
      {
        onSuccess: () => {
          toast.success('Change request created');
          handleClose();
        },
        onError: (err) => {
          toast.error(`Failed to create: ${err.message}`);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Change Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Change type */}
          <div className="space-y-1.5">
            <Label htmlFor="change-type">Change Type</Label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger id="change-type">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-title">Title *</Label>
            <Input
              id="cr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for the change…"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-description">Description</Label>
            <Textarea
              id="cr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is changing and why?"
              rows={3}
            />
          </div>

          {/* Impact summary */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-impact">Impact Summary</Label>
            <Textarea
              id="cr-impact"
              value={impactSummary}
              onChange={(e) => setImpactSummary(e.target.value)}
              placeholder="How does this change affect schedule, budget, or scope?"
              rows={2}
            />
          </div>

          {/* Is major toggle */}
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="cr-major"
              checked={isMajor}
              onCheckedChange={setIsMajor}
            />
            <div>
              <Label htmlFor="cr-major" className="cursor-pointer">
                Major change
              </Label>
              <p className="text-xs text-muted-foreground">
                Major changes require escalated approval.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createChangeRequest.isPending}
            >
              {createChangeRequest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                'Create Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
