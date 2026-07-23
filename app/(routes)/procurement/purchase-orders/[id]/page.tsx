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
  useMarkPOSent,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, FileDown, FileText, Send, Check, X, PackageCheck } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

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

  const { data: po, isLoading } = usePurchaseOrder(id);
  const submitPO = useSubmitPO();
  const approvePO = useApprovePO();
  const rejectPO = useRejectPO();
  const markSent = useMarkPOSent();
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
      toast.error(e instanceof Error ? e.message : 'Failed to save field');
    });
  };

  const handleItemPriceBlur = (itemId: string, value: string) => {
    const unitPrice = Number(value);
    if (!(unitPrice >= 0)) return;
    updateItemPrice.mutateAsync({ poId: id, itemId, unitPrice }).catch((e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to save price');
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
  if (!po) {
    return (
      <ContentLayout title="Purchase Order">
        <p className="text-muted-foreground py-12 text-center">Purchase order not found.</p>
      </ContentLayout>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <ContentLayout title={po.po_number}>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/procurement/purchase-orders')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{po.po_number}</h2>
              <p className="text-muted-foreground">
                {po.supplier?.name ?? po.supplier_id} · ₹{Number(po.total_amount).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canCreate ? (
              <div className="flex flex-col items-end gap-1">
                <Select value={po.po_format_id ?? 'none'} onValueChange={handleFormatChange}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Document format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Standard (default)</SelectItem>
                    {(formats ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(formats ?? []).length === 0 ? (
                  <button
                    type="button"
                    onClick={() => router.push('/procurement/purchase-orders/formats/new')}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    No custom formats for this institution — create one
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="set-as-vendor-default"
                      checked={setAsVendorDefault}
                      onCheckedChange={(c) => handleToggleSetAsDefault(!!c)}
                    />
                    <Label htmlFor="set-as-vendor-default" className="text-xs text-muted-foreground cursor-pointer">
                      Also use for {po.supplier?.name ?? 'this vendor'} going forward
                    </Label>
                  </div>
                )}
              </div>
            ) : (
              <Badge variant="secondary">{activeFormat?.name ?? 'Standard'} format</Badge>
            )}
            <Badge variant="outline" className="text-sm">
              {PO_STATUS_CONFIG[po.status].label}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => downloadPurchaseOrderPdf(po)}>
            <FileDown className="mr-2 h-4 w-4" />
            Download PO (PDF)
          </Button>
          <Button variant="outline" onClick={() => downloadPurchaseOrderDocx(po)}>
            <FileText className="mr-2 h-4 w-4" />
            Download PO (DOCX)
          </Button>
          {po.status === 'draft' && canCreate && (
            <Button
              onClick={() => run(() => submitPO.mutateAsync({ id, userId: profile!.id }), 'Submitted for approval')}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit for approval
            </Button>
          )}
          {po.status === 'pending_approval' && canApprove && (
            <>
              <Button
                onClick={() => run(() => approvePO.mutateAsync({ id, userId: profile!.id }), 'PO approved')}
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {po.status === 'approved' && canCreate && (
            <Button onClick={() => run(() => markSent.mutateAsync({ id, userId: profile!.id }), 'PO marked as sent')}>
              <Send className="mr-2 h-4 w-4" />
              Send to vendor
            </Button>
          )}
          {['sent', 'approved', 'partially_received'].includes(po.status) && canReceive && (
            <Button onClick={() => router.push(`/procurement/grn/new?po=${po.id}`)}>
              <PackageCheck className="mr-2 h-4 w-4" />
              Create GRN
            </Button>
          )}
          {(po.status === 'draft' || po.status === 'pending_approval') && canCreate && (
            <Button
              variant="ghost"
              onClick={() => run(() => cancelPO.mutateAsync({ id, userId: profile!.id }), 'PO cancelled')}
            >
              Cancel PO
            </Button>
          )}
        </div>

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
              <CardTitle className="text-base">Document Details</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                  {itemExtraColumns.map((c) => (
                    <TableHead key={c.key} className="text-right">{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {it.item_name}
                      {it.item_spec && (
                        <span className="block text-xs text-muted-foreground">{it.item_spec}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.ordered_quantity} {it.unit_label || ''}
                    </TableCell>
                    <TableCell className="text-right">{it.received_quantity}</TableCell>
                    <TableCell className="text-right">
                      {po.status === 'draft' && canCreate ? (
                        <Input
                          type="number"
                          min={0}
                          defaultValue={String(it.unit_price)}
                          onBlur={(e) => handleItemPriceBlur(it.id, e.target.value)}
                          className="h-8 w-28 ml-auto text-right"
                        />
                      ) : (
                        `₹${Number(it.unit_price).toLocaleString()}`
                      )}
                    </TableCell>
                    <TableCell className="text-right">₹{Number(it.line_total).toLocaleString()}</TableCell>
                    {itemExtraColumns.map((c) => {
                      const key = extraFieldKey(c.source);
                      return (
                        <TableCell key={c.key} className="text-right">
                          {canCreate ? (
                            <Input
                              defaultValue={String(it.extra_fields?.[key] ?? '')}
                              onBlur={(e) => handleItemExtraBlur(it.id, key, e.target.value)}
                              className="h-8 w-28 ml-auto text-right"
                            />
                          ) : (
                            it.extra_fields?.[key] ?? '-'
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end border-t p-4">
              <div className="text-right space-y-1">
                <p className="text-sm text-muted-foreground">
                  Subtotal: ₹{Number(po.subtotal).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Tax: ₹{Number(po.tax_amount).toLocaleString()}
                </p>
                <p className="text-base font-semibold">
                  Total: ₹{Number(po.total_amount).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject purchase order</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this PO is being rejected..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                await run(
                  () => rejectPO.mutateAsync({ id, userId: profile!.id, reason: rejectReason }),
                  'PO rejected'
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
