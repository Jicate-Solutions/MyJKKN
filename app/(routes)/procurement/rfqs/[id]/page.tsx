'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRfq,
  useVendorsForSelect,
  useAddRfqVendors,
  useRemoveRfqVendor,
  useMarkRfqSent,
  useSubmitRfqForReview,
  useApproveRfq,
  useRejectRfq,
} from '@/hooks/procurement/use-rfqs';
import { RFQ_STATUS_CONFIG } from '@/types/procurement';
import { downloadRequirementListPdf } from '@/lib/procurement/requirement-list-pdf';
import { StatusBadge } from '@/components/procurement/status-badge';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, FileDown, Send, X, UserPlus, ClipboardList, ClipboardCheck, Check, Ban } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

export default function RfqDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'rfq_manage');
  const canApprove = isSuperAdmin || canAccess('procurement', 'rfq_approve');

  const { data: rfq, isLoading, isError } = useRfq(id);
  const { data: allVendors = [] } = useVendorsForSelect(profile?.institution_id || undefined);
  const addVendors = useAddRfqVendors();
  const removeVendor = useRemoveRfqVendor();
  const markSent = useMarkRfqSent();
  const submitForReview = useSubmitRfqForReview();
  const approveRfq = useApproveRfq();
  const rejectRfq = useRejectRfq();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');

  if (isLoading) {
    return (
      <ContentLayout title="RFQ">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="RFQ">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this RFQ. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!rfq) {
    return (
      <ContentLayout title="RFQ">
        <p className="text-muted-foreground py-12 text-center">RFQ not found.</p>
      </ContentLayout>
    );
  }

  const attachedIds = new Set(rfq.vendors.map((v) => v.supplier_id));
  const availableVendors = allVendors.filter((v) => !attachedIds.has(v.id));
  // The RFQ is editable (add/remove items & vendors) while the creator still owns it —
  // draft, or rejected and sent back for changes.
  const editable = canManage && (rfq.status === 'draft' || rfq.status === 'rejected');
  const canSubmitForReview = editable; // draft | rejected → pending_review

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  return (
    <ContentLayout title={rfq.rfq_number}>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to RFQs"
              onClick={() => router.push('/procurement/rfqs')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{rfq.rfq_number}</h2>
              <p className="text-muted-foreground">
                {rfq.source_request?.request_number
                  ? `From ${rfq.source_request.request_number}`
                  : 'Ad-hoc RFQ'}
              </p>
            </div>
          </div>
          <StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} className="text-sm" />
        </div>

        {/* Rejected: show the reviewer's reason and prompt a resubmit. */}
        {rfq.status === 'rejected' && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">This RFQ was returned in review.</p>
            {rfq.review_notes && <p className="mt-1">Reason: {rfq.review_notes}</p>}
            {canManage && (
              <p className="mt-1 text-xs">Adjust the items/vendors below, then submit for review again.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push(`/procurement/rfqs/${rfq.id}/quotations`)}>
            <ClipboardList className="mr-2 h-4 w-4" />
            Quotations &amp; awards
          </Button>
          <Button variant="outline" onClick={() => downloadRequirementListPdf(rfq)}>
            <FileDown className="mr-2 h-4 w-4" />
            Requirement List (PDF)
          </Button>

          {/* draft | rejected → submit for Super-Admin review */}
          {canSubmitForReview && (
            <Button
              disabled={rfq.vendors.length === 0 || rfq.items.length === 0}
              onClick={() => run(() => submitForReview.mutateAsync(rfq.id), 'Submitted for review')}
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Submit for review
            </Button>
          )}

          {/* pending_review → reviewer approves or rejects */}
          {canApprove && rfq.status === 'pending_review' && (
            <>
              <Button
                onClick={() =>
                  run(
                    () => approveRfq.mutateAsync({ rfqId: rfq.id, reviewerId: profile!.id }),
                    'RFQ approved'
                  )
                }
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive sm:ml-auto"
                onClick={() => setRejectOpen(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}

          {/* approved → send to vendors */}
          {canManage && rfq.status === 'approved' && (
            <Button
              disabled={rfq.vendors.length === 0}
              onClick={() => run(() => markSent.mutateAsync(rfq.id), 'RFQ sent to vendors')}
            >
              <Send className="mr-2 h-4 w-4" />
              Send to vendors
            </Button>
          )}
        </div>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items ({rfq.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Specification</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfq.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.item_name}</TableCell>
                    <TableCell>{it.item_spec || '—'}</TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell>{it.unit_label || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Vendors */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Vendors ({rfq.vendors.length})</CardTitle>
            {editable && availableVendors.length > 0 && (
              <div className="w-full sm:w-[220px]">
                <Select
                  value=""
                  onValueChange={(supplierId) =>
                    run(
                      () => addVendors.mutateAsync({ rfqId: rfq.id, supplierIds: [supplierId] }),
                      'Vendor added'
                    )
                  }
                >
                  <SelectTrigger>
                    <span className="flex items-center gap-2 text-sm">
                      <UserPlus className="h-4 w-4" /> Add vendor
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableVendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {rfq.vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No vendors attached yet. Add vendors before sending.
              </p>
            ) : (
              <div className="space-y-2">
                {rfq.vendors.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.supplier?.name ?? v.supplier_id}</p>
                      {v.supplier?.email && (
                        <p className="truncate text-xs text-muted-foreground">{v.supplier.email}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {v.sent_at && <Badge variant="secondary">Sent</Badge>}
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove vendor ${v.supplier?.name ?? v.supplier_id}`}
                          onClick={() =>
                            run(
                              () => removeVendor.mutateAsync({ rfqVendorId: v.id, rfqId: rfq.id }),
                              'Vendor removed'
                            )
                          }
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reject-with-reason dialog (reviewer only) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject RFQ {rfq.rfq_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (sent back to the creator)</Label>
            <Textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Explain what needs to change before this RFQ can be sent to vendors."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNotes.trim()}
              onClick={async () => {
                await run(
                  () =>
                    rejectRfq.mutateAsync({
                      rfqId: rfq.id,
                      reviewerId: profile!.id,
                      notes: rejectNotes,
                    }),
                  'RFQ returned to the creator'
                );
                setRejectOpen(false);
                setRejectNotes('');
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              Reject RFQ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
