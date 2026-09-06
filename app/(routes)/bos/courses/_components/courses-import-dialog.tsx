'use client';

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, UploadCloud, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useImportBosCourses } from '@/hooks/bos/use-bos-courses';
import { useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useCourseTypeOptions } from '@/hooks/bos/use-course-types';
import {
  COURSE_CATEGORY_VALUES,
  COURSE_PART_VALUES,
  COURSE_TYPE_VALUES,
  COURSE_LEVEL_VALUES,
  institutionSkipsPartLevel,
  makeImportRowClientSchema,
} from '@/lib/services/bos/courses-schemas';
import { resolveAcademicModel } from '@/lib/services/bos/academic-model';
import type { BosBulkImportResponse } from '@/types/bos-courses';

interface CoeBoard {
  id: string;
  board_code: string;
  board_name: string;
}

// Template column spec — the parser reads cells by these exact header names,
// so keep them in sync if a column is ever added or renamed. `list` marks a
// column that gets an Excel dropdown fed from the hidden Lists sheet.
interface TemplateColumn {
  header: string;
  sample: string | number;
  list?: readonly string[];
}

/** Max data rows the template pre-arms with dropdown validation. */
const TEMPLATE_VALIDATION_ROWS = 500;

interface CoursesImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string | undefined;
  institutionCode: string;
  myjkknInstitutionIds: string[];
}

