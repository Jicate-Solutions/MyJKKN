import Link from 'next/link';

/**
 * Footer text is config-driven: JKKN branding decisions happen at the
 * institutional level, not the component level. Edit the constants
 * (not the JSX) when the wording needs updating.
 *
 * Design rationale: this footer shows on every page for staff using
 * MyJKKN 6-8 hours/day — it's prime surface area to reinforce "why
 * we do this work", not dev vanity credit or legal boilerplate.
 */
const BRAND = 'JKKN Institutions';
// Official JKKN Vision — provided verbatim by MD/CAIO. Do not paraphrase.
const VISION = 'To be a global innovation solution provider for the ever-changing needs of the society';

export function Footer() {
  return (
    <div className='supports-backdrop-blur:bg-background/60 z-20 w-full shadow bg-background/95 backdrop-blur'>
      <div className='mx-4 md:mx-8 flex h-14 items-center'>
        <p className='text-xs md:text-sm leading-loose text-muted-foreground truncate'>
          <Link
            href='/'
            className='font-medium text-foreground/80 hover:text-foreground transition-colors'
          >
            {BRAND}
          </Link>
          <span className='mx-2 text-muted-foreground/50'>·</span>
          <span className='italic'>{VISION}</span>
        </p>
      </div>
    </div>
  );
}
