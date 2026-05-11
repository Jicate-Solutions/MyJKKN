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
import type { ResolvedAction } from '@/lib/attention-bar/types';
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
  ChevronRight,
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
// AttentionPill — inner pill renderer
//
// One pill = one resolved action. The outer AttentionBar handles fixed
// positioning + role="status" + a11y framing; this helper handles the
// Link + tone styling + icon/CTA/label layout.
//
// `layoutMode`:
//   - 'full' — single full-width pill (legacy single-pill behaviour). The
//              `flex-1 min-w-0` wrapping done by the parent is harmless
//              here because the parent passes a single child.
//   - 'half' — half-width pill for the 2-half split layout. The parent
//              wraps two of these in a `flex gap-2` row, each child
//              gets `flex-1 min-w-0`. We drop the secondary `context`
//              line and tighten the icon tile + horizontal padding so
//              the CTA + label still fit on iPhone-SE width. Tap-target
//              minimum height stays at 48px.
//
// CTA-on-LEFT pattern (matches PR #621): the CTA pill comes BEFORE the
// label/context block in DOM order, so on the rendered screen the CTA
// hugs the LEFT edge of the pill. This avoids collision with the
// right-side floating action buttons (bug-report FAB + lightning FAB
// at z-[80]+). The label container takes flex-1 + min-w-0 so it
// truncates harmlessly to fill the remaining horizontal space.
// ─────────────────────────────────────────────────────────────────

interface AttentionPillProps {
  action: ResolvedAction;
  layoutMode: 'full' | 'half';
}