export function CoursesImportDialog({
  open,
  onOpenChange,
  institutionId,
  institutionCode,
  myjkknInstitutionIds,
}: CoursesImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [boardId, setBoardId] = useState('');
  const [regulationCode, setRegulationCode] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [clientErrors, setClientErrors] = useState<BosBulkImportResponse['errors']>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<BosBulkImportResponse | null>(null);

  const bulkImport = useImportBosCourses();

  // Live course_type list from COE — same fallback strategy as the manual form
  // so the template dropdown never blocks on a COE outage.
  const courseTypesQ = useCourseTypeOptions();
  const courseTypeOptions: readonly string[] =
    courseTypesQ.options.length > 0 ? courseTypesQ.options : COURSE_TYPE_VALUES;

  // Boards for this institution, narrowed to the user's own board memberships
  // — mirrors the New Course page (shared queryKey, so the cache is reused).
  const boardScope = useBosBoardScope();
  const { data: boardsData, isLoading: boardsLoading } = useQuery<{ data: CoeBoard[] }>({
    queryKey: ['bos', 'boards', institutionId],
    enabled: open && !!institutionId,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards?institutionsId=${institutionId}`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const allBoards = boardsData?.data ?? [];
  const boards = (boardScope.isSuperAdmin || boardScope.isPrincipal)
    ? allBoards
    : allBoards.filter((b) => boardScope.boardsOf.has(b.id));

  // Board defaulting: admins (and principals) pick explicitly; everyone else
  // gets their board pre-selected — the list is already narrowed to boards
  // they serve on (member/chairman), so they only pick a regulation and
  // upload. Multi-board members can still switch via the picker.
  const isAdminScope = boardScope.isSuperAdmin || boardScope.isPrincipal;
  useEffect(() => {
    if (!open || boardsLoading || boardScope.isLoading || boardId) return;
    if (boards.length === 1 || (!isAdminScope && boards.length > 0)) {
      setBoardId(boards[0].id);
    }
  }, [open, boards, boardId, boardsLoading, boardScope.isLoading, isAdminScope]);

  const lookupIds = myjkknInstitutionIds.length > 0 ? myjkknInstitutionIds : institutionId;
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);
  const regulations = regulationsData?.data ?? [];

  const selectedBoard = boards.find((b) => b.id === boardId);
  const boardCode = selectedBoard?.board_code ?? '';

  // Academic model of the selected board (COP: B.Pharm vs Pharm.D). Drives the
  // lenient year-based validation + the template's Academic Year column.
  const academicModel = resolveAcademicModel({
    institutionCode,
    boardId,
    boardName: selectedBoard?.board_name,
    boardCode: selectedBoard?.board_code,
  });
  const isYearBased = academicModel === 'mgr_pharmd' || academicModel === 'mgr_ahs';

  // Institutions like CET don't use the Part I–V / Level tiers — drop those
  // columns from the template and ignore them on parse.
  const skipPartLevel = institutionSkipsPartLevel(institutionCode);

  const downloadTemplate = async () => {
    // ExcelJS is loaded on demand — it's only needed for the template's
    // dropdown validations, which SheetJS (community) cannot write.
    const mod = await import('exceljs');
    const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook();

    const columns: TemplateColumn[] = [
      { header: 'Course Code', sample: isYearBased ? 'TMPPD101' : '24UCSC01' },
      { header: 'Course Name', sample: isYearBased ? 'Human Anatomy and Physiology' : 'PROGRAMMING IN C' },
      // Year-based models (Pharm.D/AHS) carry no category; add Academic Year instead.
      ...(isYearBased
        ? [{ header: 'Academic Year', sample: 1 } as TemplateColumn]
        : [{ header: 'Category', sample: 'Theory', list: COURSE_CATEGORY_VALUES } as TemplateColumn]),
      ...(skipPartLevel
        ? []
        : [{ header: 'Part', sample: 'Part III', list: COURSE_PART_VALUES } as TemplateColumn]),
      { header: 'Type', sample: 'Core', list: courseTypeOptions },
      ...(skipPartLevel
        ? []
        : [{ header: 'Level', sample: 'I', list: COURSE_LEVEL_VALUES } as TemplateColumn]),
      { header: 'Exam Duration (Hrs)', sample: 3 },
      { header: 'Credits', sample: isYearBased ? '' : 3 },
      { header: 'Theory Hours', sample: isYearBased ? 3 : 5 },
      { header: 'Practical Hours', sample: isYearBased ? 3 : 0 },
      { header: 'Internal Max Mark', sample: isYearBased ? '' : 25 },
      { header: 'External Max Mark', sample: isYearBased ? '' : 75 },
    ];
    // Column letters are derived from index — fine while the sheet stays
    // under 26 columns.
    const letter = (i: number) => String.fromCharCode(65 + i);

    const ws = wb.addWorksheet('Courses');
    ws.addRow(columns.map((c) => c.header));
    ws.addRow(columns.map((c) => c.sample));

    const header = ws.getRow(1);
    header.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    const sample = ws.getRow(2);
    sample.font = { size: 10, color: { argb: 'FF1F2937' } };
    sample.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    ws.columns = columns.map((c) => ({ width: Math.max(c.header.length + 4, 14) }));

    // Hidden Lists sheet feeding the enum dropdowns. Range references are
    // required (not inline lists) because the Type list exceeds Excel's
    // 255-char inline-formula limit.
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    const listColumns = columns.filter((c) => c.list);
    listColumns.forEach((c, li) => {
      lists.getCell(`${letter(li)}1`).value = c.header;
      c.list!.forEach((v, r) => { lists.getCell(`${letter(li)}${r + 2}`).value = v; });
    });
    for (let r = 2; r <= TEMPLATE_VALIDATION_ROWS; r++) {
      columns.forEach((c, ci) => {
        if (!c.list) return;
        const li = listColumns.indexOf(c);
        ws.getCell(`${letter(ci)}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${letter(li)}$2:$${letter(li)}$${c.list.length + 1}`],
        };
      });
    }

    const info = wb.addWorksheet('Instructions');
    info.getColumn(1).width = 100;
    [
      'BoS Courses — Bulk Import Template',
      '',
      '1. Fill one course per row on the "Courses" sheet. The yellow row is a sample — replace it.',
      '2. Board and Regulation are picked in the Import dialog, not in this file.',
      isYearBased
        ? '3. Year model (Pharm.D/AHS): Academic Year is the placement; Category / Credits / Marks may be left blank.'
        : skipPartLevel
          ? '3. Category is required; Type may be left blank.'
          : '3. Category is required; Part / Type / Level may be left blank (e.g., PG courses carry no Part).',
      '4. Total Max Mark is computed automatically as Internal + External.',
      isYearBased
        ? '5. Codes are letters/digits only — Pharm.D subjects use temp codes like TMPPD101 (year+seq), replaced with official codes later.'
        : '5. Course codes must be letters and digits only, and must not already exist for this institution.',
    ].forEach((line, i) => { info.getCell(`A${i + 1}`).value = line; });
    info.getCell('A1').font = { bold: true, size: 13 };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bos-courses-import-template${institutionCode ? `-${institutionCode}` : ''}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        // Pick the data sheet by name — never blindly take SheetNames[0]
        // (the template also carries Lists/Instructions sheets).
        const sheetName = workbook.SheetNames.includes('Courses')
          ? 'Courses'
          : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        const str = (v: unknown) => String(v ?? '').trim();
        // Blank optional enums must be undefined (not '') to satisfy the
        // optional Zod enums; blank required numbers stay undefined so the
        // row fails validation loudly instead of silently importing as 0.
        const strOpt = (v: unknown) => (str(v) === '' ? undefined : str(v));
        const num = (v: unknown) => (str(v) === '' ? undefined : Number(v));

        const entries = jsonData
          .map((row, idx) => ({
            // +2 = header row + 1-based index, so errors cite the sheet row.
            __row: idx + 2,
            course_code: str(row['Course Code']).toUpperCase(),
            course_name: str(row['Course Name']),
            course_category: strOpt(row['Category']),
            // Year-based models locate the course by academic year (no category).
            academic_year: num(row['Academic Year']),
            // CET-style institutions carry no Part/Level — ignore the columns
            // even if an old template still has them filled.
            course_part_master: skipPartLevel ? undefined : strOpt(row['Part']),
            course_type: strOpt(row['Type']),
            course_level: skipPartLevel ? undefined : strOpt(row['Level']),
            exam_duration: num(row['Exam Duration (Hrs)']),
            credit: num(row['Credits']),
            theory_hours: num(row['Theory Hours']),
            practical_hours: num(row['Practical Hours']),
            // The template's "Max Mark" columns carry the CIA/ESE WEIGHTAGE, so
            // they feed the converted pair — the pair the form edits, the one
            // Zod now requires, and the one total_max_mark derives from.
            // toCoeCreatePayload seeds the question-paper ceilings to the same
            // values on create, so a bulk import stays internally consistent.
            internal_converted_mark: num(row['Internal Max Mark']),
            external_converted_mark: num(row['External Max Mark']),
            total_max_mark:
              Number(num(row['Internal Max Mark']) ?? 0) +
              Number(num(row['External Max Mark']) ?? 0),
          }))
          // Skip fully-empty rows (including the untouched sample row's trail).
          .filter((r) => r.course_code || r.course_name);

        // Validate BEFORE upload — the same Zod schema the server applies —
        // plus in-file duplicate detection, so error rows surface immediately.
        const errors: BosBulkImportResponse['errors'] = [];
        const valid: typeof entries = [];
        const seenCodes = new Map<string, number>();
        const clientSchema = makeImportRowClientSchema(academicModel);
        for (const entry of entries) {
          const { __row, ...fields } = entry;
          const res = clientSchema.safeParse(fields);
          if (!res.success) {
            errors.push({
              row: __row,
              course_code: entry.course_code || undefined,
              message: res.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            });
            continue;
          }
          const firstRow = seenCodes.get(entry.course_code);
          if (firstRow !== undefined) {
            errors.push({
              row: __row,
              course_code: entry.course_code,
              message: `Duplicate course code in this file (also at row ${firstRow})`,
            });
            continue;
          }
          seenCodes.set(entry.course_code, __row);
          valid.push(entry);
        }

        setRows(valid);
        setClientErrors(errors);
        if (entries.length === 0) toast.error('No course rows found in the file');
        else if (errors.length > 0) toast.error(`${errors.length} row(s) failed validation`);
      } catch (error) {
        console.error('[courses-import-dialog] Parse error:', error);
        toast.error('Failed to parse file');
        setRows([]);
        setClientErrors([]);
      }
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!institutionId || !boardId || !regulationCode || rows.length === 0) return;
    try {
      const importResult = await bulkImport.mutateAsync({
        // board_id is injected into every row here (not typed in Excel) —
        // importRowSchema requires it, and one file always targets one board.
        rows: rows.map((r) => ({ ...r, board_id: boardId })),
        context: {
          institution_id: institutionId,
          institution_code: institutionCode,
          regulation_code: regulationCode,
          board_id: boardId,
          board_code: boardCode,
          academic_model: academicModel,
        },
      });
      setResult(importResult);
      const ok = importResult.inserted + importResult.updated;
      if (ok > 0) toast.success(`Imported ${ok} course${ok === 1 ? '' : 's'}`);
      if (importResult.errors.length > 0) {
        toast.error(`${importResult.errors.length} row(s) failed`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setRows([]);
      setClientErrors([]);
      setResult(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    onOpenChange(next);
  };

  const ready = !!institutionId && !!boardId && !!regulationCode && rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Import Courses</DialogTitle>
          <DialogDescription>
            Bulk-add courses{institutionCode ? ` for ${institutionCode}` : ''} from an Excel
            file. Rows are validated first; duplicate or already-existing course codes are
            reported with their row numbers.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label className='text-xs'>Board<span aria-hidden='true' className='ml-0.5 text-red-600'>*</span></Label>
              <SearchableSelect
                modal
                value={boardId}
                onValueChange={setBoardId}
                options={boards.map((b) => ({
                  value: b.id,
                  label: `${b.board_name} (${b.board_code})`,
                }))}
                loading={boardsLoading}
                disabled={!institutionId || (boards.length === 0 && !boardsLoading)}
                placeholder='Select board'
                searchPlaceholder='Search board…'
                className='w-full justify-between'
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs'>Regulation<span aria-hidden='true' className='ml-0.5 text-red-600'>*</span></Label>
              <SearchableSelect
                modal
                value={regulationCode}
                onValueChange={setRegulationCode}
                options={regulations.map((r) => ({
                  value: r.regulation_code,
                  label: r.regulation_year
                    ? `${r.regulation_code} (${r.regulation_year})`
                    : r.regulation_code,
                }))}
                loading={regulationsLoading}
                disabled={!institutionId || (regulations.length === 0 && !regulationsLoading)}
                placeholder='Select regulation'
                searchPlaceholder='Search regulation…'
                className='w-full justify-between'
              />
            </div>
          </div>

          <Button variant='outline' onClick={downloadTemplate} className='w-full sm:w-auto'>
            <Download className='h-4 w-4 mr-2' />
            Download Template
          </Button>

          <input
            type='file'
            accept='.xlsx,.xls,.csv'
            onChange={handleFileSelect}
            className='hidden'
            ref={fileInputRef}
          />

          <div
            className='flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center cursor-pointer hover:bg-muted/50'
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className='h-8 w-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              {fileName
                ? `${fileName} — ${rows.length} valid row${rows.length === 1 ? '' : 's'}`
                  + (clientErrors.length > 0 ? `, ${clientErrors.length} with errors` : '')
                : 'Click to choose a .xlsx or .csv file'}
            </p>
          </div>

          {clientErrors.length > 0 && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>
                {clientErrors.length} row(s) failed validation and will be skipped
              </AlertTitle>
              <AlertDescription>
                <ul className='mt-1 max-h-40 overflow-y-auto space-y-0.5 text-xs'>
                  {clientErrors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}{err.course_code ? ` (${err.course_code})` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert variant={result.errors.length > 0 ? 'destructive' : 'default'}>
              {result.errors.length > 0
                ? <AlertCircle className='h-4 w-4' />
                : <CheckCircle2 className='h-4 w-4' />}
              <AlertTitle>
                {result.inserted} created, {result.updated} updated of {result.total} row(s)
              </AlertTitle>
              {result.errors.length > 0 && (
                <AlertDescription>
                  <ul className='mt-1 max-h-40 overflow-y-auto space-y-0.5 text-xs'>
                    {result.errors.map((err, i) => (
                      <li key={i}>
                        Row {err.row}{err.course_code ? ` (${err.course_code})` : ''}: {err.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => handleOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleImport} disabled={!ready || bulkImport.isPending}>
              {bulkImport.isPending && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
              Import {rows.length > 0 ? `${rows.length} Course${rows.length === 1 ? '' : 's'}` : 'Courses'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
