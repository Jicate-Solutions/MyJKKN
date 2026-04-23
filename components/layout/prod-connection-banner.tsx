// components/layout/prod-connection-banner.tsx
// ============================================================================
// Red banner shown when NEXT_PUBLIC_SUPABASE_URL points at the production
// Supabase project AND we are NOT running on the actual production deployment
// (VERCEL_ENV !== 'production'). Rendered server-side in app/layout.tsx so it
// survives route navigation. Non-dismissible by design.
//
// Purpose: prevent accidental writes to production when local dev (or a rogue
// preview deploy) is env-swapped to the prod Supabase project.
//
// Render matrix:
//   | VERCEL_ENV  | Supabase URL | Banner |
//   | production  | prod         | hide   | actual prod deploy - noise
//   | preview     | prod         | SHOW   | dangerous rogue preview
//   | preview     | staging      | hide   | safe
//   | undefined   | prod         | SHOW   | local `npm run dev` swapped to prod
//   | undefined   | staging      | hide   | safe
// ============================================================================

const PROD_SUPABASE_REF = 'kvizhngldtiuufknvehv';

export function ProdConnectionBanner() {
  if (process.env.VERCEL_ENV === 'production') return null;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!supaUrl.includes(PROD_SUPABASE_REF)) return null;

  return (
    <div
      role='alert'
      aria-live='polite'
      className='fixed top-0 inset-x-0 z-[9999] bg-red-600 text-white text-center py-2 px-4 font-semibold text-sm shadow-lg pointer-events-auto'
    >
      ⚠️ CONNECTED TO PROD DATABASE — every write mutates real production data
    </div>
  );
}
