import { Metadata } from 'next';
import { ParentPortalLayout } from './_components/parent-portal-layout';

export const metadata: Metadata = {
  title: 'Parent Portal | MyJKKN',
  description: 'View your children\'s academic progress, attendance, and fee status',
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ParentPortalLayout>{children}</ParentPortalLayout>;
}
