'use client';

/**
 * BottomNavQrHandle — the curved tab that rises out of the middle of the
 * mobile bottom-nav strip and opens the signed-in person's own JKKN ID QR.
 *
 * Two ways in, both landing on the SAME dialog the Users detail page shows
 * (components/identity/jkkn-qr-dialog.tsx):
 *   1. tap the tab
 *   2. drag/swipe UP from the tab — the handle shape is the promise, so the
 *      gesture a handle invites has to work, not just the tap.
 *
 * Why it is a SIBLING of the nav and not a child: the nav strip carries
 * `overflow-x-hidden`, and a box with a hidden overflow on one axis clips the
 * other axis too — a bump drawn above the strip's top edge would be cut off.
 * So it is positioned `fixed` and the strip's measured height is passed in as
 * `bottomOffset`, which keeps it glued to the top edge even when the submenu
 * panel expands and the strip grows taller.
 *
 * Fail-soft: renders nothing until a JKKN ID for this user is actually known.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JkknQrDialog } from '@/components/identity/jkkn-qr-dialog';
import { useMyJkknId } from '@/hooks/use-my-jkkn-id';

interface BottomNavQrHandleProps {
  /** profiles.id of the signed-in user. */
  userId: string | undefined;
  /** Their name, for the dialog header and the PNG file name. */
  personName?: string;
  /** Measured height of the nav strip, in px — the handle sits on top of it. */
  bottomOffset: number;
}

/** Vertical travel (px) that turns a drag on the handle into "open". */
const SWIPE_OPEN_THRESHOLD = 24;

/**
 * The lifted top edge, in the 120×26 viewBox.
 *
 * y=25.5 is the strip's border line (the flat runs sit exactly on it), the
 * rise tops out at y=8, and the two cubics are the concave shoulders that make
 * the lift continuous with the flat edge on either side. Control points are
 * mirrored about x=60 so the curve is symmetrical.
 */
const EDGE_PATH = 'M0,25.5 H18 C30,25.5 30,8 60,8 C90,8 90,25.5 102,25.5 H120';

export function BottomNavQrHandle({
  userId,
  personName,
  bottomOffset
}: BottomNavQrHandleProps) {
  const { data: jkknId } = useMyJkknId(userId);
  const [qrOpen, setQrOpen] = useState(false);
  // SVG ids are document-global; useId keeps this one unique even if the nav
  // is ever mounted twice.
  const edgeGradientId = `qr-edge-${useId().replace(/:/g, '')}`;

  // Gesture bookkeeping. `openedBySwipe` suppresses the synthetic click that
  // a touch sequence still fires after the swipe already opened the dialog —
  // without it, the toggle would open and then immediately be re-triggered.
  const startYRef = useRef<number | null>(null);
  const openedBySwipeRef = useRef(false);

  const open = useCallback(() => setQrOpen(true), []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0]?.clientY ?? null;
    openedBySwipeRef.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (openedBySwipeRef.current || startYRef.current === null) return;
      const y = e.touches[0]?.clientY;
      if (y === undefined) return;
      // Negative delta = finger travelling up the screen.
      if (startYRef.current - y >= SWIPE_OPEN_THRESHOLD) {
        openedBySwipeRef.current = true;
        open();
      }
    },
    [open]
  );

  const handleTouchEnd = useCallback(() => {
    startYRef.current = null;
  }, []);

  const handleClick = useCallback(() => {
    if (openedBySwipeRef.current) {
      openedBySwipeRef.current = false;
      return;
    }
    open();
  }, [open]);

  if (!jkknId) return null;

  return (
    <>
      <div
        className={cn(
          // z-[81] = one above the strip (z-[80]): the tab has to paint OVER
          // the strip's top border for the curve to read as one edge.
          'pointer-events-none fixed inset-x-0 z-[81] flex justify-center lg:hidden',
          // Platform convention (tailwind.config.ts `modal-open` variant):
          // anything stacked above the dialog layer steps aside while a modal
          // is on screen — including the QR dialog this tab itself opens.
          'modal-open:hidden'
        )}
        // One pixel of overlap: the strip's top border owns the strip's topmost
        // pixel, and this curve has to land ON that line, not beside it.
        style={{ bottom: bottomOffset - 1 }}
      >
        <button
          type="button"
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          aria-label={`Show my JKKN ID QR code (${jkknId})`}
          title="My JKKN ID QR"
          className={cn(
            // Wide and shallow, and it scales with the viewport: 96px at 320px
            // wide, 120px on a large phone. Width is what keeps the curve
            // gentle — a narrow bump of the same height reads as a dome stuck
            // onto the bar instead of the bar's own edge lifting.
            'group pointer-events-auto relative h-[26px] w-[clamp(6rem,26vw,7.5rem)]'
          )}
          style={{
            // The handle owns the whole gesture: without this, a slow upward
            // drag scrolls the page behind the nav instead of pulling the tab.
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none'
          }}
        >
          {/* The strip's own top edge, lifted — not a tab parked on top of it.
              One path leaves the flat border, sweeps up over the glyph through
              two concave shoulders and settles back down onto the same line.
              The fill is the strip's background and runs past the baseline to
              y=26, painting out the border underneath the rise, so there is no
              seam to see.

              The outline is a hairline that FADES to nothing at both ends
              (the gradient below), so it never terminates in a visible stub
              against the bar's flat border.

              `preserveAspectRatio="none"` lets the shape follow the clamped
              width; `vector-effect: non-scaling-stroke` keeps the outline a
              true hairline while it does. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 120 26"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <linearGradient id={edgeGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0" />
                <stop offset="22%" stopColor="#818cf8" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.95" />
                <stop offset="78%" stopColor="#818cf8" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${EDGE_PATH} V26 H0 Z`}
              className="fill-background transition-colors group-active:fill-accent"
            />
            <path
              d={EDGE_PATH}
              fill="none"
              stroke={`url(#${edgeGradientId})`}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              style={{
                // The faint violet bloom the curve sits in on the reference.
                filter: 'drop-shadow(0 -2px 5px rgba(129,140,248,0.35))'
              }}
            />
          </svg>
          {/* Sized and parked to CLEAR the arc, not to fill it. The interior
              is only 17.5px tall (apex y=8 → baseline y=25.5), so a 15px glyph
              at bottom-5px crossed the curve; 13px at bottom-3px centres it
              with ~2px of air above and below. */}
          <QrCode
            className="absolute bottom-[3px] left-1/2 h-[13px] w-[13px] -translate-x-1/2 text-muted-foreground"
            strokeWidth={2}
          />
        </button>
      </div>

      <JkknQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        jkknId={jkknId}
        personName={personName}
      />
    </>
  );
}
