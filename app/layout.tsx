import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { PushNotificationProvider } from '@/components/notifications/push-notification-provider';
import { PWAProvider } from '@/components/pwa/pwa-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/hooks/use-auth-provider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Script from 'next/script';

const poppins = Poppins({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins'
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  title: 'MyJKKN',
  description:
    'Central Hub Application for JKKN Institutions - Manage admissions, students, billing, attendance and more',
  generator: 'Next.js',
  manifest: '/manifest.json',
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
  authors: [{ name: 'BOOBALAN A' }],
  creator: 'BOOBALAN A',
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
    <html lang='en' suppressHydrationWarning>
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
      <body className={`${poppins.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
          storageKey='theme-preference'
        >
          <AuthProvider>
            <PWAProvider>
              <PushNotificationProvider>{children}</PushNotificationProvider>
              <SpeedInsights />
            </PWAProvider>
          </AuthProvider>
        </ThemeProvider>
        <Script
          src='https://accounts.google.com/gsi/client'
          strategy='lazyOnload'
        />
      </body>
    </html>
  );
}
