import { Metadata } from 'next';
import SchoolDefaultsPage from './_components/school-defaults-page';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'School Defaults',
  description: 'Manage virtual K-12 Program and Academic department defaults for school institutions',
};

export default async function Page() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  return <SchoolDefaultsPage />;
}
