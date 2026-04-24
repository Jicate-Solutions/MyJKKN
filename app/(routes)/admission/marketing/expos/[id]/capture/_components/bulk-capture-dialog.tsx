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
// xlsx + exceljs are lazy-loaded inside the handlers that use them so they
// don't enter the main client bundle's compile graph. Both libs are large
// enough that static imports contributed to the 2026-04-24 build OOM.
// See: follow-up to PR #437.
import { saveAs } from 'file-saver';
import { createClientSupabaseClient } from '@/lib/supabase/client';

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
  twelfth_group: string;
  institution_name: string;
  program_1: string;
  program_2: string;
  program_3: string;
  visit_type: string;
  notes: string;
  wa_opt_in: boolean;
  errors: string[];
  isValid: boolean;
}

// Column mapping: header variations → internal field name
// '_ignored' fields are accepted for backwards-compat but not sent to the API
const COLUMN_MAPPING: Record<string, string> = {
  // Name
  'NAME': 'name',
  'STUDENT NAME': 'name',
  'LEARNER NAME': 'name',
  'VISITOR NAME': 'name',
  // Phone
  'PHONE': 'phone',
  'PHONE NUMBER': 'phone',
  'MOBILE': 'phone',
  'MOBILE NUMBER': 'phone',
  // Parent / Guardian
  'PARENT NAME': 'parent_name',
  'PARENT/GUARDIAN NAME': 'parent_name',
  'GUARDIAN NAME': 'parent_name',
  'FATHER NAME': 'parent_name',
  'PARENT PHONE': 'parent_phone',
  'PARENT PHONE NUMBER': 'parent_phone',
  'PARENT MOBILE': 'parent_phone',
  'GUARDIAN PHONE': 'parent_phone',
  // Contact
  'EMAIL': 'email',
  'EMAIL ADDRESS': 'email',
  'DISTRICT': 'district',
  'CITY': 'district',
  // Academic interest
  '12TH GROUP': 'twelfth_group',
  '12TH STREAM': 'twelfth_group',
  'STREAM': 'twelfth_group',
  'GROUP': 'twelfth_group',
  // Institution
  'INSTITUTION': 'institution_name',
  'INSTITUTION NAME': 'institution_name',
  'COLLEGE NAME': 'institution_name',
  // Programs (up to 3)
  'INTERESTED PROGRAM 1': 'program_1',
  'PROGRAM 1': 'program_1',
  'PROGRAM INTEREST 1': 'program_1',
  'INTERESTED PROGRAM 2': 'program_2',
  'PROGRAM 2': 'program_2',
  'PROGRAM INTEREST 2': 'program_2',
  'INTERESTED PROGRAM 3': 'program_3',
  'PROGRAM 3': 'program_3',
  'PROGRAM INTEREST 3': 'program_3',
  // Remarks / visit type
  'REMARKS': 'visit_type',
  'VISIT TYPE': 'visit_type',
  'VISIT': 'visit_type',
  // Notes
  'NOTES': 'notes',
  'COMMENTS': 'notes',
  // WhatsApp
  'WHATSAPP CONSENT': 'wa_opt_in',
  'WA OPT IN': 'wa_opt_in',
  'WA CONSENT': 'wa_opt_in',
  'WHATSAPP OPT IN': 'wa_opt_in',
  'WHATSAPP': 'wa_opt_in',
  // Backwards-compat — old template columns, accepted but not persisted
  '12TH MARKS': '_ignored',
  'TWELFTH MARKS': '_ignored',
  '12TH MARKS / PERCENTAGE': '_ignored',
  'MARKS': '_ignored',
  'CURRENT SCHOOL': '_ignored',
  'SCHOOL': '_ignored',
  'SCHOOL NAME': '_ignored',
  'COLLEGE': '_ignored',
};

