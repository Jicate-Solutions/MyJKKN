import { Metadata } from 'next';
import SchoolDefaultsPage from './_components/school-defaults-page';
import { getCurrentUserProfile } from '@/lib/auth/auth-service';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'School Defaults',
  description: 'Manage virtual K-12 Program and Academic department defaults for school institutions',
};

export default async function Page() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect('/auth/login');
  }

  return <SchoolDefaultsPage />;
}
