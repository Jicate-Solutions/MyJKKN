'use client';

// Phase 4 — "Refer a friend to JKKN" (the value→advocacy→refer→join funnel).
// A fresher who experienced value refers a prospect; the referral lands in the
// admission funnel via the gated DEFINER RPC (source='referral'). The fresher's
// effort (≥1) is their controllable gate; whether the prospect JOINS is the
// program KPI, shown live from funnel_stage — never held against the fresher.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UserPlus, CheckCircle2, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService, type MyInductionReferral } from '@/lib/services/induction/induction-service';

const BRAND = '#0b6d41';

const STAGE_LABEL: Record<string, string> = {
  new: 'Contacted soon', contacted: 'Contacted', interested: 'Interested',
  qualified: 'Qualified', application_started: 'Applying', application_submitted: 'Applied',
  token_paid: 'Joining', offer_accepted: 'Offer accepted', confirmed: 'Joined', enrolled: 'Joined',
  declined: 'Declined', lost: 'Closed',
};

interface Props {
  eventId: string;
  initialReferrals: MyInductionReferral[];
}

export function ReferralSection({ eventId, initialReferrals }: Props) {
  const [referrals, setReferrals] = useState<MyInductionReferral[]>(initialReferrals);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const joined = referrals.filter((r) => r.joined).length;

  async function submit() {
    if (firstName.trim() === '' || phone.replace(/\D/g, '').length < 10) {
      toast.error('Enter your friend’s name and a valid phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await InductionService.submitReferral(eventId, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        note: note.trim() || null,
      });
      if (res.action === 'duplicate') {
        toast.info('You’ve already referred this number.');
      } else {
        toast.success('Referral sent — thank you for growing JKKN!');
      }
      const fresh = await InductionService.myReferrals(eventId);
      setReferrals(fresh);
      setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setNote('');
    } catch (e: any) {
      toast.error(e?.message?.replace(/^fn_induction_submit_referral:\s*/, '') ?? 'Could not send referral.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5" style={{ color: BRAND }} /> Refer a friend to JKKN
        </CardTitle>
        <CardDescription>
          Loved your induction? Help a friend join JKKN. Your effort counts the moment you refer —
          whether they join is on us.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {referrals.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary">{referrals.length} referred</Badge>
              <span className="flex items-center gap-1" style={{ color: BRAND }}>
                <CheckCircle2 className="h-4 w-4" /> {joined} joined
              </span>
            </div>
            <ul className="divide-y text-sm">
              {referrals.map((r) => (
                <li key={r.lead_id} className="flex items-center justify-between py-1.5">
                  <span className="min-w-0 truncate">{r.full_name || r.phone || 'Prospect'}</span>
                  <Badge variant={r.joined ? 'default' : 'outline'} className={r.joined ? 'text-white' : ''}
                    style={r.joined ? { backgroundColor: BRAND } : undefined}>
                    {STAGE_LABEL[r.funnel_stage ?? 'new'] ?? r.funnel_stage ?? 'Contacted soon'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ref-first" className="text-xs">First name *</Label>
            <Input id="ref-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Friend’s first name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-last" className="text-xs">Last name</Label>
            <Input id="ref-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="(optional)" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-phone" className="text-xs">Phone *</Label>
            <Input id="ref-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="tel" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-email" className="text-xs">Email</Label>
            <Input id="ref-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="(optional)" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ref-note" className="text-xs">Course they’re interested in</Label>
            <Input id="ref-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(optional)" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={submitting} style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90">
            <UserPlus className="mr-1 h-4 w-4" /> {submitting ? 'Sending…' : 'Refer this friend'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
