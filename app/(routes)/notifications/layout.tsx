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

import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
  weight: ['400', '500', '600'],
  style: ['normal']
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-plex-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
  weight: ['400', '500', '600']
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
