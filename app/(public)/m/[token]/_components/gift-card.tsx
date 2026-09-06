'use client';

/**
 * GiftCard — the Family Moments public card (Father's Day theme).
 *
 * Mobile-first: fathers open this from a WhatsApp link. The card is the
 * emotional moment (child's message/drawing); the PWA install CTA appears
 * BELOW the moment, never before it.
 *
 * Install CTA behavior:
 *   - Chromium (Android Chrome etc): captures `beforeinstallprompt`, fires
 *     the native install dialog on tap.
 *   - iOS Safari: no beforeinstallprompt — shows Add-to-Home-Screen steps.
 *   - Already installed (standalone): shows "Open MyJKKN" instead.
 *
 * Tracking: install taps POST to /api/public/moments/[token]/track.
 * (Page opens are recorded server-side by the page itself.)
 *
 * NOTE: the Tamil greeting line is a single fixed phrase — needs native
 * review before send (CLAUDE.md rule #24).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface GiftCardProps {
  token: string;
  childName: string;
  childClass: string | null;
  recipientName: string | null;
  contentType: 'auto' | 'text' | 'image';
  messageText: string | null;
  mediaUrl: string | null;
  schoolName: string;
}

function firstName(full: string | null): string {
  if (!full) return 'Appa';
  const cleaned = full.replace(/[.,]/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  // Many father names are stored "KARTHIK R" / "DHANASEKAR M S" — take the
  // longest leading word as the callable name.
  return parts[0] ?? full;
}

function track(token: string, event: 'install_click' | 'push_subscribed') {
  // Fire-and-forget; the card never blocks on analytics.
  fetch(`/api/public/moments/${token}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {});
}

export function GiftCard({
  token,
  childName,
  childClass,
  recipientName,
  contentType,
  messageText,
  mediaUrl,
  schoolName,
}: GiftCardProps) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent;
    setIsIos(/iPhone|iPad|iPod/i.test(ua));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    track(token, 'install_click');
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch {
        // prompt() can throw if reused; ignore.
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }
    if (isIos) {
      setShowIosSteps(true);
      return;
    }
    // No prompt available (in-app browser etc.) — open the site; the global
    // install banner takes over from there.
    window.open('https://www.jkkn.ai/', '_blank');
  }, [deferredPrompt, isIos, token]);

  const callName = firstName(recipientName);
  const isAuto = contentType === 'auto' || (!messageText && !mediaUrl);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 px-4 py-10 flex flex-col items-center">
      {/* ── The moment ─────────────────────────────── */}
      <div className="w-full max-w-md fm-rise">
        <p className="text-center text-emerald-300/80 text-sm tracking-widest uppercase mb-3">
          {schoolName}
        </p>

        <div className="rounded-3xl bg-amber-50 shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header band */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-6 text-center">
            {/* Tamil greeting — fixed phrase, flagged for native review */}
            <p className="text-amber-50 text-lg font-semibold leading-snug">
              இனிய தந்தையர் தின நல்வாழ்த்துக்கள்
            </p>
            <h1 className="text-white text-2xl font-bold mt-1">
              Happy Father&rsquo;s Day, {callName}!
            </h1>
          </div>

          {/* Child content */}
          <div className="px-6 py-8 text-center">
            {mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public CDN image, dimensions unknown
              <img
                src={mediaUrl}
                alt={`Made for you by ${childName}`}
                className="w-full rounded-2xl border-4 border-amber-200 shadow-md mb-6"
              />
            ) : null}

            {messageText ? (
              <blockquote className="text-stone-800 text-xl leading-relaxed font-medium whitespace-pre-line">
                &ldquo;{messageText}&rdquo;
              </blockquote>
            ) : isAuto ? (
              <blockquote className="text-stone-800 text-xl leading-relaxed font-medium">
                Today is your day. Thank you for everything you do for me,
                every single day.
              </blockquote>
            ) : null}

            <p className="mt-6 text-stone-600 text-base">
              With love,
              <br />
              <span className="text-stone-900 text-lg font-bold">
                {childName}
              </span>
              {childClass ? (
                <span className="text-stone-500"> · {childClass}</span>
              ) : null}
            </p>
          </div>

          <div className="border-t border-amber-200/70 px-6 py-4 text-center">
            <p className="text-stone-500 text-xs">
              {schoolName}
              {' wishes every father a wonderful Father’s Day · June 21, 2026'}
            </p>
          </div>
        </div>
      </div>

      {/* ── The install ask (after the moment) ─────── */}
      <div className="w-full max-w-md mt-8 fm-rise-late">
        <div className="rounded-2xl bg-white/5 border border-white/10 px-6 py-6 text-center backdrop-blur">
          <p className="text-emerald-100 text-base font-medium">
            This is the first of many moments from {childName}&rsquo;s school
            life.
          </p>
          <p className="text-emerald-300/80 text-sm mt-1.5">
            Install MyJKKN to keep this card on your phone — homework,
            announcements and more moments are on the way.
          </p>

          {installed || isStandalone ? (
            <Link
              href="/"
              className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-amber-500 px-8 text-base font-semibold text-white shadow-lg active:scale-[0.98] transition"
            >
              Open MyJKKN
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-amber-500 px-8 text-base font-semibold text-white shadow-lg active:scale-[0.98] transition"
            >
              📱 Install MyJKKN — free
            </button>
          )}

          {showIosSteps ? (
            <div className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-left text-sm text-emerald-50">
              <p className="font-semibold mb-1.5">On iPhone:</p>
              <ol className="list-decimal list-inside space-y-1 text-emerald-100/90">
                <li>
                  Tap the <span className="font-semibold">Share</span> button
                  (square with arrow) below
                </li>
                <li>
                  Scroll and tap{' '}
                  <span className="font-semibold">Add to Home Screen</span>
                </li>
                <li>
                  Tap <span className="font-semibold">Add</span> — MyJKKN
                  appears like an app
                </li>
              </ol>
            </div>
          ) : null}
        </div>

        <p className="text-center text-emerald-500/60 text-xs mt-6">
          MyJKKN · JKKN Educational Institutions
        </p>
      </div>

      {/* Reveal animation — plain style tag (styled-jsx needs a registry in
          the app router; a global style element does not) */}
      <style>{`
        @keyframes fmRise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fm-rise {
          animation: fmRise 0.7s ease-out both;
        }
        .fm-rise-late {
          animation: fmRise 0.7s ease-out 0.45s both;
        }
      `}</style>
    </main>
  );
}
