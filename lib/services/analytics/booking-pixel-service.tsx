// lib/services/analytics/booking-pixel-service.ts
//
// Booking analytics pixels for the Universal Booking module (Wave-3 scaffold).
// Spec: specs/universal-booking-module-2026-06-12.md — public booking funnel
// measurement. Exposes GA4 + Meta Pixel loaders that the PUBLIC /meet/<handle>
// page can drop in to attribute booking conversions.
//
// Two parts:
//   1. getBookingPixelConfig() — a PURE helper (no React, no DOM) reading the
//      two NEXT_PUBLIC ids. Safe to call from server or client.
//   2. <BookingTrackingScripts /> — a client component that injects the GA4 +
//      Meta Pixel <Script> tags ONLY when the matching id is set. Renders null
//      when nothing is configured — safe to mount unconditionally.
//
// ENV-GATED by construction: both ids are NEXT_PUBLIC_* (intended for the
// browser; pixel ids are not secrets). When unset, getBookingPixelConfig()
// reports enabled:false and the component renders nothing. No throw, ever —
// analytics must never break a booking.
//
// NOT WIRED HERE: the lead/AB agent owns wiring <BookingTrackingScripts /> into
// the public booking page. This module only exports it. See NEEDS.md.
//
// Pattern: components/meta-pixel-loader.tsx (Script-tag injection, null-on-empty).

'use client';

import Script from 'next/script';

// ── config (pure) ────────────────────────────────────────────────────────────

export interface BookingPixelConfig {
  /** GA4 Measurement ID (G-XXXXXXX) or null when unset. */
  ga4MeasurementId: string | null;
  /** Meta Pixel id (numeric string) or null when unset. */
  metaPixelId: string | null;
  /** True when at least one pixel is configured. */
  enabled: boolean;
}

function readPublicId(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  return v.length > 0 ? v : null;
}

/**
 * Resolve the booking pixel config from NEXT_PUBLIC env vars. Pure — no React,
 * no side effects — so it can be called from a server component (to decide
 * whether to mount the loader) or from the client. Reads the two ids by their
 * literal names so Next's static replacement inlines them into the client
 * bundle (dynamic process.env[name] access would NOT be inlined).
 */
export function getBookingPixelConfig(): BookingPixelConfig {
  const ga4MeasurementId = readPublicId(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID);
  const metaPixelId = readPublicId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  return {
    ga4MeasurementId,
    metaPixelId,
    enabled: !!(ga4MeasurementId || metaPixelId),
  };
}

// ── component ────────────────────────────────────────────────────────────────

export interface BookingTrackingScriptsProps {
  /**
   * Strategy passed to next/script. Default `afterInteractive` — pixels are
   * non-critical; don't block first paint.
   */
  strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive';
}

/**
 * Injects GA4 (gtag.js) and/or Meta Pixel base code for the public booking
 * funnel. Each block renders ONLY when its id is set; if neither is set the
 * component returns null. Drop into the public booking page/layout
 * unconditionally — it self-disables when unconfigured.
 *
 * Fires GA4's automatic page_view (gtag config default) and Meta's PageView so
 * the booking funnel is measured out of the box. Conversion events (e.g. a
 * `Schedule`/`generate_lead` on confirmation) are the call site's job.
 */
export function BookingTrackingScripts({
  strategy = 'afterInteractive',
}: BookingTrackingScriptsProps) {
  const { ga4MeasurementId, metaPixelId } = getBookingPixelConfig();

  if (!ga4MeasurementId && !metaPixelId) return null;

  return (
    <>
      {ga4MeasurementId ? (
        <>
          <Script
            id="booking-ga4-src"
            strategy={strategy}
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
              ga4MeasurementId,
            )}`}
          />
          <Script
            id="booking-ga4-init"
            strategy={strategy}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4MeasurementId}');
              `.trim(),
            }}
          />
        </>
      ) : null}

      {metaPixelId ? (
        <>
          <Script
            id="booking-meta-pixel"
            strategy={strategy}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${metaPixelId}');
                fbq('track', 'PageView');
              `.trim(),
            }}
          />
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(
                metaPixelId,
              )}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}

export default BookingTrackingScripts;
