// components/health/survey-banner.tsx
// Survey page header: optional banner image (health_surveys.banner_url) + a
// centred title block. Shared by /survey, /health/surveys and /ws/[token] so
// every entry point looks the same. Everything sits in the same 850px column
// as the survey card.

import type { ReactNode } from 'react';

export function SurveyBanner({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) return null;
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(16,40,35,0.09)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, natural aspect (never crop poster text) */}
      <img src={url} alt={alt} className="block h-auto w-full" />
    </div>
  );
}

export function SurveyHero({
  bannerUrl,
  eyebrow,
  title,
  description,
  aside,
}: {
  bannerUrl?: string | null;
  /** Small pill above the title, e.g. the program name. */
  eyebrow?: string | null;
  title: string;
  description?: string | null;
  /** e.g. a "Submitted" badge. */
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[850px] space-y-5">
      <SurveyBanner url={bannerUrl} alt={title} />
      <div className="space-y-2 text-center">
        {eyebrow && (
          <span className="inline-flex rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-teal-700">
            {eyebrow}
          </span>
        )}
        <h1 className="text-[clamp(24px,4vw,36px)] font-extrabold leading-tight tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mx-auto max-w-[620px] leading-relaxed text-slate-500">{description}</p>
        )}
        {aside && <div className="flex justify-center pt-1">{aside}</div>}
      </div>
    </div>
  );
}
