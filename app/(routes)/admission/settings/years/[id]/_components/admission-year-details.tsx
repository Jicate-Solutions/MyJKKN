import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AdmissionYear } from '@/types/admission';

interface AdmissionYearDetailsProps {
  admissionYear: AdmissionYear;
}

export function AdmissionYearDetails({
  admissionYear
}: AdmissionYearDetailsProps) {
  const duration =
    admissionYear.program_end_year - admissionYear.program_start_year;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-6'>
        <div className='grid gap-4 md:grid-cols-2'>
          <div>
            <p className='font-medium'>Institution</p>
            <p className='text-base text-muted-foreground'>
              {admissionYear.institution?.name}
              {admissionYear.institution?.counselling_code &&
                ` (${admissionYear.institution.counselling_code})`}
            </p>
          </div>
          <div>
            <p className='font-medium'>Program</p>
            <p className='text-base text-muted-foreground'>
              {admissionYear.program?.program_name}
              {admissionYear.program?.program_id &&
                ` (${admissionYear.program.program_id})`}
            </p>
          </div>
          <div>
            <p className='font-medium'>Program Start Year</p>
            <p className='text-base text-muted-foreground'>
              {admissionYear.program_start_year}
            </p>
          </div>
          <div>
            <p className='font-medium'>Program End Year</p>
            <p className='text-base text-muted-foreground'>
              {admissionYear.program_end_year}
            </p>
          </div>
          <div>
            <p className='font-medium'>Duration</p>
            <p className='text-base text-muted-foreground'>
              {duration} {duration === 1 ? 'year' : 'years'}
            </p>
          </div>
          <div>
            <p className='font-medium'>Status</p>
            <Badge variant={admissionYear.is_active ? 'default' : 'secondary'}>
              {admissionYear.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
