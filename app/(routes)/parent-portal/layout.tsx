import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Parent Portal | MyJKKN',
  description: 'View your children\'s academic progress, attendance, and fee status',
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep layout simple - don't use client components with hooks here
  // The ParentPortalClient component handles all the layout including navigation
  return <>{children}</>;
}
