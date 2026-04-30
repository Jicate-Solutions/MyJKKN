'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Shield, LogIn, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const TEST_ACCOUNTS = [
  { role: 'super_admin', label: 'Super Administrator', email: 'test.superadmin@jkkn.ac.in', color: 'bg-red-500' },
  { role: 'administrator', label: 'Administrator', email: 'test.admin@jkkn.ac.in', color: 'bg-purple-500' },
  { role: 'admission', label: 'Admission Officer', email: 'test.admission@jkkn.ac.in', color: 'bg-blue-500' },
  { role: 'admission_staff', label: 'Admission Staff', email: 'test.admission_staff@jkkn.ac.in', color: 'bg-blue-400' },
  { role: 'admission_counselor', label: 'Admission Counsellor', email: 'test.counselor@jkkn.ac.in', color: 'bg-cyan-500' },
  { role: 'expo_counselor', label: 'Expo Counsellor', email: 'test.expo_counselor@jkkn.ac.in', color: 'bg-fuchsia-500' },
  { role: 'hod', label: 'HOD', email: 'test.hod@jkkn.ac.in', color: 'bg-orange-500' },
  { role: 'faculty', label: 'Facilitator', email: 'test.faculty@jkkn.ac.in', color: 'bg-green-500' },
  { role: 'student', label: 'Student', email: 'test.student@jkkn.ac.in', color: 'bg-emerald-500' },
  { role: 'accounts', label: 'Accountant', email: 'test.accounts@jkkn.ac.in', color: 'bg-yellow-500' },
  { role: 'staff', label: 'Staff', email: 'test.staff@jkkn.ac.in', color: 'bg-gray-500' },
  { role: 'digital_coordinator', label: 'Digital Coordinator', email: 'test.digital@jkkn.ac.in', color: 'bg-indigo-500' },
  { role: 'principal', label: 'Principal', email: 'test.principal@jkkn.ac.in', color: 'bg-amber-500' },
  { role: 'event_coordinator', label: 'Event Coordinator', email: 'test.event@jkkn.ac.in', color: 'bg-pink-500' },
  { role: 'driver', label: 'Driver', email: 'test.driver@jkkn.ac.in', color: 'bg-stone-500' },
  { role: 'guest', label: 'Guest', email: 'test.guest@jkkn.ac.in', color: 'bg-slate-500' },
  { role: 'coe', label: 'Controller of Examiner', email: 'test.coe@jkkn.ac.in', color: 'bg-teal-500' },
  { role: 'coe_office', label: 'COE Officer', email: 'test.coe_office@jkkn.ac.in', color: 'bg-teal-400' },
  { role: 'health_supervisor', label: 'Health Supervisor', email: 'test.health_sup@jkkn.ac.in', color: 'bg-rose-500' },
  { role: 'health_screener', label: 'Health Screener', email: 'test.health_scr@jkkn.ac.in', color: 'bg-rose-400' },
  { role: 'health_counselor', label: 'Health Counselor', email: 'test.health_coun@jkkn.ac.in', color: 'bg-rose-300' },
];

const DEFAULT_PASSWORD = 'Test@1234';

export default function TestLoginPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [manualPassword, setManualPassword] = useState(DEFAULT_PASSWORD);
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  // Block access in production
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Test login is only available in development mode.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Check current session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user.email || null);
    });
  }, []);

  const handleLogin = async (email: string, password: string = DEFAULT_PASSWORD) => {
    setLoading(email);
    setError(null);

    // Sign out first
    await supabase.auth.signOut();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(`${email}: ${error.message}`);
      setLoading(null);
      return;
    }

    if (data?.user) {
      toast.success(`Logged in as ${email}`);
      setCurrentUser(email);
      router.push('/');
      router.refresh();
    }
    setLoading(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    toast.success('Signed out');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <FlaskConical className="h-8 w-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Test Login — Role Permission Testing</h1>
            <p className="text-sm text-muted-foreground">
              Development only. Click any role to sign in as that test user. Password: {DEFAULT_PASSWORD}
            </p>
          </div>
        </div>

        {/* Current Session */}
        {currentUser && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Currently logged in as: <strong>{currentUser}</strong></span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>Sign Out</Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {TEST_ACCOUNTS.map((account) => (
            <Card
              key={account.role}
              className={`cursor-pointer hover:shadow-md transition-shadow ${
                currentUser === account.email ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => handleLogin(account.email)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${account.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{account.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                  </div>
                  {loading === account.email ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Manual Login */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Manual Email/Password Login</CardTitle>
            <CardDescription>Log in with any email/password account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">Email</Label>
                <Input
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="email@jkkn.ac.in"
                />
              </div>
              <div className="w-48">
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => handleLogin(manualEmail, manualPassword)} disabled={!manualEmail}>
                  Login
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