function AttentionPill({ action, layoutMode }: AttentionPillProps) {
  const styles = TONE_STYLES[action.tone];
  const Icon = resolveIcon(action.icon);
  const isHalf = layoutMode === 'half';

  return (
    <Link
      href={action.href}
      prefetch={false}
      className={cn(
        'pointer-events-auto relative block overflow-hidden rounded-2xl',
        'min-h-[48px]',
        // Tighter horizontal padding when half-width — every pixel matters
        // on iPhone-SE-class screens once the bar splits.
        isHalf ? 'px-2 py-2' : 'px-3 py-2',
        // In half mode, fill the parent flex track; in full mode the parent
        // is a positioned div (no flex), so block-level is correct.
        isHalf && 'h-full w-full min-w-0 flex-1',
        'ring-1 ring-inset',
        'transition-transform active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/20',
        styles.bg,
        styles.shadow,
        styles.ring,
        styles.pulse && 'animate-pulse',
      )}
      data-attention-pill-layout={layoutMode}
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

      <div className={cn('relative z-10 flex items-center', isHalf ? 'gap-2' : 'gap-3')}>
        {/* Icon tile — slightly smaller in half mode to free up label width. */}
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/30',
            isHalf ? 'h-8 w-8' : 'h-9 w-9',
            styles.iconBg,
          )}
          aria-hidden="true"
        >
          <Icon className={isHalf ? 'h-4 w-4' : 'h-5 w-5'} />
        </div>

        {/* CTA pill — full-width mode only.
            Left-anchored to avoid collision with the right-side floating
            action buttons (bug-report FAB + lightning FAB at z-[80]+). Same
            pattern shipped in PR #621 for the full-width case.
            Half-mode (Wave B.4 follow-up 2026-05-03): the CTA pill is
            dropped because each half has only ~159px usable width — the
            pill chrome ate ~85px and left only ~55px for the label, forcing
            "🧪 Verify sp..." truncation after ~10 chars. The whole half is
            already the <Link> tap target, so the pill chrome is redundant
            in split mode. A trailing ChevronRight (below) preserves the
            "tappable" affordance. */}
        {!isHalf && (
          <span
            className={cn(
              'shrink-0 rounded-lg font-semibold shadow-sm ring-1 ring-inset ring-white/40',
              'px-3 py-1.5 text-[12px]',
              styles.ctaBg,
            )}
          >
            {action.cta}
          </span>
        )}

        {/* Label + context — flex-1 fills the remaining space to the right.
            Half mode: line-clamp-2 lets long titles wrap to a second line
            instead of truncating after ~10 chars. The bar gets ~12px
            taller, but the label is readable. Context drops in half mode
            (the second line of clamp IS the context surface).
            Full mode: single-line truncate + optional separate context. */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
              isHalf ? 'text-[13px] line-clamp-2' : 'truncate text-[15px]',
            )}
          >
            {action.label}
          </p>
          {/* Drop context in half mode — line-clamp-2 on the title gives
              the second line of horizontal real estate to the title itself,
              not a separate context paragraph. */}
          {!isHalf && action.context && (
            <p className="truncate text-[12px] leading-tight text-white/80">
              {action.context}
            </p>
          )}
        </div>

        {/* Half mode: trailing chevron preserves the "this is tappable"
            affordance now that the explicit CTA pill is hidden. White-on-
            translucent, mirrors the pattern used by BottomNav drawer tile
            disclosure indicator. Hidden in full mode where the CTA pill
            is the affordance. */}
        {isHalf && (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-white/70"
            aria-hidden="true"
          />
        )}
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// AttentionBar — outer fixed-position wrapper
//
// Reads `{ primary, secondary }` from the resolver via useAttentionBar.
// Render branches:
//   - both null            → empty state, render only RealtimeListener
//   - primary only         → single full-width AttentionPill (current
//                            production behaviour, unchanged)
//   - primary + secondary  → 2-half split: a flex row with two AttentionPills
//                            (50% each minus 8px gap), both using the
//                            CTA-on-LEFT pattern.
//
// Until the follow-up resolver-extension PR populates `secondary`, this
// component always takes the single-pill branch on production.
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

  // Read the new bundle. Backcompat: if a stale API/cache still returns
  // only `resolved`, treat it as `primary`. Production currently always
  // returns `primary` populated and `secondary === null`.
  const primary = data?.primary ?? data?.resolved ?? null;
  const secondary = data?.secondary ?? null;

  if (!primary) return <RealtimeListener />;

  const hasSecondary = secondary !== null;

  return (
    <div
      data-attention-bar
      // Canonical attribute for external monitoring/QA — the layer that fired
      // for the PRIMARY pill. Phase 7 polish: scrapers must not need to
      // traverse classNames or guess from tone/icon. `data-fired-layer` is
      // kept as an alias for backward-compat with anything that already
      // shipped against the early Phase 2 attribute name.
      data-attention-bar-layer={primary.firedLayer}
      data-fired-layer={primary.firedLayer}
      data-tone={primary.tone}
      // Optional secondary metadata — exposed only when a second pill renders
      // so QA scrapers can assert split-mode vs single-mode without DOM
      // traversal. Absent when secondary is null (production today).
      {...(hasSecondary && {
        'data-attention-bar-secondary-layer': secondary.firedLayer,
        'data-attention-bar-secondary-tone': secondary.tone,
        'data-attention-bar-mode': 'split',
      })}
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
      aria-label={
        hasSecondary
          ? `Attention bar: ${primary.label}; ${secondary.label}`
          : `Attention bar: ${primary.label}`
      }
    >
      {hasSecondary ? (
        // 2-half split — both pills get flex-1 + min-w-0 so they share
        // bar width 50/50 with an 8px (gap-2) gap between them. The
        // pointer-events-none on the outer wrapper passes clicks through
        // to each Link individually.
        <div className="flex w-full items-stretch gap-2">
          <AttentionPill action={primary} layoutMode="half" />
          <AttentionPill action={secondary} layoutMode="half" />
        </div>
      ) : (
        // Single full-width pill — current production render path. Visual
        // output is identical to pre-split-bar production (modulo PR #621's
        // CTA-on-LEFT reorder which AttentionPill carries as the only
        // canonical layout).
        <AttentionPill action={primary} layoutMode="full" />
      )}
    </div>
  );
}
