'use client';

import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/providers/auth-provider';
import LearnerLayout from '@/components/layout/learner-layout';
import { QueryClientProvider } from '@/providers/query-provider';
import { BugReporterWidget } from '@/components/bug-reporter/bug-reporter-widget';

interface LearnerLayoutProps {
  children: React.ReactNode;
}

const LearnerLayoutWrapper = ({ children }: LearnerLayoutProps) => {
  return (
    <LearnerLayout>
      <QueryClientProvider>
        <AuthProvider>
          {children}
          <Toaster />
          <BugReporterWidget />
        </AuthProvider>
      </QueryClientProvider>
    </LearnerLayout>
  );
};

export default LearnerLayoutWrapper;
