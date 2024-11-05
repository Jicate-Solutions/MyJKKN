import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className='min-h-screen flex items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <div className='flex justify-center mb-4'>
            <ShieldAlert className='h-12 w-12 text-destructive' />
          </div>
          <CardTitle className='text-2xl'>Access Denied</CardTitle>
        </CardHeader>
        <CardContent className='text-center space-y-4'>
          <p className='text-muted-foreground'>
            You don&apos;t have permission to access this page. Please contact
            your administrator if you think this is a mistake.
          </p>
          <Link href='/'>
            <Button variant='default' className='w-full'>
              Return to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
