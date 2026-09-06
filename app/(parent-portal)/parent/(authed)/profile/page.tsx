'use client';

/** Profile — full-page learner + parent details for the active child. */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentProfile } from '@/hooks/parent/use-parent-profile';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/5 py-2.5 last:border-0 dark:border-white/10">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function ParentProfilePage() {
  const { activeChild } = useParentSession();
  const { data, isLoading } = useParentProfile();

  if (!activeChild || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#0b6d41] to-[#0a5733] p-4 text-white">
        <Avatar className="h-16 w-16 ring-2 ring-white/40">
          <AvatarImage src={data?.learner.photoUrl} alt={data?.learner.fullName} />
          <AvatarFallback className="bg-white/20 text-white">
            {initials(data?.learner.fullName ?? activeChild.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{data?.learner.fullName}</p>
          <p className="truncate text-xs text-white/80">
            {[data?.learner.admissionNumber, data?.learner.className].filter(Boolean).join(' · ')}
          </p>
          <p className="truncate text-xs text-white/70">{activeChild.institutionName}</p>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Student Details</h2>
        <Row label="Admission Number" value={data?.learner.admissionNumber} />
        <Row label="Class" value={data?.learner.className} />
        <Row label="Section" value={data?.learner.sectionName} />
        <Row label="Date of Birth" value={data?.learner.dateOfBirth} />
        <Row label="Gender" value={data?.learner.gender} />
        <Row label="Branch" value={data?.learner.branch} />
        <Row label="Address" value={data?.learner.address} />
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Parents Details</h2>
        <Row label="Father's Name" value={data?.parents.fatherName} />
        <Row label="Mother's Name" value={data?.parents.motherName} />
        <Row label="Primary Mobile" value={data?.parents.primaryMobile} />
        <Row label="Secondary Mobile" value={data?.parents.secondaryMobile} />
        <Row label="Email" value={data?.parents.email} />
      </Card>
    </div>
  );
}
