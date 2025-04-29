import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import Link from 'next/link';

export default function NewUserLoading() {
  return (
    <ContentLayout title='New User'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/users'>Users</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New User</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <Skeleton className='h-10 w-[200px]' />
          <Skeleton className='h-4 w-[300px] mt-2' />
        </div>

        <div className='space-y-8'>
          <div className='grid gap-6 md:grid-cols-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='space-y-2'>
                <Skeleton className='h-4 w-[100px]' />
                <Skeleton className='h-10 w-full' />
                {i % 2 === 0 && <Skeleton className='h-4 w-[200px]' />}
              </div>
            ))}
          </div>

          <div className='flex gap-4'>
            <Skeleton className='h-10 w-[120px]' />
            <Skeleton className='h-10 w-[100px]' />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
