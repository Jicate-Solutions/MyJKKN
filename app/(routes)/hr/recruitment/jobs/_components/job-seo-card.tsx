'use client';

/**
 * "Website SEO" card for the create / edit job forms.
 *
 * Edits hr_recruitment_jobs.seo_* — text that jkkn.ac.in/careers puts in the
 * page <head> (search-result title and snippet, share preview) and NEVER on the
 * page itself. Applicants keep seeing the job title and description above.
 * Every field is optional: left empty, the website builds SEO from the job.
 */

import { useState } from 'react';
import { Check, Globe, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { HRRecruitmentJob } from '@/types/hr-recruitment';

// Hard limits mirror the DB checks (migration 20261006113500); the "ideal"
// numbers are what Google shows before truncating.
export const SEO_TITLE_MAX = 70;
export const SEO_TITLE_IDEAL = 60;
export const SEO_DESCRIPTION_MAX = 170;
export const SEO_DESCRIPTION_IDEAL = 160;
export const SEO_KEYWORDS_MAX = 15;

export interface JobSeoValue {
  title: string;
  description: string;
  keywords: string[];
  ogImage: string;
  noindex: boolean;
}

export const EMPTY_JOB_SEO: JobSeoValue = { title: '', description: '', keywords: [], ogImage: '', noindex: false };

export function jobSeoFromJob(job: HRRecruitmentJob): JobSeoValue {
  return {
    title: job.seo_title ?? '',
    description: job.seo_description ?? '',
    keywords: job.seo_keywords ?? [],
    ogImage: job.seo_og_image ?? '',
    noindex: job.seo_noindex ?? false,
  };
}

/** Form value → hr_recruitment_jobs columns. Blank text is stored as NULL ("auto"). */
export function jobSeoToColumns(v: JobSeoValue) {
  return {
    seo_title: v.title.trim() || null,
    seo_description: v.description.trim() || null,
    seo_keywords: v.keywords.map((k) => k.trim()).filter(Boolean),
    seo_og_image: v.ogImage.trim() || null,
    seo_noindex: v.noindex,
  };
}

/** First problem that would make the DB reject the save, or null. */
export function validateJobSeo(v: JobSeoValue): string | null {
  if (v.title.trim().length > SEO_TITLE_MAX) return `SEO title must be ${SEO_TITLE_MAX} characters or fewer.`;
  if (v.description.trim().length > SEO_DESCRIPTION_MAX) {
    return `SEO description must be ${SEO_DESCRIPTION_MAX} characters or fewer.`;
  }
  if (v.keywords.length > SEO_KEYWORDS_MAX) return `Use at most ${SEO_KEYWORDS_MAX} SEO keywords.`;
  if (v.ogImage.trim() && !/^https:\/\//.test(v.ogImage.trim())) return 'Share image must be an https:// link.';
  return null;
}

function Counter({ length, ideal, max }: { length: number; ideal: number; max: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        length > max ? 'text-destructive font-medium' : length > ideal ? 'text-amber-600' : 'text-muted-foreground'
      )}
    >
      {length}/{ideal}
    </span>
  );
}

interface JobSeoCardProps {
  value: JobSeoValue;
  onChange: (next: JobSeoValue) => void;
  /** Visible job title — shown in the preview when no SEO title is set. */
  jobTitle: string;
  institutionName?: string | null;
}

export function JobSeoCard({ value, onChange, jobTitle, institutionName }: JobSeoCardProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const set = <K extends keyof JobSeoValue>(key: K, v: JobSeoValue[K]) => onChange({ ...value, [key]: v });

  const addKeywords = (raw: string) => {
    const incoming = raw.split(',').map((k) => k.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const seen = new Set(value.keywords.map((k) => k.toLowerCase()));
    const next = [...value.keywords];
    for (const k of incoming) {
      if (!seen.has(k.toLowerCase()) && next.length < SEO_KEYWORDS_MAX) {
        next.push(k);
        seen.add(k.toLowerCase());
      }
    }
    set('keywords', next);
    setKeywordInput('');
  };

  const autoTitle = [jobTitle.trim() || 'Job title', institutionName].filter(Boolean).join(' at ');
  const previewTitle = value.title.trim() || autoTitle;
  const previewDescription =
    value.description.trim() || 'Built automatically from the job’s department, location, experience and qualification.';
  const haystack = `${value.title} ${value.description}`.toLowerCase();

  return (
    <Card id="website-seo">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sky-500/10 flex items-center justify-center flex-shrink-0">
            <Globe className="h-4 w-4 text-sky-600" />
          </div>
          <div>
            <CardTitle className="text-base">Website SEO</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hidden from applicants — used only by Google and link previews on jkkn.ac.in/careers. Leave empty for automatic SEO.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Keywords */}
        <div className="space-y-1.5">
          <Label className="text-sm">Focus keywords</Label>
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addKeywords(keywordInput);
              }
            }}
            onBlur={() => addKeywords(keywordInput)}
            placeholder="e.g. CCTV operator job, Komarapalayam — press Enter to add"
            disabled={value.keywords.length >= SEO_KEYWORDS_MAX}
          />
          {value.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {value.keywords.map((k) => {
                const used = haystack.includes(k.toLowerCase());
                return (
                  <Badge
                    key={k}
                    variant="outline"
                    className={cn('gap-1', used ? 'border-emerald-500/50 text-emerald-700' : 'text-muted-foreground')}
                    title={used ? 'Appears in the SEO title or description' : 'Not yet in the SEO title or description'}
                  >
                    {used ? <Check className="h-3 w-3" /> : null}
                    {k}
                    <button
                      type="button"
                      aria-label={`Remove ${k}`}
                      onClick={() => set('keywords', value.keywords.filter((x) => x !== k))}
                      className="ml-0.5 rounded hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Google ranks on the title and description, so put your main keywords there — a ✓ shows they are used.
          </p>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">SEO title</Label>
            <Counter length={value.title.trim().length} ideal={SEO_TITLE_IDEAL} max={SEO_TITLE_MAX} />
          </div>
          <Input
            value={value.title}
            maxLength={SEO_TITLE_MAX}
            onChange={(e) => set('title', e.target.value)}
            placeholder={autoTitle}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">SEO description</Label>
            <Counter length={value.description.trim().length} ideal={SEO_DESCRIPTION_IDEAL} max={SEO_DESCRIPTION_MAX} />
          </div>
          <Textarea
            value={value.description}
            maxLength={SEO_DESCRIPTION_MAX}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            placeholder="One or two sentences: the role, the college and town, who can apply."
          />
        </div>

        {/* Google preview */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Google preview</p>
          <p className="text-xs text-muted-foreground">www.jkkn.ac.in › careers</p>
          <p className="text-[#1a0dab] dark:text-sky-400 text-base leading-snug truncate">{previewTitle}</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{previewDescription}</p>
        </div>

        {/* Share image + noindex */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Share image link (optional)</Label>
            <Input
              value={value.ogImage}
              onChange={(e) => set('ogImage', e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label className="text-sm">Hide from Google</Label>
              <p className="text-xs text-muted-foreground mt-0.5">For test jobs. Still listed and open for applications.</p>
            </div>
            <Switch checked={value.noindex} onCheckedChange={(v) => set('noindex', v)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
