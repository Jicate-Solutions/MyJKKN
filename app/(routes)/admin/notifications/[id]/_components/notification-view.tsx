'use client';

import { useState, useEffect } from 'react';
import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Calendar,
  Globe,
  Bell,
  ExternalLink,
  User,
  Building,
  GraduationCap,
  BookOpen,
  Hash
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';
import { useRoles } from '@/hooks/organization/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/providers/auth-provider';

interface NotificationDetails {
  id: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  sent_at: string;
  expires_at?: string;
  targeting: {
    institution_id?: string;
    department_id?: string;
    program_id?: string;
    semester?: string;
    section?: string;
    target_roles?: string[];
    institution_name?: string;
    department_name?: string;
    program_name?: string;
  };
  created_by: string;
  created_at: string;
  creator?: {
    full_name: string;
    email: string;
  };
  delivery_stats?: {
    total_recipients: number;
    delivered: number;
    read: number;
  };
}

interface NotificationViewProps {
  notificationId: string;
}

export function NotificationView({ notificationId }: NotificationViewProps) {
  const [notification, setNotification] = useState<NotificationDetails | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch roles for display
  const { data: rolesData } = useRoles({ includeSystemRoles: true });

  // Get current user and permissions
  const { user } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();

  // Check if current user is the creator of this notification
  const isCreator = notification?.created_by === user?.id;

  // Determine if user should see detailed sections
  // Super admins can see all details, regular users can only see details for their own notifications
  const canViewDetailedSections = isSuperAdmin || isCreator;

  useEffect(() => {
    const fetchNotification = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/admin/notifications/${notificationId}`
        );

        if (response.status === 404) {
          notFound();
        }

        if (!response.ok) {
          throw new Error('Failed to fetch notification details');
        }

        const data = await response.json();
        setNotification(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotification();
  }, [notificationId]);

  if (isLoading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (error || !notification) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground'>
            {error || 'Notification not found'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'secondary';
      case 'normal':
        return 'default';
      case 'low':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getTargetDescription = () => {
    const parts: string[] = [];
    if (notification.targeting.institution_id) parts.push('Institution');
    if (notification.targeting.department_id) parts.push('Department');
    if (notification.targeting.program_id) parts.push('Program');
    if (notification.targeting.semester) parts.push('Semester');
    if (notification.targeting.section) parts.push('Section');
    if (
      notification.targeting.target_roles &&
      notification.targeting.target_roles.length > 0
    ) {
      parts.push('Roles');
    }

    return parts.length > 0 ? parts.join(' → ') : 'All Users';
  };

  const getRoleNames = () => {
    if (!notification.targeting.target_roles || !rolesData) return [];

    return notification.targeting.target_roles.map((roleKey) => {
      const role = rolesData.find((r) => r.role_key === roleKey);
      return role ? role.role_name : roleKey;
    });
  };

  const getCreatorName = () => {
    if (notification.creator?.full_name) {
      return notification.creator.full_name;
    }
    return notification.creator?.email || notification.created_by;
  };

  return (
    <div className='max-w-5xl mx-auto space-y-8'>
      {/* Main Notification Preview Card */}
      <Card className='overflow-hidden shadow-lg border-2 border-slate-100'>
        <div className='p-6'>
          <div className='flex items-start gap-5'>
            <div className='flex-shrink-0 w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center'>
              <Bell className='h-6 w-6 text-white' />
            </div>
            <div className='flex-1'>
              <div className='flex items-center justify-between'>
                <h1 className='text-2xl font-bold text-slate-800'>
                  {notification.title}
                </h1>
                <div className='flex items-center gap-2'>
                  <Badge
                    variant={getPriorityColor(notification.priority) as any}
                    className='font-semibold'
                  >
                    {notification.priority}
                  </Badge>
                  <Badge variant='outline'>{notification.category}</Badge>
                </div>
              </div>
              <p className='text-base text-slate-600 mt-3 leading-relaxed'>
                {notification.body}
              </p>

              {notification.url && (
                <div className='mt-5'>
                  <Link href={notification.url} target='_blank'>
                    <Button variant='outline' size='sm'>
                      <Globe className='mr-2 h-4 w-4' />
                      View Action URL
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
        <CardFooter className='bg-slate-50/70 px-6 py-3 border-t text-xs text-slate-500 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <User className='h-3 w-3' />
            <span>
              Sent by <strong>{getCreatorName()}</strong>
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <Calendar className='h-3 w-3' />
            <span>{format(new Date(notification.sent_at), 'PPPp')}</span>
          </div>
        </CardFooter>
      </Card>

      {/* Details Grid - Show only for super admin or notification creator */}
      {canViewDetailedSections && (
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Delivery Statistics Card */}
          {notification.delivery_stats && (
            <Card className='shadow-md border-slate-100'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base font-semibold text-slate-700 flex items-center gap-2'>
                  <Users className='h-4 w-4' />
                  Delivery Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex justify-between items-baseline p-3 bg-blue-50 rounded-lg'>
                  <span className='text-sm font-medium text-blue-800'>
                    Recipients
                  </span>
                  <span className='text-2xl font-bold text-blue-600'>
                    {notification.delivery_stats.total_recipients.toLocaleString()}
                  </span>
                </div>
                <div className='flex justify-between items-baseline p-3 bg-green-50 rounded-lg'>
                  <span className='text-sm font-medium text-green-800'>
                    Delivered
                  </span>
                  <span className='text-2xl font-bold text-green-600'>
                    {notification.delivery_stats.delivered.toLocaleString()}
                  </span>
                </div>
                <div className='flex justify-between items-baseline p-3 bg-purple-50 rounded-lg'>
                  <span className='text-sm font-medium text-purple-800'>
                    Read
                  </span>
                  <span className='text-2xl font-bold text-purple-600'>
                    {notification.delivery_stats.read.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Target Audience Card */}
          <Card className='shadow-md border-slate-100'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base font-semibold text-slate-700 flex items-center gap-2'>
                <Building className='h-4 w-4' />
                Target Audience
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              <div className='font-semibold text-slate-600 p-3 bg-slate-50 rounded-lg'>
                {getTargetDescription()}
              </div>

              {notification.targeting.institution_id && (
                <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                  <span className='capitalize text-slate-500'>Institution</span>
                  <span className='font-medium text-slate-700'>
                    {notification.targeting.institution_name ||
                      notification.targeting.institution_id}
                  </span>
                </div>
              )}
              {notification.targeting.department_id && (
                <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                  <span className='capitalize text-slate-500'>Department</span>
                  <span className='font-medium text-slate-700'>
                    {notification.targeting.department_name ||
                      notification.targeting.department_id}
                  </span>
                </div>
              )}
              {notification.targeting.program_id && (
                <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                  <span className='capitalize text-slate-500'>Program</span>
                  <span className='font-medium text-slate-700'>
                    {notification.targeting.program_name ||
                      notification.targeting.program_id}
                  </span>
                </div>
              )}
              {notification.targeting.semester && (
                <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                  <span className='capitalize text-slate-500'>Semester</span>
                  <Badge variant='secondary' className='font-mono'>
                    {notification.targeting.semester}
                  </Badge>
                </div>
              )}
              {notification.targeting.section && (
                <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                  <span className='capitalize text-slate-500'>Section</span>
                  <Badge variant='secondary' className='font-mono'>
                    {notification.targeting.section}
                  </Badge>
                </div>
              )}
              {notification.targeting.target_roles &&
                notification.targeting.target_roles.length > 0 && (
                  <div className='flex flex-col items-start justify-between gap-2 py-2 px-3'>
                    <span className='capitalize text-slate-500'>
                      Target Roles
                    </span>
                    <div className='flex flex-wrap gap-2'>
                      {getRoleNames().map((roleName, index) => (
                        <Badge
                          key={index}
                          variant='secondary'
                          className='text-xs'
                        >
                          {roleName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Metadata Card */}
          <Card className='shadow-md border-slate-100'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base font-semibold text-slate-700 flex items-center gap-2'>
                <Hash className='h-4 w-4' />
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='py-2 px-3'>
                <div className='text-slate-500 mb-1'>Notification ID</div>
                <div className='font-mono bg-slate-100 p-2 rounded text-xs text-slate-600 break-all'>
                  {notification.id}
                </div>
              </div>
              <div className='py-2 px-3'>
                <div className='text-slate-500 mb-1'>Created At</div>
                <div className='font-medium text-slate-800'>
                  {format(new Date(notification.created_at), 'PPP')}
                  <span className='ml-2 text-slate-400 font-normal'>
                    (
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true
                    })}
                    )
                  </span>
                </div>
              </div>
              {notification.expires_at && (
                <div className='py-2 px-3 bg-amber-50 rounded-lg'>
                  <div className='text-amber-600 font-semibold mb-1'>
                    Expires At
                  </div>
                  <div className='font-medium text-amber-800'>
                    {format(new Date(notification.expires_at), 'PPP')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
