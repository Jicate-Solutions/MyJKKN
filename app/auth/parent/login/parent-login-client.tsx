'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Phone, ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { useRequestOTP, useVerifyOTP } from '@/hooks/parent-portal';
import { requestOTPSchema, verifyOTPSchema } from '@/lib/validations/parent-portal';
import type { RequestOTPInput, VerifyOTPInput } from '@/lib/validations/parent-portal';
import Link from 'next/link';

// Default institution ID - in production, this would be determined by subdomain or selection
const DEFAULT_INSTITUTION_ID = process.env.NEXT_PUBLIC_DEFAULT_INSTITUTION_ID || 'a1111111-1111-1111-1111-111111111111';

type Step = 'phone' | 'otp';

export function ParentLoginClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const { mutate: requestOTP, isPending: isRequestingOTP } = useRequestOTP();
  const { mutate: verifyOTP, isPending: isVerifyingOTP } = useVerifyOTP();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Phone form
  const phoneForm = useForm<RequestOTPInput>({
    resolver: zodResolver(requestOTPSchema),
    defaultValues: {
      phone: '',
      institution_id: DEFAULT_INSTITUTION_ID,
    },
  });

  // OTP form
  const otpForm = useForm<VerifyOTPInput>({
    resolver: zodResolver(verifyOTPSchema),
    defaultValues: {
      phone: '',
      otp: '',
      institution_id: DEFAULT_INSTITUTION_ID,
    },
  });

  const handlePhoneSubmit = (data: RequestOTPInput) => {
    requestOTP(data as any, {
      onSuccess: () => {
        setPhoneNumber(data.phone!);
        otpForm.setValue('phone', data.phone!);
        setStep('otp');
        setResendCooldown(30); // 30 second cooldown before resend
      },
    });
  };

  const handleOTPSubmit = (data: VerifyOTPInput) => {
    verifyOTP(data as any, {
      onSuccess: (result) => {
        if (result.success && result.parent_id) {
          // Session is now stored securely in httpOnly cookie
          // No need to store in localStorage - this is now handled server-side
          router.push('/parent-portal');
        } else if (result.success && result.is_new) {
          // New parent - redirect to registration
          router.push(`/auth/parent/register?phone=${encodeURIComponent(phoneNumber)}`);
        } else if (result.success) {
          // Edge case: success but no parent_id or is_new flag - shouldn't happen
          console.error('[parent-login] Unexpected response:', result);
          router.push('/auth/parent/register?phone=' + encodeURIComponent(phoneNumber));
        }
      },
    });
  };

  const handleBack = () => {
    setStep('phone');
    otpForm.reset();
  };

  const handleResendOTP = () => {
    requestOTP({ phone: phoneNumber, institution_id: DEFAULT_INSTITUTION_ID }, {
      onSuccess: () => {
        setResendCooldown(30); // 30 second cooldown before next resend
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            {step === 'phone' ? (
              <Phone className="h-6 w-6 text-blue-600" />
            ) : (
              <KeyRound className="h-6 w-6 text-blue-600" />
            )}
          </div>
          <CardTitle>
            {step === 'phone' ? 'Parent Login' : 'Verify OTP'}
          </CardTitle>
          <CardDescription>
            {step === 'phone'
              ? 'Enter your registered phone number to receive an OTP'
              : `We sent a 6-digit code to ${phoneNumber}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <Form {...phoneForm}>
              <form
                onSubmit={phoneForm.handleSubmit(handlePhoneSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="+91 9876543210"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isRequestingOTP}
                >
                  {isRequestingOTP ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    'Send OTP'
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...otpForm}>
              <form
                onSubmit={otpForm.handleSubmit(handleOTPSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center">
                      <FormLabel className="sr-only">OTP Code</FormLabel>
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isVerifyingOTP || otpForm.watch('otp').length !== 6}
                  >
                    {isVerifyingOTP ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Login'
                    )}
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Change Number
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleResendOTP}
                      disabled={isRequestingOTP}
                    >
                      Resend OTP
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/parent/register"
                className="font-medium text-primary hover:underline"
              >
                Register here
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