// 14-column template — matches the capture form's persisted fields
const TEMPLATE_COLUMNS = [
  { header: 'Name *',               key: 'name',             width: 25 },
  { header: 'Phone *',              key: 'phone',            width: 18 },
  { header: 'Parent Name',          key: 'parent_name',      width: 25 },
  { header: 'Parent Phone',         key: 'parent_phone',     width: 18 },
  { header: 'Email',                key: 'email',            width: 28 },
  { header: 'District',             key: 'district',         width: 18 },
  { header: '12th Group',           key: 'twelfth_group',    width: 18 },
  { header: 'Institution',          key: 'institution_name', width: 35 },
  { header: 'Interested Program 1', key: 'program_1',        width: 38 },
  { header: 'Interested Program 2', key: 'program_2',        width: 38 },
  { header: 'Interested Program 3', key: 'program_3',        width: 38 },
  { header: 'Remarks',              key: 'visit_type',       width: 18 },
  { header: 'Notes',                key: 'notes',            width: 30 },
  { header: 'WhatsApp Consent',     key: 'wa_opt_in',        width: 18 },
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

/** Map Remarks dropdown display value to DB enum value */
function parseVisitType(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v === 'expo visit') return 'expo_visit';
  if (v === 'stall visit') return 'stall_visit';
  return '';
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
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        // Always read from the first sheet (template sheet), not Reference Guide
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
          defval: '',
        });

        if (jsonData.length === 0) {
          toast.error('The file is empty or has no valid data');
          return;
        }

        const preview: PreviewRow[] = jsonData.map((row, index) => {
          const mapped: Record<string, string> = {};

          Object.entries(row).forEach(([key, value]) => {
            const normalizedKey = key.trim().replace(/[\s*#]+$/, '').toUpperCase();
            const mappedField = COLUMN_MAPPING[normalizedKey];
            // Skip backwards-compat ignored fields
            if (mappedField && mappedField !== '_ignored') {
              mapped[mappedField] = String(value ?? '').trim();
            }
          });

          // Clean phone numbers
          if (mapped.phone) mapped.phone = cleanPhone(mapped.phone);
          if (mapped.parent_phone) mapped.parent_phone = cleanPhone(mapped.parent_phone);

          // Parse visit_type from Remarks display value
          const visitType = mapped.visit_type ? parseVisitType(mapped.visit_type) : '';

          // Parse wa_opt_in — default true if column missing or empty
          const waRaw = (mapped.wa_opt_in || '').toLowerCase().trim();
          const waOptIn = !mapped.wa_opt_in || mapped.wa_opt_in === ''
            ? true
            : ['yes', 'true', '1', 'y'].includes(waRaw);

          // Validate
          const errors: string[] = [];
          if (!mapped.name) errors.push('Name required');
          if (!mapped.phone) {
            errors.push('Phone required');
          } else if (!isValidIndianPhone(mapped.phone)) {
            errors.push('Invalid phone');
          }
          if (mapped.parent_phone && !isValidIndianPhone(mapped.parent_phone)) {
            errors.push('Invalid parent phone');
          }

          return {
            rowNumber: index + 2,
            name: mapped.name || '',
            phone: mapped.phone || '',
            parent_name: mapped.parent_name || '',
            parent_phone: mapped.parent_phone || '',
            email: mapped.email || '',
            district: mapped.district || '',
            twelfth_group: mapped.twelfth_group || '',
            institution_name: mapped.institution_name || '',
            program_1: mapped.program_1 || '',
            program_2: mapped.program_2 || '',
            program_3: mapped.program_3 || '',
            visit_type: visitType,
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

    const leadsPayload = validRows.map((row) => ({
      name: row.name,
      phone: row.phone,
      parent_name: row.parent_name || undefined,
      parent_phone: row.parent_phone || undefined,
      email: row.email || undefined,
      district: row.district || undefined,
      twelfth_group: row.twelfth_group || undefined,
      institution_name: row.institution_name || undefined,
      program_1: row.program_1 || undefined,
      program_2: row.program_2 || undefined,
      program_3: row.program_3 || undefined,
      visit_type: row.visit_type || undefined,
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
      const supabase = createClientSupabaseClient();

      // Fetch institutions and programs for dropdown validations
      const [{ data: institutions }, { data: programs }] = await Promise.all([
        supabase.from('institutions').select('id, name').eq('is_active', true).order('name'),
        (supabase as any)
          .from('programs')
          .select('id, program_name, display_name, institution_id, institutions(name)')
          .eq('is_active', true)
          .order('program_name'),
      ]);

      const instList = institutions || [];
      const progList = (programs || []) as Array<{
        id: string;
        program_name: string;
        display_name: string | null;
        institution_id: string;
        institutions: { name: string } | null;
      }>;

      // Build program labels: "Institution Name — Program Name"
      const programLabels = progList.map((p) => {
        const instName = p.institutions?.name || '';
        const progName = p.display_name || p.program_name;
        return instName ? `${instName} — ${progName}` : progName;
      });

      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();

      // ── Sheet 1: Main data entry ───────────────────────────────────────
      const sheet = workbook.addWorksheet('Expo Leads Template');

      sheet.columns = TEMPLATE_COLUMNS.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width,
      }));

      // Style header row (blue)
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.alignment = { horizontal: 'center' };
      headerRow.height = 20;

      // Sample row 1
      const sampleInst = instList[0]?.name || 'Institution Name';
      const sampleProg = programLabels[0] || `${sampleInst} — Program Name`;
      sheet.addRow({
        name: 'Arun Kumar',
        phone: '9876543210',
        parent_name: 'Senthil Kumar',
        parent_phone: '9876543211',
        email: 'arun@email.com',
        district: 'Namakkal',
        twelfth_group: 'Computer Science',
        institution_name: sampleInst,
        program_1: sampleProg,
        program_2: '',
        program_3: '',
        visit_type: 'Expo Visit',
        notes: 'Very interested in CSE',
        wa_opt_in: 'Yes',
      });

      // Sample row 2
      sheet.addRow({
        name: 'Priya Devi',
        phone: '8765432109',
        parent_name: 'Murugan',
        parent_phone: '',
        email: '',
        district: 'Salem',
        twelfth_group: 'Biology',
        institution_name: sampleInst,
        program_1: programLabels[1] || sampleProg,
        program_2: '',
        program_3: '',
        visit_type: 'Stall Visit',
        notes: '',
        wa_opt_in: 'No',
      });

      // ── Sheet 2: Institution list (hidden, source for dropdown) ────────
      const instSheet = workbook.addWorksheet('_Institutions');
      instSheet.state = 'hidden';
      instSheet.getColumn(1).width = 40;
      instSheet.addRow(['Institution Name']); // header (row 1)
      instList.forEach((inst) => instSheet.addRow([inst.name]));

      // ── Sheet 3: Programs list (hidden, source for dropdown) ───────────
      const progSheet = workbook.addWorksheet('_Programs');
      progSheet.state = 'hidden';
      progSheet.getColumn(1).width = 60;
      progSheet.addRow(['Program']); // header (row 1)
      programLabels.forEach((label) => progSheet.addRow([label]));

      // ── Sheet 4: Reference guide (visible) ────────────────────────────
      const refSheet = workbook.addWorksheet('📋 Reference Guide');
      refSheet.getColumn(1).width = 35;
      refSheet.getColumn(2).width = 50;

      const refTitle = refSheet.addRow(['Institution & Programs Reference']);
      refTitle.font = { bold: true, size: 13 };
      refSheet.addRow([]);

      const refHeader = refSheet.addRow(['Institution', 'Programs Available']);
      refHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      refHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

      // Group programs by institution
      const byInstitution = new Map<string, string[]>();
      progList.forEach((p) => {
        const instName = p.institutions?.name || 'Other';
        const progName = p.display_name || p.program_name;
        if (!byInstitution.has(instName)) byInstitution.set(instName, []);
        byInstitution.get(instName)!.push(progName);
      });

      byInstitution.forEach((progs, instName) => {
        progs.forEach((prog, i) => {
          const row = refSheet.addRow([i === 0 ? instName : '', prog]);
          if (i === 0) {
            row.getCell(1).font = { bold: true };
            row.getCell(1).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFDCE6F1' },
            };
          }
        });
        refSheet.addRow([]); // spacer between institutions
      });

      refSheet.addRow([]);
      const remarksHeader = refSheet.addRow(['Remarks Column Options']);
      remarksHeader.font = { bold: true };
      refSheet.addRow(['Expo Visit', '→ Lead visited the main expo area']);
      refSheet.addRow(['Stall Visit', '→ Lead visited a specific stall']);

      // ── Apply data validations to data rows (rows 2–1001) ─────────────
      const instCount = instList.length;
      const progCount = programLabels.length;

      for (let rowIdx = 2; rowIdx <= 1001; rowIdx++) {
        // Institution dropdown (col 8)
        if (instCount > 0) {
          sheet.getRow(rowIdx).getCell(8).dataValidation = {
            type: 'list',
            allowBlank: true,
            showErrorMessage: true,
            errorTitle: 'Invalid Institution',
            error: 'Please select an institution from the dropdown list',
            formulae: [`_Institutions!$A$2:$A$${instCount + 1}`],
          };
        }

        // Program 1, 2, 3 dropdowns (cols 9, 10, 11)
        if (progCount > 0) {
          const progFormula = [`_Programs!$A$2:$A$${progCount + 1}`];
          sheet.getRow(rowIdx).getCell(9).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: progFormula,
          };
          sheet.getRow(rowIdx).getCell(10).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: progFormula,
          };
          sheet.getRow(rowIdx).getCell(11).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: progFormula,
          };
        }

        // Remarks dropdown (col 12)
        sheet.getRow(rowIdx).getCell(12).dataValidation = {
          type: 'list',
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: 'Invalid Remark',
          error: 'Please select: Expo Visit or Stall Visit',
          formulae: ['"Expo Visit,Stall Visit"'],
        };

        // WhatsApp Consent dropdown (col 14)
        sheet.getRow(rowIdx).getCell(14).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Yes,No"'],
        };
      }

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
            Download the template for the correct format — it includes institution and
            program dropdowns pre-filled from your database.
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
                    Includes institution &amp; program dropdowns + a Reference Guide sheet
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
                Drag &amp; drop your file here, or{' '}
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
                    <TableHead>Institution</TableHead>
                    <TableHead>Program 1</TableHead>
                    <TableHead>Remarks</TableHead>
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
                        {row.name || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.phone || '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {row.institution_name || '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">
                        {row.program_1
                          ? row.program_1.includes(' — ')
                            ? row.program_1.split(' — ').slice(1).join(' — ')
                            : row.program_1
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.visit_type === 'expo_visit'
                          ? 'Expo Visit'
                          : row.visit_type === 'stall_visit'
                          ? 'Stall Visit'
                          : '—'}
                      </TableCell>
                      <TableCell>{row.district || '—'}</TableCell>
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
