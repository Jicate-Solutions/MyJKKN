import type { Config } from 'tailwindcss';
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
      // components/BottomNav/bottom-navbar.tsx is `fixed bottom-0` below the
      // `lg` breakpoint (it is `lg:hidden`) and pads itself by
      // env(safe-area-inset-bottom) so it clears the iOS home indicator. Its
      // content strip measures ~4rem tall on a 387pt iPhone — the same figure
      // hard-coded in components/attention-bar/realtime-listener.tsx.
      //
      // Anything `fixed` near the bottom of the screen must therefore sit at
      // ~4rem + a gutter + the safe-area inset, or it lands on top of the nav
      // (or behind it, if its z-index is below the nav's z-[80]).
      //
      //   bottom-nav-safe    first free line above the nav. Use for a lone
      //                      floating element.
      //   bottom-nav-safe-2  first slot of the right-edge floating column.
      //   bottom-nav-safe-3  second slot (nav-safe-2 + 4rem: a 3rem control
      //                      plus a 1rem gap).
      //   bottom-nav-safe-4  third slot (nav-safe-3 + 4rem).
      //
      // The right-edge column is `nav-safe-2..4` because three controls mount
      // together on every authenticated page (bug reporter, Director handover,
      // work pulse) and must not overlap each other.
      //
      // Always pair these with an `lg:` offset — the nav does not exist at
      // `lg` and above, so the element should return to its desktop position.
      //
      // Pixel values below assume env(safe-area-inset-bottom) = 34px, the iOS
      // home-indicator inset. nav-safe / -2 / -3 reproduce exactly the 6.875rem
      // / 8.5rem / 12.5rem literals they replace, so nothing moved on a notched
      // phone; on a phone without an inset they now sit 34px lower, which is
      // where they always should have been. nav-safe-4 is new.
      spacing: {
        'nav-safe': 'calc(4.75rem + env(safe-area-inset-bottom, 0px))', // 110px on iOS
        'nav-safe-2': 'calc(6.375rem + env(safe-area-inset-bottom, 0px))', // 136px on iOS
        'nav-safe-3': 'calc(10.375rem + env(safe-area-inset-bottom, 0px))', // 200px on iOS
        'nav-safe-4': 'calc(14.375rem + env(safe-area-inset-bottom, 0px))' // 264px on iOS
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
  plugins: [tailwindcssAnimate]
};
export default config;
