# Complete Login Page Implementation Reference

This is the verbatim implementation from `app/auth/login/page.tsx` in the OMM branch.
Copy the relevant blocks into the target branch's login page.

## Full imports required by the quick-login feature

```typescript
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Shield, UserCog, School, User, BookOpenCheck, Briefcase, Heart, Building2, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { AuthService } from '@/lib/auth/auth-service';
```

## State declarations (inside the page component)

```typescript
const [quickLoginRole, setQuickLoginRole] = useState<string | null>(null);
const [loading, setLoading] = useState(false); // used to disable buttons during Google login

const router = useRouter();
const supabase = useMemo(() => createClientSupabaseClient(), []);
```

## testAccounts constant (inside or outside the component — outside is preferred to avoid recreation)

```typescript
const testAccounts = [
  { label: 'Super Admin',    email: 'test-superadmin@jkkn.local',  password: 'SuperAdmin@123', icon: Shield,        color: 'bg-red-600 hover:bg-red-700 text-white' },
  { label: 'Admin',          email: 'test.admin2@jkkn.local',       password: 'Test@123',       icon: UserCog,       color: 'bg-orange-600 hover:bg-orange-700 text-white' },
  { label: 'Principal',      email: 'test.principal@jkkn.local',    password: 'Test@123',       icon: School,        color: 'bg-purple-600 hover:bg-purple-700 text-white' },
  { label: 'HOD',            email: 'test.hod@jkkn.local',          password: 'Test@123',       icon: Briefcase,     color: 'bg-blue-600 hover:bg-blue-700 text-white' },
  { label: 'Faculty',        email: 'test.faculty@jkkn.local',      password: 'Test@123',       icon: BookOpenCheck, color: 'bg-teal-600 hover:bg-teal-700 text-white' },
  { label: 'Staff',          email: 'test.staff@jkkn.local',        password: 'Test@123',       icon: User,          color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  { label: 'Hostel Student', email: 'test.student@jkkn.local',      password: 'Test@123',       icon: Building2,     color: 'bg-green-600 hover:bg-green-700 text-white' },
  { label: 'Day Scholar',    email: 'test.dayscholars@jkkn.local',  password: 'Test@123',       icon: Sun,           color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  { label: 'Parent',         email: 'test.parent@jkkn.local',       password: 'Test@123',       icon: Heart,         color: 'bg-pink-600 hover:bg-pink-700 text-white' },
];
```

## handleQuickLogin function (inside the component)

```typescript
const handleQuickLogin = async (account: typeof testAccounts[0]) => {
  try {
    setQuickLoginRole(account.label);

    const data = await AuthService.signInWithEmail(account.email, account.password);

    if (data.user) {
      toast.success(`Signed in as ${account.label}!`);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, profile_completed')
        .eq('id', data.user.id)
        .single();

      const profileData = profile as { role: string; profile_completed: boolean } | null;

      // Route based on profile state — mirrors standard post-login flow
      if (!profileData?.profile_completed) {
        router.push('/auth/complete-profile');
      } else if (profileData?.role === 'guest') {
        router.push('/guest');
      } else if (profileData?.role === 'driver') {
        router.push('/driver');
      } else {
        router.push('/');
      }
    }
  } catch (error: any) {
    console.error('Quick login error:', error);
    toast.error(error?.message || `Failed to sign in as ${account.label}`);
    setQuickLoginRole(null); // Reset so buttons re-enable after error
  }
};
```

## Full JSX block for the login form right panel

Wrap the entire `{FEATURE_FLAGS.ENABLE_DEV_AUTH && (...)}` block inside the form's
`<div className='space-y-4'>`:

```tsx
{FEATURE_FLAGS.ENABLE_DEV_AUTH && (
  <>
    {/* Google sign-in button */}
    <Button
      onClick={handleGoogleLogin}
      disabled={loading || !!quickLoginRole}
      className='w-full h-12 text-base font-medium bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white'
    >
      {loading ? (
        <div className='flex items-center space-x-2'>
          <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
          <span>Signing in...</span>
        </div>
      ) : (
        <div className='flex items-center space-x-2'>
          {/* Google SVG icon */}
          <svg className='w-5 h-5' viewBox='0 0 24 24'>
            <path fill='currentColor' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' />
            <path fill='currentColor' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' />
            <path fill='currentColor' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' />
            <path fill='currentColor' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' />
          </svg>
          <span>Continue with Google</span>
        </div>
      )}
    </Button>

    {/* Divider */}
    <div className='relative'>
      <div className='absolute inset-0 flex items-center'>
        <span className='w-full border-t border-gray-300 dark:border-gray-600' />
      </div>
      <div className='relative flex justify-center text-xs uppercase'>
        <span className='bg-white dark:bg-gray-900 px-2 text-gray-500'>
          Quick Login (Test Accounts)
        </span>
      </div>
    </div>

    {/* Role buttons */}
    <div className='grid grid-cols-2 gap-2'>
      {testAccounts.map((account) => {
        const Icon = account.icon;
        const isLoggingIn = quickLoginRole === account.label;
        return (
          <Button
            key={account.email}
            type='button'
            disabled={!!quickLoginRole || loading}
            onClick={() => handleQuickLogin(account)}
            className={`h-10 text-xs font-medium ${account.color} disabled:opacity-50`}
          >
            {isLoggingIn ? (
              <div className='flex items-center space-x-1.5'>
                <div className='w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin' />
                <span>Signing in...</span>
              </div>
            ) : (
              <div className='flex items-center space-x-1.5'>
                <Icon className='w-3.5 h-3.5' />
                <span>{account.label}</span>
              </div>
            )}
          </Button>
        );
      })}
    </div>
  </>
)}

{/* Production fallback — only Google, no test accounts */}
{!FEATURE_FLAGS.ENABLE_DEV_AUTH && (
  <Button
    onClick={handleGoogleLogin}
    disabled={loading}
    className='w-full h-12 text-base font-medium bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white'
  >
    <span>Continue with Google</span>
  </Button>
)}
```

## Notes on the dual-render pattern

The `ENABLE_DEV_AUTH` flag produces two separate render paths:
- **Dev/staging** (`true`): Google + divider + role grid (all in one `<>` fragment)
- **Production** (`false`): Google button only — a separate simpler render

This is intentional. It avoids conditional nesting inside a shared Google button and keeps
each mode's UI self-contained and easy to read/maintain independently.
