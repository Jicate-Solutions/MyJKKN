'use client';

// InstaSolver chooser — "what kind?" (decision I3).
//
// Three large, phone-first cards. Every tappable target clears 44px on the
// smallest screen we support, because the person filing is usually standing in
// front of the problem holding a phone, not sitting at a desk.
//
// The purchase card is the only conditional one. `canRaisePurchase` is decided
// server-side in page.tsx from procurement.request_create; when it is false the
// card still renders — as a plain panel with the real next step — instead of
// disappearing or linking somewhere that will bounce (rule #27).

import Link from 'next/link';
import { ChevronRight, MessageSquareWarning, ShoppingCart, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ChooserClientProps {
  /** Resolved server-side from `procurement.request_create`. */
  canRaisePurchase: boolean;
}

const CARD_BASE =
  'group block rounded-xl border bg-background shadow-sm transition-colors ' +
  'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2';

const ICON_WRAP =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground';

export function ChooserClient({ canRaisePurchase }: ChooserClientProps) {
  return (
    <div className="mt-2 flex flex-col gap-4">
      <Link href="/instasolver/broken" className={CARD_BASE}>
        <div className="flex min-h-[88px] items-center gap-4 p-5">
          <span className={ICON_WRAP} aria-hidden="true">
            <Wrench className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">Something is broken</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              A tap, a fan, a light, a leak, a loose wire. It goes to the people who fix things.
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>

      <Link href="/instasolver/complaint" className={CARD_BASE}>
        <div className="flex min-h-[88px] items-center gap-4 p-5">
          <span className={ICON_WRAP} aria-hidden="true">
            <MessageSquareWarning className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">I have a complaint</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              About a service, a person, or how you were treated. You can send it without
              giving your name.
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>

      {canRaisePurchase ? (
        <Link href="/procurement/requests/new" className={CARD_BASE}>
          <div className="flex min-h-[88px] items-center gap-4 p-5">
            <span className={ICON_WRAP} aria-hidden="true">
              <ShoppingCart className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-semibold">We need to buy something</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Equipment, supplies, a repair someone has to be paid for. This opens a
                purchase request in Procurement.
              </span>
            </span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        </Link>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex min-h-[88px] items-center gap-4 p-5">
            <span className={`${ICON_WRAP} text-muted-foreground`} aria-hidden="true">
              <ShoppingCart className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="text-lg font-semibold text-muted-foreground">
                We need to buy something
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Direct purchase requests open soon — for now ask your HOD to raise it in
                Procurement.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
