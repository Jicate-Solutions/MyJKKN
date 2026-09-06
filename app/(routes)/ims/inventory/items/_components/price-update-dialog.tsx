// app/(routes)/ims/inventory/items/_components/price-update-dialog.tsx
'use client';

// Bulk-update selling price, MRP and POS sellability on items that ALREADY exist.
//
// Separate from BulkImportDialog because the underlying import is insert-only: it
// rejects any code already in the institution, so it cannot fill in prices for a
// catalogue that has already been loaded. That was the state JKKN Pharmacy went
// live in — 761 items, every selling_price 0 and every is_sellable_to_students
// false, which left the POS grid empty and any bill at 0.00.
//
// Downloads a template pre-filled with the institution's items so prices get typed
// next to a recognisable name rather than transcribed against bare codes.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Loader2,
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';

interface PriceUpdateError {
  row: number;
  field?: string;
  message: string;
}

interface PriceUpdateResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: PriceUpdateError[];
}

interface PriceUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  onUpdateComplete?: () => void;
}

export function PriceUpdateDialog({
  open,
  onOpenChange,
  institutionId,
  onUpdateComplete,
}: PriceUpdateDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<PriceUpdateResult | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setUploading(false);
  };

  const handleDownloadTemplate = async () => {
    if (!institutionId) {
      toast.error('No institution selected');
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/ims/inventory/prices?institutionId=${encodeURIComponent(institutionId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not build the template');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ims-item-prices.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded — fill in the prices, then upload it here');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download the template');
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('institutionId', institutionId);

      const res = await fetch('/api/ims/inventory/prices', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();

      // A 400 still carries a per-row error report, which is the useful part —
      // only treat a shape without `errors` as an outright failure.
      if (!res.ok && !body?.errors) {
        throw new Error(body?.error || 'Price update failed');
      }

      setResult(body as PriceUpdateResult);

      if (body.successCount > 0) {
        toast.success(`Updated ${body.successCount} item${body.successCount === 1 ? '' : 's'}`);
        onUpdateComplete?.();
      } else {
        toast.error('No items were updated — see the errors below');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Price update failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            Update Prices &amp; POS Sellability
          </DialogTitle>
          <DialogDescription>
            Sets MRP, Selling Price and whether an item appears at the POS counter.
            Updates existing items only — it never creates new ones, and never
            touches names, units, categories, GST or cost price.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>An item needs a price before it can be sold</AlertTitle>
            <AlertDescription className="text-xs">
              Marking an item sellable without a Selling Price above 0 is rejected —
              otherwise it reaches the counter and bills at ₹0.00. Selling price is
              treated as inclusive of GST for counter sales.
            </AlertDescription>
          </Alert>

          {/* Step 1 — template */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">1. Download the template</div>
            <p className="text-xs text-muted-foreground">
              Comes pre-filled with every active item in this institution, its code,
              name and current cost price for reference. Leave a cell blank to keep
              its current value.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              disabled={downloading || !institutionId}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download price template
            </Button>
          </div>

          {/* Step 2 — upload */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">2. Upload the filled sheet</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0
                         file:bg-primary file:px-3 file:py-1.5 file:text-sm
                         file:font-medium file:text-primary-foreground"
            />
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Apply prices
            </Button>
          </div>

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-600" />
                  {result.successCount} updated
                </Badge>
                {result.errorCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="h-3 w-3 text-destructive" />
                    {result.errorCount} skipped
                  </Badge>
                )}
                <Badge variant="secondary">{result.totalRows} rows read</Badge>
              </div>

              {result.errors?.length > 0 && (
                <div className="rounded-md border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-28">Field</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((err, i) => (
                        <TableRow key={`${err.row}-${i}`}>
                          <TableCell className="text-xs">{err.row || '—'}</TableCell>
                          <TableCell className="text-xs">{err.field || '—'}</TableCell>
                          <TableCell className="text-xs">{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Rows that succeeded are already applied — fix the skipped rows and
                upload again. Re-applying a row that already succeeded is harmless.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
