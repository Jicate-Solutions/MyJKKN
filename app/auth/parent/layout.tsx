'use client';

import { QueryClientProvider } from '@/providers/query-provider';
import { Toaster } from '@/components/ui/toaster';

export default function ParentAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
