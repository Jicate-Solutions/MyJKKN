'use client';

// A leader shown as a profile card: photo (staff table, else profile avatar, else
// coloured initials), name, designation, contact. A vacant post is a dashed card
// that says so — absence is the finding on this page, never blank space.
//
// Layout is fixed-size for the avatar so a slow or broken image never shifts the
// grid; a failed image falls back to initials.

import { useState, type ReactNode } from 'react';
import { Mail, Phone, UserX } from 'lucide-react';

import { avatarGradient, initialsOf } from '@/lib/organizations/leader-visuals';
import { personName, type LeaderPerson } from '@/lib/organizations/leadership-stats';

export function Avatar({
  person,
  size,
}: {
  person: LeaderPerson;
  size: 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const name = personName(person) ?? '';
  const dim = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-14 w-14 text-lg';

  if (person.photo_url && !failed) {
    return (
      // Plain <img>: staff photos live in several storage buckets and the
      // fallback-on-error behaviour needs the element's onError.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.photo_url}
        alt={name}
        loading="lazy"
        width={size === 'lg' ? 80 : 56}
        height={size === 'lg' ? 80 : 56}
        onError={() => setFailed(true)}
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-background shadow-md`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-background shadow-md ${avatarGradient(person.user_id || name)}`}
    >
      {initialsOf(name)}
    </div>
  );
}

export function LeaderCard({
  postLabel,
  person,
  size = 'md',
  vacantText = 'Not assigned',
  footer,
}: {
  postLabel: string;
  person: LeaderPerson | null;
  size?: 'md' | 'lg';
  vacantText?: string;
  footer?: ReactNode;
}) {
  if (!person) {
    return (
      <div className="flex h-full flex-col justify-between gap-3 rounded-xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex items-center gap-3">
          <div
            className={`${size === 'lg' ? 'h-20 w-20' : 'h-14 w-14'} flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-500`}
          >
            <UserX className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{postLabel}</p>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-500">{vacantText}</p>
          </div>
        </div>
        {footer}
      </div>
    );
  }

  const name = personName(person);
  return (
    <div className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar person={person} size={size} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{postLabel}</p>
          <p className={`truncate font-semibold leading-tight ${size === 'lg' ? 'text-lg' : 'text-base'}`} title={name ?? undefined}>
            {name}
          </p>
          {person.designation && (
            <p className="truncate text-xs text-muted-foreground" title={person.designation}>
              {person.designation}
            </p>
          )}
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {person.email && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate" title={person.email}>{person.email}</span>
              </p>
            )}
            {person.phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                {person.phone}
              </p>
            )}
            {person.staff_id && (
              <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px]">{person.staff_id}</span>
            )}
          </div>
        </div>
      </div>
      {footer}
    </div>
  );
}
