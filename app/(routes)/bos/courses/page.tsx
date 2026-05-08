import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CoursesPageClient } from './_components/courses-page-client';

export default function CoursesPage() {
  return (
    <PermissionGuard module='academic.bos-courses' action='view'>
      <Card>
        <CardContent className='p-6 space-y-6'>
          <CoursesPageClient />
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
