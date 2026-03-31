'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface BulkCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  eventId: string;
  institutionId: string;
  capturedBy: string;
}

type Step = 'upload' | 'preview' | 'uploading' | 'result';

interface PreviewRow {
  rowNumber: number;
  name: string;
  phone: string;
  parent_name: string;
  parent_phone: string;
  email: string;
  district: string;
  twelfth_marks: string;
  current_school: string;
  notes: string;
  wa_opt_in: boolean;
  errors: string[];
  isValid: boolean;
}

// Column mapping: header variations -> internal field name
const COLUMN_MAPPING: Record<string, string> = {
  'NAME': 'name',
  'STUDENT NAME': 'name',
  'LEARNER NAME': 'name',
  'VISITOR NAME': 'name',
  'PHONE': 'phone',
  'PHONE NUMBER': 'phone',
  'MOBILE': 'phone',
  'MOBILE NUMBER': 'phone',
  'PARENT NAME': 'parent_name',
  'PARENT/GUARDIAN NAME': 'parent_name',
  'GUARDIAN NAME': 'parent_name',
  'FATHER NAME': 'parent_name',
  'PARENT PHONE': 'parent_phone',
  'PARENT PHONE NUMBER': 'parent_phone',
  'PARENT MOBILE': 'parent_phone',
  'GUARDIAN PHONE': 'parent_phone',
  'EMAIL': 'email',
  'EMAIL ADDRESS': 'email',
  'DISTRICT': 'district',
  'CITY': 'district',
  '12TH MARKS': 'twelfth_marks',
  'TWELFTH MARKS': 'twelfth_marks',
  '12TH MARKS / PERCENTAGE': 'twelfth_marks',
  'MARKS': 'twelfth_marks',
  'CURRENT SCHOOL': 'current_school',
  'SCHOOL': 'current_school',
  'SCHOOL NAME': 'current_school',
  'COLLEGE': 'current_school',
  'NOTES': 'notes',
  'REMARKS': 'notes',
  'COMMENTS': 'notes',
  'WHATSAPP CONSENT': 'wa_opt_in',
  'WA OPT IN': 'wa_opt_in',
  'WA CONSENT': 'wa_opt_in',
  'WHATSAPP OPT IN': 'wa_opt_in',
  'WHATSAPP': 'wa_opt_in',
};

const TEMPLATE_COLUMNS = [
  { header: 'Name *', key: 'name', width: 25 },
  { header: 'Phone *', key: 'phone', width: 18 },
  { header: 'Parent Name *', key: 'parent_name', width: 25 },
  { header: 'Parent Phone *', key: 'parent_phone', width: 18 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'District', key: 'district', width: 18 },
  { header: '12th Marks', key: 'twelfth_marks', width: 14 },
  { header: 'Current School', key: 'current_school', width: 30 },
  { header: 'Notes', key: 'notes', width: 30 },
  { header: 'WhatsApp Consent', key: 'wa_opt_in', width: 18 },
];

/** Validate Indian mobile number: 10 digits starting with 6-9 */
function isValidIndianPhone(phone: string): boolean {
  const clean = phone.trim().replace(/[\s\-()]/g, '');
  return /^(\+91|0)?[6-9]\d{9}$/.test(clean);
}

/** Clean phone to just digits, strip prefix */
function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').replace(/^(\+91|0)/, '');
}

