'use client';

import { EchoBubble } from '@/components/admission/echo-bubble';
import { useAuth } from '@/hooks/use-auth';

interface AdmissionLayoutClientProps {
  children: React.ReactNode;
}

export function AdmissionLayoutClient({ children }: AdmissionLayoutClientProps) {
  const { profile } = useAuth();

  // Show EchoBubble if user is authenticated (admission pages already require permission)
  const isAuthenticated = !!profile;

  return (
    <>
      {children}
      {isAuthenticated && <EchoBubble />}
    </>
  );
}
