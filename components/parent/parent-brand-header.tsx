/**
 * Parent Portal — branded auth header (MyJKKN). Green gradient banner with the
 * graduation-cap logo, "MyJKKN" wordmark, a yellow "Parent Portal" eyebrow, and
 * the JKKN tagline. Shared across login / register / forgot for a consistent,
 * on-brand entry experience.
 */
export function ParentBrandHeader({ subtitle = 'Parent Portal' }: { subtitle?: string }) {
  return (
    <div className="relative overflow-hidden rounded-b-[2.75rem] bg-gradient-to-br from-[#0e7a49] via-[#0a5d37] to-[#063a22] px-6 pb-12 pt-14 text-center text-white shadow-xl">
      <div className="relative">
        {/* JKKN logo on a white card so its green/pink artwork reads on green */}
        <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-3xl bg-white p-3.5 shadow-lg ring-4 ring-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jkkn.png" alt="JKKN" className="h-14 w-auto object-contain" />
        </div>
        <p className="text-xl font-extrabold tracking-tight drop-shadow-sm">MyJKKN</p>
        <p className="mt-0.5 text-xs font-medium text-white/85">JKKN Educational Institutions</p>
        <span className="mt-1.5 inline-block rounded-full bg-[#ffde59]/15 px-3 py-0.5 text-xs font-semibold text-[#ffde59] ring-1 ring-[#ffde59]/30">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

export function ParentAuthFooter() {
  return (
    <p className="pb-6 pt-8 text-center text-[11px] text-muted-foreground">
      © 2026 JKKN Educational Institutions
    </p>
  );
}
