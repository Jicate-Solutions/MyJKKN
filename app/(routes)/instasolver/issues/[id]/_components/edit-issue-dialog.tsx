'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useCategories, useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { SEVERITY_META, SEVERITY_VALUES } from '@/lib/instasolver/constants';
import type { Issue, Severity } from '@/types/instasolver';

/** The reporter's own edit, allowed only while the issue awaits triage. */
type EditIssueDialogProps = {
  issue: Issue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditIssueDialog(props: EditIssueDialogProps) {
  // Remounts per open / saved version, so the fields start from the issue.
  return <EditIssueDialogInner key={`${props.issue.id}-${props.issue.updated_at}-${props.open}`} {...props} />;
}

function EditIssueDialogInner({ issue, open, onOpenChange }: EditIssueDialogProps) {
  const { data: categories } = useCategories('issue');
  const [title, setTitle] = useState(issue.title);
  const [details, setDetails] = useState(issue.details);
  const [location, setLocation] = useState(issue.location);
  const [severity, setSeverity] = useState<Severity>(issue.severity);
  const [categoryId, setCategoryId] = useState(String(issue.category_id));

  const save = useInstaSolverMutation(
    () =>
      InstaSolverIssueService.update(issue.id, {
        title: title.trim(),
        details: details.trim(),
        location: location.trim(),
        severity,
        category_id: Number(categoryId)
      }),
    'Report updated'
  );

  const valid =
    title.trim().length >= 5 && title.trim().length <= 160 && details.trim().length >= 10 && location.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {issue.reference_no}</DialogTitle>
          <DialogDescription>You can edit this until the CAO assigns it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            {title.trim().length > 0 && title.trim().length < 5 && (
              <p className="text-xs text-destructive">At least 5 characters.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-location">Location</Label>
            <Input id="edit-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-details">Details</Label>
            <Textarea id="edit-details" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} />
            {details.trim().length > 0 && details.trim().length < 10 && (
              <p className="text-xs text-destructive">At least 10 characters.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="edit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Severity</Label>
            <div className="grid grid-cols-2 gap-2">
              {SEVERITY_VALUES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={cn(
                    'rounded-md border p-2 text-left text-sm',
                    severity === s ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                  )}
                >
                  <span className="block font-medium">{SEVERITY_META[s].label}</span>
                  <span className="block text-xs text-muted-foreground">{SEVERITY_META[s].description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || !categoryId || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
