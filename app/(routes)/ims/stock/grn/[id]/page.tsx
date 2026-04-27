'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImsGRN } from '@/hooks/ims/use-ims-stock';
import { summariseGstLines } from '@/lib/utils/ims-gst-calculator';
import type { GstLineBreakdown } from '@/lib/utils/ims-gst-calculator';
import { GRN_STATUS_CONFIG } from '@/types/ims';
import type { ImsGRNItem } from '@/types/ims';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Map stored ImsGRNItem DB columns to GstLineBreakdown shape (no recalculation). */
function itemToBreakdown(item: ImsGRNItem): GstLineBreakdown {
  return {
    taxableAmount: item.taxable_amount,
    cgstPercent: item.cgst_percent,
    cgstAmount: item.cgst_amount,
    sgstPercent: item.sgst_percent,
    sgstAmount: item.sgst_amount,
    igstPercent: item.igst_percent,
    igstAmount: item.igst_amount,
    totalGstAmount: item.total_gst_amount,
    totalAmount: item.total,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GRNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: grn, isLoading, error } = useImsGRN(id);

  if (isLoading) {
    return (
      <ContentLayout title="GRN Details">
        <div className="flex items-center justify-center py-20">
          <BeatLoader color="#6366f1" size={12} />
        </div>
      </ContentLayout>
    );
  }

  if (error || !grn) {
    return (
      <ContentLayout title="GRN Details">
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <AlertTriangle className="h-10 w-10" />
          <p>GRN not found or failed to load.</p>
          <Button variant="outline" asChild>
            <Link href="/ims/stock/grn">Back to GRN list</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusConfig = GRN_STATUS_CONFIG[grn.status];

  // Build breakdowns from stored values
  const breakdowns: GstLineBreakdown[] = (grn.items ?? []).map(itemToBreakdown);
  const gstSummary = summariseGstLines(breakdowns);
  const isInterState = breakdowns.length > 0 && breakdowns[0].igstPercent > 0;

  return (
    <ContentLayout title={`GRN ${grn.grn_number}`}>
      <div className="space-y-6">
        {/* Back + title */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ims/stock/grn">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{grn.grn_number}</h1>
            <p className="text-sm text-muted-foreground">Goods Received Note</p>
          </div>
        </div>

        {/* ── Section 1: GRN Header ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>GRN Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={statusConfig.variant} className="mt-1">
                  {statusConfig.label}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Supplier</p>
                <p className="font-medium">{grn.supplier?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Invoice #</p>
                <p className="font-medium">{grn.invoice_number ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Invoice Date</p>
                <p className="font-medium">{formatDate(grn.invoice_date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Invoice Amount</p>
                <p className="font-medium">
                  {grn.invoice_amount != null ? formatINR(grn.invoice_amount) : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Received By</p>
                <p className="font-medium">
                  {grn.received_by_profile?.full_name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Verified By</p>
                <p className="font-medium">
                  {grn.verified_by_profile?.full_name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Approved By</p>
                <p className="font-medium">
                  {grn.approved_by_profile?.full_name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{formatDate(grn.created_at)}</p>
              </div>
              {grn.notes && (
                <div className="col-span-2 sm:col-span-3 md:col-span-4">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{grn.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Line Items ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>HSN</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Cost Price</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-center">GST %</TableHead>
                    {isInterState ? (
                      <TableHead className="text-right">IGST</TableHead>
                    ) : (
                      <>
                        <TableHead className="text-right">CGST</TableHead>
                        <TableHead className="text-right">SGST</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(grn.items ?? []).map((item: ImsGRNItem, idx: number) => {
                    const bd = breakdowns[idx];
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.item?.name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.item?.code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.item?.hsn_code ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell>
                          {item.unit?.abbreviation ?? item.unit?.name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(item.cost_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatINR(bd.taxableAmount)}
                        </TableCell>
                        <TableCell className="text-center">
                          {(item.item?.gst_rate ?? 0) > 0 ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {item.item?.gst_rate}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        {isInterState ? (
                          <TableCell className="text-right">
                            {bd.igstAmount > 0 ? (
                              <span>
                                {formatINR(bd.igstAmount)}
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({bd.igstPercent}%)
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="text-right">
                              {bd.cgstAmount > 0 ? (
                                <span>
                                  {formatINR(bd.cgstAmount)}
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({bd.cgstPercent}%)
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {bd.sgstAmount > 0 ? (
                                <span>
                                  {formatINR(bd.sgstAmount)}
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({bd.sgstPercent}%)
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </>
                        )}
                        <TableCell className="text-right font-semibold">
                          {formatINR(item.total)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.batch_number ?? '—'}
                        </TableCell>
                        <TableCell>{formatDate(item.expiry_date)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: GST Summary ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>GST Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Taxable Amount</p>
                <p className="font-semibold">{formatINR(gstSummary.totalTaxableAmount)}</p>
              </div>
              {isInterState ? (
                <div>
                  <p className="text-muted-foreground">IGST</p>
                  <p className="font-semibold">{formatINR(gstSummary.totalIgst)}</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-muted-foreground">CGST</p>
                    <p className="font-semibold">{formatINR(gstSummary.totalCgst)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">SGST</p>
                    <p className="font-semibold">{formatINR(gstSummary.totalSgst)}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-muted-foreground">Total GST</p>
                <p className="font-semibold">{formatINR(gstSummary.totalGst)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Grand Total</p>
                <p className="text-xl font-bold text-primary">
                  {formatINR(gstSummary.grandTotal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
