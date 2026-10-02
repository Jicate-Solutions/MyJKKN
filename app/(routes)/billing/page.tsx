import { redirect } from 'next/navigation';
import { createClient, getEnhancedUserProfile } from '@/lib/supabase/server';
import { getUserWithRetry, TransientAuthError } from '@/lib/auth/auth-retry';

export const dynamic = 'force-dynamic';

const BILLING_LANDING_ORDER: ReadonlyArray<{ perm: string; href: string }> = [
  { perm: 'billing.reports.view', href: '/billing/reports' },
  { perm: 'billing.schedule.view', href: '/billing/schedule' },
  { perm: 'billing.invoices.view', href: '/billing/invoices' },
  { perm: 'billing.receipts.view', href: '/billing/receipts' },
  { perm: 'billing.discounts.view', href: '/billing/discounts' },
  { perm: 'billing.refunds.view', href: '/billing/refunds' },
  { perm: 'billing.categories.view', href: '/billing/categories' },
  { perm: 'billing.onboarding.view', href: '/billing/onboarding' },
  { perm: 'billing.activities.view', href: '/billing/activities' },
];

export default async function BillingIndex() {
  // Confirm the session first, with one retry: getEnhancedUserProfile folds
  // every failure — including a momentary network error — into `profile: null`,
  // which used to send a signed-in person to the sign-in page.
  const supabase = await createClient();
  const user = await getUserWithRetry(supabase);
  if (!user) {
    redirect('/auth/login?next=/billing');
  }

  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    // getEnhancedUserProfile folds "no profile row" and "the read failed" into
    // the same null. Ask once more, plainly: a read that WORKED and found no
    // row is not temporary, so Try again would spin forever — send it to the
    // same "We could not open your account" message the proxy uses for
    // PGRST116 (session kept). Anything else is a temporary error page.
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profileError && !profileRow) {
      redirect('/auth/login?error=profile_load_failed&redirectedFrom=%2Fbilling');
    }
    throw new TransientAuthError(profileError);
  }

  if (profile.is_super_admin === true) {
    redirect('/billing/reports');
  }

  for (const { perm, href } of BILLING_LANDING_ORDER) {
    const { data } = await supabase.rpc('user_has_permission', {
      permission_name: perm,
    });
    if (data === true) redirect(href);
  }

  redirect('/unauthorized?module=billing');
}
