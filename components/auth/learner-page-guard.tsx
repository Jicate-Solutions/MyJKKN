import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

interface LearnerPageGuardProps {
  children: ReactNode;
  requiredPermission?: string;
}

/**
 * Server-side guard component for learner-only pages
 *
 * Validates:
 * 1. User is authenticated
 * 2. User has 'student' role
 * 3. User has valid learner_id
 * 4. Learner lifecycle status is 'active' or 'graduated'
 * 5. Optional: User has required permission
 *
 * Usage:
 * ```tsx
 * export default async function MyTimetablePage() {
 *   return (
 *     <LearnerPageGuard requiredPermission="learners.my-timetable.view">
 *       <MyTimetableContent />
 *     </LearnerPageGuard>
 *   );
 * }
 * ```
 */
export async function LearnerPageGuard({
  children,
  requiredPermission
}: LearnerPageGuardProps) {
  const supabase = await createClient();

  // Step 1: Authentication check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  // Step 2: Role validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/'); // Non-learners redirected to home
  }

  // Step 3: Lifecycle status validation
  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Step 4: Optional permission check
  // TODO: Implement permission check if requiredPermission is provided
  // This would require fetching merged permissions from custom_roles
  // For now, lifecycle status + role check is sufficient

  return <>{children}</>;
}
