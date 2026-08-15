'use client';

import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import type { BosCourseMaster } from '@/types/bos-courses';
import { coursesQueryArgs } from './courses-data-table';
import type { CoursesFiltersState } from './courses-filters';

export function CoursesExportButton({
  institutionId,
  institutionCode,
  filters,
}: {
  institutionId: string | undefined;  // undefined = all institutions (super-admin only)
  institutionCode: string;
  filters: CoursesFiltersState;
}) {
  // Same args as CoursesDataTable → shared cache entry, no second COE fetch.
  const { data, isLoading } = useBosCourses(coursesQueryArgs(institutionId, filters));
  const rows: (BosCourseMaster & { board_code?: string | null })[] =
    Array.isArray(data) ? data : (data?.data ?? []);

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error('No courses to export');
      return;
    }
    const sheetRows = rows.map((c) => ({
      'Course Code': c.course_code,
      'Course Name': c.course_name ?? c.course_title ?? '',
      'Board': c.board_code ?? '',
      'Regulation': c.regulation_code ?? '',
      'Institution Code': c.institution_code ?? '',
      'Category': c.course_category ?? '',
      'Part': c.course_part_master ?? '',
      'Type': c.course_type ?? '',
      'Level': c.course_level ?? '',
      'Credits': c.credit ?? c.credits ?? '',
      'Exam Duration (Hrs)': c.exam_duration ?? '',
      'Theory Hours': c.theory_hours ?? '',
      'Practical Hours': c.practical_hours ?? '',
      // Emit the CONVERTED marks under these headers, because the import dialog
      // reads them back into the converted pair — exporting the question-paper
      // ceiling here would make an export → re-import round trip file the ESE's
      // 100-mark ceiling as its 50-mark weightage. Falls back to the ceiling for
      // legacy rows whose converted columns were never populated (COE's mapper
      // reports those as 0, so 0 means "unset" rather than a real value).
      'Internal Max Mark': (c.internal_converted_mark || c.internal_max_mark) ?? '',
      'External Max Mark': (c.external_converted_mark || c.external_max_mark) ?? '',
      'Total Max Mark': c.total_max_mark ?? '',
      'Active': (c.is_active ?? c.status) ? 'Yes' : 'No',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Courses');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `bos-courses-${institutionCode || 'all'}-${date}.xlsx`);
    toast.success(`Exported ${rows.length} course${rows.length === 1 ? '' : 's'}`);
  };

  return (
    <Button
      variant='outline'
      size='sm'
      onClick={handleExport}
      disabled={isLoading || rows.length === 0}
    >
      <Download className='mr-2 h-4 w-4' /> Export
    </Button>
  );
}
