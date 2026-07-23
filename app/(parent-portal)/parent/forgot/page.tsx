'use client';

/** Forgot password — mobile → OTP → reset. */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ParentAuthService } from '@/lib/services/parent/parent-auth-service';

export default function ParentForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile.trim().length < 10) return toast.error('Enter a valid mobile number.');
    setLoading(true);
    try {
      const res = await ParentAuthService.sendOtp({ mobile: mobile.trim(), purpose: 'reset' });
      if (res.devCode) {
        setOtp(res.devCode);
        toast.message(`Dev OTP: ${res.devCode}`, { description: 'Auto-filled in development.' });
      } else {
        toast.success('If an account exists, an OTP has been sent.');
      }
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) return toast.error('Enter the 6-digit OTP.');
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setLoading(true);
    try {
      await ParentAuthService.forgot({ mobile: mobile.trim(), otp: otp.trim(), password });
      toast.success('Password updated. Please log in.');
      router.replace('/parent/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#0b6d41]">Reset Password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 1 ? 'Enter your registered mobile' : 'Verify OTP and set a new password'}
        </p>
      </div>

      {step === 1 ? (
        <form onSubmit={sendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mobile">Registered Mobile</Label>
            <Input
              id="mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="numeric"
              placeholder="10-digit mobile"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-6 text-base font-semibold"
          >
            {loading ? 'Sending…' : 'Send OTP'}
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp">OTP</Label>
            <Input
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-6 text-base font-semibold"
          >
            {loading ? 'Updating…' : 'Reset Password'}
          </Button>
        </form>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/parent/login" className="font-medium text-[#0b6d41]">
          Back to Login
        </Link>
      </div>
    </div>
  );
}
