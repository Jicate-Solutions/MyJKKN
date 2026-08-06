'use client';

import { Fragment } from 'react';
import { Plus, Trash2, Lock, FileArchive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRemoveMapping } from '@/hooks/bos/use-bos-course-scheme';
import { type BosCourseMappingDetailed, isMappingLocked } from '@/types/bos-courses';
import {
  computeSchemeTotals,
  groupKeyOf,
  type SchemeTotalRow,
} from '@/lib/utils/bos/course-scheme-totals';

// Flattens a mapping row (course fields live under `.course`, the group order
// at the top level) into the shape the shared totals helper expects.
const toSchemeTotalRow = (m: BosCourseMappingDetailed): SchemeTotalRow => ({
  group_order: m.group_order,
  credit: m.course.credit,
  theory_hours: m.course.theory_hours,
  tutorial_hours: m.course.tutorial_hours,
  practical_hours: m.course.practical_hours,
  total_max_mark: m.course.total_max_mark,
});

export function SemesterTable({
  semester, mappings, editMode, onAddToSemester,
  onDownloadSyllabi, downloading = false, downloadDisabled = false,
}: {
  semester: string;
  mappings: BosCourseMappingDetailed[];
  editMode: boolean;
  onAddToSemester: (semester: string) => void;
  onDownloadSyllabi?: () => void;
  downloading?: boolean;
  downloadDisabled?: boolean;
}) {
  const remove = useRemoveMapping();

  // Nest courses that share a Group Order (electives = "pick one"). Standalone
  // courses keep their place; grouped courses collect under one band at the
  // group's first appearance. A group counts ONCE toward the totals (see below).
  // group_order usually equals the row's own course order, so most "groups" are
  // singletons — those render as plain rows; only 2+ members get an elective band.
  type Row = BosCourseMappingDetailed;
  type Block =
    | { kind: 'single'; row: Row }
    | { kind: 'group'; code: string; rows: Row[] };

  const blocks: Block[] = [];
  const groupAt = new Map<string, number>();
  for (const m of mappings) {
    const g = groupKeyOf({ group_order: m.group_order });
    if (!g) { blocks.push({ kind: 'single', row: m }); continue; }
    const at = groupAt.get(g);
    if (at === undefined) {
      groupAt.set(g, blocks.length);
      blocks.push({ kind: 'group', code: g, rows: [m] });
    } else {
      (blocks[at] as Extract<Block, { kind: 'group' }>).rows.push(m);
    }
  }
  // Collapse singleton groups back to plain rows so an ordinary course (whose
  // group_order is just its own order number) doesn't get an elective band.
  const displayBlocks: Block[] = blocks.map((b) =>
    b.kind === 'group' && b.rows.length === 1 ? { kind: 'single', row: b.rows[0] } : b,
  );

  // A group is "pick one", so it contributes a single course's worth to EVERY
  // total — credits, L/T/P and marks. Shared with the Download Report PDF.
  const totals = computeSchemeTotals(mappings.map(toSchemeTotalRow));

  const renderRow = (m: Row) => {
    const locked = isMappingLocked(m) || m.course.course_status?.toLowerCase() === 'locked';
    const l = m.course.theory_hours   ?? 0;
    const t = m.course.tutorial_hours ?? 0;
    const p = m.course.practical_hours ?? 0;
    return (
      <tr key={m.id} className={locked ? 'border-t bg-muted/40' : 'border-t'}>
        <td className='p-2'>
          {m.course.course_part_master ?? '-'}
          {locked && <Lock className='inline ml-1 h-3 w-3 text-muted-foreground' />}
        </td>
        <td className='p-2 font-mono'>{m.course.course_code}</td>
        <td className='p-2 uppercase'>
          {m.course.course_type_code
            ? `${m.course.course_type_code}-${m.course.course_name}`
            : m.course.course_name}
        </td>
        <td className='p-2 text-right'>{m.course.exam_duration ?? '-'}</td>
        <td className='p-2 text-right'>{m.course_order ?? '-'}</td>
        <td className='p-2 text-right'>{m.group_order ?? '-'}</td>
        <td className='p-2 text-right'>{m.course.credit != null ? Number(m.course.credit) : '-'}</td>
        <td className='p-2 text-right'>{m.course.theory_hours ?? '-'}</td>
        <td className='p-2 text-right'>{m.course.tutorial_hours ?? '-'}</td>
        <td className='p-2 text-right'>{m.course.practical_hours ?? '-'}</td>
        <td className='p-2 text-right'>{l + t + p}</td>
        <td className='p-2 text-right'>{m.course.internal_max_mark}</td>
        <td className='p-2 text-right'>{m.course.external_max_mark}</td>
        <td className='p-2 text-right font-semibold'>{m.course.total_max_mark}</td>
        {editMode && (
          <td className='p-2'>
            {locked ? null : (
              <Button
                variant='ghost' size='icon' className='h-7 w-7 text-red-600'
                onClick={async () => {
                  if (!confirm(`Remove ${m.course.course_code} from semester ${semester}?`)) return;
                  try {
                    await remove.mutateAsync(m.id);
                    toast.success('Removed');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold uppercase tracking-wide'>Semester {semester}</h3>
        {onDownloadSyllabi && mappings.length > 0 && (
          <Button
            variant='outline'
            size='sm'
            onClick={onDownloadSyllabi}
            disabled={downloadDisabled}
            title={`Download Semester ${semester} syllabi as a ZIP of per-course PDFs`}
          >
            {downloading
              ? <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              : <FileArchive className='mr-2 h-4 w-4' />}
            Download Syllabi
          </Button>
        )}
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-xs'>
          <thead className='bg-muted'>
            <tr>
              <th className='p-2 text-left'>Part</th>
              <th className='p-2 text-left'>Code</th>
              <th className='p-2 text-left'>Title</th>
              <th className='p-2 text-right'>Exam</th>
              <th className='p-2 text-right'>Order</th>
              <th className='p-2 text-right'>Group</th>
              <th className='p-2 text-right'>Credits</th>
              <th className='p-2 text-right'>L</th>
              <th className='p-2 text-right'>T</th>
              <th className='p-2 text-right'>P</th>
              <th className='p-2 text-right'>L+T+P</th>
              <th className='p-2 text-right'>CIA</th>
              <th className='p-2 text-right'>ESE</th>
              <th className='p-2 text-right'>Total</th>
              {editMode && <th className='p-2'></th>}
            </tr>
          </thead>
          <tbody>
            {displayBlocks.map((b) =>
              b.kind === 'single' ? (
                renderRow(b.row)
              ) : (
                <Fragment key={`grp-${b.code}`}>
                  <tr className='border-t bg-primary/5'>
                    <td
                      colSpan={editMode ? 15 : 14}
                      className='p-2 text-left font-medium text-muted-foreground'
                    >
                      Group {b.code} · choose one · counted once in the totals
                    </td>
                  </tr>
                  {b.rows.map(renderRow)}
                </Fragment>
              ),
            )}
            <tr className='border-t bg-muted/30 font-semibold'>
              <td colSpan={6} className='p-2 text-right'>Totals</td>
              <td className='p-2 text-right'>{totals.credits}</td>
              <td className='p-2 text-right'>{totals.theory}</td>
              <td className='p-2 text-right'>{totals.tutorial}</td>
              <td className='p-2 text-right'>{totals.practical}</td>
              <td className='p-2 text-right'>{totals.hours}</td>
              <td colSpan={2} className='p-2 text-right'></td>
              <td className='p-2 text-right'>{totals.marks}</td>
              {editMode && <td></td>}
            </tr>
          </tbody>
        </table>
      </div>
      {(editMode || mappings.length === 0) && (
        <Button variant='outline' size='sm' onClick={() => onAddToSemester(semester)}>
          <Plus className='mr-2 h-4 w-4' /> Add course to Semester {semester}
        </Button>
      )}
    </section>
  );
}
