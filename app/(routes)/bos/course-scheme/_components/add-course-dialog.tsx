'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAddMapping, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import type { BosCourseMaster, BosCourseMappingDetailed } from '@/types/bos-courses';

// "UBA-1" → "Semester 1", "UPH-5" → "Semester 5"
function semesterLabel(code: string): string {
  const n = code.match(/-(\d+)$/)?.[1];
  return n ? `Semester ${n}` : `Semester ${code}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester: string;
  filters: SchemeFilters;
  institutionCode: string;
}

export function AddCourseDialog({ open, onOpenChange, semester, filters, institutionCode }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BosCourseMaster | null>(null);
  const [courseGroup, setCourseGroup] = useState('');
  const [courseOrder, setCourseOrder] = useState('');
  const addMapping = useAddMapping();
  const qc = useQueryClient();

  const { data: coursesData } = useBosCourses(
    open && search.length >= 2
      ? { institution_id: filters.institution_id, regulation_code: filters.regulation_code, search, limit: 20 }
      : undefined,
  );
  const courses = coursesData?.data ?? [];

  const reset = () => {
    setSearch('');
    setSelected(null);
    setCourseGroup('');
    setCourseOrder('');
  };

  const handleSubmit = async () => {
    if (!selected) { toast.error('Select a course first'); return; }
    try {
      await addMapping.mutateAsync({
        institution_code: institutionCode,
        program_code: filters.program_code,
        course_code: selected.course_code,
        regulation_code: filters.regulation_code,
        batch_code: filters.batch_code,
        semester_code: semester,
        course_group: courseGroup.trim() || undefined,
        course_order: courseOrder ? Number(courseOrder) : undefined,
      });

      // Immediately reflect in the table — optimistic entry uses selected course data.
      // The background refetch (triggered by invalidateQueries in useAddMapping.onSuccess)
      // will replace this with the server-confirmed row.
      const optimistic: BosCourseMappingDetailed = {
        id: `__opt_${Date.now()}`,
        institutions_id: '',
        program_id: null,
        course_id: selected.id ?? '',
        batch_id: null,
        institution_code: institutionCode,
        program_code: filters.program_code,
        course_code: selected.course_code,
        batch_code: filters.batch_code ?? null,
        course_group: courseGroup.trim() || null,
        semester_code: semester,
        course_order: courseOrder ? Number(courseOrder) : null,
        regulation_code: filters.regulation_code,
        is_active: true,
        mapping_status: 'Active',
        created_at: new Date().toISOString(),
        course: {
          course_code:        selected.course_code,
          course_name:        selected.course_name ?? selected.course_title ?? '',
          course_category:    selected.course_category,
          course_type:        selected.course_type,
          course_part_master: selected.course_part_master,
          credit:             selected.credit,
          exam_duration:      selected.exam_duration,
          theory_hours:       selected.theory_hours,
          tutorial_hours:     selected.tutorial_hours ?? 0,
          practical_hours:    selected.practical_hours,
          internal_max_mark:  selected.internal_max_mark,
          external_max_mark:  selected.external_max_mark,
          total_max_mark:     selected.total_max_mark,
        },
      };
      qc.setQueryData<{ data: BosCourseMappingDetailed[] }>(
        ['bos', 'course-mapping', filters],
        (old) => old ? { ...old, data: [...old.data, optimistic] } : old,
      );

      toast.success(`${selected.course_code} added to ${semesterLabel(semester)}`);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            Add Course
            <Badge variant='secondary' className='font-mono text-xs'>
              {semesterLabel(semester)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {/* Course search */}
          <div className='space-y-1'>
            <Label htmlFor='add-course-search' className='text-xs'>Course</Label>
            <Input
              id='add-course-search'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              placeholder='Type code or name (min 2 chars)…'
            />
            {courses.length > 0 && !selected && (
              <div className='mt-1 max-h-48 overflow-y-auto rounded border divide-y text-xs'>
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type='button'
                    className='w-full text-left px-3 py-2 hover:bg-muted'
                    onClick={() => {
                      setSelected(c);
                      setSearch(`${c.course_code} — ${c.course_name || c.course_title || ''}`);
                    }}
                  >
                    <span className='font-mono'>{c.course_code}</span>
                    <span className='ml-2 text-muted-foreground'>{c.course_name || c.course_title}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <p className='text-xs text-green-600 mt-1'>
                ✓ {selected.course_code} — {selected.course_name || selected.course_title}
              </p>
            )}
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label className='text-xs'>Group Code (optional)</Label>
              <Input
                type='number' min={0}
                value={courseGroup}
                onChange={(e) => setCourseGroup(e.target.value)}
                placeholder='0'
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs'>Order (optional)</Label>
              <Input
                type='number' min={1}
                value={courseOrder}
                onChange={(e) => setCourseOrder(e.target.value)}
                placeholder='1'
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selected || addMapping.isPending}>
            {addMapping.isPending ? 'Adding…' : `Add to ${semesterLabel(semester)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
