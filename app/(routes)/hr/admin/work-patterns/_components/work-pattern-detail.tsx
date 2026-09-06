'use client';

/**
 * Detail view for one work pattern: header (name/description/active toggle)
 * plus its Week, Leave entitlements and Members tabs.
 */

import { useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/utils';
import { useDeleteWorkPattern, useUpdateWorkPattern } from '@/hooks/hr/use-work-patterns';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import type { WorkPatternSummary } from '@/types/hr-work-patterns';

// The WeeklyTimingGrid alias `@/app/(routes)/...` does not reliably resolve
// through a parenthesized route-group segment, so this goes up to `admin/`
// and back down rather than through the `@/` alias.
import { WeeklyTimingGrid } from '../../shift-timings/_components/weekly-timing-grid';
import { PatternFormDialog } from './pattern-form-dialog';
import { EntitlementsTab } from './entitlements-tab';
import { MembersTab } from './members-tab';

interface Props {
  pattern: WorkPatternSummary;
  institutionId: string;
  onBack: () => void;
}

export function WorkPatternDetail({ pattern, institutionId, onBack }: Props) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const updatePattern = useUpdateWorkPattern();
  const deletePattern = useDeleteWorkPattern();

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updatePattern.mutateAsync({ id: pattern.id, patch: { is_active: checked } });
      toast.success(checked ? 'Pattern activated' : 'Pattern deactivated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // The server decides: only a pattern nobody has EVER held can go (its week
  // rows and figures with it). Anything else comes back as the refusal text,
  // which points at Deactivate — the history-preserving way to retire one.
  const handleDelete = async () => {
    try {
      const result = await deletePattern.mutateAsync(pattern.id);
      toast.success(`"${result.name}" deleted`);
      setDeleteOpen(false);
      onBack();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            All patterns
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{pattern.name}</h2>
            {!pattern.is_active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          {pattern.description && (
            <p className="text-sm text-muted-foreground">{pattern.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="pattern-active" className="text-sm text-muted-foreground">
              {pattern.is_active ? 'Active' : 'Inactive'}
            </Label>
            <Switch
              id="pattern-active"
              checked={pattern.is_active}
              disabled={updatePattern.isPending}
              onCheckedChange={handleToggleActive}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{pattern.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This removes the pattern, its week and its leave figures. It cannot be undone.
            </p>
            {pattern.member_count > 0 ? (
              <p className="font-medium text-amber-600">
                {pattern.member_count} staff member{pattern.member_count === 1 ? ' is' : 's are'} on
                this pattern, so it cannot be deleted. Remove them and deactivate it instead.
              </p>
            ) : (
              <p>
                Only a pattern nobody has ever been assigned to can be deleted — past
                attendance resolves through a pattern&apos;s week. If someone once held
                this one, the server will refuse and you can deactivate it instead.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deletePattern.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePattern.isPending || pattern.member_count > 0}
            >
              {deletePattern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete pattern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="entitlements">Leave entitlements</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="week" className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            Mark the days this pattern works and their hours. Members can only
            be added once the week is saved.
          </p>
          <WeeklyTimingGrid
            institutionId={institutionId}
            staffScope="work_pattern"
            workPatternId={pattern.id}
            applicableGender="all"
            scopeLabel={pattern.name}
            effectiveFrom={effectiveFrom}
            onEffectiveFromChange={setEffectiveFrom}
            onSaved={() => {
              // useSaveShiftTimingWeek only invalidates its own
              // hr-shift-timings keys — it has no reason to know about work
              // patterns. Without this, the list card and the Members tab's
              // "save the week first" gate would keep showing the old
              // (possibly empty) week until something else reloaded the page.
              qc.invalidateQueries({ queryKey: ['hr-work-patterns'] });
            }}
          />
        </TabsContent>

        <TabsContent value="entitlements" className="pt-4">
          <EntitlementsTab institutionId={institutionId} patternId={pattern.id} />
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          <MembersTab pattern={pattern} institutionId={institutionId} />
        </TabsContent>
      </Tabs>

      <PatternFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        institutionId={institutionId}
        pattern={pattern}
      />
    </div>
  );
}
