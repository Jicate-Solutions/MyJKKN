import { Metadata } from 'next';
import { ParentPortalClient } from './_components/parent-portal-client';

export const metadata: Metadata = {
  title: 'Parent Portal | MyJKKN',
  description: 'View your children\'s academic progress, attendance, and fee status',
};

export default function ParentPortalPage() {
  return <ParentPortalClient />;
}
