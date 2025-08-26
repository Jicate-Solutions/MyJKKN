'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import { toast } from 'react-hot-toast';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ResetDriverPasswordsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleReset = async () => {
    try {
      setLoading(true);
      setResult(null);
      
      const response = await fetch('/api/admin/reset-driver-passwords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset passwords');
      }

      setResult(data);
      toast.success(`Successfully reset ${data.success} driver passwords`);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reset passwords');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContentLayout title="Reset Driver Passwords">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reset Driver User Passwords</CardTitle>
            <CardDescription>
              Reset all driver user passwords to the default password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                This will reset all driver user passwords to: <strong>Driver@123</strong>
                <br />
                Users should change their password after first login.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleReset} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting Passwords...
                </>
              ) : (
                'Reset All Driver Passwords'
              )}
            </Button>

            {result && (
              <Alert variant={result.failed === 0 ? "default" : "destructive"}>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Reset Complete</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <p>Total drivers: {result.total}</p>
                    <p>Successfully reset: {result.success}</p>
                    <p>Failed: {result.failed}</p>
                    
                    {result.details?.failed?.length > 0 && (
                      <div className="mt-3">
                        <p className="font-semibold">Failed users:</p>
                        <ul className="list-disc list-inside">
                          {result.details.failed.map((f: any) => (
                            <li key={f.email}>
                              {f.email}: {f.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login Instructions for Driver Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Email:</strong> [driver's email address]</p>
              <p><strong>Password:</strong> Driver@123</p>
              <p className="text-sm text-muted-foreground mt-3">
                Note: Users should change their password after first login for security.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}