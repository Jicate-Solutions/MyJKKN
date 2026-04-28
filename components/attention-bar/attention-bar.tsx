'use client';

/**
 * AttentionBar — the visible pill above the bottom-nav strip.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 (Layer 1) and §6 (Admin UI).
 *
 * Architecture:
 *   - Client component. Subscribes to `usePathname()` so the pill updates on
 *     soft-navigation. Phase 3 (Layer 0) will graft a Realtime subscription
 *     onto the same hook and the pill will re-render automatically.
 *   - Calls `useAttentionBar(pathname)` which proxies to the resolver API.
 *     The resolver does the heavy lifting (priority cascade); this component
 *     just renders the resolved action (or nothing).
 *
 * Visual aesthetic:
 *   - Tier-C glass (default): subtle gradient + ring + 2-cue stack. Calm.
 *   - Tier-D upgrade (urgent): vivid 3-color gradient + holo-spin shimmer +
 *     pulse animation. Reuses the same primitives that PR #539 (BottomNav)
 *     and PR #541 (TodaysFocusCard) already ship — see tailwind.config.ts
 *     `holo-spin` keyframe (compositor-only, GPU-cheap).
 *   - Empty state: renders nothing (height 0) so the bottom-nav strip stays
 *     anchored at viewport-bottom unchanged.
 *
 * Mobile-first:
 *   - Fixed positioning, anchored just above the bottom-nav strip
 *     (bottom = nav-strip height + safe-area-inset).
 *   - Hidden on lg+ (desktop has the sidebar; pill is mobile-only — same
 *     contract as the bottom-nav itself).
 *   - Width: 100vw - 16px gutters; rounds to ~360px on iPhone SE.
 *
 * Accessibility:
 *   - role="status" + aria-live="polite" so screen readers announce when
 *     the action changes (route change or urgent layer-0 push).
 *   - aria-label on the link includes both the headline + CTA so the focus
 *     ring lands on a single semantic target.
 *   - Decorative shimmer overlays carry aria-hidden.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  FileCheck2,
  FilePlus2,
  GraduationCap,
  Home,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  Receipt,
  ReceiptIndianRupee,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttentionBar } from '@/hooks/use-attention-bar';
import type { Tone } from '@/lib/attention-bar/types';
import { RealtimeListener } from './realtime-listener'; // PHASE3:REALTIME — DO NOT DELETE

// ─────────────────────────────────────────────────────────────────
// Icon resolver
//
// Layer 1 entries reference lucide icon names as strings so the registry
// stays serialisable + mockup-able. We map them to components here. New
// icons added to static-defaults.ts must be appended below — TS won't
// catch the gap (resolver is a string lookup), so we fall back to
// `Sparkles` to keep the pill alive on unknown names.
// ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  FileCheck2,
  FilePlus2,
  GraduationCap,
  Home,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  Receipt,
  ReceiptIndianRupee,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Sparkles;
}

// ─────────────────────────────────────────────────────────────────
// Tone → visual treatment
//
// Five tones come from the resolver. Urgent gets the full Tier-D treatment
// (3-color gradient + holo shimmer + pulse). The other four use a calmer
// glass-on-tinted-base look so a non-urgent default doesn't fight the page
// for attention. Same pattern as TodaysFocusCard (components/dashboard/).
// ─────────────────────────────────────────────────────────────────

interface ToneStyle {
  /** Base gradient applied to the pill background. */
  bg: string;
  /** Outer cast shadow + inset bevel. */
  shadow: string;
  /** Icon-tile background (sits inside the pill, holds the icon). */
  iconBg: string;
  /** CTA pill background. */
  ctaBg: string;
  /** Outer ring colour (refraction edge). */
  ring: string;
  /** Whether to layer the holo-spin shimmer (Tier-D). */
  shimmer: boolean;
  /** Whether to pulse (urgent only). */
  pulse: boolean;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
  urgent: {
    bg: 'bg-gradient-to-br from-red-500 via-rose-500 to-red-700',
    shadow:
      'shadow-[0_12px_32px_-6px_rgba(239,68,68,0.55),0_3px_10px_-2px_rgba(0,0,0,0.18),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.12)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-red-700 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: true,
    pulse: true,
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700',
    shadow:
      'shadow-[0_10px_28px_-6px_rgba(245,158,11,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-amber-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700',
    shadow:
      'shadow-[0_10px_28px_-6px_rgba(16,185,129,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-emerald-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  blue: {
    bg: 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600',
    shadow:
      'shadow-[0_10px_28px_-6px_rgba(59,130,246,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-blue-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  neutral: {
    bg: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800',
    shadow:
      'shadow-[0_10px_28px_-6px_rgba(15,23,42,0.45),0_2px_8px_-2px_rgba(0,0,0,0.18),inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.12)]',
    iconBg: 'bg-white/15 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-slate-900 hover:bg-white/95',
    ring: 'ring-white/20',
    shimmer: false,
    pulse: false,
  },
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export function AttentionBar() {
  const pathname = usePathname() ?? '/';
  const { data, isLoading, isError } = useAttentionBar(pathname);

  // ───────────────────────────────────────────────────────────────────────
  // Empty + loading + error states
  //
  // Spec §6 + Phase 7 polish notes — render NOTHING (height 0) in three cases
  // so the bottom-nav strip stays anchored at viewport-bottom unchanged:
  //   1. Slow/failed network (isError)        — render skeleton-free empty state
  //   2. Initial load (isLoading + no cache)  — render subtle skeleton
  //   3. Cascade returned null / unauthed     — render nothing
  //
  // <RealtimeListener/> mounts in ALL three cases so an urgent (Layer 0) push
  // can arrive mid-empty-state and trigger an immediate re-resolve.
  //
  // The skeleton is intentionally minimal — same height + radius as the real
  // pill so the layout doesn't shift when the resolved action arrives. The
  // pulse animation is shipped via tailwind's animate-pulse (compositor-only,
  // GPU-cheap, no CSS file changes needed).
  // ───────────────────────────────────────────────────────────────────────
  if (isError) {
    // Network/resolver failure — render nothing visible, keep listener mounted.
    return <RealtimeListener />;
  }

  if (isLoading) {
    return (
      <>
        <div
          // data-* hooks for QA + monitoring scrapers; mirror the real pill
          // so a smoke-test can detect either state without traversal.
          data-attention-bar
          data-attention-bar-state="loading"
          aria-hidden="true"
          className="pointer-events-none fixed left-0 right-0 z-[75] px-2 lg:hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 8px)',
          }}
        >
          <div
            className={cn(
              'block min-h-[48px] w-full rounded-2xl px-3 py-2',
              'animate-pulse bg-gradient-to-br from-slate-200/70 via-slate-300/70 to-slate-200/70',
              'ring-1 ring-inset ring-slate-300/40',
              'dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 dark:ring-slate-600/40',
            )}
          />
        </div>
        <RealtimeListener />
      </>
    );
  }

  const action = data?.resolved;
  if (!action) return <RealtimeListener />;

  const styles = TONE_STYLES[action.tone];
  const Icon = resolveIcon(action.icon);

  return (
    <div
      data-attention-bar
      // Canonical attribute for external monitoring/QA — the layer that fired
      // for this render. Phase 7 polish: scrapers must not need to traverse
      // classNames or guess from tone/icon. `data-fired-layer` is kept as an
      // alias for backward-compat with anything that already shipped against
      // the early Phase 2 attribute name.
      data-attention-bar-layer={action.firedLayer}
      data-fired-layer={action.firedLayer}
      data-tone={action.tone}
      // Fixed positioning, anchored above the bottom-nav strip.
      // The bottom-nav itself is a `fixed bottom-0 z-[80]` element ~64px tall
      // on mobile (icons + label + safe-area). We sit just above it: bottom
      // offset is `calc(safe-area + 64px + 8px gutter)`. z-index 75 puts us
      // BELOW the bottom-nav (z-80) so the More-drawer backdrop covers us
      // when expanded — correct ordering: drawer interactions outrank pill.
      className={cn(
        'fixed left-0 right-0 z-[75] px-2 lg:hidden',
        'pointer-events-none', // wrapper passes clicks through; the inner Link captures them
      )}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 8px)',
      }}
      role="status"
      aria-live="polite"
      aria-label={`Attention bar: ${action.label}`}
    >
      <Link
        href={action.href}
        prefetch={false}
        className={cn(
          'pointer-events-auto relative block overflow-hidden rounded-2xl',
          'min-h-[48px] px-3 py-2',
          'ring-1 ring-inset',
          'transition-transform active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/20',
          styles.bg,
          styles.shadow,
          styles.ring,
          styles.pulse && 'animate-pulse',
        )}
        aria-label={`${action.label}. ${action.cta}.`}
      >
        {/* Tier-D holo shimmer — only for urgent. Conic-gradient rotated by
            the holo-spin keyframe (6s linear). Matches TodaysFocusCard +
            BottomNavItem treatment so the visual language is consistent. */}
        {styles.shimmer && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-holo-spin"
            style={{
              background:
                'conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.28) 60deg, rgba(255,255,255,0) 120deg, rgba(255,200,255,0.22) 180deg, rgba(255,255,255,0) 240deg, rgba(200,255,255,0.22) 300deg, rgba(255,255,255,0) 360deg)',
            }}
          />
        )}
        {/* Static specular highlight — anchored upper-left light cue.
            Painted above the rotating shimmer so the sheen position
            stays fixed (matches BottomNav tile treatment). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/25 via-white/0 to-transparent"
        />

        <div className="relative z-10 flex items-center gap-3">
          {/* Icon tile */}
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/30',
              styles.iconBg,
            )}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </div>

          {/* Label + context — flex-1 so CTA hugs the right edge. */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              {action.label}
            </p>
            {action.context && (
              <p className="truncate text-[12px] leading-tight text-white/80">
                {action.context}
              </p>
            )}
          </div>

          {/* CTA pill */}
          <span
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-sm ring-1 ring-inset ring-white/40',
              styles.ctaBg,
            )}
          >
            {action.cta}
          </span>
        </div>
      </Link>
    </div>
  );
}
