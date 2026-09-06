import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px'
      },
      // Clearance above the mobile bottom navigation.
      //
      // components/BottomNav/bottom-navbar.tsx is `fixed bottom-0 z-[80]`
      // below the `lg` breakpoint (it is `lg:hidden`) and pads itself by
      // env(safe-area-inset-bottom) so it clears the iOS home indicator.
      //
      // Its content strip is 76px, not the 4rem/64px this comment previously
      // claimed. Measured off components/BottomNav/bottom-nav-item.tsx:
      // py-2.5 (10px x 2) around a w-9/h-9 icon tile (36px) + gap-1 (4px) +
      // a ~16px text-[10px] label line. The bare `64px` still hard-coded in
      // components/attention-bar/* is 12px short of the real nav — do not
      // copy that figure into new code.
      //
      // Anything `fixed` near the bottom of the screen must therefore sit at
      // 76px + the safe-area inset or higher, or it lands on top of the nav
      // (or behind it, if its z-index is below the nav's z-[80]).
      //
      // The ladder steps by a uniform 4rem so that a 48px control in one slot
      // clears the tallest element one slot below it (the 56px echo bubble):
      //
      //   bottom-nav-safe     4.75rem  — flush above the nav. Lone floating
      //                       elements, and the base of the right-edge column.
      //   bottom-nav-safe-2   8.75rem  (+4rem) — second slot.
      //   bottom-nav-safe-3  12.75rem  (+4rem) — third slot.
      //   bottom-nav-safe-4  16.75rem  (+4rem) — fourth slot.
      //
      // Slots 2..4 exist because three 48px controls mount together on every
      // authenticated page (bug reporter, Director handover, work pulse) above
      // whatever already occupies nav-safe, and must not overlap each other.
      //
      // Always pair these with an `lg:` offset — the nav does not exist at
      // `lg` and above, so the element should return to its desktop position.
      //
      // Pixel comments below assume env(safe-area-inset-bottom) = 34px, the
      // iOS home-indicator inset. Only nav-safe reproduces the literal it
      // replaced (6.875rem on a notched phone); -2 and -3 now sit higher than
      // the 8.5rem / 12.5rem literals they replaced, because those literals
      // were themselves too close together — see the 4rem rule above.
      spacing: {
        'nav-safe': 'calc(4.75rem + env(safe-area-inset-bottom, 0px))', // 76px → 110px on iOS
        'nav-safe-2': 'calc(8.75rem + env(safe-area-inset-bottom, 0px))', // 140px → 174px on iOS
        'nav-safe-3': 'calc(12.75rem + env(safe-area-inset-bottom, 0px))', // 204px → 238px on iOS
        'nav-safe-4': 'calc(16.75rem + env(safe-area-inset-bottom, 0px))' // 268px → 302px on iOS
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        },
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' }
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        // Tier-D holographic conic-gradient rotation. Used by:
        //   - components/BottomNav/bottom-nav-item.tsx (PR #539)
        //   - components/dashboard/todays-focus.tsx (PR #541)
        // 6s linear loop, compositor-only transform. Idempotent across PRs.
        'holo-spin': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        gradient: 'gradient 8s linear infinite',
        shimmer: 'shimmer 3s ease-in-out infinite',
        'holo-spin': 'holo-spin 6s linear infinite'
      }
    }
  },
  plugins: [
    tailwindcssAnimate,
    // `modal-open:` — matches only while a MODAL dialog/sheet is on screen.
    //
    // The bottom-right FAB column sits at z-[95]/[96]/[100], deliberately
    // above the Sheet primitive (overlay z-[85], content z-[90] in
    // components/ui/sheet.tsx). That is correct for a `modal={false}` drawer
    // — BUG-003871 / BUG-003893 require the bug reporter to stay visible and
    // clickable over one — but it also meant the FABs painted on top of the
    // full-height More drawer (h-[88vh], z-[90]). `modal-open:hidden` closes
    // that hole without touching the z-indices those bug fixes depend on.
    //
    // Both halves of the selector are load-bearing:
    //   body[data-scroll-locked]              set by react-remove-scroll,
    //     which @radix-ui/react-dialog mounts ONLY when `modal` is true. A
    //     `modal={false}` Sheet never matches, so the BUG-003871 behaviour is
    //     preserved exactly.
    //   :has([role$="dialog"][data-state="open"])
    //     narrows to dialogs, sheets and alert dialogs — the only two ARIA
    //     roles ending in "dialog" are `dialog` and `alertdialog`, and Radix's
    //     AlertDialog is always modal. A modal dropdown menu (role=menu) or
    //     select (role=listbox) must NOT blank the FABs, and does not match.
    //
    // Browsers without :has() simply drop the rule and behave as before.
    plugin(({ addVariant }) => {
      addVariant(
        'modal-open',
        'body[data-scroll-locked]:has([role$="dialog"][data-state="open"]) &'
      );
    }),
    // `scrolling-down:` — sibling of `modal-open:`. Matches while the user is
    // scrolling DOWN the page on a mobile-width viewport, so the floating stack
    // can retract out of the way of the content it is parked over.
    //
    // Why a retract is the fix, and not a nudge: the Help FAB is
    // `fixed left-4` and 48px wide (x ∈ [16,64]); a Decision Queue action row's
    // first button starts at x = 24 (8px dashboard `px-2` + 16px card `p-4`,
    // and <main> has no horizontal padding below `lg`). So the FAB covers the
    // leading 40px of ✓ Approve / 🔥 Claim rescue / Acknowledge whenever that
    // row scrolls into its band. The inert gutter is 24px and an accessible
    // touch target is 44px, so nothing tappable fits beside the content — a
    // fixed control over a scrolling list of left-aligned controls always
    // collides with one eventually. Time, not space, is the only lever.
    //
    // `data-scrolling-down` is set by hooks/use-floating-stack-retract.ts
    // (one passive rAF-throttled scroll listener; direction-aware, so the FAB
    // stays out of the way after a downward scroll settles — which is the whole
    // point, that is when the tap lands — and returns on any scroll up).
    //
    // The media query is baked into the variant rather than left to a stacked
    // `max-lg:` so it can never be applied where it would be wrong. At `lg`+
    // <main> carries `lg:ml-72`, so the FAB sits over the sidebar and never
    // over content; there is no collision to solve there, and hiding a help
    // button a keyboard user may be tabbing toward would be a regression. The
    // query mirrors Tailwind's own `max-lg` exactly.
    plugin(({ addVariant }) => {
      addVariant('scrolling-down', [
        '@media not all and (min-width: 1024px) { body[data-scrolling-down] & }'
      ]);
    })
  ]
};
export default config;
