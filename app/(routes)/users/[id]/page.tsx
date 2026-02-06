'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Profile } from '@/types/auth';
import { UserService } from '@/lib/services/users/user-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit } from 'lucide-react';
import { UserDetails } from './_components/user-details';

interface UserDetailsPageProps {
  params: Promise<{ id: string }>;
}

// Validate user ID - reject DRP placeholders and non-UUID values
const isValidUserId = (id: string | undefined): boolean => {
  if (!id) return false;
  if (id.includes('%drp:') || id.includes('%%drp:')) return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
};

export default function UserDetailsPage({ params }: UserDetailsPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (!isValidUserId(id)) {
        setError('Invalid user ID. Please go back and try again.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await UserService.getUserById(id);
        setUser(response);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [id]);

  if (isLoading) {
    return (
      <ContentLayout title='User Details'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !user) {
    return (
      <ContentLayout title='User Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'User not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={user.full_name || 'User Details'}>
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
            <BreadcrumbPage>{user.full_name || 'User Details'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{user.full_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              {user.email}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button asChild>
              <Link href={`/users/${user.id}/edit`}>
                <Edit className='mr-2 h-4 w-4' />
                Edit User
              </Link>
            </Button>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
          </div>
        </div>

        <UserDetails user={user} />
      </div>
    </ContentLayout>
  );
}
