import { Card, CardContent } from '@/components/ui/card';
import { BosViewGuard } from '@/components/auth/bos-view-guard';
import { SchemePageClient } from './_components/scheme-page-client';

export default function CourseSchemePage() {
  return (
    <BosViewGuard module='academic.bos-scheme'>
      <Card>
        <CardContent className='p-6'>
          <SchemePageClient />
        </CardContent>
      </Card>
    </BosViewGuard>
  );
}
