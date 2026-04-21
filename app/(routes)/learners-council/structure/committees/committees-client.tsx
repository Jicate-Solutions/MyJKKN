'use client';

/**
 * Committees Client - CRUD management for Learners Council Portfolio Committees
 * Supports create/edit/delete of committees and assign/remove/role-update of members.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Crown,
  Star,
  User
} from 'lucide-react';
import {
  useCommittees,
  useCommittee,
  useCreateCommittee,
  useUpdateCommittee,
  useDeleteCommittee,
  useAssignCommitteeMember,
  useRemoveCommitteeMember,
  useUpdateCommitteeMemberRole
} from '@/hooks/learners-council/use-lc-committees';
import { useLCMembers } from '@/hooks/learners-council/use-lc-structure';
import type {
  LCPortfolioCommittee,
  LCCommitteeMember,
  CreateCommitteeDto,
  UpdateCommitteeDto
} from '@/types/learners-council';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CommitteesClientProps {
  isStaffOrAdmin: boolean;
}

export function CommitteesClient({ isStaffOrAdmin }: CommitteesClientProps) {
  const { data: committees, isLoading } = useCommittees();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingCommittee, setEditingCommittee] = useState<LCPortfolioCommittee | null>(null);
  const [deletingCommittee, setDeletingCommittee] = useState<LCPortfolioCommittee | null>(null);
  const [assigningToCommittee, setAssigningToCommittee] = useState<LCPortfolioCommittee | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const displayCommittees = committees || [];
  const totalActive = displayCommittees.filter((c) => c.is_active).length;
  const totalMembers = displayCommittees.reduce((sum, c) => sum + (c.member_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{displayCommittees.length}</p>
                <p className="text-sm text-muted-foreground">Total Committees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Star className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActive}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <User className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalMembers}</p>
                <p className="text-sm text-muted-foreground">Total Member Assignments</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      {isStaffOrAdmin && (
        <div className="flex items-center">
          <CreateCommitteeDialog />
        </div>
      )}

      {/* Committees Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading committees...
          </CardContent>
        </Card>
      ) : displayCommittees.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Focus Area</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  {isStaffOrAdmin && <TableHead className="w-[150px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayCommittees.map((committee) => (
                  <>
                    <TableRow
                      key={committee.id}
                      className={!committee.is_active ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleExpand(committee.id)}
                          aria-label={expandedId === committee.id ? 'Collapse' : 'Expand'}
                        >
                          {expandedId === committee.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{committee.name}</div>
                          {committee.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {committee.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {committee.focus_area || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{committee.member_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {committee.is_active ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-gray-50 text-gray-500 border-gray-200"
                          >
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {committee.sort_order}
                      </TableCell>
                      {isStaffOrAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setAssigningToCommittee(committee)}
                              title="Assign member"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingCommittee(committee)}
                              title="Edit committee"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeletingCommittee(committee)}
                              title="Delete committee"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded row: members */}
                    {expandedId === committee.id && (
                      <TableRow key={`${committee.id}-expanded`}>
                        <TableCell colSpan={isStaffOrAdmin ? 7 : 6} className="bg-muted/30 p-0">
                          <CommitteeMembersSection
                            committeeId={committee.id}
                            isStaffOrAdmin={isStaffOrAdmin}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium text-lg">No committees configured</h3>
            <p className="text-sm mt-1">Create your first portfolio committee to get started.</p>
            {isStaffOrAdmin && (
              <div className="mt-4">
                <CreateCommitteeDialog />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {editingCommittee && (
        <EditCommitteeDialog
          committee={editingCommittee}
          onClose={() => setEditingCommittee(null)}
        />
      )}
      {deletingCommittee && (
        <DeleteCommitteeDialog
          committee={deletingCommittee}
          onClose={() => setDeletingCommittee(null)}
        />
      )}
      {assigningToCommittee && (
        <AssignMemberDialog
          committee={assigningToCommittee}
          onClose={() => setAssigningToCommittee(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// COMMITTEE MEMBERS SECTION (expanded row)
// ============================================================================

function CommitteeMembersSection({
  committeeId,
  isStaffOrAdmin
}: {
  committeeId: string;
  isStaffOrAdmin: boolean;
}) {
  const { data: committee, isLoading } = useCommittee(committeeId);
  const removeMember = useRemoveCommitteeMember();
  const updateRole = useUpdateCommitteeMemberRole();

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground text-center">Loading members...</div>
    );
  }

  const members = committee?.members || [];

  if (members.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">No members assigned yet.</p>
      </div>
    );
  }

  const handleRemove = (id: string) => {
    if (!window.confirm('Remove this member from the committee?')) return;
    removeMember.mutate({ id, committeeId });
  };

  const handleRoleChange = (id: string, role: 'chair' | 'co_chair' | 'member') => {
    updateRole.mutate({ id, role, committeeId });
  };

  return (
    <div className="p-4">
      <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
        <Users className="h-4 w-4 text-muted-foreground" />
        Members ({members.length})
      </h4>
      <div className="space-y-2">
        {members.map((cm) => (
          <CommitteeMemberRow
            key={cm.id}
            committeeMember={cm}
            isStaffOrAdmin={isStaffOrAdmin}
            onRemove={handleRemove}
            onRoleChange={handleRoleChange}
            isUpdating={updateRole.isPending || removeMember.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function CommitteeMemberRow({
  committeeMember: cm,
  isStaffOrAdmin,
  onRemove,
  onRoleChange,
  isUpdating
}: {
  committeeMember: LCCommitteeMember;
  isStaffOrAdmin: boolean;
  onRemove: (id: string) => void;
  onRoleChange: (id: string, role: 'chair' | 'co_chair' | 'member') => void;
  isUpdating: boolean;
}) {
  const user = cm.member?.user;
  const position = cm.member?.position;
  const roleIcon =
    cm.role === 'chair' ? (
      <Crown className="h-3.5 w-3.5 text-amber-500" />
    ) : cm.role === 'co_chair' ? (
      <Star className="h-3.5 w-3.5 text-blue-500" />
    ) : (
      <User className="h-3.5 w-3.5 text-muted-foreground" />
    );

  return (
    <div className="flex items-center justify-between bg-background border rounded-md px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
          {user?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {user?.full_name || 'Unknown member'}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {position?.title || user?.email || '-'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isStaffOrAdmin ? (
          <Select
            value={cm.role}
            onValueChange={(val) => onRoleChange(cm.id, val as 'chair' | 'co_chair' | 'member')}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chair">Chair</SelectItem>
              <SelectItem value="co_chair">Co-Chair</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="text-xs gap-1">
            {roleIcon}
            {cm.role === 'co_chair' ? 'Co-Chair' : cm.role.charAt(0).toUpperCase() + cm.role.slice(1)}
          </Badge>
        )}

        {isStaffOrAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => onRemove(cm.id)}
            disabled={isUpdating}
            title="Remove member"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CREATE COMMITTEE DIALOG
// ============================================================================

function CreateCommitteeDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [focusArea, setFocusArea] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const createCommittee = useCreateCommittee();

  const handleSubmit = async () => {
    if (!name.trim()) return;

    const data: CreateCommitteeDto = {
      name: name.trim(),
      description: description.trim() || undefined,
      focus_area: focusArea.trim() || undefined,
      sort_order: parseInt(sortOrder) || 0
    };

    await createCommittee.mutateAsync(data);

    setName('');
    setDescription('');
    setFocusArea('');
    setSortOrder('0');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Create Committee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Portfolio Committee</DialogTitle>
          <DialogDescription>
            Portfolio committees are topical teams within the Learners Council. Members can belong
            to multiple committees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input
              placeholder="e.g., Academics & Research"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Focus Area</Label>
            <Input
              placeholder="e.g., Academic quality, research output"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What does this committee do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input
              type="number"
              placeholder="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              min={0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createCommittee.isPending}>
            {createCommittee.isPending ? 'Creating...' : 'Create Committee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EDIT COMMITTEE DIALOG
// ============================================================================

function EditCommitteeDialog({
  committee,
  onClose
}: {
  committee: LCPortfolioCommittee;
  onClose: () => void;
}) {
  const [name, setName] = useState(committee.name);
  const [description, setDescription] = useState(committee.description || '');
  const [focusArea, setFocusArea] = useState(committee.focus_area || '');
  const [sortOrder, setSortOrder] = useState(String(committee.sort_order));
  const [isActive, setIsActive] = useState(committee.is_active);

  const updateCommittee = useUpdateCommittee();

  const handleSubmit = async () => {
    if (!name.trim()) return;

    const data: UpdateCommitteeDto = {
      name: name.trim(),
      description: description.trim() || undefined,
      focus_area: focusArea.trim() || undefined,
      sort_order: parseInt(sortOrder) || committee.sort_order,
      is_active: isActive
    };

    await updateCommittee.mutateAsync({ id: committee.id, data });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Committee</DialogTitle>
          <DialogDescription>Update the portfolio committee details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Focus Area</Label>
            <Input value={focusArea} onChange={(e) => setFocusArea(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                min={0}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={isActive ? 'active' : 'inactive'}
                onValueChange={(v) => setIsActive(v === 'active')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || updateCommittee.isPending}>
            {updateCommittee.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DELETE COMMITTEE CONFIRMATION
// ============================================================================

function DeleteCommitteeDialog({
  committee,
  onClose
}: {
  committee: LCPortfolioCommittee;
  onClose: () => void;
}) {
  const deleteCommittee = useDeleteCommittee();
  const memberCount = committee.member_count || 0;

  const handleDelete = async () => {
    await deleteCommittee.mutateAsync(committee.id);
    onClose();
  };

  return (
    <AlertDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{committee.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {memberCount > 0 ? (
              <>
                This committee has {memberCount} active member{memberCount !== 1 ? 's' : ''}. It
                will be deactivated (soft delete) and its members will be removed.
              </>
            ) : (
              <>This committee has no members and will be permanently deleted.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteCommittee.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteCommittee.isPending
              ? 'Deleting...'
              : memberCount > 0
                ? 'Deactivate'
                : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// ASSIGN MEMBER DIALOG
// ============================================================================

function AssignMemberDialog({
  committee,
  onClose
}: {
  committee: LCPortfolioCommittee;
  onClose: () => void;
}) {
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<'chair' | 'co_chair' | 'member'>('member');
  const [notes, setNotes] = useState('');

  const { data: lcMembers, isLoading: membersLoading } = useLCMembers({ status: 'active' });
  const { data: existingCommittee } = useCommittee(committee.id);
  const assignMember = useAssignCommitteeMember();

  // Filter out members already on this committee
  const assignedMemberIds = new Set(
    (existingCommittee?.members || []).map((cm) => cm.member_id)
  );
  const availableMembers = (lcMembers || []).filter((m) => !assignedMemberIds.has(m.id));

  const handleSubmit = async () => {
    if (!memberId) return;

    await assignMember.mutateAsync({
      committee_id: committee.id,
      member_id: memberId,
      role,
      notes: notes.trim() || undefined
    });

    setMemberId('');
    setRole('member');
    setNotes('');
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Member to {committee.name}</DialogTitle>
          <DialogDescription>
            Add an active Learners Council member to this committee. Members can belong to
            multiple committees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>LC Member</Label>
            <Select value={memberId} onValueChange={setMemberId} disabled={membersLoading}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    membersLoading
                      ? 'Loading members...'
                      : availableMembers.length === 0
                        ? 'No available members'
                        : 'Select a member'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.user?.full_name || 'Unknown'}
                    {m.position?.title ? ` - ${m.position.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!membersLoading && availableMembers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                All active LC members are already on this committee, or no active members exist.
              </p>
            )}
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'chair' | 'co_chair' | 'member')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chair">Chair</SelectItem>
                <SelectItem value="co_chair">Co-Chair</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any notes about this assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!memberId || assignMember.isPending}>
            {assignMember.isPending ? 'Assigning...' : 'Assign Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
