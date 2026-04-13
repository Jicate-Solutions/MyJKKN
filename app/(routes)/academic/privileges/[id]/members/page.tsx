'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Users,
  Upload,
  Plus,
  UserMinus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePrivilegeGroup,
  usePrivilegeMembers,
  useAddPrivilegeMember,
  useBulkAddMembers,
  useUpdateMemberStatus,
} from '@/hooks/academic/use-privileges';
import { CsvImportDialog } from '../../_components/csv-import-dialog';
import toast from 'react-hot-toast';
import type { PrivilegeMemberStatus } from '@/types/privileges';

const memberStatusConfig: Record<
  PrivilegeMemberStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  under_review: {
    label: 'Under Review',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  revoked: { label: 'Revoked', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
};

export default function PrivilegeMembersPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const { userProfile } = usePermissions();

  const { data: group, isLoading: groupLoading } = usePrivilegeGroup(groupId);
  const { data: membersData, isLoading: membersLoading } = usePrivilegeMembers(groupId);
  const addMember = useAddPrivilegeMember(groupId);
  const bulkAdd = useBulkAddMembers(groupId);
  const updateStatus = useUpdateMemberStatus(groupId);

  // State
  const [learnerIdInput, setLearnerIdInput] = useState('');
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  // Handle both array and paginated shapes
  const membersList = Array.isArray(membersData)
    ? membersData
    : (membersData as { data?: unknown[] })?.data ?? [];

  const handleAddSingleMember = () => {
    const id = learnerIdInput.trim();
    if (!id) {
      toast.error('Please enter a learner ID');
      return;
    }

    addMember.mutate(
      {
        group_id: groupId,
        learner_id: id,
        created_by: userProfile?.id || '',
      },
      {
        onSuccess: () => {
          setLearnerIdInput('');
        },
      }
    );
  };

  const handleBulkImport = (learnerIds: string[]) => {
    bulkAdd.mutate(
      {
        group_id: groupId,
        learner_ids: learnerIds,
        created_by: userProfile?.id || '',
      },
      {
        onSuccess: () => {
          setCsvDialogOpen(false);
        },
      }
    );
  };

  const handleRevoke = () => {
    if (!selectedMemberId) return;

    updateStatus.mutate(
      {
        memberId: selectedMemberId,
        dto: {
          status: 'revoked',
          revoke_reason: revokeReason.trim() || undefined,
          revoked_by: userProfile?.id,
        },
      },
      {
        onSuccess: () => {
          setRevokeDialogOpen(false);
          setSelectedMemberId(null);
          setRevokeReason('');
        },
      }
    );
  };

  const openRevokeDialog = (memberId: string) => {
    setSelectedMemberId(memberId);
    setRevokeReason('');
    setRevokeDialogOpen(true);
  };

  if (groupLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Manage Members${group ? ` - ${group.name}` : ''}`}>
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic/privileges">Privileges</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/academic/privileges/${groupId}`}>
                {group?.name || 'Group'}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Members</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Add Member Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Single Add */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Individual Member
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="learner-id">Learner ID</Label>
                <Input
                  id="learner-id"
                  placeholder="Enter learner UUID..."
                  value={learnerIdInput}
                  onChange={(e) => setLearnerIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSingleMember();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the learner profile UUID to add them to this group.
                </p>
              </div>
              <Button
                onClick={handleAddSingleMember}
                disabled={addMember.isPending || !learnerIdInput.trim()}
                className="w-full"
              >
                {addMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Member
              </Button>
            </CardContent>
          </Card>

          {/* Bulk Import */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Bulk Import
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with learner IDs to add multiple members at once.
                The CSV should have a column with learner UUIDs.
              </p>
              <Button
                variant="outline"
                onClick={() => setCsvDialogOpen(true)}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV File
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Current Members Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Current Members ({membersList.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : membersList.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No members in this group yet. Add members above.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Roll Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(membersList as Array<{
                      id: string;
                      status: PrivilegeMemberStatus;
                      start_date: string;
                      learner?: {
                        full_name?: string;
                        first_name?: string;
                        last_name?: string;
                        roll_number?: string | null;
                      };
                    }>).map((member) => {
                      const mStatus =
                        memberStatusConfig[member.status] || memberStatusConfig.active;
                      const name =
                        member.learner?.full_name ||
                        `${member.learner?.first_name || ''} ${member.learner?.last_name || ''}`.trim() ||
                        'Unknown';
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.learner?.roll_number || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={mStatus.className}>{mStatus.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(member.start_date), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            {member.status !== 'revoked' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openRevokeDialog(member.id)}
                              >
                                <UserMinus className="h-4 w-4 mr-1" />
                                Revoke
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CSV Import Dialog */}
        <CsvImportDialog
          open={csvDialogOpen}
          onOpenChange={setCsvDialogOpen}
          onImport={handleBulkImport}
          isImporting={bulkAdd.isPending}
        />

        {/* Revoke Confirmation Dialog */}
        <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Revoke Member
              </DialogTitle>
              <DialogDescription>
                This will revoke the learner's privileges in this group. This action can be
                reversed by changing their status back.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="revoke-reason">Reason (optional)</Label>
              <Input
                id="revoke-reason"
                placeholder="Enter reason for revocation..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRevokeDialogOpen(false)}
                disabled={updateStatus.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Revoke
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
