import React from 'react';
import { AlertCircle, Clock, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface LearnerProfilePendingProps {
  email?: string;
  fullName?: string;
}

export function LearnerProfilePending({
  email,
  fullName
}: LearnerProfilePendingProps) {
  return (
    <div className='space-y-6'>
      <Alert className='border-yellow-200 bg-yellow-50'>
        <Clock className='h-4 w-4 text-yellow-600' />
        <AlertTitle className='text-yellow-800'>
          Profile Setup In Progress
        </AlertTitle>
        <AlertDescription className='text-yellow-700'>
          Your student profile is currently being set up by the administration.
          This usually takes 1-2 business days.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>Name</p>
              <p className='text-base'>{fullName || 'Not Available'}</p>
            </div>
            <div>
              <p className='text-sm font-medium text-muted-foreground'>Email</p>
              <p className='text-base'>{email || 'Not Available'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s Next?</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-3'>
            <div className='flex items-start gap-3'>
              <div className='rounded-full bg-primary/10 p-2'>
                <span className='text-sm font-semibold text-primary'>1</span>
              </div>
              <div>
                <p className='font-medium'>Wait for Profile Completion</p>
                <p className='text-sm text-muted-foreground'>
                  The administration will complete your student record setup
                  within 1-2 business days.
                </p>
              </div>
            </div>

            <div className='flex items-start gap-3'>
              <div className='rounded-full bg-primary/10 p-2'>
                <span className='text-sm font-semibold text-primary'>2</span>
              </div>
              <div>
                <p className='font-medium'>Check Your Email</p>
                <p className='text-sm text-muted-foreground'>
                  You&apos;ll receive an email notification once your profile is
                  ready.
                </p>
              </div>
            </div>

            <div className='flex items-start gap-3'>
              <div className='rounded-full bg-primary/10 p-2'>
                <span className='text-sm font-semibold text-primary'>3</span>
              </div>
              <div>
                <p className='font-medium'>Access Full Features</p>
                <p className='text-sm text-muted-foreground'>
                  Once setup is complete, you&apos;ll have access to all student
                  features including courses, attendance, and grades.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className='border-blue-200 bg-blue-50/50'>
        <CardContent className='pt-6'>
          <div className='flex items-start gap-3'>
            <AlertCircle className='h-5 w-5 text-blue-600 mt-0.5' />
            <div className='space-y-2'>
              <p className='text-sm font-medium text-blue-900'>
                Need Immediate Assistance?
              </p>
              <p className='text-sm text-blue-800'>
                If you need urgent access or have been waiting longer than 2
                business days, please contact the administration office.
              </p>
              <Button
                variant='outline'
                size='sm'
                className='mt-2'
                onClick={() =>
                  (window.location.href = 'mailto:admin@jkkn.ac.in')
                }
              >
                <Mail className='h-4 w-4 mr-2' />
                Contact Administration
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
