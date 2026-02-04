import { QueryClientProvider } from '@/providers/query-provider';

export default function CoursesLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider>
      {children}
    </QueryClientProvider>
  );
}
