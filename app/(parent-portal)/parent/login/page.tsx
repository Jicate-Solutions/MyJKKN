'use client';

/** Login — clean white card: admission/mobile toggle + password (eye toggle). */
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { IdCard, Smartphone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ParentAuthService } from '@/lib/services/parent/parent-auth-service';

// Must match ACTIVE_LEARNER_COOKIE in parent-session-provider.tsx.
const ACTIVE_LEARNER_COOKIE = 'pp_active_learner';

type Mode = 'admission' | 'mobile';

export default function ParentLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('admission');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error('Please enter your details and password.');
      return;
    }
    setLoading(true);
    try {
      await ParentAuthService.login({ identifier: identifier.trim(), password });
      // The React Query cache is a tab-lifetime singleton; without this a parent
      // logging in after another (shared device, or a prior session that ended
      // without logout) would briefly see the previous parent's cached children
      // and child-scoped data until refetch. Clear cache + stale child selection
      // so every query runs fresh against the new session cookie.
      queryClient.clear();
      Cookies.remove(ACTIVE_LEARNER_COOKIE);
      const dest = searchParams.get('redirectedFrom') || '/parent/dashboard';
      router.replace(dest.startsWith('/parent') ? dest : '/parent/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-white">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-6">
        {/* logo */}
        <div className="flex justify-center pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jkkn.png" alt="JKKN" className="h-16 w-auto object-contain" />
        </div>

        {/* white card */}
        <div className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
          <h1 className="text-2xl font-bold leading-snug text-[#11243a]">
            Welcome to
            <br />
            MyJKKN Parent Portal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">JKKN Educational Institutions</p>

          {/* Admission / Mobile toggle */}
          <div className="my-4 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1">
            {(['admission', 'mobile'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
                  mode === m ? 'bg-white text-[#0b6d41] shadow-sm' : 'text-muted-foreground'
                )}
              >
                {m === 'admission' ? <IdCard className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                {m === 'admission' ? 'Admission No.' : 'Mobile'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              inputMode={mode === 'mobile' ? 'numeric' : 'text'}
              placeholder={mode === 'admission' ? 'Admission number' : 'Mobile number'}
              autoComplete="username"
              className="h-12 rounded-xl text-[15px]"
            />

            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 rounded-xl pr-11 text-[15px]"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
              >
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0e7a49] to-[#0b6d41] text-base font-semibold shadow-md hover:opacity-95"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>

          {/* Forgot password — hidden for now; reset flow exists at /parent/forgot
              and the route is built, just not surfaced yet. Re-enable later. */}
          {/* <div className="mt-4 text-center">
            <Link href="/parent/forgot" className="text-sm font-medium text-[#0b6d41]">
              Forgot password?
            </Link>
          </div> */}
        </div>
      </div>
    </div>
  );
}
