'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import {
  useImsIndent,
  useApproveImsIndent,
  useRejectImsIndent,
  useIssueImsIndentItem,
  useMarkImsIndentIssued,
  useConfirmImsIndentDelivery,
} from '@/hooks/ims/use-ims-indents';
import {
  INDENT_STATUS_CONFIG,
  INDENT_URGENCY_CONFIG,
  type ImsIndentRequestItem,
} from '@/types/ims/indents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  ArrowLeft,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  Calendar,
  Building2,
  User,
  FileText,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function IndentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const id = params.id as string;

  const [issueQuantities, setIssueQuantities] = useState<Record<string, number>>({});
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: indent, isLoading } = useImsIndent(id);
  const approveIndent = useApproveImsIndent();
  const rejectIndent = useRejectImsIndent();
  const issueItem = useIssueImsIndentItem();
  const markIssued = useMarkImsIndentIssued();
  const confirmDelivery = useConfirmImsIndentDelivery();

  if (isLoading) {
    return (
      <ContentLayout title="Indent Details">
        <div className="flex items-center justify-center py-24">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (!indent) {
    return (
      <ContentLayout title="Indent Details">
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg">Indent not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/ims/indents')}
          >
            Back to Indents
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusConfig = INDENT_STATUS_CONFIG[indent.status];
  const urgencyConfig = INDENT_URGENCY_CONFIG[indent.urgency];
  const isApproved = indent.status === 'approved' || indent.status === 'pending_issue' || indent.status === 'partially_issued';
  const isPendingApproval = indent.status === 'pending_approval';
  const isRequester = indent.requested_by === profile?.id;
  const canConfirmDelivery = indent.status === 'issued' && isRequester;

  const allItemsIssued =
    indent.items &&
    indent.items.length > 0 &&
    indent.items.every(
      (item: ImsIndentRequestItem) => item.issued_quantity >= item.quantity
    );

  const handleApprove = async () => {
    try {
      await approveIndent.mutateAsync({ id, userId: profile?.id || '' });
      toast.success('Indent approved successfully');
    } catch {
      toast.error('Failed to approve indent');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      await rejectIndent.mutateAsync({
        id,
        userId: profile?.id || '',
        reason: rejectReason,
      });
      toast.success('Indent rejected');
      setRejectDialogOpen(false);
      setRejectReason('');
    } catch {
      toast.error('Failed to reject indent');
    }
  };

  const handleIssueItem = async (itemId: string) => {
    const qty = issueQuantities[itemId];
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    try {
      await issueItem.mutateAsync({ itemId, quantity: qty });
      toast.success('Item issued successfully');
      setIssueQuantities((prev) => ({ ...prev, [itemId]: 0 }));
    } catch {
      toast.error('Failed to issue item');
    }
  };

  const handleMarkAllIssued = async () => {
    try {
      await markIssued.mutateAsync(id);
      toast.success('Indent marked as fully issued');
    } catch {
      toast.error('Failed to mark indent as issued');
    }
  };

  const handleConfirmDelivery = async () => {
    try {
      await confirmDelivery.mutateAsync(id);
      toast.success('Delivery confirmed');
    } catch {
      toast.error('Failed to confirm delivery');
    }
  };

  return (
    <ContentLayout title="Indent Details">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/ims/indents')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {indent.indent_number}
              </h2>
              <p className="text-muted-foreground">Indent Request Details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPendingApproval && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleApprove}
                  disabled={approveIndent.isPending}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
            {isApproved && allItemsIssued && (
              <Button onClick={handleMarkAllIssued} disabled={markIssued.isPending}>
                <Package className="mr-2 h-4 w-4" />
                Mark All Issued
              </Button>
            )}
            {canConfirmDelivery && (
              <Button onClick={handleConfirmDelivery} disabled={confirmDelivery.isPending}>
                <Truck className="mr-2 h-4 w-4" />
                Confirm Received
              </Button>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={statusConfig.variant} className="text-sm">
                {statusConfig.label}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgency</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={urgencyConfig.variant} className="text-sm">
                {urgencyConfig.label}
              </Badge>
              {indent.is_emergency && (
                <p className="text-xs text-destructive mt-1">Emergency Request</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Department</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {indent.department?.department_name || '-'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Requested By</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {indent.requested_by_profile?.full_name || '-'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Request Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Request Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Required Date</p>
                <p className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4" />
                  {indent.required_date
                    ? new Date(indent.required_date).toLocaleDateString()
                    : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created At</p>
                <p className="font-medium">
                  {new Date(indent.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Purpose</p>
              <p className="font-medium">{indent.purpose}</p>
            </div>
            {indent.is_emergency && indent.emergency_reason && (
              <div>
                <p className="text-sm text-destructive font-medium">Emergency Reason</p>
                <p>{indent.emergency_reason}</p>
              </div>
            )}
            {indent.rejection_reason && (
              <div>
                <p className="text-sm text-destructive font-medium">Rejection Reason</p>
                <p>{indent.rejection_reason}</p>
              </div>
            )}
            {indent.approved_by_profile && (
              <div>
                <p className="text-sm text-muted-foreground">Approved By</p>
                <p className="font-medium">
                  {indent.approved_by_profile.full_name}
                  {indent.approved_at && (
                    <span className="text-muted-foreground ml-2">
                      on {new Date(indent.approved_at).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Requested Qty</TableHead>
                  <TableHead>Issued Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  {isApproved && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {indent.items && indent.items.length > 0 ? (
                  indent.items.map((item: ImsIndentRequestItem) => {
                    const isFullyIssued = item.issued_quantity >= item.quantity;
                    const remaining = item.quantity - item.issued_quantity;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.item?.name || '-'}
                          {item.item?.code && (
                            <span className="text-muted-foreground ml-1">
                              ({item.item.code})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.issued_quantity}</TableCell>
                        <TableCell>
                          {item.unit?.abbreviation || item.unit?.name || '-'}
                        </TableCell>
                        <TableCell>
                          {isFullyIssued ? (
                            <Badge variant="default">Issued</Badge>
                          ) : item.issued_quantity > 0 ? (
                            <Badge variant="outline">
                              Partial ({remaining} remaining)
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        {isApproved && (
                          <TableCell>
                            {!isFullyIssued && (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  placeholder={`Max: ${remaining}`}
                                  className="w-24"
                                  value={issueQuantities[item.id] || ''}
                                  onChange={(e) =>
                                    setIssueQuantities((prev) => ({
                                      ...prev,
                                      [item.id]:
                                        parseInt(e.target.value) || 0,
                                    }))
                                  }
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleIssueItem(item.id)}
                                  disabled={issueItem.isPending}
                                >
                                  Issue
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={isApproved ? 6 : 5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No items found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Indent Request</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this indent request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="detail-reject-reason">Rejection Reason *</Label>
                <Textarea
                  id="detail-reject-reason"
                  placeholder="Enter the reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
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
