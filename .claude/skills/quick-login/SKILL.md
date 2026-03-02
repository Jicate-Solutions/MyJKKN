---
name: quick-login
description: Implements the Quick Login (Test Accounts) panel on the auth/login page for MyJKKN branches. Provides one-click role switching for development and staging environments, gated behind the ENABLE_DEV_AUTH feature flag. Use when setting up a new branch's login page, porting the test accounts panel from OMM to another branch, or adding new roles to the demo login listing. Never activates in production (feature flag is false by default).
---

# Quick Login (Test Accounts) Skill

## What This Skill Does

Ports the one-click role login panel from `app/auth/login/page.tsx` into any MyJKKN branch.
The panel lets developers switch between 9 pre-seeded test accounts without needing separate
Google accounts for each role — gated by `NEXT_PUBLIC_ENABLE_DEV_AUTH=true`.

## Prerequisites

Before implementing, verify these exist in the target branch:

| Dependency | Location | Notes |
|---|---|---|
| `AuthService.signInWithEmail` | `lib/auth/auth-service.ts` | Must call `supabase.auth.signInWithPassword` |
| `FEATURE_FLAGS.ENABLE_DEV_AUTH` | `lib/config/feature-flags.ts` | Must read `process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH` |
| `react-hot-toast` | package.json | For login success/error toasts |
| `lucide-react` | package.json | For role icons on each button |
| shadcn `Button` | `components/ui/button` | Standard button primitive |

See `references/prerequisites-check.md` for how to add missing pieces.

---

## Step 1 — Add the Feature Flag

In `lib/config/feature-flags.ts`, add inside the `FEATURE_FLAGS` object if not present:

```typescript
// DEV AUTH MODE — enables email/password quick login on dev/staging
// Default: false (production shows Google only)
ENABLE_DEV_AUTH: process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === 'true',
```

Add the helper function:

```typescript
export function isDevAuthEnabled(): boolean {
  return FEATURE_FLAGS.ENABLE_DEV_AUTH;
}
```

---

## Step 2 — Set the Environment Variable

In `.env.local` (dev) or Vercel environment settings (staging):

```bash
NEXT_PUBLIC_ENABLE_DEV_AUTH=true
```

**Never set this in production.** When the flag is `false`, the entire section is hidden —
Google OAuth is the only option shown.

---

## Step 3 — Create Supabase Test Users

Each button maps to a real `auth.users` row. Run this in Supabase SQL Editor to create them
(or use the Dashboard → Authentication → Users panel):

```sql
-- Run in Supabase SQL Editor
-- Adjust institution_id to match your branch's demo institution UUID

-- After creating users via Supabase Auth, update their profiles:
UPDATE profiles SET
  role = 'super_admin',
  institution_id = NULL,  -- super_admin has no institution scope
  profile_completed = true
WHERE email = 'test-superadmin@jkkn.local';

UPDATE profiles SET role = 'admin',          institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.admin2@jkkn.local';
UPDATE profiles SET role = 'principal',      institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.principal@jkkn.local';
UPDATE profiles SET role = 'hod',            institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.hod@jkkn.local';
UPDATE profiles SET role = 'faculty',        institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.faculty@jkkn.local';
UPDATE profiles SET role = 'staff',          institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.staff@jkkn.local';
UPDATE profiles SET role = 'student',        institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.student@jkkn.local';
UPDATE profiles SET role = 'student',        institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.dayscholars@jkkn.local';
UPDATE profiles SET role = 'parent',         institution_id = '<YOUR_DEMO_INSTITUTION_ID>', profile_completed = true WHERE email = 'test.parent@jkkn.local';
```

> **Password for all accounts**: `Test@123`
> **Super Admin password**: `SuperAdmin@123`

---

## Step 4 — Add to Login Page

See `references/complete-implementation.md` for the full copy-paste block.

### The `testAccounts` Array (add near top of component)

```typescript
import { Shield, UserCog, School, Briefcase, BookOpenCheck, User, Building2, Sun, Heart } from 'lucide-react';

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

### State Required

```typescript
const [quickLoginRole, setQuickLoginRole] = useState<string | null>(null);
```

### The Handler

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
    setQuickLoginRole(null);
  }
};
```

### The UI Block (place inside `{FEATURE_FLAGS.ENABLE_DEV_AUTH && (...)}`)

```tsx
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

{/* 2-column role button grid */}
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
```

---

## Customising for a Branch

### Removing roles not relevant to the branch

Simply remove entries from `testAccounts`. The grid is auto-sized (`grid-cols-2`) so any
even number of roles renders cleanly. Odd numbers leave one cell empty — adjust to
`grid-cols-3` or add a spacer if needed.

### Adding a new role

Add one object to `testAccounts`:

```typescript
{ label: 'Librarian', email: 'test.librarian@jkkn.local', password: 'Test@123', icon: BookMarked, color: 'bg-amber-600 hover:bg-amber-700 text-white' }
```

Then create the Supabase user and update its `profiles` row to `role = 'librarian'`.

### Changing the password

Update both the `testAccounts` array **and** the Supabase user password (Auth → Users →
reset password). They must match.

---

## Security Notes

- Credentials are intentionally hardcoded (not env vars) because `NEXT_PUBLIC_*` goes to
  the browser bundle regardless — obscuring them via env provides no real security benefit.
- The entire section is invisible when `ENABLE_DEV_AUTH=false` — production deployments
  never expose this UI.
- Test accounts use `@jkkn.local` domain specifically so they can never conflict with real
  Google OAuth users (who must have real email domains).
- `quickLoginRole` state disables all buttons while any login is in progress — prevents
  concurrent auth calls that could corrupt session state.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Button shows "Failed to sign in" | Test user doesn't exist in Supabase | Create user via Auth → Users, then run profile UPDATE |
| Redirects to `/auth/complete-profile` | `profile_completed = false` on the profile row | `UPDATE profiles SET profile_completed = true WHERE email = '...'` |
| Section doesn't appear | `NEXT_PUBLIC_ENABLE_DEV_AUTH` not set to `'true'` | Add to `.env.local` and restart dev server |
| All buttons disabled after error | `setQuickLoginRole(null)` not called on catch | Verify the catch block resets state |
| "Invalid login credentials" | Password mismatch | Reset via Supabase Auth → Users → Send reset email or use SQL |
