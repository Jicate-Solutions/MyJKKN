'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Student } from '@/types/student';
import { Hash, BookUser, University } from 'lucide-react';

interface LearnerProfileSummaryCardProps {
  student: Student;
}

export function LearnerProfileSummaryCard({
  student
}: LearnerProfileSummaryCardProps) {
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'S';
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className='overflow-hidden shadow-lg border-t-4 border-primary'>
      <CardContent className='p-6 text-center bg-gray-50/50'>
        <div className='flex justify-center mb-4'>
          <Avatar className='h-24 w-24 border-4 border-white shadow-lg'>
            <AvatarImage
              src={student.student_photo_url || ''}
              alt={`${student.first_name} ${student.last_name || ''}`.trim()}
            />
            <AvatarFallback className='bg-primary/20 text-primary font-semibold text-2xl'>
              {getInitials(
                `${student.first_name} ${student.last_name || ''}`.trim()
              )}
            </AvatarFallback>
          </Avatar>
        </div>
        <h2 className='text-2xl font-bold text-gray-900'>
          {`${student.first_name} ${student.last_name || ''}`.trim()}
        </h2>
        <p className='text-muted-foreground'>
          {student.program?.program_name || 'Program not assigned'}
        </p>
        <div className='mt-4 flex flex-wrap justify-center gap-2'>
          <Badge variant='secondary' className='flex items-center gap-1 py-1'>
            <Hash className='h-3 w-3' />
            {student.roll_number || 'No Roll No.'}
          </Badge>
          <Badge variant='secondary' className='flex items-center gap-1 py-1'>
            <BookUser className='h-3 w-3' />
            {student.department?.department_name || 'No Department'}
          </Badge>
          <Badge variant='secondary' className='flex items-center gap-1 py-1'>
            <University className='h-3 w-3' />
            {student.institution?.name || 'No Institution'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
