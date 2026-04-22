import Link from 'next/link';

/**
 * Footer text is config-driven: JKKN branding decisions happen at the
 * institutional level, not the component level. Edit these constants
 * (not the JSX) when the tagline or copyright line needs updating.
 *
 * Design rationale:
 * - Left: institutional identity + short mission anchor. This footer shows
 *   on every page for staff using MyJKKN 6-8 hours/day — it's prime surface
 *   area to reinforce "why we do this work", not dev vanity credit.
 * - Right: quiet copyright, standard legal anchor without shouting.
 */
const BRAND = 'JKKN Institutions';
const MISSION_ANCHOR = 'Knowledge to Wisdom · Learners to Leaders';
const COPYRIGHT_LINE = `© ${new Date().getFullYear()} J.K.K. Nattraja Educational Institutions`;

export function Footer() {
  return (
    <div className='supports-backdrop-blur:bg-background/60 z-20 w-full shadow bg-background/95 backdrop-blur'>
      <div className='mx-4 md:mx-8 flex h-14 items-center justify-between gap-4'>
        <p className='text-xs md:text-sm leading-loose text-muted-foreground truncate'>
          <Link
            href='/'
            className='font-medium text-foreground/80 hover:text-foreground transition-colors'
          >
            {BRAND}
          </Link>
          <span className='mx-2 text-muted-foreground/50'>·</span>
          <span className='italic'>{MISSION_ANCHOR}</span>
        </p>
        <p className='hidden md:block text-[11px] text-muted-foreground/60 whitespace-nowrap'>
          {COPYRIGHT_LINE}
        </p>
      </div>
    </div>
  );
}
