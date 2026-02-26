'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { useCreateImsGRN } from '@/hooks/ims/use-ims-stock';
import { useImsSuppliersForSelect, useImsUnitsForSelect } from '@/hooks/ims/use-ims-settings';
import { useImsItemsForSelect } from '@/hooks/ims/use-ims-inventory';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore } from '@/hooks/ims/use-ims-stores';
import { useAuth } from '@/hooks/use-auth';
import { calculateGstLine, summariseGstLines } from '@/lib/utils/ims-gst-calculator';
import type { GstLineBreakdown } from '@/lib/utils/ims-gst-calculator';
import type { CreateImsGRNDto } from '@/types/ims';

interface GRNLineItem {
  item_id: string;
  quantity: number;
  unit_id: string;
  cost_price: number;
  gst_rate: number;
  batch_number: string;
  expiry_date: string;
}

const emptyLine: GRNLineItem = {
  item_id: '',
  quantity: 0,
  unit_id: '',
  cost_price: 0,
  gst_rate: 0,
  batch_number: '',
  expiry_date: '',
};

export default function NewGRNPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();
  const userId = profile?.id ?? '';

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<GRNLineItem[]>([{ ...emptyLine }]);

  const { data: suppliers } = useImsSuppliersForSelect(storeId || '', institutionId);
  const { data: items } = useImsItemsForSelect(storeId || '', institutionId);
  const { data: units } = useImsUnitsForSelect();
  const { data: storeData } = useImsStore(storeId || '');

  const createMutation = useCreateImsGRN();

  // Resolve GSTINs for live GST calculation
  const storeGstin = storeData?.gstin ?? null;
  const supplierGstin = (suppliers ?? []).find((s) => s.id === supplierId)?.gstin ?? null;

  // Derive per-line and summary GST breakdowns (pure, synchronous)
  const gstBreakdowns: GstLineBreakdown[] = lineItems.map((line) =>
    calculateGstLine(line.cost_price, line.quantity, line.gst_rate, supplierGstin, storeGstin)
  );
  const gstSummary = summariseGstLines(gstBreakdowns);
  const isInterState = gstBreakdowns.length > 0 && gstBreakdowns[0].igstPercent > 0;
  const gstMissing = !storeGstin || !supplierGstin;

  const updateLine = (index: number, field: keyof GRNLineItem, value: string | number) => {
    setLineItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addLine = () => {
    setLineItems((prev) => [...prev, { ...emptyLine }]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const formatINR = (n: number) =>
    n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  const isValid = () => {
    if (!supplierId) return false;
    if (lineItems.length === 0) return false;
    return lineItems.every(
      (line) => line.item_id && line.quantity > 0 && line.unit_id && line.cost_price > 0
    );
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      toast.error('Please fill all required fields and add at least one item');
      return;
    }

    const payload: CreateImsGRNDto = {
      supplier_id: supplierId,
      invoice_number: invoiceNumber || undefined,
      invoice_date: invoiceDate || undefined,
      invoice_amount: invoiceAmount ? parseFloat(invoiceAmount) : undefined,
      notes: notes || undefined,
      store_id: storeId || '',
      institution_id: institutionId || null,
      items: lineItems.map((line) => ({
        item_id: line.item_id,
        quantity: line.quantity,
        unit_id: line.unit_id,
        cost_price: line.cost_price,
        gst_rate: line.gst_rate,
        batch_number: line.batch_number || undefined,
        expiry_date: line.expiry_date || undefined,
      })),
    };

    try {
      await createMutation.mutateAsync({ data: payload, userId });
      toast.success('GRN created successfully');
      router.push('/ims/stock/grn');
    } catch {
      toast.error('Failed to create GRN');
    }
  };

  return (
    <ContentLayout title="Create Goods Received Note">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/ims/stock/grn">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Goods Received Note</h1>
            <p className="text-sm text-muted-foreground">
              Record goods received from a supplier
            </p>
          </div>
        </div>

        {/* Header Section */}
        <Card>
          <CardHeader>
            <CardTitle>GRN Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  Supplier <span className="text-red-500">*</span>
                </Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers ?? []).map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Amount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">
                      Item <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      Qty <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="min-w-[150px]">
                      Unit <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="min-w-[120px]">
                      Cost Price <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="min-w-[130px]">Batch #</TableHead>
                    <TableHead className="min-w-[140px]">Expiry</TableHead>
                    <TableHead className="text-right min-w-[100px]">Taxable</TableHead>
                    {isInterState ? (
                      <TableHead className="text-right min-w-[90px]">IGST</TableHead>
                    ) : (
                      <>
                        <TableHead className="text-right min-w-[90px]">CGST</TableHead>
                        <TableHead className="text-right min-w-[90px]">SGST</TableHead>
                      </>
                    )}
                    <TableHead className="text-right min-w-[100px]">Total</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((line, idx) => {
                    const bd = gstBreakdowns[idx];
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select
                            value={line.item_id}
                            onValueChange={(val) => {
                              const found = (items ?? []).find((i) => i.id === val);
                              setLineItems((prev) => {
                                const copy = [...prev];
                                copy[idx] = {
                                  ...copy[idx],
                                  item_id: val,
                                  gst_rate: found?.gst_rate ?? 0,
                                };
                                return copy;
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {(items ?? []).map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                  {item.gst_rate > 0 && (
                                    <span className="text-muted-foreground ml-1">
                                      ({item.gst_rate}%)
                                    </span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity || ''}
                            onChange={(e) =>
                              updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)
                            }
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line.unit_id}
                            onValueChange={(val) => updateLine(idx, 'unit_id', val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {(units ?? []).map(
                                (u: { id: string; name: string; abbreviation: string }) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name} ({u.abbreviation})
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.cost_price || ''}
                            onChange={(e) =>
                              updateLine(idx, 'cost_price', parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.batch_number}
                            onChange={(e) => updateLine(idx, 'batch_number', e.target.value)}
                            placeholder="Batch #"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={line.expiry_date}
                            onChange={(e) => updateLine(idx, 'expiry_date', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatINR(bd?.taxableAmount ?? 0)}
                        </TableCell>
                        {isInterState ? (
                          <TableCell className="text-right text-sm">
                            {bd?.igstAmount > 0 ? (
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
                            <TableCell className="text-right text-sm">
                              {bd?.cgstAmount > 0 ? (
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
                            <TableCell className="text-right text-sm">
                              {bd?.sgstAmount > 0 ? (
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
                        <TableCell className="text-right font-semibold text-sm">
                          {formatINR(bd?.totalAmount ?? 0)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLine(idx)}
                            disabled={lineItems.length <= 1}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* GST Summary + Submit */}
        <Card>
          <CardContent className="pt-6">
            {gstMissing && (
              <div className="flex items-center gap-2 mb-4 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-700 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {!storeGstin && !supplierGstin
                  ? 'Store GSTIN and Supplier GSTIN are not set — GST amounts will be zero.'
                  : !storeGstin
                  ? 'Store GSTIN is not set — GST amounts will be zero.'
                  : 'Supplier GSTIN is not set — GST amounts will be zero.'}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6 text-sm">
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
                <p className="text-lg font-bold text-primary">{formatINR(gstSummary.grandTotal)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" asChild>
                <Link href="/ims/stock/grn">Cancel</Link>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <BeatLoader color="#fff" size={8} />
                ) : (
                  'Create GRN'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
