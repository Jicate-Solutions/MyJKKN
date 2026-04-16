/**
 * Dashboard v2 — Limited Hero (safe default for roles without a specific persona)
 *
 * Shown to: HOD, Principal, Warden, Accounts, Faculty, Student, Parent, and any other
 * role not yet issued a role-specific dashboard.
 *
 * Intentionally minimal: greets the user, states what's available right now, points
 * them at their own Decision Queue below. NO cross-institution metrics, no leaderboards,
 * no institution chips — those are reserved for Director/Counselor personas.
 *
 * Spec §5 mapping: this is the "until Weeks 3-6 cascade" holding pattern.
 */

import { resolvePersona } from '@/lib/services/dashboard/dashboard-role-service';

const ROLE_LABEL: Record<string, string> = {
  hod: 'Head of Department',
  faculty: 'Faculty',
  principal: 'Principal',
  warden: 'Hostel Warden',
  accounts: 'Accounts Team',
  student: 'Learner',
  parent: 'Parent',
  staff: 'Staff',
  guest: 'Guest'
};

function prettyRole(role: string | null): string {
  if (!role) return 'MyJKKN user';
  return ROLE_LABEL[role.toLowerCase()] ?? role.replace(/_/g, ' ');
}

export async function LimitedHero() {
  const { fullName, role } = await resolvePersona();
  const firstName = (fullName ?? 'there').split(' ')[0];
  const roleLabel = prettyRole(role);

  return (
    <section
      aria-label='Dashboard greeting'
      className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-white to-emerald-50/30 dark:from-neutral-900 dark:to-emerald-950/20 p-5 sm:p-6'
    >
      <h2 className='text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-neutral-100'>
        Welcome back, {firstName} 👋
      </h2>
      <p className='mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl'>
        You&apos;re signed in as <span className='font-medium'>{roleLabel}</span>. Your
        personalized hero view is on the way — until it&apos;s ready, items awaiting your
        action appear in the Decision Queue below, and your browser tab will ping you when
        something needs you.
      </p>
      <div className='mt-4 flex flex-wrap gap-2 text-[11px]'>
        <a
          href='#decision-queue'
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium hover:opacity-90 transition-opacity'
        >
          Jump to Decision Queue ↓
        </a>
        <a
          href='/dashboard/classic'
          className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors'
        >
          Open classic dashboard
        </a>
      </div>
    </section>
  );
}
