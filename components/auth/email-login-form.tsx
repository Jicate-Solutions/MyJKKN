'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface EmailLoginFormProps {
  returnTo?: string;
}

export function EmailLoginForm({ returnTo }: EmailLoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        // Check user role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        // Determine destination based on role
        // Type cast to fix TypeScript inference after React 19 upgrade
        const profileData = profile as { role: string } | null;

        let destination = returnTo || '/';
        if (!returnTo) {
          if (profileData?.role === 'guest') {
            destination = '/guest';
          } else if (profileData?.role === 'student') {
            if (process.env.NEXT_PUBLIC_ENABLE_STUDENT_PORTAL === 'true') {
              destination = '/learners/my-gate-passes';
            } else {
              // Students are not allowed - sign out and stay on login page
              await supabase.auth.signOut();
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('reason', 'student_redirect');
              window.history.replaceState({}, '', newUrl.toString());
              window.location.reload();
              return;
            }
          } else if (profileData?.role === 'driver') {
            destination = '/driver/dashboard';
          }
        }

        router.push(destination);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message?.includes('Invalid login credentials')) {
        const msg = 'Invalid email or password. Please try again.';
        setError(msg);
        toast.error(msg);
      } else if (err.message?.includes('Email not confirmed')) {
        const msg = 'Please confirm your email address before logging in.';
        setError(msg);
        toast.error(msg);
      } else {
        const msg = err.message || 'An error occurred during login.';
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="pl-10"
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </Button>

      <p className="text-xs text-center text-gray-500">
        Driver users: Use email and password provided by admin
      </p>
    </form>
  );
}