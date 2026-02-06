'use client';

import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { UserEditForm } from '../_components/user-edit-form';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { UserService } from '@/lib/services/users/user-service';
import { Profile } from '@/types/auth';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';

// Validate user ID - reject DRP placeholders and non-UUID values
const isValidUserId = (id: string | undefined): boolean => {
  if (!id) return false;
  if (id.includes('%drp:') || id.includes('%%drp:')) return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
};

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (!isValidUserId(userId)) {
        setError('Invalid user ID. Please go back and try again.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const userData = await UserService.getUserById(userId);
        setUser(userData);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user');
        toast.error('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchUser();
    }
  }, [userId]);

  if (loading) {
    return (
      <ContentLayout title='Edit User'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#3b82f6' size={12} />
        </div>
      </ContentLayout>
    );
  }

  if (error || !user) {
    return (
      <ContentLayout title='Edit User'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <p className='text-destructive'>{error || 'User not found'}</p>
          <Button onClick={() => router.push('/users')} variant='outline'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Users
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit User'>
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
            <BreadcrumbLink asChild>
              <Link href={`/users/${userId}`}>
                {user.full_name || user.email}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-5'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Edit User</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Update user information and settings
            </p>
          </div>
          <Button
            variant='outline'
            onClick={() => router.push(`/users/${userId}`)}
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Details
          </Button>
        </div>

        <UserEditForm user={user} />
      </div>
    </ContentLayout>
  );
}
