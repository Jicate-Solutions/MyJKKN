import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CoursesTable } from './_components/courses-table';

export const metadata = { title: 'JKKN API – Courses' };

export default function JkknCoursesPage() {
  return (
    <ContentLayout title="JKKN Courses">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Courses' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Courses</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all courses across the
            network.
          </p>
        </div>
        <CoursesTable />
      </div>
    </ContentLayout>
  );
}
