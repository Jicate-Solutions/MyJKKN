import { redirect } from 'next/navigation';

export default function SF100ProgramsRedirect() {
  // Programs list is now a tab in the unified admin dashboard
  redirect('/startup-studio/solve-for-100/admin?tab=programs');
}
