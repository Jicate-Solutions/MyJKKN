'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { CourseForm } from '../_components/course-form';
import { useCreateBosCourse } from '@/hooks/bos/use-bos-courses';
import { useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';

export default function NewCoursePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState(searchParams.get('institution_code') ?? '');
  const [myjkknIds, setMyjkknIds] = useState<string[]>([]);
  const [regulationCode, setRegulationCode] = useState(searchParams.get('regulation_code') ?? '');
  const create = useCreateBosCourse();

  // Skip resetting regulation on the very first institution auto-selection.
  const institutionInitialized = useRef(false);
  useEffect(() => {
    if (!institutionInitialized.current) {
      institutionInitialized.current = true;
      return;
    }
    setRegulationCode('');
  }, [institutionId]);

  const handleInstitutionSelect = (opt: InstitutionOption) => {
    setInstitutionCode(opt.institution_code);
    setMyjkknIds(opt.myjkkn_institution_ids);
  };

  // Use MyJKKN IDs if available (CAS Aided+Self); fall back to COE institution UUID.
  const lookupIds = myjkknIds.length > 0 ? myjkknIds : institutionId;
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);
  const regulations = regulationsData?.data ?? [];

  const ready = !!institutionId && institutionCode.trim().length > 0 && regulationCode.trim().length > 0;

  return (
    <PermissionGuard module='academic.bos-courses' action='create'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>New Course</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex gap-3 flex-wrap items-end'>
            {/* Visible for super-admins; mounted-but-hidden for others to trigger auto-select. */}
            <div className={isSuperAdmin ? '' : 'hidden'}>
              <InstitutionPicker
                value={institutionId}
                onChange={setInstitutionId}
                onSelect={handleInstitutionSelect}
              />
            </div>

            {/* Regulation dropdown — enabled once institution is resolved. */}
            <div className='space-y-1'>
              <Label className='text-xs'>Regulation</Label>
              <SearchableSelect
                value={regulationCode}
                onValueChange={setRegulationCode}
                options={regulations.map((r) => ({
                  value: r.regulation_code,
                  label: r.regulation_year
                    ? `${r.regulation_code} (${r.regulation_year})`
                    : r.regulation_code,
                }))}
                loading={regulationsLoading}
                disabled={!institutionId || (regulations.length === 0 && !regulationsLoading)}
                placeholder={!institutionId ? 'Select institution first' : 'Select regulation'}
                searchPlaceholder='Search regulation…'
                className='w-[200px]'
              />
            </div>
          </div>

          {!ready && (
            <p className='text-sm text-muted-foreground'>
              {isSuperAdmin
                ? 'Pick an institution and select a regulation to enable the form.'
                : 'Select a regulation to enable the form.'}
            </p>
          )}

          {ready && (
            <CourseForm
              submitting={create.isPending}
              submitLabel='Create Course'
              onSubmit={async (form) => {
                try {
                  await create.mutateAsync({
                    form,
                    context: {
                      institution_id: institutionId!,
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
