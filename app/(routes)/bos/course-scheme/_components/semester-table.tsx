'use client';

import { Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRemoveMapping } from '@/hooks/bos/use-bos-course-scheme';
import { type BosCourseMappingDetailed, isMappingLocked } from '@/types/bos-courses';

export function SemesterTable({
  semester, mappings, editMode, onAddToSemester,
}: {
  semester: string;
  mappings: BosCourseMappingDetailed[];
  editMode: boolean;
  onAddToSemester: () => void;
}) {
  const remove = useRemoveMapping();

  const totals = mappings.reduce(
    (acc, m) => {
      acc.credits += m.course.credit ?? 0;
      acc.hours += (m.course.theory_hours ?? 0) + (m.course.practical_hours ?? 0);
      acc.marks += m.course.total_max_mark ?? 0;
      return acc;
    },
    { credits: 0, hours: 0, marks: 0 },
  );

  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-semibold uppercase tracking-wide'>Semester {semester}</h3>
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-xs'>
          <thead className='bg-muted'>
            <tr>
              <th className='p-2 text-left'>Part</th>
              <th className='p-2 text-left'>Code</th>
              <th className='p-2 text-left'>Title</th>
              <th className='p-2 text-right'>Exam</th>
              <th className='p-2 text-right'>Credits</th>
              <th className='p-2 text-right'>L</th>
              <th className='p-2 text-right'>P</th>
              <th className='p-2 text-right'>CIA</th>
              <th className='p-2 text-right'>ESE</th>
              <th className='p-2 text-right'>Total</th>
              {editMode && <th className='p-2'></th>}
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const locked = isMappingLocked(m);
              return (
                <tr key={m.id} className={locked ? 'border-t bg-muted/40' : 'border-t'}>
                  <td className='p-2'>
                    {m.course.course_part_master ?? '-'}
                    {locked && <Lock className='inline ml-1 h-3 w-3 text-muted-foreground' />}
                  </td>
                  <td className='p-2 font-mono'>{m.course.course_code}</td>
                  <td className='p-2'>{m.course.course_name}</td>
                  <td className='p-2 text-right'>{m.course.exam_duration}</td>
                  <td className='p-2 text-right'>{Number(m.course.credit ?? 0).toFixed(2)}</td>
                  <td className='p-2 text-right'>{m.course.theory_hours}</td>
                  <td className='p-2 text-right'>{m.course.practical_hours || '-'}</td>
                  <td className='p-2 text-right'>{m.course.internal_max_mark}</td>
                  <td className='p-2 text-right'>{m.course.external_max_mark}</td>
                  <td className='p-2 text-right font-semibold'>{m.course.total_max_mark}</td>
                  {editMode && (
                    <td className='p-2'>
                      {locked ? (
                        <span title='Locked — ratified mapping cannot be removed'>
                          <Lock className='h-3.5 w-3.5 text-muted-foreground' />
                        </span>
                      ) : (
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
            })}
            <tr className='border-t bg-muted/30 font-semibold'>
              <td colSpan={4} className='p-2 text-right'>Totals</td>
              <td className='p-2 text-right'>{totals.credits.toFixed(2)}</td>
              <td colSpan={2} className='p-2 text-right'>{totals.hours} hrs</td>
              <td colSpan={2} className='p-2 text-right'></td>
              <td className='p-2 text-right'>{totals.marks}</td>
              {editMode && <td></td>}
            </tr>
          </tbody>
        </table>
      </div>
      {editMode && (
        <Button variant='outline' size='sm' onClick={onAddToSemester}>
          <Plus className='mr-2 h-4 w-4' /> Add course to Semester {semester}
        </Button>
      )}
    </section>
  );
}
