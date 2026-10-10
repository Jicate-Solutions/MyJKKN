import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './fonts/fonts.css';
import { PushNotificationProvider } from '@/components/notifications/push-notification-provider';
import { AppBadgeSync } from '@/components/notifications/app-badge-sync';
import { InstallPromptBanner } from '@/components/pwa/install-prompt-banner';
import { PWAProvider } from '@/components/pwa/pwa-provider';
import { StaleDeploymentReload } from '@/components/pwa/stale-deployment-reload';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/hooks/use-auth-provider';
import { ReactQueryProvider } from '@/providers/query-client-provider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { PreviewBanner } from '@/components/layout/preview-banner';
import { PlatformGuideFabMount } from '@/components/guide/platform-guide-fab-mount';

// Fonts are self-hosted from app/fonts/ (OFL, built from github.com/google/fonts)
// so `next build` never fetches fonts.googleapis.com — a flaky fetch there failed
// two production deploys on 2026-10-07. Each file covers the same Google subsets
// (latin + latin-ext, plus tamil / greek where Google served them) and variable
// files keep the axes Google served, so the rendered page is unchanged. The
// metric-matched fallback faces the Google font loader used to generate live in
// app/fonts/fonts.css, hence `adjustFontFallback: false` + `fallback` below.
const poppins = localFont({
  src: [
    { path: './fonts/poppins/Poppins-Thin.woff2', weight: '100', style: 'normal' },
    { path: './fonts/poppins/Poppins-ExtraLight.woff2', weight: '200', style: 'normal' },
    { path: './fonts/poppins/Poppins-Light.woff2', weight: '300', style: 'normal' },
    { path: './fonts/poppins/Poppins-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins/Poppins-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins/Poppins-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins/Poppins-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/poppins/Poppins-ExtraBold.woff2', weight: '800', style: 'normal' },
    { path: './fonts/poppins/Poppins-Black.woff2', weight: '900', style: 'normal' },
  ],
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Poppins Fallback'],
  variable: '--font-poppins'
});

