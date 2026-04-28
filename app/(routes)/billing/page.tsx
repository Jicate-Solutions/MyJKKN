import { redirect } from 'next/navigation';
import { createClient, getEnhancedUserProfile } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BILLING_LANDING_ORDER: ReadonlyArray<{ perm: string; href: string }> = [
  { perm: 'billing.reports.view', href: '/billing/reports' },
  { perm: 'billing.schedule.view', href: '/billing/schedule' },
  { perm: 'billing.invoices.view', href: '/billing/invoices' },
  { perm: 'billing.receipts.view', href: '/billing/receipts' },
  { perm: 'billing.discounts.view', href: '/billing/discounts' },
  { perm: 'billing.refunds.view', href: '/billing/refunds' },
  { perm: 'billing.categories.view', href: '/billing/categories/parent-categories' },
  { perm: 'billing.onboarding.view', href: '/billing/onboarding' },
];

export default async function BillingIndex() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/auth/login?next=/billing');
  }

  if (profile.is_super_admin === true) {
    redirect('/billing/reports');
  }

  const supabase = await createClient();
  for (const { perm, href } of BILLING_LANDING_ORDER) {
    const { data } = await supabase.rpc('user_has_permission', {
      permission_name: perm,
    });
    if (data === true) redirect(href);
  }

  redirect('/unauthorized?module=billing');
}
