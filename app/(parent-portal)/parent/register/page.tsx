'use client';

/** Register — admission + mobile → OTP → password (+ sibling auto-link). */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  ParentAuthService,
  type SendOtpResponse,
} from '@/lib/services/parent/parent-auth-service';
import type { SiblingCandidate } from '@/types/parent-portal';

// Must match ACTIVE_LEARNER_COOKIE in parent-session-provider.tsx.
const ACTIVE_LEARNER_COOKIE = 'pp_active_learner';

export default function ParentRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  const [admission, setAdmission] = useState('');
  const [mobile, setMobile] = useState('');

  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [matched, setMatched] = useState<SendOtpResponse['matchedLearner']>();
  const [siblings, setSiblings] = useState<SiblingCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admission.trim() || mobile.trim().length < 10) {
      toast.error('Enter the admission number and a valid mobile number.');
      return;
    }
    setLoading(true);
    try {
      const res = await ParentAuthService.sendOtp({
        admission: admission.trim(),
        mobile: mobile.trim(),
        purpose: 'register',
      });
      // Generic response (no match) carries no matchedLearner — stay safe.
      if (!res.matchedLearner) {
        toast.success('If the details match our records, an OTP has been sent.');
        return;
      }
      setMatched(res.matchedLearner);
      setSiblings(res.siblings ?? []);
      setSelected(new Set((res.siblings ?? []).map((s) => s.learnerProfileId)));
      if (res.devCode) {
        setOtp(res.devCode);
        toast.message(`Dev OTP: ${res.devCode}`, { description: 'Auto-filled in development.' });
      } else {
        toast.success('OTP sent to your mobile.');
      }
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) return toast.error('Enter the 6-digit OTP.');
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setLoading(true);
    try {
      await ParentAuthService.register({
        admission: admission.trim(),
        mobile: mobile.trim(),
        otp: otp.trim(),
        password,
        linkSiblingIds: [...selected],
      });
      toast.success('Account created!');
      // Fresh session on a tab-lifetime query cache — drop any cached data and
      // stale child selection from a previous parent before entering the portal.
      queryClient.clear();
      Cookies.remove(ACTIVE_LEARNER_COOKIE);
      router.replace('/parent/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#0b6d41]">Create Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 1 ? 'Verify your child’s details' : 'Verify OTP and set a password'}
        </p>
      </div>

      {step === 1 ? (
        <form onSubmit={sendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admission">Admission Number</Label>
            <Input
              id="admission"
              value={admission}
              onChange={(e) => setAdmission(e.target.value)}
              placeholder="e.g. JKKN2024001"
            />
          </div>
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
        <form onSubmit={register} className="space-y-4">
          {matched && (
            <div className="rounded-xl bg-[#0b6d41]/5 p-3 text-sm">
              Linking <span className="font-semibold">{matched.fullName}</span> ({matched.admissionNumber})
            </div>
          )}

          {siblings.length > 0 && (
            <div className="space-y-2">
              <Label>Also link siblings</Label>
              {siblings.map((s) => (
                <label
                  key={s.learnerProfileId}
                  className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.learnerProfileId)}
                    onChange={() => toggle(s.learnerProfileId)}
                    className="h-4 w-4 accent-[#0b6d41]"
                  />
                  <span className="flex-1">
                    {s.fullName} <span className="text-muted-foreground">({s.admissionNumber})</span>
                  </span>
                </label>
              ))}
            </div>
          )}

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
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-6 text-base font-semibold"
          >
            {loading ? 'Creating…' : 'Create Account'}
          </Button>
        </form>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/parent/login" className="text-muted-foreground">
          Already have an account? <span className="font-medium text-[#0b6d41]">Login</span>
        </Link>
      </div>
    </div>
  );
}
