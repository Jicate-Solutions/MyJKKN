'use client';

/**
 * Stakeholder Form Dialog — create / edit a project stakeholder.
 *
 * A stakeholder is either:
 *   - Internal: identified by staff_id (UUID), name resolved at render time.
 *   - External: identified by external_name + external_email.
 * Toggle between modes via a radio-style switch.
 *
 * NOTE: Actor fields (created_by) are null — no auth helper available at this
 * layer. The orchestrator PR can wire in the current user ID once auth context
 * is plumbed. See PR description for details.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useCreateStakeholder,
  useUpdateStakeholder,
} from '@/hooks/projects/use-stakeholders';
import {
  STAKEHOLDER_ROLE_OPTIONS,
} from '@/components/projects/stakeholders/types';
import type { ProjectStakeholder } from '@/types/projects';

const NONE = '__none__';

interface StakeholderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Provided → edit mode; omitted → create mode. */
  stakeholder?: ProjectStakeholder | null;
}

export function StakeholderFormDialog({
  open,
  onOpenChange,
  projectId,
  stakeholder,
}: StakeholderFormDialogProps) {
  const isEdit = !!stakeholder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit stakeholder' : 'Add stakeholder'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update stakeholder details and notification preferences.'
              : 'Add a person or organisation to this project.'}
          </DialogDescription>
        </DialogHeader>

        {/* Remount form body on open/stakeholder change so state initialises fresh */}
        <StakeholderFormBody
          key={`${open ? 'open' : 'closed'}-${stakeholder?.id ?? 'new'}`}
          projectId={projectId}
          stakeholder={stakeholder ?? null}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Form body ────────────────────────────────────────────────────────────────────

interface FormBodyProps {
  projectId: string;
  stakeholder: ProjectStakeholder | null;
  onSuccess: () => void;
  onCancel: () => void;
}

type PersonType = 'internal' | 'external';

function StakeholderFormBody({
  projectId,
  stakeholder,
  onSuccess,
  onCancel,
}: FormBodyProps) {
  const isEdit = !!stakeholder;
  const createMutation = useCreateStakeholder();
  const updateMutation = useUpdateStakeholder();

  const [personType, setPersonType] = useState<PersonType>(
    stakeholder?.staff_id ? 'internal' : 'external'
  );
  const [staffId, setStaffId] = useState(stakeholder?.staff_id ?? '');
  const [externalName, setExternalName] = useState(
    stakeholder?.external_name ?? ''
  );
  const [externalEmail, setExternalEmail] = useState(
    stakeholder?.external_email ?? ''
  );
  const [role, setRole] = useState(stakeholder?.role ?? NONE);
  const [notifyInApp, setNotifyInApp] = useState(
    stakeholder?.notify_in_app ?? false
  );
  const [notifyEmail, setNotifyEmail] = useState(
    stakeholder?.notify_email ?? false
  );

  const isPending =
    createMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    // Validate
    if (personType === 'internal' && !staffId.trim()) {
      toast.error('Please enter a staff ID.');
      return;
    }
    if (personType === 'external' && !externalName.trim()) {
      toast.error('Please enter a name for the external stakeholder.');
      return;
    }

    const payload = {
      staff_id: personType === 'internal' ? staffId.trim() : null,
      external_name: personType === 'external' ? externalName.trim() : null,
      external_email:
        personType === 'external' && externalEmail.trim()
          ? externalEmail.trim()
          : null,
      role: role === NONE ? null : role,
      notify_in_app: notifyInApp,
      notify_email: notifyEmail,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: stakeholder!.id, input: payload },
        {
          onSuccess: () => {
            toast.success('Stakeholder updated.');
            onSuccess();
          },
          onError: (err) => {
            toast.error(`Failed to update: ${(err as Error).message}`);
          },
        }
      );
    } else {
      createMutation.mutate(
        { project_id: projectId, ...payload },
        {
          onSuccess: () => {
            toast.success('Stakeholder added.');
            onSuccess();
          },
          onError: (err) => {
            toast.error(`Failed to add: ${(err as Error).message}`);
          },
        }
      );
    }
  }

  return (
    <>
      {/* Person type toggle */}
      <div className="grid gap-4 py-2">
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="person-type"
              value="external"
              checked={personType === 'external'}
              onChange={() => setPersonType('external')}
              className="accent-primary"
            />
            <span className="text-sm">External person</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="person-type"
              value="internal"
              checked={personType === 'internal'}
              onChange={() => setPersonType('internal')}
              className="accent-primary"
            />
            <span className="text-sm">Internal staff</span>
          </label>
        </div>

        {personType === 'internal' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="staff-id">Staff ID (UUID)</Label>
            <Input
              id="staff-id"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              placeholder="e.g. 00000000-0000-0000-0000-000000000000"
            />
            <p className="text-xs text-muted-foreground">
              Staff picker UI deferred — enter UUID directly for now.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="ext-name">Name</Label>
              <Input
                id="ext-name"
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="e.g. Vendor Project Manager"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ext-email">Email (optional)</Label>
              <Input
                id="ext-email"
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </>
        )}

        {/* Role */}
        <div className="grid gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="role">
              <SelectValue placeholder="Select role…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— None —</SelectItem>
              {STAKEHOLDER_ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notification preferences */}
        <div className="rounded-md border p-3 grid gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Notification preferences
          </p>
          <p className="text-xs text-muted-foreground -mt-1">
            Note: actual sending (email dispatch, in-app push) is deferred.
            These toggles store preferences only.
          </p>
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-in-app" className="cursor-pointer">
              In-app notifications
            </Label>
            <Switch
              id="notify-in-app"
              checked={notifyInApp}
              onCheckedChange={setNotifyInApp}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-email" className="cursor-pointer">
              Email notifications
            </Label>
            <Switch
              id="notify-email"
              checked={notifyEmail}
              onCheckedChange={setNotifyEmail}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Add stakeholder'
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
