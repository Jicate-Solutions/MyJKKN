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
import { Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsService } from '@/lib/services/school-defaults-service';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';

interface CreateDefaultsDialogProps {
  schoolId: string;
  schoolName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export default function CreateDefaultsDialog({
  schoolId,
  schoolName,
  open,
  onOpenChange,
  onSuccess,
}: CreateDefaultsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateDefaults() {
    try {
      setCreating(true);
      setError(null);

      const supabase = createClientSupabaseClient();

      // Use SchoolDefaultsService to ensure defaults exist
      const defaults = await SchoolDefaultsService.getSchoolDefaults(schoolId);

      // Log audit trail
      const { data: currentUser } = await supabase.auth.getUser();
      if (currentUser.user?.id && defaults) {
        await SchoolDefaultsAuditService.logAction(
          'create',
          schoolId,
          schoolName,
          'degree',
          { degree_id: defaults.degree_id, degree_name: defaults.degree_name },
          currentUser.user.id
        );
      }

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create defaults');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create School Defaults</DialogTitle>
          <DialogDescription>
            Create K-12 Program degree and Academic department for {schoolName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AlertBox
            type="info"
            message="This will create:
• K-12 Program degree
• Academic department under the degree

These are idempotent - safe to run multiple times."
          />

          {error && <AlertBox type="error" message={error} />}

          <div className="text-sm text-muted-foreground">
            After creation, school learners can be assigned to this program.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button onClick={handleCreateDefaults} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Defaults'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
