'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';
import {
  Building2,
  Mail,
  Phone,
  User2,
  CalendarDays,
  BookOpen
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { ProfileForm } from './_components/profile-form';
import { useAuth } from '@/providers/auth-provider';
import { INSTITUTIONS, ROLE_LABELS } from '@/lib/constants/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  if (loading) {
    return (
      <ContentLayout title='Profile'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!user) {
    return (
      <ContentLayout title='Profile'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground mb-4'>
            Please sign in to view your profile.
          </p>
          <Link href='/auth/login' className='text-primary hover:underline'>
            Sign In
          </Link>
        </div>
      </ContentLayout>
    );
  }

  // Format dates
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get institution label
  const getInstitutionLabel = (value: string | null) => {
    if (!value) return 'Not Set';
    const institution = INSTITUTIONS.find((i) => i.value === value);
    return institution ? institution.label : value;
  };

  // Generate initials for avatar
  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  const handleProfileUpdate = async () => {
    await refreshUser();
    setIsEditing(false);
  };

  return (
    <ContentLayout title='Profile'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Profile</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        {isEditing ? (
          <ProfileForm user={user} onComplete={handleProfileUpdate} />
        ) : (
          <>
            {/* Profile Overview Card */}
            <Card className='mt-6'>
              <CardHeader>
                <div className='flex flex-col md:flex-row justify-between md:items-center gap-4'>
                  <div className='flex flex-col md:flex-row items-start md:items-center gap-4'>
                    <Avatar className='h-24 w-24'>
                      <AvatarImage
                        src={user.avatar_url || undefined}
                        alt='Profile'
                      />
                      <AvatarFallback className='text-2xl bg-primary/10'>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className='text-2xl'>
                        {user.full_name || 'No name set'}
                      </CardTitle>
                      <div className='mt-1.5 flex items-center gap-2'>
                        <Badge variant='secondary'>
                          {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Profile
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className='space-y-6'>
                  {/* Contact Information */}
                  <div>
                    <h3 className='text-lg font-semibold mb-4'>
                      Contact Information
                    </h3>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div className='flex items-center gap-2 text-muted-foreground'>
                        <Mail className='h-4 w-4 shrink-0' />
                        <span className='truncate'>{user.email}</span>
                      </div>
                      <div className='flex items-center gap-2 text-muted-foreground'>
                        <Phone className='h-4 w-4 shrink-0' />
                        <span>
                          {user.phone_number || 'No phone number set'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact Information */}
                  <div>
                    <h3 className='text-lg font-semibold mb-4'>
                      Personal Information
                    </h3>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div className='flex items-center gap-2 text-muted-foreground'>
                        <User2 className='h-4 w-4 shrink-0' />
                        <span className='truncate'>
                          Gender: {user.gender || 'No gender set'}
                        </span>
                      </div>
                      <div className='flex items-center gap-2 text-muted-foreground'>
                        <Building2 className='h-4 w-4 shrink-0' />
                        <span>
                          Designation:{' '}
                          {user.designation || 'No designation set'}
                        </span>
                      </div>
                    </div>
                    <div className='flex items-center gap-2 text-muted-foreground mt-6'>
                      <BookOpen className='h-4 w-4 shrink-0' />
                      <span>Bio: {user.bio || 'No bio set'}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Account Details */}
                  <div>
                    <h3 className='text-lg font-semibold mb-4'>
                      Account Details
                    </h3>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div>
                        <div className='flex items-center gap-2 text-muted-foreground mb-1'>
                          <CalendarDays className='h-4 w-4' />
                          <span>Member Since</span>
                        </div>
                        <p className='text-sm ml-6'>
                          {formatDate(user.created_at)}
                        </p>
                      </div>
                      {user.last_login && (
                        <div>
                          <div className='flex items-center gap-2 text-muted-foreground mb-1'>
                            <CalendarDays className='h-4 w-4' />
                            <span>Last Login</span>
                          </div>
                          <p className='text-sm ml-6'>
                            {formatDate(user.last_login)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
