'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2, Trash2, Edit2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

interface SchoolDetailsModalProps {
  school: SchoolWithDefaults | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  onEdit?: (school: SchoolWithDefaults) => void;
}

export default function SchoolDetailsModal({
  school,
  open,
  onOpenChange,
  onRefresh,
  onEdit,
}: SchoolDetailsModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!school) return null;

  const hasDefaults = !!school.degree_id;
  const canDelete = hasDefaults && school.learner_count === 0;

  async function handleDeleteDefaults() {
    if (!canDelete) return;
    if (!window.confirm(`Delete K-12 Program degree for ${school.school_name}?`)) return;

    try {
      setDeleting(true);
      setError(null);
      const supabase = createClientSupabaseClient();

      if (school.degree_id) {
        const { error: deleteError } = await supabase
          .from('degrees')
          .delete()
          .eq('id', school.degree_id);

        if (deleteError) throw deleteError;

        // Log audit trail
        const { data: currentUser } = await supabase.auth.getUser();
        if (currentUser.user?.id) {
          await SchoolDefaultsAuditService.logAction(
            'delete',
            school.school_id,
            school.school_name,
            'degree',
            { degree_id: school.degree_id, degree_name: school.degree_name },
            currentUser.user.id
          );
        }
      }

      await onRefresh();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete defaults');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{school.school_name}</DialogTitle>
          <DialogDescription>
            View and manage K-12 Program defaults for this school
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="text-sm text-muted-foreground">Enrolled Learners</div>
            <div className="text-2xl font-bold">{school.learner_count}</div>
          </div>

          {!hasDefaults && (
            <AlertBox
              type="warning"
              message="No K-12 Program degree assigned. Use 'Create Defaults' to add."
            />
          )}

          {hasDefaults && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground uppercase">Degree</div>
                <div className="text-lg font-semibold">{school.degree_name}</div>
                <div className="text-sm text-muted-foreground">{school.degree_code}</div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground uppercase">Department</div>
                <div className="text-lg font-semibold">
                  {school.department_name || '—'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {school.department_code || 'Not assigned'}
                </div>
              </div>
            </div>
          )}

          {error && <AlertBox type="error" message={error} />}

          {hasDefaults && school.learner_count > 0 && (
            <AlertBox
              type="info"
              message={`Cannot delete: ${school.learner_count} learner(s) assigned to this school`}
            />
          )}
        </div>

        <DialogFooter className="flex gap-2 justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {hasDefaults && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit && onEdit(school)}
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteDefaults}
                disabled={!canDelete || deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
