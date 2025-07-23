import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/providers/toast-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Script from 'next/script';

const poppins = Poppins({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins'
});

export const metadata: Metadata = {
  title: 'MyJKKN',
  description: 'Central Hub Application for JKKN Institutions'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={`${poppins.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
          storageKey='theme-preference'
        >
          <ToastProvider />
          {children}
          <SpeedInsights />
        </ThemeProvider>
        <Script
          src='https://accounts.google.com/gsi/client'
          async
          defer
        ></Script>
      </body>
    </html>
  );
}
