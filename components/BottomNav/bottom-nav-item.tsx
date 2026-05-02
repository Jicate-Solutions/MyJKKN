'use client';

import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNavItemProps } from './types';

// Fast spring for snappy interactions
const tapSpring = {
  type: 'spring' as const,
  stiffness: 600,
  damping: 25
};

// Smooth spring for icon animations
const iconSpring = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 20
};

// Very fast spring for indicator
const indicatorSpring = {
  type: 'spring' as const,
  stiffness: 600,
  damping: 30
};

export function BottomNavItem({
  id,
  icon: Icon,
  label,
  isActive,
  hasSubmenu,
  badgeCount,
  hideIndicator = false,
  customColor,
  onClick,
  variant = 'strip',
  tileGradient
}: BottomNavItemProps) {
  // --- TILE VARIANT: 4-col grid tile for the More-drawer ---
  if (variant === 'tile') {
    return (
      <motion.button
        onClick={onClick}
        className={cn(
          // min-h-[100px] keeps the 4-col grid aligned regardless of whether
          // a label wraps to 1 or 2 lines. Pre-fix tiles ragged in their row.
          // items-start + justify-start anchors content to the top so icons
          // line up across all tiles in a row, and the label spans whatever
          // height it needs without pushing the icon out of position.
          'flex flex-col items-center justify-start gap-2 p-2 rounded-xl min-h-[100px]',
          'transition-colors duration-150',
          isActive
            ? 'bg-primary/10 ring-1 ring-primary/20'
            : 'active:bg-accent'
        )}
        whileTap={{ scale: 0.92 }}
        transition={tapSpring}
        aria-label={label}
        aria-pressed={isActive}
      >
        {/* 56×56 Tier-D Holographic + Glass tile — Gen Alpha "fall in love" calibration.
            Recalibrated 2026-04-27 from earlier subtle Liquid Glass (was too restrained).
            Cues layered (bottom → top, all GPU-cheap, compositor-only):
              1. Base 3-color holographic gradient (from GROUP_TILE_GRADIENTS)
              2. Outer cast shadow + inset top-edge sheen + inset bottom shade
              3. Animated conic-gradient shimmer overlay (6s rotation) — brain
                 reads as "iridescent surface" (peacock feathers / Pokemon holo)
              4. Static specular highlight (light from upper-left)
              5. 1px luminous inset border (refraction)
              6. Icon w/ deep drop-shadow ("suspended above glass")
              7. whileTap scale (existing) — tactile press compression
            No backdrop-blur (catastrophic at 22 tiles on Mediatek-class GPUs). */}
        <motion.div
          className={cn(
            'relative w-14 h-14 rounded-2xl flex items-center justify-center',
            tileGradient ?? 'bg-gradient-to-br from-primary/70 via-primary to-primary',
            'shadow-[0_8px_24px_-4px_rgba(0,0,0,0.32),0_2px_8px_-1px_rgba(0,0,0,0.18),inset_0_2px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.1)]',
            'ring-1 ring-inset ring-white/30',
            isActive && 'ring-2 ring-primary/40 ring-offset-1'
          )}
          animate={{ scale: isActive ? 1.08 : 1 }}
          transition={iconSpring}
        >
          {/* Holographic shimmer overlay — animated conic gradient. Rotates 360°
              every 6s via `animate-holo-spin` keyframe (tailwind.config.ts).
              Self-clips via own rounded-2xl, no overflow-hidden needed (so the
              chevron disclosure can still extend past the tile bounds).
              Gated to isActive so shimmer is a focal accent (active tile only),
              not ambient noise. motion-reduce:hidden prevents the frozen
              mid-rotation specular smear under prefers-reduced-motion. */}
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 rounded-2xl motion-reduce:hidden',
              isActive && 'animate-holo-spin'
            )}
            style={{
              background:
                'conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.35) 60deg, rgba(255,255,255,0) 120deg, rgba(255,200,255,0.28) 180deg, rgba(255,255,255,0) 240deg, rgba(200,255,255,0.28) 300deg, rgba(255,255,255,0) 360deg)'
            }}
          />
          {/* Static specular highlight — paints above shimmer so the upper-left
              light cue stays anchored while iridescence rotates underneath. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/35 via-white/0 to-transparent"
          />
          <Icon
            className="relative z-10 h-6 w-6 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            strokeWidth={isActive ? 2.5 : 2.2}
          />
          {/* Multi-module disclosure affordance — tells the user "this tile
              has multiple modules underneath; tap to drill into the list."
              Small chevron in the bottom-right corner of the gradient
              container, white-on-translucent so it reads against any
              gradient color. Single-module tiles render no chevron and
              navigate directly on tap (existing behavior). */}
          {hasSubmenu && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/95 flex items-center justify-center shadow-sm"
              aria-hidden="true"
            >
              <ChevronRight className="h-3 w-3 text-foreground" strokeWidth={2.5} />
            </span>
          )}
        </motion.div>

        {/* 2-line label */}
        <span
          className={cn(
            'text-[10px] text-center leading-tight line-clamp-2 w-full',
            isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </motion.button>
    );
  }

  // --- STRIP VARIANT (default): Tier-D glass strip rendering ---
  // Recalibrated 2026-04-27 to match More-drawer Tier-D treatment.
  // Each strip item gets a 36x36 glass tile (same cue-stack as 56x56 drawer
  // tile, just smaller). Always-on shimmer matches drawer for design unity —
  // user directive: "same effect for entire bottom navigation menu".
  // Bottom indicator bar removed — the glass tile + scale + ring IS the
  // active indicator now (multi-cue, accessibility-preserving).
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center px-2 py-2.5 min-w-[56px] flex-1 gap-1',
        'touch-manipulation transition-colors duration-150'
      )}
      whileTap={{ scale: 0.92 }}
      transition={tapSpring}
    >
      <motion.div
        className={cn(
          'relative w-9 h-9 rounded-xl flex items-center justify-center',
          tileGradient ?? 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700',
          'shadow-[0_4px_12px_-2px_rgba(0,0,0,0.22),0_1px_4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.08)]',
          'ring-1 ring-inset ring-white/25',
          isActive && 'ring-2 ring-white/45'
        )}
        animate={{
          scale: isActive ? 1.12 : 1,
          y: isActive ? -3 : 0
        }}
        transition={iconSpring}
      >
        {/* Holographic shimmer — same conic-gradient + holo-spin keyframe
            as drawer tiles, scaled to 36px. Self-clips via own rounded-xl.
            Gated to isActive; motion-reduce:hidden prevents frozen smear. */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 rounded-xl motion-reduce:hidden',
            isActive && 'animate-holo-spin'
          )}
          style={{
            background:
              'conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.32) 60deg, rgba(255,255,255,0) 120deg, rgba(255,200,255,0.26) 180deg, rgba(255,255,255,0) 240deg, rgba(200,255,255,0.26) 300deg, rgba(255,255,255,0) 360deg)'
          }}
        />
        {/* Static specular highlight — anchored upper-left light cue. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 via-white/0 to-transparent"
        />
        <Icon
          className="relative z-10 h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          strokeWidth={isActive ? 2.5 : 2.2}
        />

        {/* Badge for notifications — anchored to top-right of glass tile. */}
        {badgeCount !== undefined && badgeCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center z-20"
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </motion.span>
        )}
      </motion.div>

      <motion.span
        className={cn(
          'text-[10px] font-medium truncate max-w-full',
          isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'
        )}
        animate={{
          opacity: isActive ? 1 : 0.85,
          y: isActive ? 1 : 0
        }}
        transition={{ duration: 0.15 }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}
