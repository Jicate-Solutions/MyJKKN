import { Users, Trophy, Shield, UserCheck, BookOpen } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const solveTabs: SectionTab[] = [
  { href: '/startup-studio/solve-for-100/dashboard', icon: Users, label: 'My Team' },
  { href: '/startup-studio/solve-for-100/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { href: '/startup-studio/solve-for-100/admin', icon: Shield, label: 'Admin' },
  { href: '/startup-studio/solve-for-100/mentor', icon: UserCheck, label: 'My Mentees' },
  { href: '/startup-studio/solve-for-100/programs', icon: BookOpen, label: 'Programs' },
];

export default function SolveFor100Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={solveTabs} />
      {children}
    </>
  );
}
