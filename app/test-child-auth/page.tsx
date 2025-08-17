'use client';

import { useEffect, useState } from 'react';
import {
  AuthProvider,
  useAuth,
  useCurrentUser,
  useSession,
  RequireAuth,
  ConditionalAuth
} from '@/lib/auth/child-app';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  User,
  Shield,
  Key,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  LogOut,
  LogIn,
  AlertCircle
} from 'lucide-react';
import { getSessionManager, getActivityTracker } from '@/lib/auth/child-app';

/**
 * Test Component for Child App Authentication
 * This demonstrates all authentication features
 */
function AuthTestContent() {
  const {
    login,
    logout,
    isAuthenticated,
    isLoading,
    error,
    hasPermission,
    hasRole,
    validateSession,
    refreshSession
  } = useAuth();

  const user = useCurrentUser();
  const { session, isExpired, refresh } = useSession();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [sessionStatus, setSessionStatus] = useState<any>({});

  // Initialize session management
  useEffect(() => {
    const sessionManager = getSessionManager({
      autoRefresh: true,
      refreshInterval: 5 * 60 * 1000, // 5 minutes
      onSessionExpiring: () => {
        addTestResult('⚠️ Session expiring soon');
      },
      onSessionExpired: () => {
        addTestResult('❌ Session expired');
      },
      onRefreshSuccess: () => {
        addTestResult('✅ Session refreshed successfully');
      },
      onRefreshError: (error) => {
        addTestResult(`❌ Session refresh error: ${error.message}`);
      }
    });

    const activityTracker = getActivityTracker({
      inactivityThreshold: 10 * 60 * 1000, // 10 minutes
      onInactive: () => {
        addTestResult('💤 User inactive');
      },
      onActive: () => {
        addTestResult('👤 User active again');
      },
      sessionManager
    });

    sessionManager.start();
    activityTracker.start();

    // Update session status periodically
    const statusTimer = setInterval(() => {
      setSessionStatus(sessionManager.getStatus());
    }, 1000);

    return () => {
      sessionManager.stop();
      activityTracker.stop();
      clearInterval(statusTimer);
    };
  }, []);

  const addTestResult = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults((prev) =>
      [`[${timestamp}] ${message}`, ...prev].slice(0, 10)
    );
  };

  const handleValidateSession = async () => {
    addTestResult('🔍 Validating session...');
    const isValid = await validateSession();
    addTestResult(isValid ? '✅ Session is valid' : '❌ Session is invalid');
  };

  const handleRefreshSession = async () => {
    addTestResult('🔄 Refreshing session...');
    const refreshed = await refreshSession();
    addTestResult(refreshed ? '✅ Session refreshed' : '❌ Refresh failed');
  };

  const handleTestPermission = (permission: string) => {
    const hasIt = hasPermission(permission);
    addTestResult(
      `🔑 Permission "${permission}": ${hasIt ? '✅ Granted' : '❌ Denied'}`
    );
  };

  const handleTestRole = (role: string) => {
    const hasIt = hasRole(role);
    addTestResult(`👤 Role "${role}": ${hasIt ? '✅ Yes' : '❌ No'}`);
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-2'>
              <RefreshCw className='h-4 w-4 animate-spin' />
              <span>Loading authentication...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-6 max-w-6xl'>
      <h1 className='text-3xl font-bold mb-6'>Child App Authentication Test</h1>

      {error && (
        <Alert variant='destructive' className='mb-6'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Authentication Status */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Authentication Status
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span>Status:</span>
              <Badge variant={isAuthenticated ? 'default' : 'secondary'}>
                {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
              </Badge>
            </div>

            {!isAuthenticated ? (
              <Button onClick={() => login()} className='w-full'>
                <LogIn className='h-4 w-4 mr-2' />
                Login with Parent App
              </Button>
            ) : (
              <Button
                onClick={() => logout()}
                variant='destructive'
                className='w-full'
              >
                <LogOut className='h-4 w-4 mr-2' />
                Logout
              </Button>
            )}
          </CardContent>
        </Card>

        {/* User Information */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              User Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className='space-y-2 text-sm'>
                <div>
                  <strong>ID:</strong> {user.id}
                </div>
                <div>
                  <strong>Name:</strong> {user.full_name}
                </div>
                <div>
                  <strong>Email:</strong> {user.email}
                </div>
                <div>
                  <strong>Role:</strong> <Badge>{user.role}</Badge>
                </div>
                {user.institution_id && (
                  <div>
                    <strong>Institution:</strong> {user.institution_id}
                  </div>
                )}
                {user.is_super_admin && (
                  <Badge variant='destructive'>Super Admin</Badge>
                )}
              </div>
            ) : (
              <p className='text-muted-foreground'>Not logged in</p>
            )}
          </CardContent>
        </Card>

        {/* Session Information */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Session Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session ? (
              <div className='space-y-3'>
                <div className='text-sm space-y-1'>
                  <div>
                    <strong>Session ID:</strong> {session.id}
                  </div>
                  <div>
                    <strong>Created:</strong>{' '}
                    {new Date(session.created_at).toLocaleString()}
                  </div>
                  <div>
                    <strong>Expires:</strong>{' '}
                    {new Date(session.expires_at).toLocaleString()}
                  </div>
                  <div>
                    <strong>Status:</strong>{' '}
                    <Badge variant={isExpired ? 'destructive' : 'default'}>
                      {isExpired ? 'Expired' : 'Active'}
                    </Badge>
                  </div>
                </div>

                {sessionStatus.timeUntilExpiry && (
                  <div className='text-sm'>
                    <strong>Time until expiry:</strong>{' '}
                    {Math.floor(sessionStatus.timeUntilExpiry / 1000 / 60)}{' '}
                    minutes
                  </div>
                )}

                <div className='flex gap-2'>
                  <Button size='sm' onClick={handleValidateSession}>
                    Validate
                  </Button>
                  <Button size='sm' onClick={handleRefreshSession}>
                    Refresh
                  </Button>
                </div>
              </div>
            ) : (
              <p className='text-muted-foreground'>No active session</p>
            )}
          </CardContent>
        </Card>

        {/* Permissions Test */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Key className='h-5 w-5' />
              Permissions & Roles Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className='space-y-3'>
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Test Permissions:</p>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestPermission('read')}
                    >
                      Test &quot;read&quot;
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestPermission('write')}
                    >
                      Test &quot;write&quot;
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestPermission('delete')}
                    >
                      Test &quot;delete&quot;
                    </Button>
                  </div>
                </div>

                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Test Roles:</p>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestRole('admin')}
                    >
                      Test &quot;admin&quot;
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestRole('staff')}
                    >
                      Test &quot;staff&quot;
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleTestRole('student')}
                    >
                      Test &quot;student&quot;
                    </Button>
                  </div>
                </div>

                {user.permissions &&
                  Object.keys(user.permissions).length > 0 && (
                    <div className='mt-3'>
                      <p className='text-sm font-medium mb-1'>
                        Current Permissions:
                      </p>
                      <div className='flex flex-wrap gap-1'>
                        {Object.entries(user.permissions).map(
                          ([key, value]) => (
                            <Badge
                              key={key}
                              variant={value ? 'default' : 'secondary'}
                              className='text-xs'
                            >
                              {key}:{' '}
                              {value ? (
                                <CheckCircle className='h-3 w-3 ml-1' />
                              ) : (
                                <XCircle className='h-3 w-3 ml-1' />
                              )}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <p className='text-muted-foreground'>Login to test permissions</p>
            )}
          </CardContent>
        </Card>

        {/* Test Results Log */}
        <Card className='md:col-span-2'>
          <CardHeader>
            <CardTitle>Test Results Log</CardTitle>
            <CardDescription>
              Real-time authentication events and test results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testResults.length > 0 ? (
              <div className='space-y-1 max-h-64 overflow-y-auto'>
                {testResults.map((result, index) => (
                  <div
                    key={index}
                    className='text-sm font-mono p-2 bg-muted rounded'
                  >
                    {result}
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-muted-foreground'>
                No test results yet. Try the actions above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Protected Content Example */}
      <Card className='mt-6'>
        <CardHeader>
          <CardTitle>Protected Content Example</CardTitle>
          <CardDescription>
            This content is only visible to authenticated users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConditionalAuth
            authenticated={
              <Alert>
                <CheckCircle className='h-4 w-4' />
                <AlertDescription>
                  You can see this because you are authenticated!
                </AlertDescription>
              </Alert>
            }
            unauthenticated={
              <Alert>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  Please login to see protected content.
                </AlertDescription>
              </Alert>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Main Test Page with Auth Provider
 */
export default function TestChildAuthPage() {
  return (
    <AuthProvider
      autoValidate={true}
      autoRefresh={true}
      refreshInterval={5 * 60 * 1000}
      onAuthChange={(user) => {
        console.log('Auth changed:', user);
      }}
      onSessionExpired={() => {
        console.log('Session expired!');
      }}
    >
      <RequireAuth>
        <AuthTestContent />
      </RequireAuth>
    </AuthProvider>
  );
}
