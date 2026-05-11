'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAddMapping, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { COURSE_GROUP_VALUES } from '@/lib/services/bos/courses-schemas';
import type { BosCourseMaster } from '@/types/bos-courses';

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
        course_group: courseGroup && courseGroup !== 'none' ? courseGroup : undefined,
        course_order: courseOrder ? Number(courseOrder) : undefined,
      });
      toast.success(`${selected.course_code} added to Semester ${semester}`);
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
          <DialogTitle>Add Course to Semester {semester}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
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
              <Label htmlFor='add-course-group' className='text-xs'>Course Group (optional)</Label>
              <Select value={courseGroup} onValueChange={setCourseGroup}>
                <SelectTrigger><SelectValue placeholder='—' /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>—</SelectItem>
                  {COURSE_GROUP_VALUES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='add-course-order' className='text-xs'>Order (optional)</Label>
              <Input
                id='add-course-order'
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
            {addMapping.isPending ? 'Adding…' : 'Add Course'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
