// app/(routes)/applications/layout.tsx
import { Suspense } from 'react';
import Loading from './loading';

export default function ApplicationsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
