import { Card, CardContent } from '@/components/ui/card';
import { SopList } from './_components/sop-list';

export const metadata = {
  title: 'SOP Documents - Board of Studies',
};

export default function SopListPage() {
  return (
    <Card>
      <CardContent className='p-6'>
        <SopList />
      </CardContent>
    </Card>
  );
}
