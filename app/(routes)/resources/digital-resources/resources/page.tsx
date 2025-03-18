'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import DigitalResourceList from './_components/digital-resource-list';

export default function DigitalResourcesListPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/auth/login');
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error('Error checking session:', error);
        setError('Authentication error. Please try again.');
        setLoading(false);
      }
    };

    checkSession();
  }, [router, supabase.auth]);

  if (loading) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='flex justify-center items-center p-8'>
          <BeatLoader color='#3498db' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Digital Resources'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/auth/login')}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Digital Resources'>
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
              <Link href='/resources/digital-resources'>Digital Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Digital Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your digital licenses, software, and online resources
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/resources/digital-resources/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Digital Resource
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DigitalResourceList />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
