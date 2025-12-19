// ============================================
// LEARNERS MODULE - MAIN PAGE
// ============================================
// Created: 2025-01-18
// Purpose: Redirect to appropriate learner module based on user role
// ============================================

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

/**
 * Learners Main Page
 *
 * Redirects users to the most appropriate learner module based on their role:
 * - Admission staff → /learners/enquiries
 * - Academic staff → /learners/profiles
 * - Alumni staff → /learners/alumni
 * - Admin → /learners/analytics
 */
export default function LearnersPage() {
  const router = useRouter();
  const { profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!profile) {
      router.push('/login');
      return;
    }

    // Route based on user role
    const role = profile.role;

    switch (role) {
      case 'admission_admin':
      case 'staff':
        router.push('/learners/enquiries');
        break;

      case 'academic_admin':
        router.push('/learners/profiles');
        break;

      case 'super_admin':
      case 'admin':
        router.push('/learners/analytics');
        break;

      default:
        // Default to enquiries for other roles
        router.push('/learners/enquiries');
    }
  }, [profile, isLoading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}