const notoSansTamil = localFont({
  src: [{ path: './fonts/noto-sans-tamil/NotoSansTamil-Variable.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Noto Sans Tamil Fallback'],
  variable: '--font-noto-tamil'
});

// Editorial display serif — used for the YoY chart's verdict headline
// ("Behind 2025-26 by 14%"). Distinctive against the generic sans-defaults
// most dashboards use.
const dmSerifDisplay = localFont({
  src: [{ path: './fonts/dm-serif-display/DMSerifDisplay-Regular.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['DM Serif Display Fallback'],
  variable: '--font-dm-serif-display',
});

// Refined body sans — used for descriptions, labels, tooltips in the YoY
// chart. Pairs with DM Serif Display for the editorial/financial-terminal
// aesthetic Director-locked 2026-06-02.
const ibmPlexSans = localFont({
  src: [{ path: './fonts/ibm-plex-sans/IBMPlexSans-Variable.woff2', weight: '300 600', style: 'normal' }],
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['IBM Plex Sans Fallback'],
  variable: '--font-ibm-plex-sans',
});

// Tabular-figures monospace — used for trajectory values, axis labels,
// drill-down counts. Fixed-width = trustworthy/numerical.
const ibmPlexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono/IBMPlexMono-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['IBM Plex Mono Fallback'],
  variable: '--font-ibm-plex-mono',
});

// Allow pinch-zoom for accessibility (WCAG 2.5.5 target size, 1.4.4 resize text).
// Locking userScalable / maximumScale soft-fails low-vision users and is widely
// considered an anti-pattern; we trust the responsive layout to behave well at
// any zoom level instead of disabling the gesture.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover'
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  title: {
    template: '%s · MyJKKN',
    default: 'MyJKKN',
  },
  description:
    'Central Hub Application for JKKN Institutions - Manage admissions, students, billing, attendance and more',
  generator: 'Next.js',
  manifest: '/manifest.webmanifest',
  keywords: [
    'education',
    'JKKN',
    'institutions',
    'management',
    'students',
    'admissions',
    'billing',
    'attendance',
    'academic management',
    'college management',
    'pwa',
    'progressive web app',
    'mobile app',
    'offline app',
    'installable app'
  ],
  authors: [{ name: 'JKKN Institutions' }],
  creator: 'JKKN Institutions',
  publisher: 'JKKN Institutions',
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: 'website',
    siteName: 'MyJKKN',
    title: 'MyJKKN - Central Hub Application',
    description:
      'Central Hub Application for JKKN Institutions - Manage admissions, students, billing, attendance and more',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'MyJKKN Logo'
      }
    ]
  },
  twitter: {
    card: 'summary',
    title: 'MyJKKN - Central Hub Application',
    description:
      'Central Hub Application for JKKN Institutions - Manage admissions, students, billing, attendance and more',
    images: ['/icons/icon-512x512.png']
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MyJKKN',
    startupImage: [
      {
        url: '/icons/apple-splash-2048x2732.png',
        media:
          '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-1668x2388.png',
        media:
          '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-1536x2048.png',
        media:
          '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-1284x2778.png',
        media:
          '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-1170x2532.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-1125x2436.png',
        media:
          '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-828x1792.png',
        media:
          '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
      },
      {
        url: '/icons/apple-splash-750x1334.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
      }
    ]
  },
  icons: {
    icon: [
      { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      {
        url: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png'
      }
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/icons/safari-pinned-tab.svg',
        color: '#3b82f6'
      }
    ]
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'msapplication-TileColor': '#3b82f6',
    'msapplication-config': '/browserconfig.xml'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' className='overflow-x-hidden' suppressHydrationWarning>
      <head>
        {/* Preconnect to critical third-party origins — shaves ~200-400ms off first request */}
        <link
          rel='preconnect'
          href='https://kvizhngldtiuufknvehv.supabase.co'
          crossOrigin='anonymous'
        />
        <link
          rel='preconnect'
          href='https://accounts.google.com'
        />
        <link
          rel='dns-prefetch'
          href='https://apis.google.com'
        />
      </head>
      <body className={`${poppins.variable} ${notoSansTamil.variable} ${dmSerifDisplay.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} font-sans antialiased overflow-x-hidden`} suppressHydrationWarning>
        <ReactQueryProvider>
          <ThemeProvider
            attribute='class'
            defaultTheme='light'
            enableSystem
            disableTransitionOnChange
            storageKey='theme-preference'
          >
            <AuthProvider>
              <PWAProvider>
                {/* Sticky preview banner — renders only when a preview session
                    cookie is active. Non-dismissible by design. */}
                <PreviewBanner />
                {/* Headless: syncs the installed-PWA icon badge (Badging API) to
                    the global unread count. Renders nothing; mounted app-wide so
                    the badge tracks the count on every authenticated page. */}
                <AppBadgeSync />
                {/* Headless: reloads a tab once when it calls a Server Action
                    from an older deployment (BUG-006164). Renders nothing. */}
                <StaleDeploymentReload />
                <PushNotificationProvider>{children}</PushNotificationProvider>
                {/* ONE route-aware platform Help FAB (replaces the 3 per-module
                    FABs). Server-resolves the viewer's visible+filtered lanes,
                    then the client FAB picks the lane for the current route and
                    hides itself on auth/public/onboarding surfaces. Mounted here
                    (root server layout) because app/(routes)/layout.tsx is a
                    client component and can't run the server-only resolver. */}
                {/* Suspense-isolated: the mount reads auth cookies (dynamic);
                    wrapping it keeps the static shell of public pages prerenderable
                    instead of forcing the whole tree dynamic. */}
                <Suspense fallback={null}>
                  <PlatformGuideFabMount />
                </Suspense>
                <InstallPromptBanner />
                <SpeedInsights />
              </PWAProvider>
            </AuthProvider>
          </ThemeProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
