'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { ParentAuthService } from '@/lib/services/parent/parent-auth-service';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';

export default function AddSiblingPage() {
  const router = useRouter();
  const { parent, refetchChildren } = useParentSession();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [admission, setAdmission] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!parent?.mobile || !admission.trim()) return toast.error('Enter the admission number.');
    setLoading(true);
    try {
      const res = await ParentAuthService.sendOtp({
        mobile: parent.mobile,
        admission: admission.trim(),
        purpose: 'add_sibling',
      });
      if (!res.matchedLearner) {
        toast.success('If the details match, an OTP has been sent.');
        return;
      }
      if (res.devCode) {
        setOtp(res.devCode);
        toast.message(`Dev OTP: ${res.devCode}`);
      } else {
        toast.success('OTP sent to your registered mobile.');
      }
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const link = async () => {
    if (otp.trim().length !== 6) return toast.error('Enter the 6-digit OTP.');
    setLoading(true);
    try {
      await ParentFeatures.addSibling({ admission: admission.trim(), otp: otp.trim() });
      toast.success('Sibling linked!');
      refetchChildren();
      queryClient.invalidateQueries({ queryKey: ['parent-children'] });
      router.replace('/parent/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Add Sibling</h1>
      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted-foreground">
          Enter your other child&apos;s admission number. We&apos;ll send an OTP to your registered mobile
          {parent?.mobile ? ` ending ${parent.mobile.slice(-4)}` : ''}.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="adm">Admission Number</Label>
          <Input id="adm" value={admission} onChange={(e) => setAdmission(e.target.value)} disabled={step === 2} />
        </div>
        {step === 1 ? (
          <Button onClick={sendOtp} disabled={loading} className="w-full bg-[#0b6d41]">
            {loading ? 'Sending…' : 'Send OTP'}
          </Button>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="otp">OTP</Label>
              <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} />
            </div>
            <Button onClick={link} disabled={loading} className="w-full bg-[#0b6d41]">
              {loading ? 'Linking…' : 'Link Sibling'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
