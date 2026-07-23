'use client';

// Bulk room upload for a single block.
//
// Flow mirrors the established bulk-upload pattern (staff/category): download
// a template → user fills it → upload .xlsx → per-row validation with a Valid /
// Invalid preview → "Upload Valid Rows" loops HostelRoomService.createRoom.
//
// Category is provided BY NAME in the sheet and resolved here against this
// block's gender-matched hostel_categories (rooms inherit the block's gender,
// so only those tiers are valid). Rows whose category name doesn't match are
// flagged Invalid with the list of accepted names.

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, X, FileText, Download } from 'lucide-react';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { hostelRoomKeys } from '@/hooks/campus-living/use-hostel-rooms';
import { HostelRoomService } from '@/lib/services/campus-living/hostel-room-service';
import type { RoomType, AcStatus, CreateHostelRoomDTO } from '@/types/campus-living';
import { ROOM_PURPOSE_OPTIONS, TIER_ACCESS_OPTIONS } from './room-meta';

const ROOM_TYPES: RoomType[] = ['single', 'double', 'triple', 'quad', 'dormitory'];
const AC_STATUSES: AcStatus[] = ['non_ac', 'ac', 'cooler'];
const TIER_VALUES = TIER_ACCESS_OPTIONS.map((t) => t.value);
const PURPOSE_VALUES = ROOM_PURPOSE_OPTIONS.map((p) => p.value);
// Lossless normalization: "OFFICE ROOM" / "Mess Staff" → office_room / mess_staff.
const normalizePurpose = (v: unknown) =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_');
const DEFAULT_CAPACITY: Record<RoomType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  dormitory: 6,
};

const truthy = (v: unknown) =>
  ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());

interface PreviewRow {
  rowNumber: number;
  room_number: string;
  floor: string;
  room_type: string;
  ac_status: string;
  room_purpose: string;
  tier_access: string;
  category: string;
  capacity: string;
  isValid: boolean;
  errors: string[];
  payload?: Omit<CreateHostelRoomDTO, 'block_id'>;
}

interface BulkUploadRoomsProps {
  blockId: string;
  blockType?: string;
}

