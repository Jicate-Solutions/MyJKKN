import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AdmissionYear } from '@/types/admission';

interface AdmissionYearDetailsProps {
  admissionYear: AdmissionYear;
}

export function AdmissionYearDetails({
  admissionYear
}: AdmissionYearDetailsProps) {
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
            <p className='font-medium'>Year</p>
            <p className='text-base text-muted-foreground'>
              {admissionYear.year}
            </p>
          </div>
          <div>
            <p className='font-medium'>Status</p>
            <Badge variant={admissionYear.is_active ? 'default' : 'secondary'}>
              {admissionYear.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div>
            <p className='font-medium'>Current Admission Year</p>
            <Badge
              variant='outline'
              className={
                admissionYear.is_current ? 'border-primary text-primary' : ''
              }
            >
              {admissionYear.is_current ? 'Current' : 'Not current'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
