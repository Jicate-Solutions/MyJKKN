'use client';

import { Fragment, useMemo, useState } from 'react';
import { buildComparisonRows } from '@/lib/services/procurement/quotation-service';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRfq } from '@/hooks/procurement/use-rfqs';
import {
  useQuotationsForRfq,
  useDeleteQuotation,
  useAwardLine,
  useUnawardLine,
} from '@/hooks/procurement/use-quotations';
import { useGeneratePOsFromRfq } from '@/hooks/procurement/use-purchase-orders';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Trash2, FileText, Award, X, ExternalLink } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

export default function RfqQuotationsPage() {
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('procurement', 'quotation_manage');

  const { data: rfq, isLoading: rfqLoading, isError: rfqError } = useRfq(rfqId);
  const { data: quotations = [], isLoading: quotesLoading, isError: quotesError } = useQuotationsForRfq(rfqId);
  // Derive the comparison client-side from the RFQ items + quotations already loaded,
  // instead of a second server round-trip (useComparison re-fetched the same quotations).
  const comparison = useMemo(
    () => buildComparisonRows(rfq?.items ?? [], quotations),
    [rfq?.items, quotations]
  );
  const compLoading = rfqLoading || quotesLoading;
  const compError = rfqError || quotesError;

  const deleteQuotation = useDeleteQuotation(rfqId);
  const awardLine = useAwardLine(rfqId);
  const unawardLine = useUnawardLine(rfqId);
  const generatePOs = useGeneratePOsFromRfq();
  const canGeneratePO = isSuperAdmin || canAccess('procurement', 'po_create');
  const hasAwarded = comparison.some((r) => r.quotes.some((q) => q.awarded));
  const awardedCount = comparison.filter((r) => r.quotes.some((q) => q.awarded)).length;

  // Which quotation PDFs are expanded inline (keyed by quotation id). Iframes are
  // only mounted for open entries so we don't load every vendor's PDF at once.
  const [openPdfs, setOpenPdfs] = useState<Record<string, boolean>>({});
  const togglePdf = (id: string) => setOpenPdfs((p) => ({ ...p, [id]: !p[id] }));

  const handleGeneratePOs = async () => {
    if (!profile?.id) return;
    try {
      const pos = await generatePOs.mutateAsync({ rfqId, userId: profile.id });
      toast.success(`Generated ${pos.length} purchase order${pos.length === 1 ? '' : 's'}`);
      router.push('/procurement/purchase-orders');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to generate POs'));
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  if (rfqLoading) {
    return (
      <ContentLayout title="Quotations">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (rfqError) {
    return (
      <ContentLayout title="Quotations">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load this RFQ. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!rfq) {
    return (
      <ContentLayout title="Quotations">
        <p className="text-muted-foreground py-12 text-center">RFQ not found.</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${rfq.rfq_number} — Quotations`}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to RFQ"
              onClick={() => router.push(`/procurement/rfqs/${rfqId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">Quotations</h2>
              <p className="text-muted-foreground">
                {rfq.rfq_number} · {quotations.length} vendor
                {quotations.length === 1 ? '' : 's'} quoted · {awardedCount} of{' '}
                {comparison.length} item{comparison.length === 1 ? '' : 's'} awarded
              </p>
            </div>
          </div>
          {canManage && (
            <Button
              className="shrink-0"
              onClick={() => router.push(`/procurement/rfqs/${rfqId}/quotations/new`)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Quotation
            </Button>
          )}
        </div>

        {/* ── What came in ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received quotations ({quotations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {quotesLoading ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={8} />
              </div>
            ) : quotesError ? (
              <AlertBox type="error" message="Failed to load quotations. Please try again." />
            ) : quotations.length === 0 ? (
              <EmptyState
                title="No quotations captured yet"
                description="Add a vendor quotation to start comparing prices."
              />
            ) : (
              <div className="space-y-2">
                {quotations.map((q) => (
                  <div key={q.id} className="rounded-md border">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.supplier?.name ?? q.supplier_id}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {q.vendor_quote_number ? `Ref ${q.vendor_quote_number} · ` : ''}
                          Total ₹{Number(q.total_amount ?? 0).toLocaleString()}
                          {q.delivery_time_days ? ` · ${q.delivery_time_days}d delivery` : ''}
                          {q.payment_terms ? ` · ${q.payment_terms}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {q.document_file_id ? (
                          <Button variant="ghost" size="sm" onClick={() => togglePdf(q.id)}>
                            <FileText className="h-4 w-4 mr-1" />
                            {openPdfs[q.id] ? 'Hide PDF' : 'View PDF'}
                          </Button>
                        ) : q.document_url ? (
                          <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Open quotation document — ${q.supplier?.name ?? q.supplier_id}`}
                            >
                              <FileText className="h-4 w-4" />
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No PDF</span>
                        )}
                        {q.document_file_id && q.document_url && (
                          <a href={q.document_url} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Open quotation document in a new tab — ${q.supplier?.name ?? q.supplier_id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete quotation — ${q.supplier?.name ?? q.supplier_id}`}
                            onClick={() => run(() => deleteQuotation.mutateAsync(q.id), 'Quotation removed')}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {q.document_file_id && openPdfs[q.id] && (
                      <div className="px-3 pb-3">
                        <iframe
                          src={`https://drive.google.com/file/d/${q.document_file_id}/preview`}
                          title={`Quotation PDF — ${q.supplier?.name ?? q.supplier_id}`}
                          className="w-full rounded-md border"
                          style={{ height: 500 }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Deciding who wins ──────────────────────────────────────────────
            One table for the whole RFQ, grouped by item. This used to render a
            separate bordered table per item, so no two vendors' figures ever
            lined up and a vendor could not be scanned down the page. */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Compare &amp; award</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Award each item to one vendor. Items may go to different vendors — one purchase
                order is raised per winning vendor.
              </p>
            </div>
            {canGeneratePO && hasAwarded && (
              <Button className="shrink-0" onClick={handleGeneratePOs} disabled={generatePOs.isPending}>
                {generatePOs.isPending ? 'Generating...' : 'Generate Purchase Orders'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {compLoading ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={8} />
              </div>
            ) : compError ? (
              <AlertBox type="error" message="Failed to load the comparison. Please try again." />
            ) : comparison.length === 0 ? (
              <EmptyState
                title="Nothing to compare yet"
                description="Add vendor quotations to compare prices by item."
              />
            ) : (
              <div className="space-y-3">
                {/* The rows are colour-coded; say so rather than leaving it to be guessed. */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-green-500/20 ring-1 ring-green-500/40" />
                    Awarded
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-blue-400/20 ring-1 ring-blue-400/40" />
                    Lowest price
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Vendor</th>
                        <th className="py-2 pr-3 font-medium">Unit price</th>
                        <th className="py-2 pr-3 font-medium">Qty offered</th>
                        <th className="py-2 pr-3 font-medium">Line total</th>
                        <th className="py-2 pr-3 font-medium">Delivery</th>
                        <th className="py-2 pr-3 font-medium">What they offered</th>
                        <th className="py-2 font-medium">Award</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => (
                        <Fragment key={row.rfq_item_id}>
                          <tr className="border-b bg-muted/50">
                            <td colSpan={7} className="px-1 py-2">
                              <span className="font-medium">{row.item_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                — asked for {row.quantity} {row.unit_label || ''}
                                {row.item_spec ? ` · ${row.item_spec}` : ''}
                              </span>
                            </td>
                          </tr>
                          {row.quotes.length === 0 ? (
                            <tr className="border-b">
                              <td colSpan={7} className="py-2 pl-1 text-xs text-muted-foreground">
                                No vendor quoted this item.
                              </td>
                            </tr>
                          ) : (
                            row.quotes.map((qt) => {
                              const isNotQuoted = qt.unit_price === null;
                              const isLowest = !isNotQuoted && qt.unit_price === row.lowest_price;
                              const offeredQty = qt.quantity ?? row.quantity;
                              const offered = [
                                qt.manufacturer,
                                qt.quality_grade,
                                row.is_chemical ? qt.concentration : null,
                                qt.other_specs,
                              ]
                                .filter(Boolean)
                                .join(' · ');
                              return (
                                <tr
                                  key={qt.quotation_item_id}
                                  className={`border-b ${
                                    qt.awarded ? 'bg-green-500/10' : isLowest ? 'bg-blue-400/10' : ''
                                  }`}
                                >
                                  <td className="py-2 pr-3 pl-1 font-medium">{qt.supplier_name}</td>
                                  <td className="py-2 pr-3">
                                    {isNotQuoted ? (
                                      <span className="italic text-muted-foreground">Not quoted</span>
                                    ) : (
                                      <>
                                        ₹{Number(qt.unit_price).toLocaleString()}
                                        {isLowest && !qt.awarded && (
                                          <Badge variant="secondary" className="ml-1 text-[10px]">
                                            Lowest
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">
                                    {isNotQuoted ? '—' : offeredQty}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {isNotQuoted
                                      ? '—'
                                      : `₹${(Number(qt.unit_price) * Number(offeredQty)).toLocaleString()}`}
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">
                                    {qt.delivery_time_days != null ? `${qt.delivery_time_days}d` : '—'}
                                  </td>
                                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                                    {offered || '—'}
                                  </td>
                                  <td className="py-2">
                                    {qt.awarded ? (
                                      <span className="flex items-center gap-1 text-green-600">
                                        <Award className="h-3.5 w-3.5" /> Awarded
                                        {canManage && (
                                          <button
                                            className="ml-1"
                                            aria-label={`Clear award — ${row.item_name}`}
                                            onClick={() =>
                                              run(
                                                () => unawardLine.mutateAsync(row.rfq_item_id),
                                                'Award cleared'
                                              )
                                            }
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      canManage &&
                                      !isNotQuoted && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() =>
                                            run(
                                              () =>
                                                awardLine.mutateAsync({
                                                  rfqItemId: row.rfq_item_id,
                                                  quotationItemId: qt.quotation_item_id,
                                                }),
                                              `Awarded to ${qt.supplier_name}`
                                            )
                                          }
                                        >
                                          Award
                                        </Button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
