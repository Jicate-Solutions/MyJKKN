// app/(routes)/applications/layout.tsx

import { ErrorBoundary } from '@/components/Error/error-boundary';

export default function ApplicationsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
