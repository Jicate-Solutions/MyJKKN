'use client';

// The CO master for one course, edited inline while authoring its paper.
//
// Deliberately NON-blocking: when a course has no COs defined the CO dropdowns
// fall back to CO1–CO6, so a missing master can never stop an author from
// finishing a paper. This panel just lets them fix the master while they are here
// (spec §5.3).

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Plus, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAddCourseOutcomes,
  useDeleteCourseOutcome,
} from '@/hooks/question-papers/use-question-papers';
import type { IaCourseOutcome } from '@/types/ia-question-paper';

interface Props {
  courseId: string | undefined;
  courseCode: string | undefined;
  outcomes: IaCourseOutcome[];
  /** COs are master data — only an author who may edit the paper may edit them. */
  editable: boolean;
}

export function CourseOutcomesManager({ courseId, courseCode, outcomes, editable }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const add = useAddCourseOutcomes();
  const remove = useDeleteCourseOutcome();

  // Without a course_id there is nothing to key the master on — COE requires it.
  if (!courseId || !courseCode) return null;

  const busy = add.isPending || remove.isPending;

  const submit = () => {
    const co = code.trim().toUpperCase();
    if (!co) return;
    add.mutate(
      {
        course_id: courseId,
        course_code: courseCode,
        co_code: co,
        co_description: description.trim() || undefined,
        display_order: outcomes.length + 1,
      },
      {
        onSuccess: () => {
          setCode('');
          setDescription('');
        },
      }
    );
  };

  /** Bulk-seed CO1–CO5 — the shape almost every course ends up with. */
  const seedFive = () =>
    add.mutate({
      course_id: courseId,
      course_code: courseCode,
      outcomes: [1, 2, 3, 4, 5].map((n) => ({
        co_code: `CO${n}`,
        display_order: n,
      })),
    });

  return (
    <div className='rounded-md border'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40'
      >
        {open ? (
          <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
        ) : (
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        )}
        <span className='font-medium'>Course Outcomes ({outcomes.length})</span>
        <span className='font-mono text-xs text-muted-foreground'>— {courseCode}</span>
      </button>

      {open && (
        <div className='space-y-3 border-t px-3 py-3'>
          {outcomes.length === 0 ? (
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-xs text-muted-foreground'>
                No COs for this course yet — dropdowns fall back to CO1–CO6.
              </p>
              {editable && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='h-7 gap-1 px-2 text-xs'
                  disabled={busy}
                  onClick={seedFive}
                >
                  {add.isPending ? (
                    <Loader2 className='h-3 w-3 animate-spin' />
                  ) : (
                    <Sparkles className='h-3 w-3' />
                  )}
                  Add CO1–CO5
                </Button>
              )}
            </div>
          ) : (
            <div className='flex flex-wrap gap-1.5'>
              {outcomes.map((co) => (
                <Badge
                  key={co.id}
                  variant='outline'
                  className='max-w-full gap-1 py-1 font-normal'
                  title={co.co_description || co.co_code}
                >
                  <span className='font-mono text-xs font-semibold'>{co.co_code}</span>
                  {co.co_description && (
                    <span className='truncate text-xs text-muted-foreground'>
                      · {co.co_description}
                    </span>
                  )}
                  {editable && (
                    <button
                      type='button'
                      aria-label={`Remove ${co.co_code}`}
                      className={cn(
                        'ml-0.5 rounded-sm text-muted-foreground hover:text-destructive',
                        busy && 'pointer-events-none opacity-50'
                      )}
                      onClick={() => remove.mutate({ id: co.id, courseId })}
                    >
                      <X className='h-3 w-3' />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}

          {editable && (
            <div className='flex flex-wrap items-center gap-2'>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder='CO code'
                className='h-7 w-[110px] text-sm'
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='Description (optional)'
                className='h-7 flex-1 min-w-[180px] text-sm'
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-7 w-7 p-0'
                title='Add course outcome'
                disabled={busy || !code.trim()}
                onClick={submit}
              >
                {add.isPending ? (
                  <Loader2 className='h-3 w-3 animate-spin' />
                ) : (
                  <Plus className='h-3.5 w-3.5' />
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
