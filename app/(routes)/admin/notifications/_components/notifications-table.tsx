'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Bell, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Notification } from '@/types/notifications';
import Link from 'next/link';

interface NotificationsTableProps {
  limit?: number;
}

export function NotificationsTable({ limit }: NotificationsTableProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());

        const response = await fetch(`/api/admin/notifications?${params}`);

        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        setNotifications(data.notifications || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [limit]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'normal':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getTargetDescription = (notification: Notification) => {
    const targets = [];

    if (notification.target_institution_id) targets.push('Institution');
    if (notification.target_department_id) targets.push('Department');
    if (notification.target_program_id) targets.push('Program');
    if (notification.target_semester)
      targets.push(`Semester ${notification.target_semester}`);
    if (notification.target_section)
      targets.push(`Section ${notification.target_section}`);

    return targets.length > 0 ? targets.join(', ') : 'All Users';
  };

  if (isLoading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
      </div>
    );
  }

  if (error) {
    return <div className='text-center p-8 text-red-500'>Error: {error}</div>;
  }

  if (notifications.length === 0) {
    return (
      <div className='text-center p-8 text-muted-foreground'>
        <Bell className='mx-auto h-12 w-12 mb-4 opacity-50' />
        <h3 className='text-lg font-medium mb-2'>No notifications sent yet</h3>
        <p className='text-sm'>
          Get started by sending your first notification to users.
        </p>
      </div>
    );
  }

  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notifications.map((notification) => (
            <TableRow key={notification.id}>
              <TableCell className='font-medium'>
                <div>
                  <div className='font-medium'>{notification.title}</div>
                  <div className='text-sm text-muted-foreground line-clamp-2'>
                    {notification.body}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-1 text-sm'>
                  <Users className='h-3 w-3' />
                  {getTargetDescription(notification)}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getPriorityColor(notification.priority) as any}>
                  {notification.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{notification.category}</Badge>
              </TableCell>
              <TableCell className='text-sm text-muted-foreground'>
                {formatDistanceToNow(new Date(notification.sent_at), {
                  addSuffix: true
                })}
              </TableCell>
              <TableCell className='text-right'>
                <Link href={`/admin/notifications/${notification.id}`}>
                  <Button
                    variant='ghost'
                    size='sm'
                    title='View notification details'
                  >
                    <Eye className='h-4 w-4' />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