export function BulkCaptureDialog({
  open,
  onOpenChange,
  onSuccess,
  eventId,
  institutionId,
  capturedBy,
}: BulkCaptureDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    duplicates: number;
    errors: Array<{ row: number; message: string }>;
    total: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const resetDialog = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreviewData([]);
    setUploadProgress(0);
    setUploadResult(null);
    setIsDragging(false);
  }, []);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) resetDialog();
      onOpenChange(open);
    },
    [onOpenChange, resetDialog]
  );

  // ─── File Handling ──────────────────────────────────────────────────────

  const processFile = useCallback((selectedFile: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(selectedFile.type) && !['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
          defval: '',
        });

        if (jsonData.length === 0) {
          toast.error('The file is empty or has no valid data');
          return;
        }

        // Map columns using the mapping
        const preview: PreviewRow[] = jsonData.map((row, index) => {
          const mapped: Record<string, string> = {};

          Object.entries(row).forEach(([key, value]) => {
            const normalizedKey = key.trim().replace(/[\s*#]+$/, '').toUpperCase();
            const mappedField =
              COLUMN_MAPPING[normalizedKey] ||
              COLUMN_MAPPING[key.trim().replace(/[\s*#]+$/, '').toUpperCase()];

            if (mappedField) {
              mapped[mappedField] = String(value ?? '').trim();
            }
          });

          // Clean phone numbers
          if (mapped.phone) {
            mapped.phone = cleanPhone(mapped.phone);
          }
          if (mapped.parent_phone) {
            mapped.parent_phone = cleanPhone(mapped.parent_phone);
          }

          // Validate
          const errors: string[] = [];
          if (!mapped.name) errors.push('Name required');
          if (!mapped.phone) {
            errors.push('Phone required');
          } else if (!isValidIndianPhone(mapped.phone)) {
            errors.push('Invalid phone');
          }
          if (!mapped.parent_name) errors.push('Parent name required');
          if (!mapped.parent_phone) {
            errors.push('Parent phone required');
          } else if (mapped.parent_phone && !isValidIndianPhone(mapped.parent_phone)) {
            errors.push('Invalid parent phone');
          }

          // Parse wa_opt_in: treat "yes", "true", "1", "y" as true; default true if column missing
          const waRaw = (mapped.wa_opt_in || '').toLowerCase().trim();
          const waOptIn = mapped.wa_opt_in === undefined || mapped.wa_opt_in === ''
            ? true // Default: opted in if column not present
            : ['yes', 'true', '1', 'y'].includes(waRaw);

          return {
            rowNumber: index + 2,
            name: mapped.name || '',
            phone: mapped.phone || '',
            parent_name: mapped.parent_name || '',
            parent_phone: mapped.parent_phone || '',
            email: mapped.email || '',
            district: mapped.district || '',
            twelfth_marks: mapped.twelfth_marks || '',
            current_school: mapped.current_school || '',
            notes: mapped.notes || '',
            wa_opt_in: waOptIn,
            errors,
            isValid: errors.length === 0,
          };
        });

        setPreviewData(preview);
        setStep('preview');

        const validCount = preview.filter((r) => r.isValid).length;
        const invalidCount = preview.filter((r) => !r.isValid).length;

        if (invalidCount > 0) {
          toast.error(`${invalidCount} rows have validation errors`);
        } else {
          toast.success(`${validCount} rows ready to import`);
        }
      } catch (error) {
        console.error('[admission/expos] Parse error:', error);
        toast.error('Failed to parse the file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) processFile(selected);
    },
    [processFile]
  );

  // ─── Drag & Drop ───────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) processFile(droppedFile);
    },
    [processFile]
  );

  // ─── Upload ─────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async () => {
    const validRows = previewData.filter((r) => r.isValid);

    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }

    setStep('uploading');
    setUploadProgress(10);

    // Prepare leads data for API
    const leadsPayload = validRows.map((row) => ({
      name: row.name,
      phone: row.phone,
      parent_name: row.parent_name,
      parent_phone: row.parent_phone,
      email: row.email || undefined,
      district: row.district || undefined,
      twelfth_marks: row.twelfth_marks || undefined,
      current_school: row.current_school || undefined,
      notes: row.notes || undefined,
      wa_opt_in: row.wa_opt_in,
    }));

    try {
      setUploadProgress(30);

      const response = await fetch('/api/admission/expos/bulk-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: leadsPayload,
          eventId,
          institutionId,
          capturedBy,
        }),
      });

      setUploadProgress(80);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${response.status})`);
      }

      const result = await response.json();

      setUploadProgress(100);
      setUploadResult({
        inserted: result.inserted || 0,
        duplicates: result.duplicates || 0,
        errors: result.errors || [],
        total: result.total || leadsPayload.length,
      });
      setStep('result');

      if (result.inserted > 0) {
        toast.success(`Successfully captured ${result.inserted} leads`);
      }
      if (result.duplicates > 0) {
        toast(`${result.duplicates} duplicate leads skipped`, { icon: '⚠️' });
      }
    } catch (error) {
      console.error('[admission/expos] Bulk upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed. Please try again.');
      setStep('preview');
    }
  }, [previewData, eventId, institutionId, capturedBy]);

  // ─── Template Download ──────────────────────────────────────────────────

  const downloadTemplate = useCallback(async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Expo Leads Template');

      // Set columns
      sheet.columns = TEMPLATE_COLUMNS.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width,
      }));

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.alignment = { horizontal: 'center' };

      // Add sample row
      sheet.addRow({
        name: 'Arun Kumar',
        phone: '9876543210',
        parent_name: 'Senthil Kumar',
        parent_phone: '9876543211',
        email: 'arun@email.com',
        district: 'Namakkal',
        twelfth_marks: '85%',
        current_school: 'Government Higher Secondary School',
        notes: 'Interested in B.Tech CSE',
        wa_opt_in: 'Yes',
      });

      // Add second sample row
      sheet.addRow({
        name: 'Priya Devi',
        phone: '8765432109',
        parent_name: 'Murugan',
        parent_phone: '8765432100',
        email: '',
        district: 'Salem',
        twelfth_marks: '92%',
        current_school: 'St. Mary\'s Matric Hr Sec School',
        notes: '',
        wa_opt_in: 'No',
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, 'expo-leads-template.xlsx');
      toast.success('Template downloaded');
    } catch (error) {
      console.error('[admission/expos] Template error:', error);
      toast.error('Failed to generate template');
    }
  }, []);

  // ─── Computed ───────────────────────────────────────────────────────────

  const validCount = previewData.filter((r) => r.isValid).length;
  const invalidCount = previewData.filter((r) => !r.isValid).length;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Lead Capture
          </DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with visitor data captured at the expo.
            Download the template for the correct format.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Template Download */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Download Template</p>
                  <p className="text-xs text-muted-foreground">
                    Use this template to ensure correct column format
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Template
              </Button>
            </div>

            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                Drag & drop your file here, or{' '}
                <button
                  className="text-primary underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx, .xls, .csv (max 10MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {file?.name}
              </Badge>
              <Badge className="bg-green-100 text-green-800 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge className="bg-red-100 text-red-800 gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  {invalidCount} invalid
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Total: {previewData.length} rows
              </span>
            </div>

            {/* Preview Table */}
            <div className="border rounded-lg max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead className="w-[40px]">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Parent Name</TableHead>
                    <TableHead>Parent Phone</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 100).map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={!row.isValid ? 'bg-red-50 dark:bg-red-950/20' : ''}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.name || '\u2014'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.phone || '\u2014'}
                      </TableCell>
                      <TableCell>{row.parent_name || '\u2014'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.parent_phone || '\u2014'}
                      </TableCell>
                      <TableCell>{row.district || '\u2014'}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <div className="text-xs text-red-600">
                            {row.errors.join('; ')}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {previewData.length > 100 && (
                <div className="p-2 text-center text-xs text-muted-foreground border-t">
                  Showing first 100 of {previewData.length} rows
                </div>
              )}
            </div>

            {/* Actions */}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={resetDialog}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={validCount === 0}
              >
                <Upload className="h-4 w-4 mr-1" />
                Import {validCount} Leads
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="space-y-4 py-8 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Uploading leads...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Please don&apos;t close this dialog
              </p>
            </div>
            <Progress value={uploadProgress} className="max-w-xs mx-auto" />
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && uploadResult && (
          <div className="space-y-4">
            {/* Result Summary */}
            <div className="text-center py-4">
              {uploadResult.errors.length === 0 ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
              ) : (
                <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-2" />
              )}
              <h3 className="text-lg font-semibold">
                {uploadResult.errors.length === 0
                  ? 'Capture Successful!'
                  : 'Capture Completed with Issues'}
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {uploadResult.inserted}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">Captured</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                  {uploadResult.duplicates}
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">Duplicates</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {uploadResult.errors.length}
                </p>
                <p className="text-xs text-red-600 dark:text-red-500">Errors</p>
              </div>
            </div>

            {/* Error Details */}
            {uploadResult.errors.length > 0 && (
              <div className="border rounded-lg max-h-[200px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.errors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell className="text-sm text-red-600">
                          {err.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  resetDialog();
                  onSuccess();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
