'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BookOpen } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BosCourseSyllabus } from '@/types/bos';

interface SyllabusTabProps {
  meetingId: string;
  boardId?: string;
  regulationId?: string;
  institutionsId: string;
  canEdit: boolean;
}

export function SyllabusTab({
  meetingId,
  boardId,
  regulationId,
  institutionsId,
}: SyllabusTabProps) {
  // Fetch syllabi filtered by board + regulation (latest, non-archived)
  const { data: syllabusData, isLoading: loadingSyllabi, error } = useQuery({
    queryKey: ['bos', 'syllabi-for-meeting', meetingId, boardId, regulationId, institutionsId],
    queryFn: async () => {
      const params = new URLSearchParams({ institutionsId, isLatest: 'true', isArchived: 'false' });
      if (boardId) params.set('boardId', boardId);
      if (regulationId) params.set('regulationId', regulationId);
      const res = await fetch(`/api/bos/syllabus?${params}`);
      if (!res.ok) throw new Error('Failed to fetch syllabi');
      return res.json() as Promise<{ data: BosCourseSyllabus[] }>;
    },
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch regulations for id → label mapping
  const { data: regulationsData } = useQuery({
    queryKey: ['bos', 'regulations', institutionsId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/regulations?institutionId=${institutionsId}`);
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: { id: string; regulation_code: string; title: string }[] }>;
    },
    enabled: !!institutionsId,
    staleTime: 10 * 60 * 1000,
  });

  // Build id → regulation_code lookup
  const regulationMap = useMemo(() => {
    const map = new Map<string, string>();
    (regulationsData?.data ?? []).forEach((reg) => {
      map.set(reg.id, reg.regulation_code ?? reg.title);
    });
    return map;
  }, [regulationsData]);

  if (loadingSyllabi) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription>Failed to load syllabi. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const syllabi = syllabusData?.data ?? [];

  if (syllabi.length === 0) {
    return (
      <div className='rounded-lg border border-dashed p-8 text-center'>
        <BookOpen className='h-8 w-8 mx-auto mb-3 opacity-30' />
        <p className='text-sm font-medium'>No syllabi found</p>
        <p className='text-xs text-muted-foreground mt-1'>
          No syllabi found for this meeting&apos;s board and regulation.
          Create syllabi before the meeting.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <p className='text-xs text-muted-foreground'>
        {syllabi.length} course{syllabi.length !== 1 ? 's' : ''} found
      </p>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-14 text-center'>S.No</TableHead>
              <TableHead className='w-36'>Course Code</TableHead>
              <TableHead>Course Name</TableHead>
              <TableHead className='w-36'>Regulation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {syllabi.map((syllabus, index) => (
              <TableRow key={syllabus.id}>
                <TableCell className='text-center text-muted-foreground text-sm'>
                  {index + 1}
                </TableCell>
                <TableCell className='font-mono font-semibold text-sm'>
                  {syllabus.course_code}
                </TableCell>
                <TableCell className='text-sm'>{syllabus.course_name}</TableCell>
                <TableCell>
                  {syllabus.regulation_id ? (
                    <Badge variant='secondary' className='text-xs'>
                      {regulationMap.get(syllabus.regulation_id) ?? syllabus.regulation_id.slice(0, 8)}
                    </Badge>
                  ) : (
                    <span className='text-xs text-muted-foreground'>—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
