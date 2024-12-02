'use client';

import { format } from 'date-fns';
import { Profile } from '@/types/auth';
import { ROLE_LABELS, INSTITUTIONS } from '@/lib/constants/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  BookOpen,
  Shield,
  MapPin,
  UserCircle2,
  Briefcase,
  FileText
} from 'lucide-react';

interface UserDetailsProps {
  user: Profile;
}

export function UserDetails({ user }: UserDetailsProps) {
  const getInitials = (user: Profile) => {
    return user.full_name
      ? user.full_name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
      : user.email[0].toUpperCase();
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'PPP');
  };

  return (
    <div className='grid gap-6'>
      {/* Profile Overview Card */}
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle>Profile Overview</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-6'>
          <div className='flex items-center gap-4'>
            <Avatar className='h-20 w-20'>
              <AvatarImage
                src={user.avatar_url || undefined}
                alt={user.full_name || 'User'}
              />
              <AvatarFallback className='text-lg'>
                {getInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className='text-xl font-semibold'>{user.full_name}</h2>
              <p className='text-sm text-muted-foreground'>{user.email}</p>
              <div className='flex items-center gap-2 mt-2'>
                <Badge variant='secondary'>
                  {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                </Badge>
                {user.last_login ? (
                  <Badge variant='success'>Active</Badge>
                ) : (
                  <Badge variant='destructive'>Inactive</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personsl Information Card */}
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='flex items-center gap-3'>
              <UserCircle2 className='h-4 w-4 text-muted-foreground' />
              <span>Gender: {user.gender || 'Not specified'}</span>
            </div>
            <div className='flex items-center gap-3'>
              <Briefcase className='h-4 w-4 text-muted-foreground' />
              <span>Designation: {user.designation || 'Not specified'}</span>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div className='flex items-center gap-3'>
              <FileText className='h-4 w-4 text-muted-foreground' />
              <span>Bio: {user.bio || 'Not specified'}</span>
            </div>
            <div className='flex items-center gap-3'>
              <Phone className='h-4 w-4 text-muted-foreground' />
              <span>{user.phone_number || 'Not specified'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academic Information Card */}
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle>Role Information</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div className='flex items-center gap-3'>
            <Shield className='h-4 w-4 text-muted-foreground' />
            <span>
              Role: {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Account Details Card */}
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div className='flex items-center gap-3'>
            <Calendar className='h-4 w-4 text-muted-foreground' />
            <div className='grid gap-0.5'>
              <span className='text-sm font-medium'>Member Since</span>
              <span className='text-sm text-muted-foreground'>
                {formatDate(user.created_at)}
              </span>
            </div>
          </div>
          {user.last_login && (
            <div className='flex items-center gap-3'>
              <Calendar className='h-4 w-4 text-muted-foreground' />
              <div className='grid gap-0.5'>
                <span className='text-sm font-medium'>Last Login</span>
                <span className='text-sm text-muted-foreground'>
                  {formatDate(user.last_login)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
