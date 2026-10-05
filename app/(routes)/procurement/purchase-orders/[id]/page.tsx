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
} from '@/hooks/procurement/use-purchase-orders';
import { usePoFormats } from '@/hooks/procurement/use-po-formats';
import { useUpdateImsSupplier } from '@/hooks/ims/use-ims-settings';
import { PO_STATUS_CONFIG, type ProcurementPoFormat } from '@/types/procurement';
import { downloadPurchaseOrderPdf } from '@/lib/procurement/purchase-order-pdf';
import { downloadPurchaseOrderDocx } from '@/lib/procurement/purchase-order-docx';
import { StatusBadge } from '@/components/procurement/status-badge';
import { type DocAction, type DocPrimaryAction } from '@/components/procurement/document-header';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { STANDARD_PO_FORMAT } from '@/lib/procurement/po-document-model';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileDown, FileText, Send, Check, X, Ban, ClipboardList, ChevronLeft, ChevronDown } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/** Print-as option that opens the format builder instead of choosing a format. */
const NEW_FORMAT = '__new_format';

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

  const { data: po, isLoading, isError } = usePurchaseOrder(id);
  const submitPO = useSubmitPO();
  const approvePO = useApprovePO();
  const rejectPO = useRejectPO();
  const cancelPO = useCancelPO();
  const updateDocFields = useUpdatePoDocumentFields();
  const updateItemExtra = useUpdatePoItemExtraFields();
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
  // No custom format = the standard paper-PO layout, whose fill-in fields are editable too.
  const docFormat = activeFormat ?? STANDARD_PO_FORMAT;
  const { header: headerFieldDefs, footer: footerFieldDefs } = freeEntryFields(docFormat);
  const itemExtraColumns = docFormat.item_columns.filter((c) => c.source.startsWith('item_extra.'));

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
  }

  const reject: DocAction | null =
    po.status === 'pending_approval' && canApprove
      ? { key: 'reject', label: 'Reject', icon: X, onClick: () => setRejectOpen(true) }
      : null;

  const actions: DocAction[] = [];
  const purchase = po.purchase_request;
  if (purchase) {
    actions.push({
      key: 'view-purchase',
      label: 'View purchase',
      icon: ClipboardList,
      onClick: () => router.push(`/procurement/requests/${purchase.id}`),
    });
  }
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

  const printedFilled =
    Object.values(po.header_field_values || {}).filter(Boolean).length +
    Object.values(po.footer_field_values || {}).filter(Boolean).length +
    (po.terms_and_conditions ? 1 : 0);
  const printedTotal = headerFieldDefs.length + footerFieldDefs.length + 1;

  return (
    <ContentLayout title={purchase ? displayRequestNumber(purchase.request_number) : po.po_number}>
      {/* The order page is about the printed document: a slim header, then the
          details edge to edge. Items and vendor live on the purchase page. */}
      <div className="w-full space-y-4">
        <Button
          variant="link"
          className="h-8 px-0"
          onClick={() => router.push(purchase ? `/procurement/requests/${purchase.id}` : '/procurement/purchase-orders')}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {purchase ? 'Back to the purchase' : 'Purchase orders'}
        </Button>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">Order to {po.supplier?.name ?? 'vendor'}</h1>
              <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
            </div>
            <p className="text-sm text-muted-foreground">
              {po.po_number}
              {purchase ? ` · Purchase ${displayRequestNumber(purchase.request_number)}` : ''}
              {` · ${po.items.length} item${po.items.length === 1 ? '' : 's'} · `}
              <b className="tabular-nums text-foreground">₹{Number(po.total_amount).toLocaleString('en-IN')}</b>
              {po.created_at ? ` · ${formatDateDMY(po.created_at)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reject && (
              <Button variant="outline" className="h-10 text-destructive" onClick={reject.onClick} disabled={transitionBusy}>
                Reject
              </Button>
            )}
            {primary && (
              <Button className="h-10 px-5" onClick={primary.onClick} disabled={primary.disabled}>
                {primary.icon && <primary.icon className="mr-1.5 h-4 w-4" />}
                {primary.label}
              </Button>
            )}
          </div>
        </header>

        {/* Deliveries are recorded on the purchase page; this page only prepares the order. */}
        {['approved', 'sent', 'partially_received'].includes(po.status) && (
          <p className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            When the goods arrive, record the delivery on{' '}
            {purchase ? (
              <button type="button" className="font-medium underline" onClick={() => router.push(`/procurement/requests/${purchase.id}`)}>
                the purchase page
              </button>
            ) : (
              'the purchase page'
            )}
            .
          </p>
        )}

        {po.status === 'rejected' && po.rejection_reason && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            Rejected: {po.rejection_reason}
          </p>
        )}

        {/* ── Details printed on the order: edge to edge, 5 compact fields per row ── */}
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3">
            <span className="mr-auto">
              <span className="block text-[15px] font-semibold">Details printed on the order</span>
              <span className="text-xs text-muted-foreground">
                Optional — fill only what your format prints · {printedFilled} of {printedTotal} filled
              </span>
            </span>
            {canCreate ? (
              <>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Print as
                  <Select
                    value={po.po_format_id ?? 'none'}
                    onValueChange={(v) =>
                      v === NEW_FORMAT ? router.push('/procurement/purchase-orders/formats/new') : handleFormatChange(v)
                    }
                  >
                    <SelectTrigger className="h-8 w-40 text-[13px] text-foreground">
                      <SelectValue placeholder="Standard" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Standard</SelectItem>
                      {(formats ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={NEW_FORMAT} className="text-primary">
                        + New format
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {(formats ?? []).length > 0 && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={setAsVendorDefault} onCheckedChange={(c) => handleToggleSetAsDefault(!!c)} />
                    Always for this vendor
                  </label>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Prints as <span className="font-medium text-foreground">{activeFormat?.name ?? 'Standard'}</span>
              </span>
            )}
            <span className="flex gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <FileDown className="mr-1 h-3.5 w-3.5" />
                    Download
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => downloadPurchaseOrderPdf(po)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadPurchaseOrderDocx(po)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Word
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canCreate && (
                <Button size="sm" className="h-8" onClick={handleSaveDocumentDetails} disabled={updateDocFields.isPending}>
                  {updateDocFields.isPending ? 'Saving…' : 'Save details'}
                </Button>
              )}
            </span>
          </div>

          <div className="space-y-4 px-5 py-4">
            {canCreate ? (
              <>
                {(headerFieldDefs.length > 0 || footerFieldDefs.length > 0) && (
                  <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 md:grid-cols-3 xl:grid-cols-5">
                    {headerFieldDefs.map((f) => {
                      const key = f.source.slice('header_values.'.length);
                      return (
                        <label key={f.key} className="min-w-0 space-y-1">
                          <span className="block truncate text-[11px] text-muted-foreground" title={f.label}>
                            {f.label}
                          </span>
                          <Input
                            className="h-8 text-[13px]"
                            value={headerValues[key] ?? ''}
                            onChange={(e) => setHeaderValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          />
                        </label>
                      );
                    })}
                    {footerFieldDefs.map((f) => (
                      <label key={f.key} className="min-w-0 space-y-1">
                        <span className="block truncate text-[11px] text-muted-foreground" title={f.label}>
                          {f.label}
                        </span>
                        <Input
                          className="h-8 text-[13px]"
                          value={footerValues[f.key] ?? ''}
                          onChange={(e) => setFooterValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">Terms &amp; conditions</span>
                  <Textarea className="min-h-[60px] text-[13px]" value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={2} />
                </label>
                {itemExtraColumns.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Per item</span>
                    {po.items.map((it) => (
                      <div key={it.id} className="grid grid-cols-2 items-center gap-2.5 text-sm md:grid-cols-3 xl:grid-cols-5">
                        <span className="min-w-0 truncate">{it.item_name}</span>
                        {itemExtraColumns.map((c) => {
                          const key = extraFieldKey(c.source);
                          return (
                            <Input
                              key={c.key}
                              placeholder={c.label}
                              aria-label={`${c.label} for ${it.item_name}`}
                              defaultValue={String(it.extra_fields?.[key] ?? '')}
                              onBlur={(e) => handleItemExtraBlur(it.id, key, e.target.value)}
                              className="h-8 text-[13px]"
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 text-sm md:grid-cols-3 xl:grid-cols-5">
                {Object.entries({ ...(po.header_field_values || {}), ...(po.footer_field_values || {}) }).map(([k, v]) => (
                  <p key={k} className="min-w-0">
                    <span className="block truncate text-[11px] text-muted-foreground">{k}</span>
                    {v || '—'}
                  </p>
                ))}
                {po.terms_and_conditions && (
                  <p className="col-span-full">
                    <span className="block text-[11px] text-muted-foreground">Terms &amp; conditions</span>
                    {po.terms_and_conditions}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {canCancel && (
          <p className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="hover:underline"
              disabled={transitionBusy}
              onClick={() => run(() => cancelPO.mutateAsync({ id, userId: profile!.id }), 'Purchase order cancelled')}
            >
              Cancel this order
            </button>
          </p>
        )}
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
