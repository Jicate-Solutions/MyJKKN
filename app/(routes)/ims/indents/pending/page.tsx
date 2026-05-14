'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsPendingIndents,
  useApproveImsIndent,
  useRejectImsIndent,
} from '@/hooks/ims/use-ims-indents';
import {
  INDENT_URGENCY_CONFIG,
  type ImsIndentFilters,
  type ImsIndentRequest,
} from '@/types/ims/indents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function PendingIndentsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filters: ImsIndentFilters = {
    status: 'pending_approval',
    store_id: storeId ?? undefined,
    institution_id: institutionId || undefined,
  };

  const { data: indentsResponse, isLoading } = useImsPendingIndents(filters);
  const approveIndent = useApproveImsIndent();
  const rejectIndent = useRejectImsIndent();

  const pendingList = indentsResponse?.data ?? [];
  const totalPending = pendingList.length;
  const urgentCount = pendingList.filter(
    (i: ImsIndentRequest) => i.urgency === 'urgent'
  ).length;
  const emergencyCount = pendingList.filter(
    (i: ImsIndentRequest) => i.urgency === 'emergency'
  ).length;

  const handleApprove = async (id: string) => {
    try {
      await approveIndent.mutateAsync({ id, userId: profile?.id || '' });
      toast.success('Indent approved successfully');
    } catch {
      toast.error('Failed to approve indent');
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      await rejectIndent.mutateAsync({
        id: rejectId,
        userId: profile?.id || '',
        reason: rejectReason,
      });
      toast.success('Indent rejected');
      setRejectId(null);
      setRejectReason('');
    } catch {
      toast.error('Failed to reject indent');
    }
  };

  return (
    <ContentLayout title="Pending Approvals">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pending Approvals</h2>
          <p className="text-muted-foreground">
            Review and approve or reject indent requests
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgent</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{urgentCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Emergency</CardTitle>
              <Flame className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {emergencyCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : pendingList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mb-4 text-green-500" />
                <p className="text-lg font-medium">All caught up!</p>
                <p>No pending approvals at the moment.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indent #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingList.map((indent: ImsIndentRequest) => {
                    const urgencyConfig = INDENT_URGENCY_CONFIG[indent.urgency];
                    return (
                      <TableRow
                        key={indent.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/ims/indents/${indent.id}`)}
                      >
                        <TableCell className="font-medium">
                          {indent.indent_number}
                        </TableCell>
                        <TableCell>
                          {new Date(indent.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {indent.department?.department_name || '-'}
                        </TableCell>
                        <TableCell>
                          {indent.requested_by_profile?.full_name || '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {indent.purpose}
                        </TableCell>
                        <TableCell>
                          <Badge variant={urgencyConfig.variant}>
                            {urgencyConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(indent.id)}
                              disabled={approveIndent.isPending}
                            >
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setRejectId(indent.id)}
                              disabled={rejectIndent.isPending}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={!!rejectId} onOpenChange={() => { setRejectId(null); setRejectReason(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Indent Request</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this indent request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Rejection Reason *</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Enter the reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setRejectId(null); setRejectReason(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectIndent.isPending || !rejectReason.trim()}
              >
                {rejectIndent.isPending ? (
                  <BeatLoader color="white" size={8} />
                ) : (
                  'Reject Indent'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
