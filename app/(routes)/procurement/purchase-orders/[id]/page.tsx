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
  useMarkPoSent,
  useApplyPoItemExtraToAll,
} from '@/hooks/procurement/use-purchase-orders';
import { PO_STATUS_CONFIG } from '@/types/procurement';
import { downloadPurchaseOrderPdf } from '@/lib/procurement/purchase-order-pdf';
import { downloadPurchaseOrderDocx } from '@/lib/procurement/purchase-order-docx';
import { StatusBadge } from '@/components/procurement/status-badge';
import { type DocAction, type DocPrimaryAction } from '@/components/procurement/document-header';
import { formatDateDMY } from '@/lib/utils/date-format';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import {
  STANDARD_PO_FORMAT,
  suggestedHeaderValues,
  catalogExtra,
  resolvePoDocumentModel,
  PO_REQUIRED_FIELDS,
} from '@/lib/procurement/po-document-model';
import { PoDocumentPreview, type PoPreviewEdit } from '@/components/procurement/po-document-preview';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileDown, FileText, Send, Check, X, ChevronLeft, ChevronDown } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

/** What the printed order can't go out without. Everything else may stay blank. */
const REQUIRED_KEYS = new Set(Object.keys(PO_REQUIRED_FIELDS));
/** Boxes printed in the footer group (the rest are header_values). */
const FOOTER_KEYS = new Set(['special_note']);

