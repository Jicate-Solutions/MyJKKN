import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Calendar, Globe, Bell } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { NotificationView } from './_components/notification-view';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';

interface NotificationViewPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function NotificationViewPage({
  params
}: NotificationViewPageProps) {
  const { id } = await params;
  return (
    <PermissionGuard
      module='notifications'
      action={['view', 'view.all']}
      anyAction={true}
    >
      <ContentLayout title='Notification Details'>
        <div className='flex-1 space-y-4 pt-2'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center justify-between gap-4'>
              <Link href='/admin/notifications'>
                <Button variant='outline' size='sm'>
                  <ArrowLeft className='h-4 w-4' />
                </Button>
              </Link>
              <div>
                <h2 className='text-2xl font-bold tracking-tight'>
                  Notification Details
                </h2>
                <p className='text-muted-foreground'>
                  View notification content and delivery information
                </p>
              </div>
            </div>
          </div>

          <Suspense fallback={<div>Loading notification...</div>}>
            <NotificationView notificationId={id} />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
