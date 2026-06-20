'use client';

/**
 * Parent Portal — dashboard feature tile grid. Colorful per-feature tiles (each
 * with its own accent gradient + matching colored glow), conditional on the
 * active child's entityType (Wellness / Gate Pass / Bus are school-only). Exam
 * Results is "coming soon" (COE proxy deferred).
 */
import Link from 'next/link';
import {
  Megaphone,
  Trophy,
  GraduationCap,
  Wallet,
  CalendarCheck,
  Vote,
  MessageSquareWarning,
  Bus,
  HeartPulse,
  DoorOpen,
  Images,
  BookOpenCheck,
  IdCard,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import type { EntityType } from '@/types/parent-portal';

interface Tile {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string; // icon tile gradient
  glow: string; // colored drop-shadow under the icon
  href?: string; // set = enabled
  schoolOnly?: boolean;
}

const TILES: Tile[] = [
  { key: 'profile', label: 'Profile', icon: IdCard, color: 'from-slate-400 to-slate-600', glow: 'shadow-slate-500/30', href: '/parent/profile' },
  { key: 'announcements', label: 'Announcements', icon: Megaphone, color: 'from-blue-400 to-blue-600', glow: 'shadow-blue-500/35', href: '/parent/announcements' },
  { key: 'achievements', label: 'Achievements', icon: Trophy, color: 'from-amber-400 to-orange-500', glow: 'shadow-orange-500/35', href: '/parent/achievements' },
  { key: 'fees', label: 'Fee Payments', icon: Wallet, color: 'from-emerald-400 to-emerald-600', glow: 'shadow-emerald-500/35', href: '/parent/fees' },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck, color: 'from-teal-400 to-teal-600', glow: 'shadow-teal-500/35', href: '/parent/attendance' },
  { key: 'homework', label: 'Homework', icon: BookOpenCheck, color: 'from-indigo-400 to-indigo-600', glow: 'shadow-indigo-500/35', href: '/parent/homework' },
  { key: 'exam', label: 'Exam Results', icon: GraduationCap, color: 'from-violet-400 to-violet-600', glow: 'shadow-violet-500/35' },
  { key: 'concerns', label: 'Parent Concerns', icon: MessageSquareWarning, color: 'from-rose-400 to-rose-600', glow: 'shadow-rose-500/35', href: '/parent/concerns' },
  { key: 'poll', label: 'Opinion Poll', icon: Vote, color: 'from-orange-400 to-orange-600', glow: 'shadow-orange-500/35', href: '/parent/polls' },
  { key: 'events', label: 'Events & Gallery', icon: Images, color: 'from-pink-400 to-pink-600', glow: 'shadow-pink-500/35', href: '/parent/events' },
  { key: 'bus', label: 'Bus Tracking', icon: Bus, color: 'from-sky-400 to-sky-600', glow: 'shadow-sky-500/35', href: '/parent/bus', schoolOnly: true },
  { key: 'gatepass', label: 'Gate Pass', icon: DoorOpen, color: 'from-purple-400 to-purple-600', glow: 'shadow-purple-500/35', href: '/parent/gate-pass', schoolOnly: true },
  { key: 'wellness', label: 'Wellness', icon: HeartPulse, color: 'from-green-400 to-green-600', glow: 'shadow-green-500/35', href: '/parent/wellness', schoolOnly: true },
];

export function FeatureTileGrid() {
  const { activeChild } = useParentSession();
  const entityType: EntityType = activeChild?.entityType ?? 'institution';
  const visible = TILES.filter((t) => !t.schoolOnly || entityType === 'school');

  return (
    <div className="grid grid-cols-3 gap-3">
      {visible.map((tile) => {
        const Icon = tile.icon;
        const body = (
          <div
            className={cn(
              'group relative flex aspect-square flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[1.5rem] border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/80 p-2 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.22)] active:translate-y-0 active:scale-[0.97] dark:border-white/10 dark:from-neutral-900 dark:to-neutral-900',
              !tile.href && 'opacity-70'
            )}
          >
            {/* top sheen — barely-there highlight for a glassy finish */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10" />
            <span
              className={cn(
                'relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/40 transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-95',
                tile.color,
                tile.glow
              )}
            >
              {/* inner top-light glaze on the icon chip */}
              <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 to-transparent" />
              <Icon className="relative h-7 w-7" strokeWidth={2.2} />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-foreground/90">{tile.label}</span>
          </div>
        );

        return tile.href ? (
          <Link key={tile.key} href={tile.href}>
            {body}
          </Link>
        ) : (
          <button key={tile.key} type="button" onClick={() => toast.info(`${tile.label} is coming soon`)}>
            {body}
          </button>
        );
      })}
    </div>
  );
}