/** item_extra.<key> -> <key> */
const extraFieldKey = (source: string) =>
  source.startsWith('item_extra.') ? source.slice('item_extra.'.length) : source;

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
  const markSent = useMarkPoSent();
  const updateItemExtra = useUpdatePoItemExtraFields();
  const applyToAll = useApplyPoItemExtraToAll();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // The blanks on the order, typed straight into the preview. They start from the
  // vendor's quotation (number, date, delivery, payment, warranty), then what the
  // last order to this vendor printed. Saved values win.
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [footerValues, setFooterValues] = useState<Record<string, string>>({});
  // What was last written, so a blur with nothing changed doesn't save again.
  const [lastSaved, setLastSaved] = useState('');
  // HSN / GST typed on a line, kept here too so Download prints them even while the save is in flight.
  const [itemEdits, setItemEdits] = useState<Record<string, Record<string, string>>>({});
  const [syncedId, setSyncedId] = useState<string | undefined>(undefined);
  if (po && po.id !== syncedId) {
    setSyncedId(po.id);
    const saved = Object.fromEntries(
      Object.entries(po.header_field_values || {}).filter(([, v]) => String(v ?? '').trim())
    );
    const suggested = Object.fromEntries(Object.entries(suggestedHeaderValues(po)).map(([k, v]) => [k, v.value]));
    setHeaderValues({ ...suggested, ...saved });
    setFooterValues(po.footer_field_values || {});
    setLastSaved(JSON.stringify([po.header_field_values || {}, po.footer_field_values || {}]));
  }

  /** Save the typed blanks, if anything changed since the last save. Quietly: it runs on every blur. */
  const saveBlanks = async () => {
    if (!canCreate) return;
    const snapshot = JSON.stringify([headerValues, footerValues]);
    if (snapshot === lastSaved) return;
    await updateDocFields.mutateAsync({
      id,
      patch: { header_field_values: headerValues, footer_field_values: footerValues },
    });
    setLastSaved(snapshot);
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
  const transitionBusy = submitPO.isPending || approvePO.isPending || cancelPO.isPending || rejectPO.isPending;

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
      ? {
          key: 'reject',
          label: 'Reject',
          icon: X,
          onClick: () => setRejectOpen(true),
        }
      : null;

  const purchase = po.purchase_request;

  const docFormat = po.po_format ?? STANDARD_PO_FORMAT;
  const extraCols = docFormat.item_columns.filter((c) => c.source.startsWith('item_extra.'));
  // The order exactly as it will print, with what's typed here.
  const livePo = {
    ...po,
    header_field_values: headerValues,
    footer_field_values: footerValues,
    items: po.items.map((it) =>
      itemEdits[it.id] ? { ...it, extra_fields: { ...(it.extra_fields ?? {}), ...itemEdits[it.id] } } : it
    ),
  };
  const liveModel = resolvePoDocumentModel(livePo);
  const missing = [...REQUIRED_KEYS].filter((k) => !String(headerValues[k] ?? '').trim());

  const extraOf = (i: number, key: string) => {
    const col = extraCols.find((c) => c.key === key);
    const it = livePo.items[i];
    return col && it ? { it, k: extraFieldKey(col.source) } : null;
  };
  /** A line has no value of its own and none from the quotation / item master. */
  const isBlank = (i: number, key: string) => {
    const x = extraOf(i, key);
    if (!x) return false;
    const own = x.it.extra_fields?.[x.k];
    return (own === undefined || own === '') && !catalogExtra(x.it, x.k);
  };
  const rememberItemEdit = (itemId: string, k: string, value: string) =>
    setItemEdits((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), [k]: value } }));

  const edit: PoPreviewEdit | undefined = canCreate
    ? {
        value: (k) => (FOOTER_KEYS.has(k) ? footerValues[k] : headerValues[k]) ?? '',
        onChange: (k, v) => (FOOTER_KEYS.has(k) ? setFooterValues : setHeaderValues)((prev) => ({ ...prev, [k]: v })),
        onCommit: () => {
          saveBlanks().catch((e) => toast.error(errorMessage(e, 'Could not save')));
        },
        required: REQUIRED_KEYS,
        itemKeys: new Set(extraCols.map((c) => c.key)),
        itemValue: (i, key) => {
          const x = extraOf(i, key);
          if (!x) return '';
          const own = x.it.extra_fields?.[x.k];
          return String(own !== undefined && own !== '' ? own : (catalogExtra(x.it, x.k) ?? ''));
        },
        // From the vendor's quotation (or item master): printed as is. Only a blank is typed.
        itemEditable: (i, key) => {
          const x = extraOf(i, key);
          if (!x) return false;
          const own = x.it.extra_fields?.[x.k];
          return (own !== undefined && own !== '') || !catalogExtra(x.it, x.k);
        },
        onItemCommit: (i, key, value) => {
          const x = extraOf(i, key);
          if (!x) return;
          rememberItemEdit(x.it.id, x.k, value);
          updateItemExtra
            .mutateAsync({ poId: id, itemId: x.it.id, extraFields: { [x.k]: value } })
            .catch((e) => toast.error(errorMessage(e, 'Could not save')));
        },
        // Only the lines still blank: never over a value typed or taken from the quotation.
        onApplyAll: (key, value) => {
          const col = extraCols.find((c) => c.key === key);
          if (!col) return;
          const itemIds = livePo.items.filter((_, i) => isBlank(i, key)).map((it) => it.id);
          if (!itemIds.length) {
            toast.info(`Every line already has ${col.label}`);
            return;
          }
          for (const itemId of itemIds) rememberItemEdit(itemId, extraFieldKey(col.source), value);
          applyToAll
            .mutateAsync({ poId: id, itemIds, extraFields: { [extraFieldKey(col.source)]: value } })
            .then(() => toast.success(`${col.label} ${value} on ${itemIds.length} items`))
            .catch((e) => toast.error(errorMessage(e, 'Could not save')));
        },
      }
    : undefined;

  // Download = what's on screen, saved first so a reprint matches.
  const download = async (as: 'pdf' | 'word') => {
    // Only someone who can fill the blanks is held back by them; a reader just downloads.
    if (canCreate && missing.length > 0) {
      toast.error(`Fill ${missing.map((k) => PO_REQUIRED_FIELDS[k]).join(', ')} first`);
      return;
    }
    try {
      await saveBlanks();
      await (as === 'pdf' ? downloadPurchaseOrderPdf(livePo) : downloadPurchaseOrderDocx(livePo));
      // Downloaded by the store to send to the vendor: the order is now "sent".
      // A reader downloading to look leaves it as it is.
      if (canCreate && po.status === 'approved') {
        markSent.mutate(po.id, {
          onError: (e) => toast.error(errorMessage(e, 'Could not mark the order as sent')),
        });
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Could not prepare the order'));
    }
  };

  return (
    <ContentLayout title={purchase ? displayRequestNumber(purchase.request_number) : po.po_number}>
      <div className="w-full space-y-4">
        {/* One row: back, vendor, status, numbers, then the actions. Wraps on a phone. */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={purchase ? 'Back to the purchase' : 'Purchase orders'}
              title={purchase ? 'Back to the purchase' : 'Purchase orders'}
              onClick={() =>
                router.push(purchase ? `/procurement/requests/${purchase.id}` : '/procurement/purchase-orders')
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Order to {po.supplier?.name ?? 'vendor'}</h1>
            <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
            <p className="text-sm text-muted-foreground">
              {po.po_number}
              {purchase ? ` · ${displayRequestNumber(purchase.request_number)}` : ''}
              {` · ${po.items.length} item${po.items.length === 1 ? '' : 's'} · `}
              <b className="tabular-nums text-foreground">₹{Number(po.total_amount).toLocaleString('en-IN')}</b>
              {po.created_at ? ` · ${formatDateDMY(po.created_at)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reject && (
              <Button
                variant="outline"
                className="h-10 text-destructive"
                onClick={reject.onClick}
                disabled={transitionBusy}
              >
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

        {po.status === 'rejected' && po.rejection_reason && (
          <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            Rejected: {po.rejection_reason}
          </p>
        )}

        {/* The order itself; blanks are typed in place and save on their own. */}
        <PoDocumentPreview model={liveModel} edit={edit} />

        {/* Footer: send it out once it reads right. */}
        <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-10 px-5" variant={missing.length ? 'outline' : 'default'}>
                  <FileDown className="mr-1.5 h-4 w-4" />
                  Download
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={() => download('pdf')}>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => download('word')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

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
                  () =>
                    rejectPO.mutateAsync({
                      id,
                      userId: profile!.id,
                      reason: rejectReason,
                    }),
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
