// app/student-form/[token]/submitted/page.tsx
//
// Success landing after the student finalizes their form. Shown once; the
// token has been consumed and any subsequent visit to the wizard route
// redirects to /expired. Bilingual confirmation only — no PII.
//
// 2026-05-19: Redesigned with celebratory confetti, animated check icon,
// warm welcome copy, and "what happens next" guidance. Mobile-first.

'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  PhoneCall,
  FileCheck,
  Sparkles,
} from 'lucide-react';

export default function SubmittedPage() {
  // Choreographed confetti — three timed bursts from center, left, right,
  // then one final center pop. Total run ≈ 2.5s. Stops automatically so it
  // doesn't drain the student's phone battery on the desk.
  useEffect(() => {
    const colors = [
      '#10b981', // emerald-500 — JKKN brand-adjacent
      '#34d399', // emerald-400
      '#fbbf24', // amber-400
      '#f59e0b', // amber-500
      '#ec4899', // pink-500
      '#8b5cf6', // violet-500
    ];

    const burst = (origin: { x: number; y: number }) => {
      confetti({
        particleCount: 60,
        spread: 75,
        origin,
        colors,
        gravity: 1.1,
        scalar: 1.0,
        ticks: 200,
      });
    };

    burst({ x: 0.5, y: 0.6 });
    const t1 = setTimeout(() => burst({ x: 0.15, y: 0.7 }), 250);
    const t2 = setTimeout(() => burst({ x: 0.85, y: 0.7 }), 500);
    const t3 = setTimeout(
      () =>
        confetti({
          particleCount: 90,
          spread: 100,
          startVelocity: 35,
          origin: { x: 0.5, y: 0.55 },
          colors,
          gravity: 1.2,
          scalar: 1.1,
        }),
      900,
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-white to-amber-50 relative overflow-hidden">
      {/* Decorative background blobs — pure CSS, no JS animation cost */}
      <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-amber-200/30 blur-3xl pointer-events-none" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 p-8 space-y-6"
      >
        {/* Animated check icon */}
        <div className="flex justify-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: 0.2,
            }}
            className="relative"
          >
            <div className="absolute inset-0 bg-emerald-400 blur-2xl opacity-40" aria-hidden />
            <CheckCircle2
              className="relative h-24 w-24 text-emerald-500 drop-shadow-lg"
              strokeWidth={1.5}
            />
          </motion.div>
        </div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-center space-y-1"
        >
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-emerald-700 flex items-center justify-center gap-2">
            Thank You!
            <Sparkles className="h-6 w-6 text-amber-500" aria-hidden />
          </h1>
          <p className="text-xl font-semibold text-emerald-600">நன்றி!</p>
        </motion.div>

        {/* Welcome subtitle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-center space-y-1"
        >
          <p className="text-base font-medium text-foreground">
            Welcome to the JKKN family
          </p>
          <p className="text-sm text-muted-foreground">
            JKKN குடும்பத்திற்கு வரவேற்கிறோம்
          </p>
        </motion.div>

        {/* Submission confirmation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="rounded-lg bg-emerald-50 border border-emerald-100 p-4 text-center"
        >
          <p className="text-sm font-medium text-emerald-800">
            Your application has been received successfully.
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            உங்கள் விண்ணப்பம் வெற்றிகரமாக பெறப்பட்டது.
          </p>
        </motion.div>

        {/* What happens next — visual checklist */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.4 }}
          className="space-y-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What happens next / அடுத்து என்ன
          </p>
          <ul className="space-y-2.5">
            <NextStep
              icon={<Clock className="h-4 w-4" />}
              en="Our admission team reviews your details"
              ta="சேர்க்கைக் குழு உங்கள் விவரங்களைப் பார்க்கும்"
            />
            <NextStep
              icon={<PhoneCall className="h-4 w-4" />}
              en="We'll call you on the mobile you provided"
              ta="நீங்கள் கொடுத்த எண்ணில் அழைப்போம்"
            />
            <NextStep
              icon={<FileCheck className="h-4 w-4" />}
              en="Keep your documents ready for verification"
              ta="ஆவணங்களை சரிபார்ப்புக்கு தயாராக வைக்கவும்"
            />
          </ul>
        </motion.div>

        {/* Hand-back instruction */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.4 }}
          className="text-center text-xs text-muted-foreground border-t border-border pt-4"
        >
          Please return this phone to the admission desk.
          <br />
          <span className="opacity-80">
            உங்கள் கைபேசியை அலுவலகத்தில் ஒப்படைக்கவும்.
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
}

function NextStep({
  icon,
  en,
  ta,
}: {
  icon: React.ReactNode;
  en: string;
  ta: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{en}</p>
        <p className="text-xs text-muted-foreground">{ta}</p>
      </div>
    </li>
  );
}