export function BulkUploadRooms({ blockId, blockType }: BulkUploadRoomsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { hostelCategories: allCategories } = useActiveHostelCategories();
  const categories = useMemo(
    () =>
      blockType && blockType !== 'mixed'
        ? allCategories.filter((c) => c.type === blockType)
        : allCategories,
    [allCategories, blockType]
  );

  // Case-insensitive name → id map for the accepted categories.
  const categoryByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.name.trim().toLowerCase(), c.id);
    return m;
  }, [categories]);
  const acceptedNames = categories.map((c) => c.name).join(', ');

  const downloadTemplate = () => {
    const header = {
      room_number: '101',
      floor: 1,
      room_type: 'double',
      ac_status: 'non_ac',
      room_purpose: 'student',
      tier_access: 'classic',
      category: categories[0]?.name ?? 'Boys Hostel',
      capacity: 2,
      actual_capacity: 2,
      annual_fee: 60000,
      renovated: '',
      painting: '',
      attached_bathroom: 'yes',
      accessible: 'no',
    };
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([header]);
    XLSX.utils.book_append_sheet(wb, ws, 'Rooms');

    // Reference sheet so users know the exact accepted values. The upload
    // reader only ever reads the first ("Rooms") sheet, so this is purely
    // informational.
    const ref = XLSX.utils.json_to_sheet([
      { field: 'room_type', accepted_values: ROOM_TYPES.join(' | ') },
      { field: 'ac_status', accepted_values: AC_STATUSES.join(' | ') },
      { field: 'room_purpose', accepted_values: PURPOSE_VALUES.join(' | ') },
      { field: 'tier_access', accepted_values: TIER_VALUES.join(' | ') },
      {
        field: 'category (student rooms only)',
        accepted_values: acceptedNames || '(no categories defined for this block)',
      },
      {
        field: 'renovated / painting',
        accepted_values: 'free text, e.g. DONE PROPERLY | RENOVATED | PENDING | FINISHED (blank = N/A)',
      },
      {
        field: 'actual_capacity',
        accepted_values: 'optional whole number — real bed count, may exceed capacity (blank = N/A)',
      },
      { field: 'attached_bathroom / accessible', accepted_values: 'yes | no' },
    ]);
    XLSX.utils.book_append_sheet(wb, ref, 'ValidValues');

    XLSX.writeFile(wb, 'rooms-bulk-template.xlsx');
  };

  const validateRow = (raw: Record<string, unknown>, index: number): PreviewRow => {
    const errors: string[] = [];

    const room_number = String(raw.room_number ?? '').trim();
    if (!room_number) errors.push('Room number is required');

    const floorRaw = String(raw.floor ?? '').trim();
    const floor = Number(floorRaw);
    if (floorRaw === '' || !Number.isInteger(floor) || floor < 0 || floor > 50) {
      errors.push('Floor must be a whole number 0–50');
    }

    let room_type = String(raw.room_type ?? '').trim().toLowerCase() as RoomType;
    if (!room_type) room_type = 'double';
    if (!ROOM_TYPES.includes(room_type)) {
      errors.push(`Room type must be one of: ${ROOM_TYPES.join(', ')}`);
    }

    let ac_status = String(raw.ac_status ?? '').trim().toLowerCase() as AcStatus;
    if (!ac_status) ac_status = 'non_ac';
    if (!AC_STATUSES.includes(ac_status)) {
      errors.push(`AC status must be one of: ${AC_STATUSES.join(', ')}`);
    }

    // Purpose is lossless (default 'student'); any value is accepted so the
    // hostel's real vocabulary (accounts, warden, mess_staff, …) round-trips.
    let room_purpose = normalizePurpose(raw.room_purpose);
    if (!room_purpose) room_purpose = 'student';

    let tier_access = String(raw.tier_access ?? '').trim().toLowerCase();
    if (!tier_access) tier_access = 'classic';
    if (!TIER_VALUES.includes(tier_access)) {
      errors.push(`Tier must be one of: ${TIER_VALUES.join(', ')}`);
    }

    // Category is required for student rooms only; special-purpose rooms
    // (Accounts, Warden, …) carry no category.
    const categoryName = String(raw.category ?? '').trim();
    const category_id = categoryName
      ? categoryByName.get(categoryName.toLowerCase())
      : undefined;
    if (!categoryName) {
      if (room_purpose === 'student') {
        errors.push('Category is required for student rooms');
      }
    } else if (!category_id) {
      errors.push(`Unknown category "${categoryName}". Accepted: ${acceptedNames || 'none'}`);
    }

    const renovated = String(raw.renovated ?? '').trim() || null;
    const painting = String(raw.painting ?? '').trim() || null;

    const capRaw = String(raw.capacity ?? '').trim();
    let capacity = Number(capRaw);
    if (capRaw === '') {
      capacity = ROOM_TYPES.includes(room_type) ? DEFAULT_CAPACITY[room_type] : 1;
    } else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      errors.push('Capacity must be a whole number 1–20');
    }

    // Real bed count — optional, may exceed sanctioned capacity.
    const actualCapRaw = String(raw.actual_capacity ?? '').trim();
    let actual_capacity: number | null = null;
    if (actualCapRaw !== '') {
      const ac = Number(actualCapRaw);
      if (!Number.isInteger(ac) || ac < 1 || ac > 30) {
        errors.push('Actual capacity must be a whole number 1–30');
      } else {
        actual_capacity = ac;
      }
    }

    const feeRaw = String(raw.annual_fee ?? '').trim();
    let annual_fee: number | null = null;
    if (feeRaw !== '') {
      const fee = Number(feeRaw);
      if (!Number.isFinite(fee) || fee < 0) {
        errors.push('Annual fee must be a non-negative number');
      } else {
        annual_fee = fee;
      }
    }

    const isValid = errors.length === 0;
    return {
      rowNumber: index + 2, // +1 header, +1 to 1-base
      room_number,
      floor: floorRaw,
      room_type,
      ac_status,
      room_purpose,
      tier_access,
      category: categoryName,
      capacity: capRaw || String(capacity),
      isValid,
      errors,
      payload: isValid
        ? {
            room_number,
            floor,
            room_type,
            ac_status,
            room_purpose,
            tier_access,
            category_id: category_id ?? null,
            capacity,
            actual_capacity,
            annual_fee,
            renovated,
            painting,
            has_attached_bathroom: truthy(raw.attached_bathroom),
            is_accessible: truthy(raw.accessible),
          }
        : undefined,
    };
  };

  const processFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      // Template's data sheet is always the first ("Rooms") sheet.
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      if (json.length === 0) {
        toast.error('The sheet has no data rows.');
        return;
      }
      setPreviewData(json.map((row, i) => validateRow(row, i)));
      setIsOpen(true);
    } catch (err) {
      console.error('Error processing rooms file:', err);
      toast.error('Could not read the file. Check the format and headers.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      toast.error('Please upload an Excel (.xlsx) file');
      return;
    }
    setSelectedFile(file);
    await processFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    const validRows = previewData.filter((r) => r.isValid && r.payload);
    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }
    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;
    // Sequential to keep error attribution simple and avoid hammering RLS.
    for (const row of validRows) {
      try {
        await HostelRoomService.createRoom({ block_id: blockId, ...row.payload! });
        successCount++;
      } catch (err) {
        console.error(`Row ${row.rowNumber} failed:`, err);
        errorCount++;
      }
    }
    await queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
    setIsUploading(false);

    if (successCount > 0) {
      toast.success(
        `Uploaded ${successCount} room${successCount === 1 ? '' : 's'}.` +
          (errorCount > 0 ? ` ${errorCount} failed.` : '')
      );
    } else {
      toast.error('No rooms were uploaded.');
    }
    if (errorCount === 0) {
      setIsOpen(false);
      clearFile();
    }
  };

  const validCount = previewData.filter((r) => r.isValid).length;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o);
        if (!o) clearFile();
      }}
    >
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="mr-2 h-4 w-4" />
            Bulk Upload
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Rooms</DialogTitle>
          <DialogDescription>
            Download the template, fill one room per row, then upload it here to
            preview and import.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg">
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileSelect}
                className="hidden"
                ref={fileInputRef}
              />
              <Upload className="h-8 w-8 mb-4 text-muted-foreground" />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Select Excel File
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Only .xlsx files are supported
              </p>
              <Button variant="link" size="sm" className="mt-1" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download template
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span>{selectedFile.name}</span>
                  <Badge variant="outline">
                    {validCount}/{previewData.length} valid
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFile}>
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Room No.</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>AC</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.room_number || '—'}</TableCell>
                        <TableCell>{row.floor || '—'}</TableCell>
                        <TableCell className="capitalize">{row.room_type}</TableCell>
                        <TableCell>{row.ac_status}</TableCell>
                        <TableCell className="capitalize">
                          {row.room_purpose.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="capitalize">{row.tier_access}</TableCell>
                        <TableCell>{row.category || '—'}</TableCell>
                        <TableCell>{row.capacity || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={row.isValid ? 'success' : 'destructive'}>
                            {row.isValid ? 'Valid' : 'Invalid'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-destructive max-w-[240px] text-xs">
                          {row.errors.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                clearFile();
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            {selectedFile && (
              <Button onClick={handleUpload} disabled={isUploading || validCount === 0}>
                {isUploading ? 'Uploading...' : `Upload ${validCount} Valid Row${validCount === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
