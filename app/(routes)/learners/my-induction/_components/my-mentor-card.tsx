'use client';

// "Your Senior Peer Mentor" — the MENTEE side of the assignment a coordinator
// makes in the Senior Peer Mentors console. Until now that edge was write-only
// from the fresher's point of view: 809 assignments exist in prod and the
// fresher was never told who they had been assigned to. A mentoring programme
// whose mentees don't know their mentor's name is just a spreadsheet.
//
// IDENTIFICATION ONLY — no phone, no email. See the note on the contact block
// below and 20261118000000.
//
// Self-scoping, mirroring SeniorPeerMentorCard / MentorMonthFeedbackCard: the
// RPC resolves the caller server-side, no learner id is passed, and the card
// renders NOTHING for a fresher with no current assignment — a college that
// doesn't run the SPM programme should not see an empty placeholder on every
// load.
//
// Distinct from MentorMonthFeedbackCard directly below it: this one says WHO
// your mentor is (always, from the moment of assignment); that one asks you to
// RATE them, and only once a monthly check-in has come due (first beat
// 15 Aug 2026).
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { HeartHandshake, GraduationCap, Info } from 'lucide-react';
import { InductionVolunteerService, type MyMentor } from '@/lib/services/induction/induction-volunteer-service';

const BRAND = '#0b6d41';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MyMentorCard({ eventId }: { eventId: string }) {
  const [mentor, setMentor] = useState<MyMentor | null | 'loading'>('loading');

  useEffect(() => {
    let active = true;
    setMentor('loading');
    InductionVolunteerService.myMentorForEvent(eventId)
      .then((m) => { if (active) setMentor(m); })
      // Silent on failure by design — a fresher should never be shown an error
      // toast for a card that is optional context, not something they asked for.
      .catch(() => { if (active) setMentor(null); });
    return () => { active = false; };
  }, [eventId]);

  // Invisible while loading and for any fresher without an assigned mentor.
  if (mentor === 'loading' || mentor === null) return null;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: BRAND }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HeartHandshake className="h-4 w-4" style={{ color: BRAND }} /> Your Senior Peer Mentor
        </CardTitle>
        <CardDescription>
          A senior learner assigned to look out for you through your first year. Stuck, lost or just
          want to ask something? Reach out — that&apos;s what they&apos;re here for.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-12 w-12 shrink-0">
            {mentor.mentor_photo_url && (
              <AvatarImage src={mentor.mentor_photo_url} alt={mentor.mentor_name} />
            )}
            <AvatarFallback style={{ backgroundColor: `${BRAND}1a`, color: BRAND }} className="font-semibold">
              {initials(mentor.mentor_name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="font-semibold truncate">{mentor.mentor_name}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {mentor.mentor_program && (
                <span className="flex items-center gap-1 min-w-0">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{mentor.mentor_program}</span>
                </span>
              )}
              {mentor.mentor_ident && (
                <Badge variant="outline" className="font-normal shrink-0">{mentor.mentor_ident}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* NO contact details. The card names the mentor and stops there —
            fn_induction_my_mentor_for_event does not return a mobile or an
            email (20261118000000), so there is nothing to render even if a
            future edit tried. A mentee reaches their mentor in person or
            through their coordinator; publishing a senior learner's phone
            number to their whole group was the Director's call to decline. */}

        {/* A stand-in is stated plainly. A fresher who was told a different name
            in week one must not silently see a new one and assume they were
            moved — the admin side tracks this, so the mentee gets it too. */}
        {mentor.is_cover && (
          <p className="flex items-start gap-2 text-sm rounded-md bg-muted/40 px-3 py-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND }} />
            <span>
              {mentor.mentor_name.split(/\s+/)[0]} is standing in
              {mentor.original_mentor_name ? ` for ${mentor.original_mentor_name}` : ''}
              {mentor.cover_until ? ` until ${fmtDate(mentor.cover_until)}` : ''}. Contact them exactly
              as you would your usual mentor.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
