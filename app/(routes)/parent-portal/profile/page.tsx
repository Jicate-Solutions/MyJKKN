import { Metadata } from 'next';
import { ProfileClient } from '../_components/profile-client';

export const metadata: Metadata = {
  title: 'Profile | Parent Portal | MyJKKN',
  description: 'Manage your parent profile settings',
};

export default function ProfilePage() {
  return <ProfileClient />;
}
