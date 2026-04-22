'use client';

/**
 * Event-level SectionSubNav (15 tabs, dynamic per eventId).
 *
 * Replaces the IIFE in lib/sidebarMenuLink.ts that previously built 15
 * event-specific submenus into the sidebar when the URL matched
 * /startup-studio/events/[uuid]/... Now the sidebar is flat (one Startup
 * Studio entry) and this layout renders the same 15 tabs IN-PAGE via
 * useParams(), matching Learners Council / Campus Living / Admission CRM.
 *
 * URLs UNCHANGED.
 */

import { useParams } from 'next/navigation';
import {
  BarChart3,
  Users,
  ClipboardList,
  Send,
  UserCheck,
  UsersRound,
  MapPin,
  Rocket,
  CheckCircle2,
  Trophy,
  Vote,
  ListChecks,
  Flag,
  BookOpen,
  Target,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

export default function EventLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const eventId = (params?.id as string) ?? '';

  const tabs: SectionTab[] = [
    { href: `/startup-studio/events/${eventId}/dashboard`, icon: BarChart3, label: 'Analytics Dashboard' },
    { href: `/startup-studio/events/${eventId}/my-team`, icon: Users, label: 'My Team' },
    { href: `/startup-studio/events/${eventId}/my-registration`, icon: ClipboardList, label: 'My Registration' },
    { href: `/startup-studio/events/${eventId}/submit`, icon: Send, label: 'Submit Project' },
    { href: `/startup-studio/events/${eventId}/my-assignment`, icon: UserCheck, label: 'My Assignment' },
    { href: `/startup-studio/events/${eventId}/registrations`, icon: UsersRound, label: 'Registrations' },
    { href: `/startup-studio/events/${eventId}/venues`, icon: MapPin, label: 'Venues & Mentors' },
    { href: `/startup-studio/events/${eventId}/demo-day`, icon: Rocket, label: 'Demo Day' },
    { href: `/startup-studio/events/${eventId}/evaluate`, icon: CheckCircle2, label: 'Evaluate Teams' },
    { href: `/startup-studio/events/${eventId}/leaderboard`, icon: Trophy, label: 'Leaderboard' },
    { href: `/startup-studio/events/${eventId}/vote`, icon: Vote, label: 'Live Voting' },
    { href: `/startup-studio/events/${eventId}/checklists`, icon: ListChecks, label: 'Checklists' },
    { href: `/startup-studio/events/${eventId}/declare`, icon: Flag, label: 'Declare Track' },
    { href: `/startup-studio/events/${eventId}/case-study`, icon: BookOpen, label: 'Case Study' },
    { href: `/startup-studio/events/${eventId}/solve-for-100`, icon: Target, label: 'Solve for 100' },
  ];

  return (
    <>
      <SectionSubNav tabs={tabs} />
      {children}
    </>
  );
}
