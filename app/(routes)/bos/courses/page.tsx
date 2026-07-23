import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { CoursesPageClient } from './_components/courses-page-client';

export default function CoursesPage() {
  return (
    <BosViewGuard module='academic.bos-courses'>
      <Card>
        <CardContent className='p-6 space-y-6'>
          <CoursesPageClient />
        </CardContent>
      </Card>
    </BosViewGuard>
  );
}
