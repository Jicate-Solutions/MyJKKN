'use client';

/**
 * Change Request Form Dialog — create OR edit.
 *
 * Create: raises a new change request (fn_create_change_request). The server
 * resolves attribution and starts it at 'submitted'.
 * Edit (pass `existing`): updates an in-flight request the current user raised,
 * while it is still 'submitted' (fn_update_change_request). is_major is frozen
 * after creation, so the "Major change" toggle is hidden in edit mode.
 *
 * change_type values must match the DB CHECK: {scope, timeline, budget, other}.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import { useEffect, useState } from 'react';
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
import {
  useCreateChangeRequest,
  useUpdateChangeRequest,
} from '@/hooks/projects/use-changes';
import type { ProjectChangeRequest } from '@/types/projects';

// Values MUST match the project_change_requests.change_type CHECK constraint.
const CHANGE_TYPES = [
  { value: 'scope', label: 'Scope' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'budget', label: 'Budget' },
  { value: 'other', label: 'Other' },
];

interface ChangeRequestFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this request instead of creating a new one. */
  existing?: ProjectChangeRequest | null;
}

export function ChangeRequestFormDialog({
  projectId,
  open,
  onOpenChange,
  existing = null,
}: ChangeRequestFormDialogProps) {
  const isEdit = !!existing;
  const createChangeRequest = useCreateChangeRequest();
  const updateChangeRequest = useUpdateChangeRequest();
  const pending = createChangeRequest.isPending || updateChangeRequest.isPending;

  const [changeType, setChangeType] = useState('scope');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impactSummary, setImpactSummary] = useState('');
  const [isMajor, setIsMajor] = useState(false);

  // Sync form state whenever the dialog opens (prefill for edit, blank for create).
  useEffect(() => {
    if (!open) return;
    setChangeType(existing?.change_type ?? 'scope');
    setTitle(existing?.title ?? '');
    setDescription(existing?.description ?? '');
    setImpactSummary(existing?.impact_summary ?? '');
    setIsMajor(existing?.is_major ?? false);
  }, [open, existing]);

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    if (isEdit && existing) {
      updateChangeRequest.mutate(
        {
          id: existing.id,
          input: {
            change_type: changeType,
            title: title.trim(),
            description: description.trim() || null,
            impact_summary: impactSummary.trim() || null,
          },
        },
        {
          onSuccess: () => {
            toast.success('Change request updated');
            handleClose();
          },
          onError: (err) => toast.error(`Failed to update: ${err.message}`),
        }
      );
      return;
    }

    createChangeRequest.mutate(
      {
        project_id: projectId,
        change_type: changeType,
        title: title.trim(),
        description: description.trim() || null,
        impact_summary: impactSummary.trim() || null,
        is_major: isMajor,
      },
      {
        onSuccess: () => {
          toast.success('Change request created');
          handleClose();
        },
        onError: (err) => toast.error(`Failed to create: ${err.message}`),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Change Request' : 'New Change Request'}
          </DialogTitle>
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

          {/* Is major toggle — only at creation (frozen afterwards) */}
          {!isEdit && (
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
                  Major changes require an admin&apos;s approval.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isEdit ? 'Saving…' : 'Creating…'}
                </>
              ) : isEdit ? (
                'Save Changes'
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
