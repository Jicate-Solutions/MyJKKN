// components/meta-pixel-loader.tsx
//
// Client React component that injects the Meta Pixel base code into the
// page. Renders NOTHING if `pixelId` is empty (i.e. no policy configured
// for the current institution).
//
// Usage — typically rendered in a layout or per-page wrapper that has
// already resolved the institution's `meta.capi.pixel_id` policy server-side:
//
//   const pixelId = await getPolicyString('meta.capi.pixel_id', '', institutionId);
//   const enabled  = await getPolicyBool('meta.capi.is_enabled', false, institutionId);
//   return (<>
//     {enabled && pixelId && <MetaPixelLoader pixelId={pixelId} />}
//     {children}
//   </>);
//
// Once mounted, `window.fbq` is available globally. To fire an event with
// the same dedup id as the server CAPI call:
//
//   declare global { interface Window { fbq?: (...args: unknown[]) => void } }
//   window.fbq?.('track', 'Lead', { value: 100, currency: 'INR' },
//               { eventID: `lead-${leadId}` });
//
// The component is intentionally minimal — no automatic PageView fire, no
// auto event dispatch. That keeps dedupe explicit: each call-site must
// emit the same `eventID` the server hook uses.

'use client';

import Script from 'next/script';
import { useEffect } from 'react';

export interface MetaPixelLoaderProps {
  /** Meta Pixel id (numeric string). Empty / undefined → component renders null. */
  pixelId: string | null | undefined;
  /**
   * When true, fires a `PageView` automatically once the script loads.
   * Default false — most callers will want to fire PageView explicitly with
   * an `eventID` that matches the server CAPI call (otherwise PageView
   * dedup is broken).
   */
  autoPageView?: boolean;
  /**
   * Strategy passed to next/script. Default `afterInteractive` — the Pixel
   * SDK is non-critical; don't block first paint.
   */
  strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive';
}

/**
 * Renders the Meta Pixel SDK loader. Returns null if `pixelId` is empty —
 * safe to drop into a layout unconditionally.
 */
export function MetaPixelLoader({
  pixelId,
  autoPageView = false,
  strategy = 'afterInteractive',
}: MetaPixelLoaderProps) {
  // Optionally fire PageView once the SDK has had a tick to attach `fbq`.
  // We DON'T emit a dedup id here — callers who want dedup should call fbq
  // themselves from the page that knows the event_id.
  useEffect(() => {
    if (!autoPageView || !pixelId || pixelId.trim().length === 0) return;
    // Defer slightly to give the Script tag a chance to mount + init.
    const t = window.setTimeout(() => {
      const w = window as Window & {
        fbq?: (...args: unknown[]) => void;
      };
      if (typeof w.fbq === 'function') {
        try {
          w.fbq('track', 'PageView');
        } catch {
          /* swallow — analytics must never throw */
        }
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [pixelId, autoPageView]);

  if (!pixelId || pixelId.trim().length === 0) {
    return null;
  }

  const trimmed = pixelId.trim();

  // The base Pixel snippet. We init the pixel but do NOT auto-track
  // PageView — that's controlled by the `autoPageView` prop above.
  const snippet = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${trimmed}');
  `.trim();

  return (
    <>
      <Script
        id={`meta-pixel-${trimmed}`}
        strategy={strategy}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: snippet }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(
            trimmed
          )}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

export default MetaPixelLoader;
