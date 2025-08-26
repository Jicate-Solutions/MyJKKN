'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { StudentProfileSyncService } from '@/lib/services/student/student-profile-sync-service';
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Users,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

function StudentProfileSyncContent() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [conflicts, setConflicts] = useState<
    Array<{
      email: string;
      studentId?: string;
      profileId?: string;
      issue: string;
    }>
  >([]);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    synced: number;
    errors: string[];
  } | null>(null);

  const checkConflicts = async () => {
    setChecking(true);
    try {
      const result = await StudentProfileSyncService.checkEmailConflicts();
      setConflicts(result.conflicts);
      if (result.conflicts.length === 0) {
        toast.success('No conflicts found!');
      } else {
        toast.error(`Found ${result.conflicts.length} conflicts`);
      }
    } catch (error) {
      toast.error('Failed to check conflicts');
    } finally {
      setChecking(false);
    }
  };

  const syncAllProfiles = async () => {
    setLoading(true);
    try {
      const result = await StudentProfileSyncService.syncAllStudentProfiles();
      setSyncResult(result);

      if (result.success) {
        toast.success(`Successfully synced ${result.synced} profiles`);
      } else {
        toast.error(
          `Synced ${result.synced} profiles with ${result.errors.length} errors`
        );
      }

      // Recheck conflicts after sync
      await checkConflicts();
    } catch (error) {
      toast.error('Failed to sync profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConflicts();
  }, []);

  return (
    <div className='p-6 space-y-6'>
      <div className='flex justify-between items-start'>
        <div>
          <h1 className='text-3xl font-bold'>Student Profile Sync</h1>
          <p className='text-muted-foreground mt-2'>
            Manage email synchronization between students and profiles
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            onClick={checkConflicts}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4 mr-2' />
            )}
            Check Conflicts
          </Button>
          <Button onClick={syncAllProfiles} disabled={loading}>
            {loading ? (
              <Loader2 className='h-4 w-4 mr-2 animate-spin' />
            ) : (
              <Users className='h-4 w-4 mr-2' />
            )}
            Sync All Profiles
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
            Overview of student-profile synchronization status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 md:grid-cols-3'>
            <div className='flex items-center space-x-2'>
              <AlertCircle className='h-5 w-5 text-yellow-500' />
              <div>
                <p className='text-sm font-medium'>Conflicts Found</p>
                <p className='text-2xl font-bold'>{conflicts.length}</p>
              </div>
            </div>
            {syncResult && (
              <>
                <div className='flex items-center space-x-2'>
                  <CheckCircle className='h-5 w-5 text-green-500' />
                  <div>
                    <p className='text-sm font-medium'>Profiles Synced</p>
                    <p className='text-2xl font-bold'>{syncResult.synced}</p>
                  </div>
                </div>
                <div className='flex items-center space-x-2'>
                  <AlertTriangle className='h-5 w-5 text-red-500' />
                  <div>
                    <p className='text-sm font-medium'>Sync Errors</p>
                    <p className='text-2xl font-bold'>
                      {syncResult.errors.length}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conflicts List */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Email Conflicts</CardTitle>
            <CardDescription>
              These issues need to be resolved for proper system functioning
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              {conflicts.map((conflict, index) => (
                <Alert key={index} className='border-yellow-200'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle className='text-sm font-medium'>
                    {conflict.email}
                  </AlertTitle>
                  <AlertDescription className='text-sm'>
                    {conflict.issue}
                    <div className='mt-2 flex gap-2'>
                      {conflict.studentId && (
                        <Badge variant='outline'>
                          Student: {conflict.studentId.slice(0, 8)}...
                        </Badge>
                      )}
                      {conflict.profileId && (
                        <Badge variant='outline'>
                          Profile: {conflict.profileId.slice(0, 8)}...
                        </Badge>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Errors */}
      {syncResult && syncResult.errors.length > 0 && (
        <Card className='border-red-200'>
          <CardHeader>
            <CardTitle className='text-red-700'>Sync Errors</CardTitle>
            <CardDescription>
              These errors occurred during the synchronization process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              {syncResult.errors.map((error, index) => (
                <Alert key={index} variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Message */}
      {conflicts.length === 0 && (
        <Alert className='border-green-200 bg-green-50'>
          <CheckCircle className='h-4 w-4 text-green-600' />
          <AlertTitle className='text-green-800'>All Clear!</AlertTitle>
          <AlertDescription className='text-green-700'>
            No email conflicts found. All student profiles are properly
            synchronized.
          </AlertDescription>
        </Alert>
      )}

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Email Sync Works</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <h3 className='font-semibold mb-2'>Automatic Synchronization</h3>
            <p className='text-sm text-muted-foreground'>
              When a student&apos;s email is updated, the system automatically:
            </p>
            <ul className='mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside'>
              <li>Updates the corresponding profile email if it exists</li>
              <li>Syncs the institution ID between student and profile</li>
              <li>Updates the full name in the profile</li>
              <li>Validates to prevent email conflicts</li>
            </ul>
          </div>

          <div>
            <h3 className='font-semibold mb-2'>Common Issues</h3>
            <ul className='space-y-1 text-sm text-muted-foreground list-disc list-inside'>
              <li>
                Profile exists with student role but no matching student record
              </li>
              <li>Student has email but no corresponding profile</li>
              <li>Institution ID mismatch between student and profile</li>
              <li>Name discrepancies between records</li>
            </ul>
          </div>

          <div>
            <h3 className='font-semibold mb-2'>Resolution</h3>
            <p className='text-sm text-muted-foreground'>
              Use the &quot;Sync All Profiles&quot; button to automatically
              resolve most conflicts. For complex cases, manual intervention may
              be required through the database.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StudentProfileSyncPage() {
  return (
    <ContentLayout title='Student Profile Sync'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Students', href: '/students' },
          { label: 'Admin', href: '#' },
          { label: 'Sync Profiles' }
        ]}
      />
      <SuperAdminOnly
        fallback={
          <div className='mt-8'>
            <Alert className='border-red-200 bg-red-50'>
              <ShieldAlert className='h-4 w-4 text-red-600' />
              <AlertTitle className='text-red-800'>Access Denied</AlertTitle>
              <AlertDescription className='text-red-700'>
                This page is only accessible to super administrators.
              </AlertDescription>
            </Alert>
          </div>
        }
      >
        <StudentProfileSyncContent />
      </SuperAdminOnly>
    </ContentLayout>
  );
}
