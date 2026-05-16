'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Eye } from 'lucide-react';

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SyllabusForm } from '@/components/bos/syllabus-form';
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
  // Syllabus selected for the view-popup. Null = no popup open.
  const [viewSyllabus, setViewSyllabus] = useState<BosCourseSyllabus | null>(null);

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
              <TableHead className='w-20 text-center'>View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {syllabi.map((syllabus, index) => (
              <TableRow
                key={syllabus.id}
                className='cursor-pointer hover:bg-muted/50'
                onClick={() => setViewSyllabus(syllabus)}
              >
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
                <TableCell className='text-center'>
                  <Eye className='inline h-4 w-4 text-muted-foreground' />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── View Syllabus Popup ─────────────────────────────────────────
          Re-uses the existing SyllabusForm so the popup matches the
          insert/edit UI exactly. The form's own permission guard
          (guardSyllabusEdit) decides whether saves are allowed — viewers
          without edit rights can still browse every field. */}
      <Dialog open={!!viewSyllabus} onOpenChange={(v) => { if (!v) setViewSyllabus(null); }}>
        <DialogContent
          className='max-w-6xl max-h-[90vh] overflow-y-auto'
          // Stop row-click bubbling into anything below the dialog content.
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              {viewSyllabus
                ? `${viewSyllabus.course_code} — ${viewSyllabus.course_name}`
                : 'Syllabus'}
            </DialogTitle>
            {viewSyllabus?.regulation_id && (
              <DialogDescription>
                Regulation:{' '}
                {regulationMap.get(viewSyllabus.regulation_id) ?? viewSyllabus.regulation_id}
                {' · '}Version {viewSyllabus.version_number}
                {viewSyllabus.is_latest ? ' (latest)' : ''}
              </DialogDescription>
            )}
          </DialogHeader>
          {viewSyllabus && (
            <SyllabusForm
              syllabus={viewSyllabus}
              isEditing={true}
              onSuccess={() => setViewSyllabus(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
