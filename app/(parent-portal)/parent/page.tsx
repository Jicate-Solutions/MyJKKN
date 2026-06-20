'use client';

/** Splash — branded entry point with "Get Started". */
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export default function ParentSplashPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-between px-6 py-12 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-[#0b6d41] to-[#0a4a2d] text-white shadow-lg">
          <GraduationCap className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0b6d41]">MyJKKN</h1>
          <p className="text-sm font-semibold text-[#0b6d41]/80">Parent Portal</p>
          <p className="mt-0.5 text-xs italic text-muted-foreground">Your Success — Our Tradition</p>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">
          A window into your child&apos;s school life — attendance, fees, homework,
          achievements and more, in one place.
        </p>
      </div>

      <div className="w-full space-y-3">
        <Link
          href="/parent/onboarding"
          className="block w-full rounded-2xl bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-3.5 font-semibold text-white shadow-md"
        >
          Get Started
        </Link>
        <p className="text-xs text-muted-foreground">© 2026 JKKN Educational Institutions</p>
      </div>
    </div>
  );
}
