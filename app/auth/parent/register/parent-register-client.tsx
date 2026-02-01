'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus, ArrowRight, Check } from 'lucide-react';
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
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRegisterParent, useRequestOTP, useVerifyOTP } from '@/hooks/parent-portal';
import { parentRegistrationSchema } from '@/lib/validations/parent-portal';
import type { ParentRegistrationInput } from '@/lib/validations/parent-portal';
import Link from 'next/link';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

// Default institution ID
const DEFAULT_INSTITUTION_ID = 'demo-institution-id';

type Step = 'info' | 'otp' | 'success';

export function ParentRegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('info');
  const [otp, setOtp] = useState('');

  const { mutate: register, isPending: isRegistering } = useRegisterParent();
  const { mutate: requestOTP, isPending: isRequestingOTP } = useRequestOTP();
  const { mutate: verifyOTP, isPending: isVerifyingOTP } = useVerifyOTP();

  const form = useForm<ParentRegistrationInput>({
    resolver: zodResolver(parentRegistrationSchema),
    defaultValues: {
      phone: searchParams.get('phone') || '',
      name: '',
      email: '',
      relationship: undefined,
      learner_enrollment_number: '',
      institution_id: DEFAULT_INSTITUTION_ID,
    },
  });

  const handleSubmit = (data: ParentRegistrationInput) => {
    register(data as any, {
      onSuccess: (result) => {
        if (result.requires_verification) {
          // Send OTP for verification
          requestOTP(
            { phone: data.phone, institution_id: data.institution_id },
            {
              onSuccess: () => setStep('otp'),
            }
          );
        } else if (result.parent_id) {
          // Already verified, go to success
          setStep('success');
        }
      },
    });
  };

  const handleVerifyOTP = () => {
    const phone = form.getValues('phone');
    verifyOTP(
      {
        phone,
        otp,
        institution_id: DEFAULT_INSTITUTION_ID,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            // Session is now stored securely in httpOnly cookie
            // No need to store in localStorage
            setStep('success');
          }
        },
      }
    );
  };

  const handleResendOTP = () => {
    requestOTP({
      phone: form.getValues('phone'),
      institution_id: DEFAULT_INSTITUTION_ID,
    });
  };

  const handleGoToDashboard = () => {
    router.push('/parent-portal');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            {step === 'success' ? (
              <Check className="h-6 w-6 text-green-600" />
            ) : (
              <UserPlus className="h-6 w-6 text-blue-600" />
            )}
          </div>
          <CardTitle>
            {step === 'info' && 'Parent Registration'}
            {step === 'otp' && 'Verify Phone Number'}
            {step === 'success' && 'Registration Complete!'}
          </CardTitle>
          <CardDescription>
            {step === 'info' &&
              'Register to access your child\'s academic information'}
            {step === 'otp' &&
              `Enter the OTP sent to ${form.getValues('phone')}`}
            {step === 'success' &&
              'Your account has been created successfully'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'info' && (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
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
                      <FormDescription>
                        This will be used for login
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your.email@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select relationship" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="father">Father</SelectItem>
                          <SelectItem value="mother">Mother</SelectItem>
                          <SelectItem value="guardian">Guardian</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="learner_enrollment_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Child&apos;s Enrollment Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., JKKN2024001"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        You can find this on the student ID card
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isRegistering}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}

          {step === 'otp' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
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
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleVerifyOTP}
                  disabled={isVerifyingOTP || otp.length !== 6}
                >
                  {isVerifyingOTP ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Complete Registration'
                  )}
                </Button>

                <div className="text-center">
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
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-6 text-center">
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-green-700">
                  Your account has been created and linked to your child&apos;s
                  profile. You can now access the parent portal.
                </p>
              </div>

              <Button className="w-full" onClick={handleGoToDashboard}>
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 'info' && (
            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                Already have an account?{' '}
                <Link
                  href="/auth/parent/login"
                  className="font-medium text-primary hover:underline"
                >
                  Login here
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
