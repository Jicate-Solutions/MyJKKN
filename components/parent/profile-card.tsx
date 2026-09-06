'use client';

/**
 * Parent Portal — dashboard identity header with an expandable details panel.
 * Avatar chevron opens the child switcher. A "details" toggle reveals the
 * Student / Parents tabs inline (collapsed by default, so the header stays
 * clean). Full page lives at /parent/profile.
 */
import { useState } from 'react';
import { ChevronDown, User, School } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentProfile } from '@/hooks/parent/use-parent-profile';
import { ChildSwitcher } from './child-switcher';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/5 py-2 last:border-0 dark:border-white/10">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-xs font-medium">{value || '—'}</span>
    </div>
  );
}

export function ProfileCard() {
  const { activeChild, parent } = useParentSession();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: profile, isLoading } = useParentProfile();

  if (!activeChild) return <Skeleton className="h-36 w-full rounded-3xl" />;

  const classLine = [activeChild.className, activeChild.sectionName].filter(Boolean).join(' · ');

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e7a49] via-[#0b6d41] to-[#063018] text-white shadow-xl shadow-[#0b6d41]/30 ring-1 ring-white/10">
      {/* soft premium glow */}
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#ffde59]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 top-0 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      {/* lit top edge + faint diagonal sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/[0.07]" />

      <ChildSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />

      <div className="relative p-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSwitcherOpen(true)} className="relative shrink-0">
            <span className="absolute inset-0 -m-1 rounded-full bg-white/15 blur-md" />
            <Avatar className="relative h-[76px] w-[76px] shadow-lg ring-[3px] ring-white/30">
              <AvatarImage src={activeChild.photoUrl} alt={activeChild.fullName} />
              <AvatarFallback className="bg-white/20 text-xl font-semibold text-white">
                {initials(activeChild.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-[#ffde59] text-[#0b6d41] shadow-md ring-2 ring-[#073a22]">
              <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white/70">{greeting()},</p>
            <p className="truncate text-2xl font-extrabold leading-tight tracking-tight text-[#ffde59] drop-shadow-sm">
              {activeChild.fullName}
            </p>
            {parent?.displayName && (
              <p className="truncate text-sm text-white/90">
                <span className="text-white/55">D/o · S/o </span>
                {parent.displayName}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/80">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {activeChild.admissionNumber}
              </span>
              {classLine && <span className="uppercase tracking-wide text-white/70">{classLine}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {activeChild.institutionName && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur">
              {activeChild.institutionLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeChild.institutionLogoUrl}
                  alt=""
                  className="h-4 w-4 rounded-full bg-white object-contain p-px"
                />
              ) : (
                <School className="h-3.5 w-3.5" />
              )}
              <span className="max-w-[55vw] truncate">{activeChild.institutionName}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15 active:scale-95"
          >
            Details
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* expandable white details sheet (Student / Parents tabs) */}
      {open && (
        <div className="bg-white p-3 text-foreground dark:bg-neutral-900">
          <Tabs defaultValue="student">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student">Student Details</TabsTrigger>
              <TabsTrigger value="parents">Parents Details</TabsTrigger>
            </TabsList>
            <TabsContent value="student" className="px-1">
              {isLoading ? (
                <DetailSkeleton />
              ) : (
                <>
                  <Row label="Admission Number" value={profile?.learner.admissionNumber} />
                  <Row label="Class" value={profile?.learner.className} />
                  <Row label="Section" value={profile?.learner.sectionName} />
                  <Row label="Date of Birth" value={profile?.learner.dateOfBirth} />
                  <Row label="Branch" value={profile?.learner.branch} />
                  <Row label="Address" value={profile?.learner.address} />
                </>
              )}
            </TabsContent>
            <TabsContent value="parents" className="px-1">
              {isLoading ? (
                <DetailSkeleton />
              ) : (
                <>
                  <Row label="Father's Name" value={profile?.parents.fatherName} />
                  <Row label="Mother's Name" value={profile?.parents.motherName} />
                  <Row label="Primary Mobile" value={profile?.parents.primaryMobile} />
                  <Row label="Secondary Mobile" value={profile?.parents.secondaryMobile} />
                  <Row label="Email" value={profile?.parents.email} />
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-2 py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
