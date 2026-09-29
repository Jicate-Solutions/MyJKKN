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
import { ResponsiveList } from '@/components/procurement/responsive-list';
import {
  DocumentHeader,
  type DocAction,
  type DocPrimaryAction,
} from '@/components/procurement/document-header';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileDown, Send, X, UserPlus, ClipboardList, ClipboardCheck, Check, Ban } from 'lucide-react';
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

  let primary: DocPrimaryAction | null = null;
  let reject: DocAction | null = null;

  // draft | rejected → submit for Super-Admin review
  if (canSubmitForReview) {
    primary = {
      key: 'submit',
      label: 'Submit for review',
      icon: ClipboardCheck,
      disabled: rfq.vendors.length === 0 || rfq.items.length === 0,
      onClick: () => run(() => submitForReview.mutateAsync(rfq.id), 'Submitted for review'),
    };
  }

  // pending_review → reviewer approves or rejects
  if (canApprove && rfq.status === 'pending_review') {
    primary = {
      key: 'approve',
      label: 'Approve',
      icon: Check,
      onClick: () =>
        run(
          () => approveRfq.mutateAsync({ rfqId: rfq.id, reviewerId: profile!.id }),
          'RFQ approved'
        ),
    };
    reject = { key: 'reject', label: 'Reject', icon: X, onClick: () => setRejectOpen(true) };
  }

  // approved → send to vendors
  if (canManage && rfq.status === 'approved') {
    primary = {
      key: 'send',
      label: 'Send to vendors',
      icon: Send,
      disabled: rfq.vendors.length === 0,
      onClick: () => run(() => markSent.mutateAsync(rfq.id), 'RFQ sent to vendors'),
    };
  }

  const actions: DocAction[] = [
    {
      key: 'quotations',
      label: 'Quotations & awards',
      icon: ClipboardList,
      onClick: () => router.push(`/procurement/rfqs/${rfq.id}/quotations`),
    },
    {
      key: 'requirement-pdf',
      label: 'Requirement List (PDF)',
      icon: FileDown,
      onClick: () =>
        void downloadRequirementListPdf(rfq).catch((e) =>
          toast.error(errorMessage(e, 'Could not build the requirement list'))
        ),
    },
  ];

  return (
    <ContentLayout title={rfq.rfq_number}>
      <div className="space-y-4 sm:space-y-6 max-w-5xl">
        <DocumentHeader
          onBack={() => router.push('/procurement/rfqs')}
          backLabel="Back to RFQs"
          title={rfq.rfq_number}
          status={<StatusBadge status={rfq.status} config={RFQ_STATUS_CONFIG} className="text-sm" />}
          next={
            rfq.source_request?.request_number
              ? `From ${rfq.source_request.request_number}`
              : 'Ad-hoc RFQ'
          }
          primary={primary}
          reject={reject}
          actions={actions}
        />

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

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items ({rfq.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveList
              rows={rfq.items}
              getRowKey={(it) => it.id}
              columns={[
                { key: 'item', header: 'Item', mobile: 'title', className: 'font-medium', cell: (it) => it.item_name },
                { key: 'spec', header: 'Specification', cell: (it) => it.item_spec || '—' },
                { key: 'qty', header: 'Qty', className: 'text-right', cell: (it) => it.quantity },
                { key: 'unit', header: 'Unit', cell: (it) => it.unit_label || '—' },
              ]}
            />
          </CardContent>
        </Card>

        {/* Vendors */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                          className="h-10 w-10 sm:h-8 sm:w-8"
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
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
