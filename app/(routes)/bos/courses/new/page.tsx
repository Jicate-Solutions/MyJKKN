'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { InstitutionPicker } from '../../_components/institution-picker';
import { CourseForm } from '../_components/course-form';
import { useCreateBosCourse } from '@/hooks/bos/use-bos-courses';

export default function NewCoursePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [institutionId, setInstitutionId] = useState<string | undefined>(profile?.institution_id ?? undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [regulationCode, setRegulationCode] = useState('');
  const create = useCreateBosCourse();

  const ready =
    !!institutionId &&
    institutionCode.trim().length > 0 &&
    regulationCode.trim().length > 0;

  return (
    <PermissionGuard module='academic.bos-courses' action='create'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>New Course</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex gap-3 flex-wrap items-end'>
            <InstitutionPicker value={institutionId} onChange={setInstitutionId} />
            <div className='space-y-1'>
              <Label className='text-xs'>Institution Code</Label>
              <Input
                value={institutionCode}
                onChange={(e) => setInstitutionCode(e.target.value.toUpperCase())}
                placeholder='AHS'
                className='w-[140px] font-mono'
              />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs'>Regulation Code</Label>
              <Input
                value={regulationCode}
                onChange={(e) => setRegulationCode(e.target.value.toUpperCase())}
                placeholder='R-2024'
                className='w-[160px] font-mono'
              />
            </div>
          </div>

          {!ready && (
            <p className='text-sm text-muted-foreground'>
              Pick an institution and enter the institution + regulation codes to enable the form.
            </p>
          )}

          {ready && institutionId && (
            <CourseForm
              submitting={create.isPending}
              submitLabel='Create Course'
              onSubmit={async (form) => {
                try {
                  await create.mutateAsync({
                    form,
                    context: {
                      institution_id: institutionId,
                      institution_code: institutionCode,
                      regulation_code: regulationCode,
                    },
                  });
                  toast.success('Course created');
                  router.push('/bos/courses');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
