'use client';

/**
 * AddInstitutionDialog
 *
 * Picker dialog that lets the user add an institution to a project.
 * Reuses useJkknInstitutions (JKKN API proxy, the canonical institutions source)
 * for the dropdown. Role defaults to 'participating'; user can choose 'lead'
 * (service enforces the single-lead constraint and will throw if violated).
 *
 * Pattern: components/projects/risks/risk-form-dialog.tsx
 */

import { useState } from 'react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import { useAddProjectInstitution } from '@/hooks/projects/use-project-institutions';
import type { InstitutionRole } from '@/lib/services/projects/project-institution-service';

// Radix SelectItem must never have an empty-string value.
const NONE = '__none__';

interface AddInstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** IDs already linked — excluded from the picker to avoid duplicates. */
  existingInstitutionIds: string[];
}

export function AddInstitutionDialog({
  open,
  onOpenChange,
  projectId,
  existingInstitutionIds,
}: AddInstitutionDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(NONE);
  const [role, setRole] = useState<InstitutionRole>('participating');

  const { data: instData, isLoading: instLoading } = useJkknInstitutions({
    limit: 100,
  });
  const addInstitution = useAddProjectInstitution(projectId);

  const availableInstitutions = (instData?.data ?? []).filter(
    (i) => !existingInstitutionIds.includes(i.id)
  );

  function resetForm() {
    setSelectedId(NONE);
    setRole('participating');
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedId || selectedId === NONE) {
      toast.error('Please select an institution.');
      return;
    }

    try {
      await addInstitution.mutateAsync({
        project_id: projectId,
        institution_id: selectedId,
        role,
      });

      toast.success('Institution added to project.');
      handleClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add institution.'
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add institution</DialogTitle>
            <DialogDescription>
              Link an institution to this project and assign its participation
              role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Institution picker */}
            <div className="space-y-1.5">
              <Label htmlFor="institution-select">Institution</Label>
              {instLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading institutions…
                </div>
              ) : (
                <Select
                  value={selectedId}
                  onValueChange={setSelectedId}
                >
                  <SelectTrigger id="institution-select">
                    <SelectValue placeholder="Select institution…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInstitutions.length === 0 ? (
                      <SelectItem value={NONE} disabled>
                        All institutions already added
                      </SelectItem>
                    ) : (
                      availableInstitutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Role picker */}
            <div className="space-y-1.5">
              <Label htmlFor="role-select">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as InstitutionRole)}
              >
                <SelectTrigger id="role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="participating">Participating</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
              {role === 'lead' && (
                <p className="text-xs text-muted-foreground">
                  Only one lead is allowed per project. Adding a lead will fail
                  if one is already set.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={addInstitution.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                addInstitution.isPending ||
                !selectedId ||
                selectedId === NONE ||
                instLoading
              }
            >
              {addInstitution.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                'Add institution'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
