// app/(routes)/notifications/layout.tsx
//
// Scoped editorial typography just for the /notifications surface.
// The rest of MyJKKN keeps Poppins (loaded in app/layout.tsx). This layout
// loads Newsreader (display serif) + IBM Plex Sans (humanist body) +
// IBM Plex Mono (tabular numerals) and exposes them as CSS variables.
//
// The trajectory cards use these variables for the "Director's Briefing"
// editorial × Bloomberg aesthetic — display serif headline numbers,
// monospace tabular numerals for trajectory readability.

// Self-hosted from app/fonts/ (see app/layout.tsx) so the build never fetches
// fonts.googleapis.com. Fallback faces live in app/fonts/fonts.css (imported
// by the root layout).
import localFont from 'next/font/local';

const newsreader = localFont({
  src: [{ path: '../../fonts/newsreader/Newsreader-Variable.woff2', weight: '400 600', style: 'normal' }],
  variable: '--font-newsreader',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Newsreader Fallback']
});

const plexSans = localFont({
  src: [{ path: '../../fonts/ibm-plex-sans/IBMPlexSans-Variable.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-plex-sans',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['IBM Plex Sans Fallback']
});

const plexMono = localFont({
  src: [
    { path: '../../fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/ibm-plex-mono/IBMPlexMono-SemiBold.woff2', weight: '600', style: 'normal' }
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['IBM Plex Mono Fallback']
});

export default function NotificationsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      {children}
    </div>
  );
}
