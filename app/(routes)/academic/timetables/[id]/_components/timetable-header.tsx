'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Timetable } from '@/types/academics';

interface TimetableHeaderProps {
  timetable: Timetable;
  onBack?: () => void;
}

export function TimetableHeader({ timetable, onBack }: TimetableHeaderProps) {
  return (
    <div className='bg-white rounded-lg shadow-sm border'>
      <div className='p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>
              {timetable.timetable_name}
            </h1>
            <p className='text-sm text-gray-500 mt-1'>
              Manage and view the timetable details
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={onBack}>
              <ArrowLeft className='h-4 w-4 mr-2' />
              Back
            </Button>
          </div>
        </div>

        {/* Timetable Info Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Institution & Academic Details */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>
              Institution & Academic Details
            </h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>Institution</span>
                <p className='font-medium'>
                  {timetable.institution?.name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Academic Year</span>
                <p className='font-medium'>2025-2026 A</p>
              </div>
              <div>
                <span className='text-gray-500'>Start Date</span>
                <p className='font-medium'>June 1st, 2025</p>
              </div>
              <div>
                <span className='text-gray-500'>End Date</span>
                <p className='font-medium'>June 30th, 2025</p>
              </div>
            </div>
          </div>

          {/* Program Information */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>Program Information</h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>Degree</span>
                <p className='font-medium'>Undergraduate</p>
              </div>
              <div>
                <span className='text-gray-500'>Program</span>
                <p className='font-medium'>(BDS) Bachelor of Dental Surgery</p>
              </div>
              <div>
                <span className='text-gray-500'>Department</span>
                <p className='font-medium'>Department of BDS</p>
              </div>
              <div>
                <span className='text-gray-500'>Semester</span>
                <p className='font-medium'>
                  {typeof timetable.semester === 'object' &&
                  timetable.semester &&
                  'semester_name' in timetable.semester
                    ? (timetable.semester as any).semester_name
                    : typeof timetable.semester === 'string'
                    ? timetable.semester
                    : 'Semester'}
                </p>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>Dates</h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>Created</span>
                <p className='font-medium'>Jun 23, 2025</p>
              </div>
              <div>
                <span className='text-gray-500'>Last Updated</span>
                <p className='font-medium'>Jun 23, 2025</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
