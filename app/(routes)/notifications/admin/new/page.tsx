import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NotificationForm } from '../_components/notification-form';
import { ContentLayout } from '@/components/layout/content-layout';

export default function NewNotificationPage() {
  return (
    <PermissionGuard module='notifications' action='create'>
      <ContentLayout title='Send Notification'>
        <div className='flex-1 space-y-4 pt-2 sm:pt-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                Send Notification
              </h2>
              <p className='text-sm text-muted-foreground hidden sm:block'>
                Create and send a new notification to your users
              </p>
            </div>
          </div>

          <Card className='border-0 sm:border shadow-none sm:shadow-sm'>
            <CardHeader>
              <CardTitle>Notification Details</CardTitle>
              <CardDescription>
                Fill in the details below to send a notification to your target
                audience
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationForm />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
