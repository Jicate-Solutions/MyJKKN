'use client';

import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface ProgramsPageWrapperProps {
  children: React.ReactNode;
}

/**
 * Client wrapper to inject adaptive labels into the Programs page
 * This allows the page to remain a server component while adapting labels client-side
 */
export function ProgramsPageWrapper({ children }: ProgramsPageWrapperProps) {
  const adaptLabel = useAdaptiveLabels();

  // Return children with adapted labels injected via context or props
  // This example shows the pattern; pages would consume these via a context provider
  return (
    <div>
      {/* Labels available via useAdaptiveLabels hook in child components */}
      {children}
    </div>
  );
}
