'use client';

import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit,
  Settings
} from 'lucide-react';

export default function LearnerProfilePage() {
  const { user } = useAuth();

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-white/50 via-blue-50/20 to-green-50/10'>
      {/* Background Decorative Elements */}
      <div className='absolute inset-0 overflow-hidden pointer-events-none'>
        <div className='absolute top-20 right-10 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse' />
        <div className='absolute bottom-40 left-10 w-40 h-40 bg-gradient-to-br from-green-200/20 to-blue-200/20 rounded-full blur-3xl animate-pulse' />
        <div className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-gradient-to-br from-purple-100/10 to-pink-100/10 rounded-full blur-3xl animate-pulse' />
      </div>

      <div className='relative pb-20 px-4 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-900'>My Profile</h1>
          <p className='text-gray-600'>
            Manage your personal information and settings
          </p>
        </div>

        <div className='space-y-6'>
          {/* Profile Header Card */}
          <Card className='backdrop-blur-sm bg-white/80 border-white/20 shadow-xl'>
            <CardContent className='pt-6'>
              <div className='flex items-center space-x-4'>
                <Avatar className='h-20 w-20 ring-4 ring-white/50'>
                  <AvatarImage
                    src={user?.avatar_url || ''}
                    alt={user?.full_name || 'User'}
                  />
                  <AvatarFallback className='bg-gradient-to-br from-blue-100 to-green-100 text-blue-600 text-xl font-semibold'>
                    {getInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className='flex-1'>
                  <h2 className='text-xl font-semibold'>
                    {user?.full_name || 'Student'}
                  </h2>
                  <p className='text-gray-600'>{user?.email}</p>
                  <div className='flex items-center space-x-2 mt-2'>
                    <Badge
                      variant={user?.is_active ? 'default' : 'secondary'}
                      className='bg-gradient-to-r from-green-500 to-blue-500 text-white'
                    >
                      {user?.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge
                      variant='outline'
                      className='border-blue-200 text-blue-700'
                    >
                      Student
                    </Badge>
                  </div>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  className='border-blue-200 text-blue-700 hover:bg-blue-50'
                >
                  <Edit className='h-4 w-4 mr-2' />
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information Card */}
          <Card className='backdrop-blur-sm bg-white/80 border-white/20 shadow-xl'>
            <CardHeader>
              <CardTitle className='flex items-center text-gray-800'>
                <User className='h-5 w-5 mr-2 text-blue-600' />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div className='flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-blue-50/50 to-green-50/50'>
                  <Mail className='h-5 w-5 text-blue-500' />
                  <div>
                    <p className='text-sm font-medium text-gray-700'>Email</p>
                    <p className='text-sm text-gray-600'>
                      {user?.email || 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-green-50/50 to-blue-50/50'>
                  <Phone className='h-5 w-5 text-green-500' />
                  <div>
                    <p className='text-sm font-medium text-gray-700'>Phone</p>
                    <p className='text-sm text-gray-600'>
                      {user?.phone_number || 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-purple-50/50 to-pink-50/50'>
                  <User className='h-5 w-5 text-purple-500' />
                  <div>
                    <p className='text-sm font-medium text-gray-700'>Gender</p>
                    <p className='text-sm text-gray-600'>
                      {user?.gender || 'Not specified'}
                    </p>
                  </div>
                </div>
                <div className='flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-orange-50/50 to-yellow-50/50'>
                  <Calendar className='h-5 w-5 text-orange-500' />
                  <div>
                    <p className='text-sm font-medium text-gray-700'>Joined</p>
                    <p className='text-sm text-gray-600'>
                      {user?.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>

              {user?.bio && (
                <div className='mt-4 p-4 rounded-lg bg-gradient-to-r from-gray-50/50 to-blue-50/50'>
                  <p className='text-sm font-medium mb-2 text-gray-700'>Bio</p>
                  <p className='text-sm text-gray-600'>{user.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions Card */}
          <Card className='backdrop-blur-sm bg-white/80 border-white/20 shadow-xl'>
            <CardHeader>
              <CardTitle className='flex items-center text-gray-800'>
                <Settings className='h-5 w-5 mr-2 text-blue-600' />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 gap-3'>
                <Button
                  variant='outline'
                  className='justify-start border-blue-200 text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-green-50 transition-all duration-300'
                >
                  <Edit className='h-4 w-4 mr-2' />
                  Edit Profile
                </Button>
                <Button
                  variant='outline'
                  className='justify-start border-green-200 text-green-700 hover:bg-gradient-to-r hover:from-green-50 hover:to-blue-50 transition-all duration-300'
                >
                  <Settings className='h-4 w-4 mr-2' />
                  Account Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
