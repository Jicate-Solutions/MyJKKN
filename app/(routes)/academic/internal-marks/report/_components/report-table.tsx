'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CiaReportResponse } from '@/types/internal-marks';

interface ReportTableProps {
  reportData: CiaReportResponse;
}

export function ReportTable({ reportData }: ReportTableProps) {
  const { course, learners, summary } = reportData;

  // Extract all mark keys from learner data
  const markKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const learner of learners) {
      Object.keys(learner.marks).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }, [learners]);

  return (
    <div className='space-y-4'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card>
          <CardContent className='pt-4 pb-4'>
            <div className='text-center'>
              <p className='text-2xl font-bold'>{summary.total_learners}</p>
              <p className='text-xs text-muted-foreground'>Total Learners</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-4 pb-4'>
            <div className='text-center'>
              <p className='text-2xl font-bold text-green-600'>
                {summary.marks_entered}
              </p>
              <p className='text-xs text-muted-foreground'>Marks Entered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-4 pb-4'>
            <div className='text-center'>
              <p className='text-2xl font-bold text-amber-600'>
                {summary.pending}
              </p>
              <p className='text-xs text-muted-foreground'>Pending</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course Info */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center justify-between'>
            <span>
              {course.course_code} — {course.course_name}
            </span>
            <Badge variant='outline'>
              Max Internal Mark: {course.internal_max_mark}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/50'>
                  <th className='px-3 py-2 text-left font-medium w-12'>
                    S.No
                  </th>
                  <th className='px-3 py-2 text-left font-medium w-32'>
                    Register No
                  </th>
                  <th className='px-3 py-2 text-left font-medium min-w-[150px]'>
                    Student Name
                  </th>
                  {markKeys.map((key) => (
                    <th
                      key={key}
                      className='px-3 py-2 text-center font-medium min-w-[80px]'
                    >
                      {key.replace(/_/g, ' ').toUpperCase()}
                    </th>
                  ))}
                  <th className='px-3 py-2 text-center font-medium w-20'>
                    Total
                  </th>
                  <th className='px-3 py-2 text-left font-medium min-w-[120px]'>
                    In Words
                  </th>
                </tr>
              </thead>
              <tbody>
                {learners.map((learner, idx) => (
                  <tr key={learner.register_number} className='border-b hover:bg-muted/30'>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {idx + 1}
                    </td>
                    <td className='px-3 py-2 font-mono text-xs'>
                      {learner.register_number}
                    </td>
                    <td className='px-3 py-2'>{learner.student_name}</td>
                    {markKeys.map((key) => {
                      const mark = learner.marks[key];
                      return (
                        <td key={key} className='px-3 py-2 text-center'>
                          {mark !== null && mark !== undefined ? (
                            <span
                              className={
                                mark === 0
                                  ? 'text-red-600 font-medium'
                                  : 'font-medium'
                              }
                            >
                              {mark}
                            </span>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className='px-3 py-2 text-center font-bold'>
                      {learner.total}
                    </td>
                    <td className='px-3 py-2 text-xs text-muted-foreground'>
                      {learner.marks_in_words}
                    </td>
                  </tr>
                ))}

                {learners.length === 0 && (
                  <tr>
                    <td
                      colSpan={markKeys.length + 4}
                      className='px-3 py-8 text-center text-muted-foreground'
                    >
                      No marks data available for the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
