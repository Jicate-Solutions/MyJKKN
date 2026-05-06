'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { BosCourseSyllabus, BosSyllabusHistory } from '@/types/bos';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function SyllabusHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const courseCode = params.id as string;

  const [history, setHistory] = useState<BosSyllabusHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await BosSyllabusService.getSyllabusHistory(courseCode);
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    if (courseCode) {
      fetchHistory();
    }
  }, [courseCode]);

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-32' />
        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-48' />
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className='h-20 w-full' />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className='space-y-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>

        <Card>
          <CardContent className='pt-6'>
            <div className='text-center text-red-600'>{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Syllabus History</CardTitle>
          <CardDescription>
            Version history for {courseCode}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.all_versions.length === 0 ? (
            <div className='text-center text-gray-500 py-8'>
              No versions found
            </div>
          ) : (
            <div className='space-y-4'>
              {history.all_versions.map((syllabus) => (
                <div
                  key={syllabus.id}
                  className='border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer'
                  onClick={() => router.push(`/bos/syllabi/${syllabus.id}/edit`)}
                >
                  <div className='flex items-start justify-between'>
                    <div className='flex items-start gap-3'>
                      <FileText className='h-5 w-5 text-gray-400 mt-1' />
                      <div>
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold'>
                            Version {syllabus.version_number}
                          </span>
                          {syllabus.is_latest && (
                            <Badge variant='default'>Current</Badge>
                          )}
                          {syllabus.is_archived && (
                            <Badge variant='destructive'>Archived</Badge>
                          )}
                        </div>
                        <p className='text-sm text-gray-600 mt-1'>
                          {syllabus.course_name}
                        </p>
                        <p className='text-xs text-gray-500 mt-1'>
                          Updated {format(new Date(syllabus.updated_at), 'PPP p')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/bos/syllabi/${syllabus.id}/edit`);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
