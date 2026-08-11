'use client';

// app/(routes)/learners-council/yuva/_components/vertical-members-panel.tsx
// Renders the assigned members of ONE vertical / stakeholder group on the YUVA
// chapter detail page, plus the assign and remove controls.
//
// WHY: every vertical card read "No members assigned" with no control to add
// anyone (BUG-06), and yuva_vertical_members has never held a single row across
// any chapter. The service layer already had assignVerticalMember() and
// removeVerticalMember() — only this UI entry point was missing. The learner is
// chosen through the module's existing searchable PersonPicker; a pasted UUID
// is the very defect PR #2702 removed from this module.
//
// The card it sits in is server-rendered, so a successful write calls
// router.refresh() to pull the new row straight back into the list.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, UserMinus } from 'lucide-react';
import { PersonPicker } from '@/app/(routes)/learners-council/structure/members/person-picker';
import {
  useAssignVerticalMember,
  useRemoveVerticalMember,
} from '@/hooks/learners-council/use-lc-structure';

const ROLE_LABEL: Record<string, string> = {
  vertical_chair: 'Chair',
  vertical_co_chair: 'Co-Chair',
  stakeholder_chair: 'Chair',
  stakeholder_co_chair: 'Co-Chair',
};

const ROLE_BADGE: Record<string, string> = {
  vertical_chair: 'bg-blue-100 text-blue-800 border-blue-200',
  vertical_co_chair: 'bg-blue-50 text-blue-700 border-blue-200',
  stakeholder_chair: 'bg-purple-100 text-purple-800 border-purple-200',
  stakeholder_co_chair: 'bg-purple-50 text-purple-700 border-purple-200',
};

export interface VerticalMemberRow {
  id: string;
  role: string;
  full_name: string | null;
}

interface VerticalMembersPanelProps {
  chapterId: string;
  verticalId: string;
  verticalName: string;
  /** 'stakeholder' or 'vertical' — decides which two role keys are offered. */
  verticalType: string;
  academicYear: string;
  members: VerticalMemberRow[];
  /** Only an authorised office bearer sees the assign / remove controls. */
  canManage: boolean;
}

export function VerticalMembersPanel({
  chapterId,
  verticalId,
  verticalName,
  verticalType,
  academicYear,
  members,
  canManage,
}: VerticalMembersPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');

  const assignMember = useAssignVerticalMember();
  const removeMember = useRemoveVerticalMember();

  const roleOptions =
    verticalType === 'stakeholder'
      ? ['stakeholder_chair', 'stakeholder_co_chair']
      : ['vertical_chair', 'vertical_co_chair'];

  const handleAssign = async () => {
    if (!userId || !role) return;
    await assignMember.mutateAsync({
      chapter_id: chapterId,
      vertical_id: verticalId,
      user_id: userId,
      role,
      academic_year: academicYear,
    });
    setUserId('');
    setRole('');
    setOpen(false);
    router.refresh();
  };

  const handleRemove = async (memberId: string) => {
    await removeMember.mutateAsync({ id: memberId, chapterId });
    router.refresh();
  };

  return (
    <div className="space-y-2">
      {members.length > 0 ? (
        members.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {m.full_name?.charAt(0) || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{m.full_name || 'Unknown'}</p>
              <Badge
                variant="outline"
                className={`text-[10px] ${ROLE_BADGE[m.role] || ''}`}
              >
                {ROLE_LABEL[m.role] || m.role}
              </Badge>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => handleRemove(m.id)}
                disabled={removeMember.isPending}
                aria-label={`Remove ${m.full_name || 'this member'} from ${verticalName}`}
                title="Remove from this vertical"
                className="shrink-0 text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-50"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="text-xs italic text-muted-foreground">No members assigned</p>
      )}

      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-full justify-start px-1 text-xs">
              <UserPlus className="mr-1 h-3 w-3" />
              Assign member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign a learner to {verticalName}</DialogTitle>
              <DialogDescription>
                Give a learner a Chair or Co-Chair role in this vertical for {academicYear}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor={`vm-role-${verticalId}`}>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id={`vm-role-${verticalId}`}>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r] || r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`vm-learner-${verticalId}`}>Learner</Label>
                <PersonPicker
                  id={`vm-learner-${verticalId}`}
                  value={userId}
                  onChange={setUserId}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Search by name or email. Only learners from institutions you can
                  access are listed.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!userId || !role || assignMember.isPending}
              >
                {assignMember.isPending ? 'Assigning...' : 'Assign member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
