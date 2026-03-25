import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Driver Portal | MyJKKN',
  description: 'Driver portal for JKKN Transport Services'
};

export default function DriverLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}