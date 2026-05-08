import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SchemePageClient } from './_components/scheme-page-client';

export default function CourseSchemePage() {
  return (
    <PermissionGuard module='academic.bos-scheme' action='view'>
      <Card>
        <CardContent className='p-6'>
          <SchemePageClient />
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
