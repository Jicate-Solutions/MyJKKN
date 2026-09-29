'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePurchaseOrder,
  useSubmitPO,
  useApprovePO,
  useRejectPO,
  useCancelPO,
  useUpdatePoDocumentFields,
  useUpdatePoItemExtraFields,
  useUpdatePoItemPrice,
} from '@/hooks/procurement/use-purchase-orders';
import { usePoFormats } from '@/hooks/procurement/use-po-formats';
import { useUpdateImsSupplier } from '@/hooks/ims/use-ims-settings';
import { PO_STATUS_CONFIG, type ProcurementPoFormat } from '@/types/procurement';
import { downloadPurchaseOrderPdf } from '@/lib/procurement/purchase-order-pdf';
import { downloadPurchaseOrderDocx } from '@/lib/procurement/purchase-order-docx';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import {
  DocumentHeader,
  type DocAction,
  type DocPrimaryAction,
} from '@/components/procurement/document-header';
import { formatDateDMY } from '@/lib/utils/date-format';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileDown, FileText, Send, Check, X, PackageCheck, Ban, Plus } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/** item_extra.<key> -> <key> */
function extraFieldKey(source: string): string {
  return source.startsWith('item_extra.') ? source.slice('item_extra.'.length) : source;
}

/** Free-entry header/footer field defs (source header_values.x or footer_values.x) an active format declares. */
function freeEntryFields(format: ProcurementPoFormat | null | undefined) {
  if (!format) return { header: [], footer: [] };
  const header = format.header_fields.filter((f) => f.source.startsWith('header_values.'));
  const footer = format.footer_columns.flatMap((group) =>
    group.freeText
      ? group.source && group.source.startsWith('footer_values.')
        ? [{ key: group.source.slice('footer_values.'.length), label: group.title, source: group.source }]
        : []
      : (group.fields || []).filter((f) => f.source.startsWith('footer_values.'))
  );
  return { header, footer };
}

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canApprove = isSuperAdmin || canAccess('procurement', 'po_approve');
  const canCreate = isSuperAdmin || canAccess('procurement', 'po_create');
  const canReceive = isSuperAdmin || canAccess('procurement', 'grn_create');

  const { data: po, isLoading, isError } = usePurchaseOrder(id);
  const submitPO = useSubmitPO();
  const approvePO = useApprovePO();
  const rejectPO = useRejectPO();
  const cancelPO = useCancelPO();
  const updateDocFields = useUpdatePoDocumentFields();
  const updateItemExtra = useUpdatePoItemExtraFields();
  const updateItemPrice = useUpdatePoItemPrice();
  const updateSupplier = useUpdateImsSupplier();

  const { data: formats } = usePoFormats(po?.institution_id, { activeOnly: true });
  const [setAsVendorDefault, setSetAsVendorDefault] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Document formatting (format/header/footer/T&C/item extras) is presentational only — it never
  // touches quantities, prices, or totals — so unlike the workflow actions (approve/send/cancel),
  // it's never status-gated; only permission-gated (canCreate), same as the rest of this page.
  const hasSavedDocDetails =
    Object.keys(po?.header_field_values || {}).length > 0 ||
    Object.keys(po?.footer_field_values || {}).length > 0 ||
    !!po?.terms_and_conditions;
  const activeFormat = po?.po_format ?? null;
  const { header: headerFieldDefs, footer: footerFieldDefs } = freeEntryFields(activeFormat);
  const itemExtraColumns = (activeFormat?.item_columns ?? []).filter((c) => c.source.startsWith('item_extra.'));

  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [footerValues, setFooterValues] = useState<Record<string, string>>({});
  const [termsText, setTermsText] = useState('');

  // Re-derive the editable document fields whenever the loaded PO or its
  // selected format changes, without a useEffect (adjusting state during
  // render, per https://react.dev/learn/you-might-not-need-an-effect).
  const syncKey = po ? `${po.id}:${po.po_format_id ?? ''}` : undefined;
  const [lastSyncKey, setLastSyncKey] = useState<string | undefined>(undefined);
  if (po && syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    setHeaderValues(po.header_field_values || {});
    setFooterValues(po.footer_field_values || {});
    setTermsText(po.terms_and_conditions ?? po.po_format?.terms_and_conditions_default ?? '');
  }

  const handleFormatChange = (formatId: string) => {
    const resolvedId = formatId === 'none' ? null : formatId;
    run(async () => {
      await updateDocFields.mutateAsync({ id, patch: { po_format_id: resolvedId } });
      if (setAsVendorDefault && po) {
        await updateSupplier.mutateAsync({
          id: po.supplier_id,
          data: { default_po_format_id: resolvedId },
        });
      }
    }, setAsVendorDefault ? 'Format applied and saved as vendor default' : 'Document format updated');
  };

  const handleToggleSetAsDefault = (checked: boolean) => {
    setSetAsVendorDefault(checked);
    if (checked && po?.po_format_id) {
      run(
        () =>
          updateSupplier.mutateAsync({
            id: po.supplier_id,
            data: { default_po_format_id: po.po_format_id },
          }),
        'Saved as vendor default'
      );
    }
  };

  const handleSaveDocumentDetails = () => {
    run(
      () =>
        updateDocFields.mutateAsync({
          id,
          patch: {
            header_field_values: headerValues,
            footer_field_values: footerValues,
            terms_and_conditions: termsText.trim() || null,
          },
        }),
      'Document details saved'
    );
  };

  const handleItemExtraBlur = (itemId: string, key: string, value: string) => {
    updateItemExtra.mutateAsync({ poId: id, itemId, extraFields: { [key]: value } }).catch((e) => {
      toast.error(errorMessage(e, 'Failed to save field'));
    });
  };

  const handleItemPriceBlur = (itemId: string, value: string) => {
    const unitPrice = Number(value);
    if (!(unitPrice >= 0)) return;
    updateItemPrice.mutateAsync({ poId: id, itemId, unitPrice }).catch((e) => {
      toast.error(errorMessage(e, 'Failed to save price'));
    });
  };

  if (isLoading) {
    return (
      <ContentLayout title="Purchase Order">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="Purchase Order">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this purchase order. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!po) {
    return (
      <ContentLayout title="Purchase Order">
        <p className="text-muted-foreground py-12 text-center">Purchase order not found.</p>
      </ContentLayout>
    );
  }

  // One workflow action at a time — a second click while the first is in
  // flight would try the same transition from a state the PO has already left.
  const transitionBusy =
    submitPO.isPending || approvePO.isPending || cancelPO.isPending || rejectPO.isPending;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const canCreateGrn = ['sent', 'approved', 'partially_received'].includes(po.status) && canReceive;
  const canCancel = (po.status === 'draft' || po.status === 'pending_approval') && canCreate;

  let primary: DocPrimaryAction | null = null;
  if (po.status === 'draft' && canCreate) {
    primary = {
      key: 'submit',
      label: 'Submit for approval',
      icon: Send,
      disabled: transitionBusy,
      onClick: () => run(() => submitPO.mutateAsync({ id, userId: profile!.id }), 'Submitted for approval'),
    };
  } else if (po.status === 'pending_approval' && canApprove) {
    primary = {
      key: 'approve',
      label: 'Approve',
      icon: Check,
      disabled: transitionBusy,
      onClick: () => run(() => approvePO.mutateAsync({ id, userId: profile!.id }), 'Purchase order approved'),
    };
  } else if (canCreateGrn) {
    primary = {
      key: 'create-grn',
      label: 'Record delivery',
      icon: PackageCheck,
      onClick: () => router.push(`/procurement/grn/new?po=${po.id}`),
    };
  }

  const reject: DocAction | null =
    po.status === 'pending_approval' && canApprove
      ? { key: 'reject', label: 'Reject', icon: X, onClick: () => setRejectOpen(true) }
      : null;

  const actions: DocAction[] = [];
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: 'Cancel PO',
      disabled: transitionBusy,
      icon: Ban,
      destructive: true,
      confirm: {
        title: `Cancel ${po.po_number}?`,
        description: 'The purchase order stops here and cannot be reopened.',
        confirmLabel: 'Cancel PO',
      },
      onClick: () => run(() => cancelPO.mutateAsync({ id, userId: profile!.id }), 'Purchase order cancelled'),
    });
  }

  return (
    <ContentLayout title={po.po_number}>
      <div className="space-y-3">
        <DocumentHeader
          compact
          onBack={() => router.push('/procurement/purchase-orders')}
          backLabel="Back to purchase orders"
          title={po.po_number}
          status={<StatusBadge status={po.status} config={PO_STATUS_CONFIG} />}
          next={
            <>
              {po.supplier?.name ?? po.supplier_id} ·{' '}
              <span className="font-semibold text-foreground tabular-nums">
                ₹{Number(po.total_amount).toLocaleString()}
              </span>
              {po.created_at ? ` · ${formatDateDMY(po.created_at)}` : ''}
            </>
          }
          primary={primary}
          reject={reject}
          actions={actions}
        />

        {/* Document toolbar — print format, library tag and downloads in one slim row. */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
            {canCreate ? (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-normal text-muted-foreground">Print as</Label>
                  <Select value={po.po_format_id ?? 'none'} onValueChange={handleFormatChange}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <SelectValue placeholder="Standard" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Standard</SelectItem>
                      {(formats ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(formats ?? []).length === 0 ? (
                  <button
                    type="button"
                    onClick={() => router.push('/procurement/purchase-orders/formats/new')}
                    className="flex items-center gap-0.5 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    New format
                  </button>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={setAsVendorDefault}
                      onCheckedChange={(c) => handleToggleSetAsDefault(!!c)}
                    />
                    Use for {po.supplier?.name ?? 'this vendor'} always
                  </label>
                )}
                <span className="hidden h-5 w-px bg-border sm:block" />
                {/* Accreditation classification — tagged POs auto-emit NAAC library
                    purchase-bill evidence once approved (DB trigger, Wave 2D). */}
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
                  title="Counts as NAAC accreditation evidence once approved"
                >
                  <Checkbox
                    checked={!!po.is_library_resource}
                    onCheckedChange={(c) =>
                      run(
                        () => updateDocFields.mutateAsync({ id, patch: { is_library_resource: !!c } }),
                        c
                          ? 'Tagged as library purchase — counts as accreditation evidence once approved'
                          : 'Library purchase tag removed'
                      )
                    }
                  />
                  Library purchase
                </label>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Prints as <span className="font-medium text-foreground">{activeFormat?.name ?? 'Standard'}</span>
                </span>
                {po.is_library_resource && <Badge variant="secondary">Library purchase</Badge>}
              </>
            )}
            <div className="ml-auto flex gap-1.5">
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => downloadPurchaseOrderPdf(po)}>
                <FileDown className="mr-1 h-3.5 w-3.5" />
                PDF
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => downloadPurchaseOrderDocx(po)}>
                <FileText className="mr-1 h-3.5 w-3.5" />
                Word
              </Button>
            </div>
          </CardContent>
        </Card>

        {po.status === 'rejected' && po.rejection_reason && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm">
                <span className="font-medium text-destructive">Rejected: </span>
                {po.rejection_reason}
              </p>
            </CardContent>
          </Card>
        )}

        {(canCreate && activeFormat && (headerFieldDefs.length > 0 || footerFieldDefs.length > 0)) || hasSavedDocDetails ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Format fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canCreate ? (
                <>
                  {headerFieldDefs.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {headerFieldDefs.map((f) => {
                        const key = f.source.slice('header_values.'.length);
                        return (
                          <div key={f.key} className="space-y-1">
                            <Label className="text-xs">{f.label}</Label>
                            <Input
                              value={headerValues[key] ?? ''}
                              onChange={(e) => setHeaderValues((prev) => ({ ...prev, [key]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {footerFieldDefs.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {footerFieldDefs.map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-xs">{f.label}</Label>
                          <Input
                            value={footerValues[f.key] ?? ''}
                            onChange={(e) => setFooterValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Terms &amp; Conditions</Label>
                    <Textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={3} />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveDocumentDetails} disabled={updateDocFields.isPending}>
                      Save Document Details
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(po.header_field_values || {}).map(([k, v]) => (
                    <p key={k}><span className="text-muted-foreground">{k}: </span>{v}</p>
                  ))}
                  {Object.entries(po.footer_field_values || {}).map(([k, v]) => (
                    <p key={k}><span className="text-muted-foreground">{k}: </span>{v}</p>
                  ))}
                  {po.terms_and_conditions && (
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Terms &amp; Conditions: </span>
                      {po.terms_and_conditions}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <ResponsiveList
              rows={po.items}
              getRowKey={(it) => it.id}
              columns={[
                {
                  key: 'item',
                  header: 'Item',
                  mobile: 'title',
                  cell: (it) => (
                    <>
                      {it.item_name}
                      {it.item_spec && (
                        <span className="text-xs font-normal text-muted-foreground"> · {it.item_spec}</span>
                      )}
                    </>
                  ),
                },
                {
                  key: 'ordered',
                  header: 'Ordered',
                  className: 'text-right',
                  cell: (it) => `${it.ordered_quantity} ${it.unit_label || ''}`,
                },
                {
                  key: 'received',
                  header: 'Received',
                  className: 'text-right',
                  cell: (it) => it.received_quantity,
                },
                {
                  key: 'price',
                  header: 'Price',
                  className: 'text-right',
                  cell: (it) =>
                    po.status === 'draft' && canCreate ? (
                      <Input
                        type="number"
                        min={0}
                        defaultValue={String(it.unit_price)}
                        onBlur={(e) => handleItemPriceBlur(it.id, e.target.value)}
                        className="h-10 w-full text-right md:ml-auto md:h-8 md:w-28"
                      />
                    ) : (
                      `₹${Number(it.unit_price).toLocaleString()}`
                    ),
                },
                {
                  key: 'total',
                  header: 'Amount',
                  className: 'text-right',
                  cell: (it) => `₹${Number(it.line_total).toLocaleString()}`,
                },
                ...itemExtraColumns.map((c) => {
                  const key = extraFieldKey(c.source);
                  return {
                    key: c.key,
                    header: c.label,
                    className: 'text-right',
                    cell: (it: (typeof po.items)[number]) =>
                      canCreate ? (
                        <Input
                          defaultValue={String(it.extra_fields?.[key] ?? '')}
                          onBlur={(e) => handleItemExtraBlur(it.id, key, e.target.value)}
                          className="h-10 w-full text-right md:ml-auto md:h-8 md:w-28"
                        />
                      ) : (
                        it.extra_fields?.[key] ?? '-'
                      ),
                  };
                }),
              ]}
            />
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground tabular-nums">
              <span>Subtotal ₹{Number(po.subtotal).toLocaleString()}</span>
              <span>Tax ₹{Number(po.tax_amount).toLocaleString()}</span>
              <span className="text-sm text-foreground">
                Total <b>₹{Number(po.total_amount).toLocaleString()}</b>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject PO</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this purchase order is being rejected..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                await run(
                  () => rejectPO.mutateAsync({ id, userId: profile!.id, reason: rejectReason }),
                  'Purchase order rejected'
                );
                setRejectOpen(false);
                setRejectReason('');
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
