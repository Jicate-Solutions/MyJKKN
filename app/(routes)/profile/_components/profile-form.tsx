// app/(routes)/profile/_components/profile-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ProfileFormValues,
  profileFormSchema
} from '@/lib/validations/profile';
import { AuthService } from '@/lib/auth/auth-service';
import { Profile } from '@/types/auth';
import { toast } from 'react-hot-toast';
import {
  INSTITUTIONS,
  DEPARTMENTS,
  GENDERS,
  ROLE_LABELS
} from '@/lib/constants/permissions';
import { Button } from '@/components/ui/button';
import { AvatarUpload } from './avatar-upload';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ProfileFormProps {
  user: Profile;
  onComplete?: () => void;
}

export function ProfileForm({ user, onComplete }: ProfileFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClientSupabaseClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: user.full_name || '',
      phone_number: user.phone_number || '',
      gender: user.gender || undefined,
      designation: user.designation || '',
      bio: user.bio || ''
    }
  });

  // Generate initials for avatar
  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      setIsLoading(true);
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error('No authenticated user');
      }

      // Transform empty strings to null for optional fields
      const formData = {
        ...data,
        phone_number: data.phone_number || null,
        designation: data.designation || null,
        bio: data.bio || null,
        gender: data.gender || null
      };

      const { error } = await supabase
        .from('profiles')
        .update({
          ...formData,
          profile_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userData.user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      onComplete?.();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    try {
      await AuthService.refreshSession();
      onComplete?.();
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex flex-col items-center space-y-4'>
              <AvatarUpload
                avatarUrl={user.avatar_url}
                initials={initials}
                onUploadComplete={handleProfileUpdate}
                userId={user.id}
              />
              <p className='text-sm text-muted-foreground'>
                Click or drag and drop to change your avatar
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            {/* Email (Read-only) */}
            <div className='space-y-2 mb-6'>
              <FormLabel>Email</FormLabel>
              <Input value={user.email} disabled />
              <p className='text-sm text-muted-foreground'>
                Your email is managed through your Google account
              </p>
            </div>

            {/* Role (Read-only) */}
            <div className='space-y-2 mb-6'>
              <FormLabel>Role</FormLabel>
              <Input
                value={ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}
                disabled
              />
            </div>

            <div className='grid gap-6 grid-cols-1 md:grid-cols-2'>
              {/* Full Name */}
              <FormField
                control={form.control}
                name='full_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter your full name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone Number */}
              <FormField
                control={form.control}
                name='phone_number'
                render={({ field: { value, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter your phone number'
                        value={value || ''}
                        {...fieldProps}
                      />
                    </FormControl>
                    <FormDescription>
                      Format: +91XXXXXXXXXX or 10 digits
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Gender */}
              <FormField
                control={form.control}
                name='gender'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select your gender' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GENDERS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Designation */}
              <FormField
                control={form.control}
                name='designation'
                render={({ field: { value, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter your designation'
                        value={value || ''}
                        {...fieldProps}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bio */}
            <div className='mt-6'>
              <FormField
                control={form.control}
                name='bio'
                render={({ field: { value, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Tell us about yourself...'
                        className='resize-none'
                        value={value || ''}
                        {...fieldProps}
                      />
                    </FormControl>
                    <FormDescription>
                      Brief description about yourself (max 500 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-end space-x-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              form.reset();
              onComplete?.();
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
