# Module 0: Project Setup & Foundation

## 📋 Overview

This module covers the initial setup of the separate learner application, including project initialization, development environment configuration, and foundational architecture setup.

## 🎯 Objectives

- Create optimized Next.js 14 project structure
- Setup Supabase connection with connection pooling
- Configure PWA capabilities for mobile-first experience
- Establish development workflow and standards
- Setup performance monitoring from day one

## 📁 Directory Structure

```
learner-app/
├── README.md
├── next.config.js              # Next.js configuration
├── package.json               # Dependencies
├── tailwind.config.js         # Tailwind configuration
├── tsconfig.json              # TypeScript configuration
├── .env.local                 # Environment variables
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── .eslintrc.json            # ESLint configuration
├── .prettierrc               # Prettier configuration
├── public/
│   ├── icons/                # PWA icons (144x144, 192x192, 512x512)
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   ├── favicon.ico           # Favicon
│   └── offline.html          # Offline fallback page
├── src/
│   ├── app/
│   │   ├── (auth)/           # Auth route group
│   │   │   ├── login/
│   │   │   ├── callback/
│   │   │   └── layout.tsx
│   │   ├── (main)/           # Main app route group
│   │   │   ├── dashboard/
│   │   │   ├── attendance/
│   │   │   ├── billing/
│   │   │   ├── apps/
│   │   │   ├── profile/
│   │   │   └── layout.tsx
│   │   ├── api/              # API routes
│   │   │   ├── auth/
│   │   │   ├── student/
│   │   │   └── health/
│   │   ├── globals.css       # Global styles
│   │   ├── layout.tsx        # Root layout
│   │   ├── loading.tsx       # Global loading UI
│   │   ├── error.tsx         # Global error UI
│   │   ├── not-found.tsx     # 404 page
│   │   └── page.tsx          # Root redirect page
│   ├── components/
│   │   ├── ui/               # Shadcn/ui components
│   │   ├── layout/           # Layout components
│   │   ├── auth/             # Authentication components
│   │   └── common/           # Common components
│   ├── lib/
│   │   ├── supabase/         # Supabase configuration
│   │   ├── stores/           # Zustand stores
│   │   ├── hooks/            # Custom hooks
│   │   ├── utils/            # Utility functions
│   │   ├── constants/        # Application constants
│   │   └── validations/      # Zod schemas
│   ├── types/                # TypeScript type definitions
│   ├── styles/               # Additional styles
│   └── middleware.ts         # Optimized middleware
└── docs/                     # Documentation
    ├── api/                  # API documentation
    ├── components/           # Component documentation
    └── deployment/           # Deployment guides
```

## 🚀 Step-by-Step Setup

### Step 1: Project Initialization

```bash
# Create new Next.js project
npx create-next-app@latest learner-app --typescript --tailwind --eslint --app --src-dir

# Navigate to project directory
cd learner-app

# Install additional dependencies
npm install @supabase/supabase-js @supabase/ssr
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install zustand
npm install @hookform/resolvers zod react-hook-form
npm install date-fns
npm install framer-motion
npm install recharts
npm install next-pwa
npm install @radix-ui/react-slot @radix-ui/react-toast

# Install development dependencies
npm install -D @types/node
npm install -D prettier prettier-plugin-tailwindcss
```

### Step 2: Environment Configuration

Create `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://kvizhngldtiuufknvehv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application Configuration
NEXT_PUBLIC_APP_NAME=MyJKKN Learner
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_APP_URL=https://learner.myjkkn.com

# Development Configuration
NODE_ENV=development
NEXT_PUBLIC_DEV_MODE=true

# Performance Monitoring
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_PERFORMANCE_MONITORING=true
```

Create `.env.example`:

```env
# Copy this file to .env.local and fill in your values

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application Configuration
NEXT_PUBLIC_APP_NAME=MyJKKN Learner
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_APP_URL=your_app_url_here

# Development Configuration
NODE_ENV=development
NEXT_PUBLIC_DEV_MODE=true

# Performance Monitoring
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_PERFORMANCE_MONITORING=true
```

### Step 3: Next.js Configuration

Create optimized `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/kvizhngldtiuufknvehv\.supabase\.co\/rest\/v1\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'supabase-api-cache',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 5, // 5 minutes
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images-cache',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
  ],
});

const nextConfig = {
  // Performance optimizations
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons'],
  },

  // Image optimization
  images: {
    domains: ['kvizhngldtiuufknvehv.supabase.co'],
    formats: ['image/webp', 'image/avif'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Webpack optimizations
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = withPWA(nextConfig);
```

### Step 4: PWA Configuration

Create `public/manifest.json`:

