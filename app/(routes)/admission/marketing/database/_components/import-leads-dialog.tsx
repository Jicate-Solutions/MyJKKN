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
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useBulkUploadLeads } from '@/hooks/admission/use-marketing-leads-database';
import {
  MARKETING_LEADS_COLUMN_MAPPING,
  MARKETING_LEADS_TEMPLATE_COLUMNS,
  normalizeGender,
  cleanMobileNumber,
  cleanPincode,
} from '@/lib/utils/mappings/marketing-leads-excel-mappings';

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  institutionId?: string;
}

type Step = 'upload' | 'preview' | 'uploading' | 'result';

interface PreviewRow {
  rowNumber: number;
  district: string;
  sub_district: string;
  student_name: string;
  father_name: string;
  gender: string;
  community: string;
  mobile_number: string;
  group_detail: string;
  address: string;
  pincode: string;
  school_name: string;
  errors: string[];
  isValid: boolean;
}

export function ImportLeadsDialog({
  open,
  onOpenChange,
  onSuccess,
  institutionId: propInstitutionId,
}: ImportLeadsDialogProps) {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = propInstitutionId || selectedInstitutionId || '';
  const bulkUpload = useBulkUploadLeads();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    failed: number;
    errors: Array<{ row: number; message: string }>;
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
            // Strip trailing annotation chars like * (required marker) before lookup
            const normalizedKey = key.trim().replace(/[\s*#]+$/, '').toUpperCase();
            const mappedField = MARKETING_LEADS_COLUMN_MAPPING[normalizedKey] ||
              MARKETING_LEADS_COLUMN_MAPPING[key.trim().replace(/[\s*#]+$/, '')];

            if (mappedField) {
              mapped[mappedField] = String(value ?? '').trim();
            }
          });

          // Apply normalization (data cleanup only, no blocking validation)
          if (mapped.gender) {
            mapped.gender = normalizeGender(mapped.gender) || mapped.gender;
          }
          if (mapped.mobile_number) {
            mapped.mobile_number = cleanMobileNumber(mapped.mobile_number);
          }
          if (mapped.pincode) {
            mapped.pincode = cleanPincode(mapped.pincode);
          }

          return {
            rowNumber: index + 2,
            district: mapped.district || '',
            sub_district: mapped.sub_district || '',
            student_name: mapped.student_name || '',
            father_name: mapped.father_name || '',
            gender: mapped.gender || '',
            community: mapped.community || '',
            mobile_number: mapped.mobile_number || '',
            group_detail: mapped.group_detail || '',
            address: mapped.address || '',
            pincode: mapped.pincode || '',
            school_name: mapped.school_name || '',
            errors: [] as string[],
            isValid: true,
          };
        });

        setPreviewData(preview);
        setStep('preview');

        const validCount = preview.length;
        const invalidCount = 0;

        if (invalidCount > 0) {
          toast.error(`${invalidCount} rows have validation errors`);
        } else {
          toast.success(`${validCount} rows ready to import`);
        }
      } catch (error) {
        console.error('[admission/marketing-leads-db] Parse error:', error);
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
    if (!institutionId) {
      toast.error('Institution not loaded. Please refresh and try again.');
      return;
    }

    if (previewData.length === 0) {
      toast.error('No rows to upload');
      return;
    }

    setStep('uploading');
    setUploadProgress(10);

    const batchId = crypto.randomUUID();

    // Prepare leads data (strip preview-only fields)
    const leads = previewData.map((row) => ({
      district: row.district,
      sub_district: row.sub_district,
      student_name: row.student_name,
      father_name: row.father_name,
      gender: row.gender,
      community: row.community,
      mobile_number: row.mobile_number,
      group_detail: row.group_detail,
      address: row.address,
      pincode: row.pincode,
      school_name: row.school_name,
    }));

    setUploadProgress(30);

    try {
      const result = await bulkUpload.mutateAsync({
        leads,
        batchId,
        institutionId,
        fileName: file?.name || 'unknown',
        userId: profile?.id,
      });

      setUploadProgress(100);
      setUploadResult({
        inserted: result.inserted,
        failed: result.failed,
        errors: result.errors,
      });
      setStep('result');

      if (result.inserted > 0) {
        toast.success(`Successfully imported ${result.inserted} leads`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} rows failed to insert`);
      }
    } catch (error) {
      console.error('[admission/marketing-leads-db] Upload error:', error);
      toast.error('Upload failed. Please try again.');
      setStep('preview');
    }
  }, [previewData, file, institutionId, profile?.id, bulkUpload]);

  // ─── Template Download ──────────────────────────────────────────────────

  const downloadTemplate = useCallback(async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Leads Template');

      // Set columns
      sheet.columns = MARKETING_LEADS_TEMPLATE_COLUMNS.map((col) => ({
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
        district: 'Namakkal',
        sub_district: 'Komarapalayam',
        student_name: 'John Doe',
        father_name: 'Richard Doe',
        gender: 'Male',
        community: 'BC',
        mobile_number: '9876543210',
        group_detail: 'Science',
        address: '123 Main Street',
        pincode: '637001',
        school_name: 'Government Higher Secondary School',
      });

      // Add gender dropdown validation
      const genderCol = MARKETING_LEADS_TEMPLATE_COLUMNS.findIndex(
        (c) => c.key === 'gender'
      );
      if (genderCol >= 0) {
        for (let i = 2; i <= 1001; i++) {
          sheet.getCell(i, genderCol + 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"Male,Female,Other"'],
          };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, 'marketing-leads-template.xlsx');
      toast.success('Template downloaded');
    } catch (error) {
      console.error('[admission/marketing-leads-db] Template error:', error);
      toast.error('Failed to generate template');
    }
  }, []);

  // ─── Computed ───────────────────────────────────────────────────────────

  const validCount = previewData.length;
  const invalidCount = 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Leads
          </DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with lead data. Download the template
            for the correct format.
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
            <div className="flex items-center gap-4">
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
                    <TableHead>Status</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Father Name</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 100).map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={!row.isValid ? 'bg-red-50' : ''}
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
                        {row.student_name || '—'}
                      </TableCell>
                      <TableCell>{row.father_name || '—'}</TableCell>
                      <TableCell>{row.gender || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.mobile_number || '—'}
                      </TableCell>
                      <TableCell>{row.district || '—'}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {row.school_name || '—'}
                      </TableCell>
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
                Import {validCount} Rows
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
              {uploadResult.failed === 0 ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
              ) : (
                <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-2" />
              )}
              <h3 className="text-lg font-semibold">
                {uploadResult.failed === 0
                  ? 'Import Successful!'
                  : 'Import Completed with Errors'}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
              <div className="text-center p-3 rounded-lg bg-green-50">
                <p className="text-2xl font-bold text-green-700">
                  {uploadResult.inserted}
                </p>
                <p className="text-xs text-green-600">Imported</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-red-700">
                  {uploadResult.failed}
                </p>
                <p className="text-xs text-red-600">Failed</p>
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
