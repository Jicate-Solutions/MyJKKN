import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TaxonomyList } from './_components/taxonomy-list';

export const metadata = {
  title: 'Regulation Taxonomy - Board of Studies',
};

export default function TaxonomyPage() {
  return (
    <PermissionGuard module='academic.bos-taxonomy' action='view'>
      <Card>
        <CardContent className='p-6'>
          <div className='space-y-6'>
            <TaxonomyList />
          </div>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