```json
{
  "name": "MyJKKN Learner",
  "short_name": "JKKN Learner",
  "description": "MyJKKN Student Learning Platform",
  "theme_color": "#0066cc",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "shortcuts": [
    {
      "name": "Dashboard",
      "short_name": "Dashboard",
      "description": "View your dashboard",
      "url": "/dashboard",
      "icons": [{ "src": "/icons/dashboard-icon.png", "sizes": "192x192" }]
    },
    {
      "name": "Attendance",
      "short_name": "Attendance",
      "description": "Check your attendance",
      "url": "/attendance",
      "icons": [{ "src": "/icons/attendance-icon.png", "sizes": "192x192" }]
    },
    {
      "name": "Billing",
      "short_name": "Billing",
      "description": "View your bills",
      "url": "/billing",
      "icons": [{ "src": "/icons/billing-icon.png", "sizes": "192x192" }]
    }
  ]
}
```

### Step 5: TypeScript Configuration

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"],
      "@/hooks/*": ["./src/lib/hooks/*"],
      "@/stores/*": ["./src/lib/stores/*"],
      "@/utils/*": ["./src/lib/utils/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Step 6: Tailwind Configuration

Update `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // MyJKKN Brand Colors
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6', // Main brand color
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Learner specific colors
        learner: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9', // Learner accent
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Status colors
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        // Learner specific animations
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: 0 },
          to: { transform: "translateY(0)", opacity: 1 },
        },
        "fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: 0 },
          to: { transform: "scale(1)", opacity: 1 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
      // Mobile-first breakpoints
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      // Performance optimized spacing
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### Step 7: Package.json Scripts

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "type-check": "tsc --noEmit",
    "prettier": "prettier --write .",
    "prettier:check": "prettier --check .",
    "analyze": "ANALYZE=true npm run build",
    "test": "echo \"Tests will be added in future modules\"",
    "lighthouse": "lhci autorun",
    "performance": "npm run build && npm run lighthouse"
  }
}
```

### Step 8: ESLint and Prettier Configuration

Create `.eslintrc.json`:

```json
{
  "extends": [
    "next/core-web-vitals",
    "prettier"
  ],
  "rules": {
    "prefer-const": "error",
    "no-unused-vars": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "no-console": "warn",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

## 🔧 Core Infrastructure Setup

### Step 9: Supabase Client Configuration

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: {
        headers: {
          'X-Client-Info': 'learner-app@1.0.0',
        },
      },
    }
  );
}
```

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handle cookie setting errors in server components
          }
        },
        remove(name: string, options) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle cookie removal errors in server components
          }
        },
      },
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }
  );
}
```

### Step 10: Performance Monitoring Setup

Create `src/lib/utils/performance.ts`:

```typescript
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private marks: Map<string, number> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMark(name: string): void {
    if (typeof window !== 'undefined' && window.performance) {
      this.marks.set(name, performance.now());
    }
  }

  endMark(name: string): number | null {
    if (typeof window !== 'undefined' && window.performance) {
      const startTime = this.marks.get(name);
      if (startTime) {
        const duration = performance.now() - startTime;
        this.marks.delete(name);

        // Log performance metrics in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
        }

        return duration;
      }
    }
    return null;
  }

  measureFCP(): void {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            console.log('FCP:', entry.startTime);
          }
        }
      });
      observer.observe({ entryTypes: ['paint'] });
    }
  }

  measureLCP(): void {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log('LCP:', entry.startTime);
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
```

## ✅ Verification Checklist

After completing the setup, verify:

- [ ] Next.js project initializes without errors
- [ ] TypeScript compilation works (`npm run type-check`)
- [ ] ESLint and Prettier work (`npm run lint`)
- [ ] PWA manifest is accessible at `/manifest.json`
- [ ] Environment variables are properly loaded
- [ ] Supabase connection works (test in browser console)
- [ ] Tailwind CSS classes are working
- [ ] Build process completes successfully (`npm run build`)
- [ ] Development server starts (`npm run dev`)

## 🚀 Next Steps

After completing this module:

1. **Proceed to [Authentication Module](./01-authentication.md)**
2. **Setup version control and initial commit**
3. **Configure deployment pipeline**
4. **Setup performance monitoring dashboard**

## 📊 Performance Targets for This Module

- [ ] Project build time < 30 seconds
- [ ] Development server start time < 5 seconds
- [ ] TypeScript compilation time < 10 seconds
- [ ] Bundle size analysis available
- [ ] PWA manifest validation passes

---

**Module Completion Time**: 1-2 days
**Prerequisites**: Node.js 18+, Git, VS Code
**Next Module**: [Authentication](./01-authentication.md)