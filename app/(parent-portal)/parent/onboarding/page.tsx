'use client';

/** Onboarding carousel — 3 intro slides with Skip / Next → login. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Wallet, BookOpenCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const SLIDES = [
  {
    icon: CalendarCheck,
    title: 'Attendance at a glance',
    body: 'See class and exam attendance for each child, with a clear monthly view.',
  },
  {
    icon: Wallet,
    title: 'Fees made simple',
    body: 'View outstanding bills and pay securely — receipts kept in one place.',
  },
  {
    icon: BookOpenCheck,
    title: 'Homework & more',
    body: 'Track homework, achievements, announcements and raise concerns directly.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-3xl bg-[#0b6d41]/10 text-[#0b6d41]">
          <Icon className="h-12 w-12" />
        </div>
        <h2 className="text-xl font-bold">{slide.title}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{slide.body}</p>
      </div>

      <div className="flex items-center justify-center gap-2 py-6">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 rounded-full transition-all',
              i === index ? 'w-6 bg-[#0b6d41]' : 'w-2 bg-[#0b6d41]/30'
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.replace('/parent/login')}
          className="px-2 py-2 text-sm font-medium text-muted-foreground"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => (last ? router.replace('/parent/login') : setIndex((i) => i + 1))}
          className="rounded-2xl bg-gradient-to-r from-[#0b6d41] to-[#0a5733] px-6 py-3 font-semibold text-white shadow-md"
        >
          {last ? 'Get Started' : 'Next ›'}
        </button>
      </div>
    </div>
  );
}
