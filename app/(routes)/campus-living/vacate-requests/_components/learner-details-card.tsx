'use client';

import { Loader2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useVacateLearnerDetails } from '@/hooks/campus-living/use-hostel-vacate';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className='min-w-0'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <p className='text-sm break-words'>{value?.trim() ? value : '—'}</p>
    </div>
  );
}

/** Complete learner details for the approver: identity, programme, contacts, parents, hostel/mess. */
export function LearnerDetailsCard({
  learnerProfileId,
  fallbackName,
  fallbackEmail,
}: {
  learnerProfileId: string | null;
  fallbackName: string;
  fallbackEmail: string | null;
}) {
  const { data: learner, isLoading, error } = useVacateLearnerDetails(learnerProfileId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <User className='h-4 w-4' />
          Learner Details
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='flex justify-center py-6'>
            <Loader2 className='h-5 w-5 animate-spin text-primary' />
          </div>
        ) : !learner ? (
          <div className='space-y-1'>
            <p className='text-sm font-medium'>{fallbackName}</p>
            {fallbackEmail && <p className='text-xs text-muted-foreground'>{fallbackEmail}</p>}
            <p className='text-xs text-muted-foreground'>
              {error ? 'Learner record could not be loaded.' : 'This resident has no learner record.'}
            </p>
          </div>
        ) : (
          <>
            <div className='flex items-center gap-3'>
              <Avatar className='h-14 w-14'>
                {learner.photo_url && <AvatarImage src={learner.photo_url} alt={learner.name} />}
                <AvatarFallback>{learner.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className='min-w-0'>
                <p className='font-medium'>{learner.name}</p>
                <p className='text-xs text-muted-foreground'>
                  {learner.roll_number ? `Roll ${learner.roll_number}` : 'No roll number'}
                </p>
                <div className='mt-1 flex flex-wrap gap-1'>
                  {learner.lifecycle_status && <Badge variant='outline'>{learner.lifecycle_status}</Badge>}
                  {learner.accommodation && <Badge variant='secondary'>{learner.accommodation}</Badge>}
                </div>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3'>
              <Field label='Institution' value={learner.institution} />
              <Field label='Degree' value={learner.degree} />
              <Field label='Programme' value={learner.program} />
              <Field label='Department' value={learner.department} />
              <Field label='Semester' value={learner.semester} />
              <Field label='Section' value={learner.section} />
              <Field label='Batch' value={learner.batch} />
              <Field label='Academic year' value={learner.academic_year} />
              <Field label='Gender' value={learner.gender} />
              <Field label='Blood group' value={learner.blood_group} />
              <Field label='Hostel category' value={learner.hostel_category} />
              <Field label='Mess category' value={learner.mess_category} />
            </div>

            <div className='grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3'>
              <Field label='Learner mobile' value={learner.student_mobile} />
              <Field label='College email' value={learner.college_email} />
              <Field label='Personal email' value={learner.student_email} />
              <Field label='Father' value={learner.father_name} />
              <Field label='Father mobile' value={learner.father_mobile} />
              <Field label='Mother' value={learner.mother_name} />
              <Field label='Mother mobile' value={learner.mother_mobile} />
            </div>
            <div className='border-t pt-3'>
              <Field label='Permanent address' value={learner.address} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
