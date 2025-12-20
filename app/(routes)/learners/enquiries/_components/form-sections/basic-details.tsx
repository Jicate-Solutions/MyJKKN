// ============================================
// BASIC DETAILS FORM SECTION
// ============================================
// Created: 2025-01-18
// Purpose: Personal and family information fields
// ============================================

import { UseFormReturn } from 'react-hook-form';
import { useMemo } from 'react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProfileImageUpload } from '../profile-image-upload';

interface BasicDetailsProps {
  form: UseFormReturn<any>;
}

export function BasicDetailsSection({ form }: BasicDetailsProps) {
  // Generate year options (current year - 10 to current year + 5)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 10; i <= currentYear + 5; i++) {
      years.push(i);
    }
    return years.reverse(); // Most recent years first
  }, []);

  // Religion options (values match database format - uppercase)
  const religionOptions = [
    { value: 'HINDU', label: 'Hindu' },
    { value: 'CHRISTIAN', label: 'Christian' },
    { value: 'MUSLIM', label: 'Muslim' },
    { value: 'OTHERS', label: 'Others' }
  ];

  // Community options
  const communityOptions = [
    { value: 'OC', label: 'OC' },
    { value: 'BC', label: 'BC' },
    { value: 'BCM', label: 'BCM' },
    { value: 'MBC', label: 'MBC' },
    { value: 'DNC', label: 'DNC' },
    { value: 'BC-CC', label: 'BC-CC' },
    { value: 'SC', label: 'SC' },
    { value: 'ST', label: 'ST' },
    { value: 'SC (A)', label: 'SC (A)' }
  ];

  // Blood group options
  const bloodGroupOptions = [
    { value: 'A+', label: 'A+' },
    { value: 'A-', label: 'A-' },
    { value: 'B+', label: 'B+' },
    { value: 'B-', label: 'B-' },
    { value: 'AB+', label: 'AB+' },
    { value: 'AB-', label: 'AB-' },
    { value: 'O+', label: 'O+' },
    { value: 'O-', label: 'O-' },
    { value: 'A1+', label: 'A1+' },
    { value: 'A1B', label: 'A1B' }
  ];

  return (
    <div className="space-y-6">
      {/* Profile Image Upload */}
      <div className="flex justify-center mb-6">
        <ProfileImageUpload
          value={form.watch('student_photo_url')}
          onChange={(url) => form.setValue('student_photo_url', url)}
        />
      </div>

      {/* Enquiry Date and Admission Year */}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="enquiry_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enquiry Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="admission_year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Admission Year</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value))}
                value={field.value?.toString() || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select admission year" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Personal Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Personal Information</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  First Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Enter first name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

        <FormField
          control={form.control}
          name="last_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Enter last name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date_of_birth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of Birth <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gender <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="religion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Religion <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select religion" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {religionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="community"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Community <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select community" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {communityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="caste"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Caste <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter caste" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="aadhar_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Aadhar Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter 12-digit Aadhar number"
                    maxLength={12}
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="blood_group"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Blood Group</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bloodGroupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Father's Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Father&apos;s Information</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="father_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Father&apos;s Name <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter father's name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="father_occupation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Father&apos;s Occupation</FormLabel>
                <FormControl>
                  <Input placeholder="Enter occupation" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="father_mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Father&apos;s Mobile</FormLabel>
                <FormControl>
                  <Input placeholder="Enter mobile number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Mother's Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Mother&apos;s Information</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="mother_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mother&apos;s Name <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter mother's name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mother_occupation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mother&apos;s Occupation</FormLabel>
                <FormControl>
                  <Input placeholder="Enter occupation" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mother_mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mother&apos;s Mobile</FormLabel>
                <FormControl>
                  <Input placeholder="Enter mobile number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Additional Information */}
      <FormField
        control={form.control}
        name="annual_income"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Annual Family Income</FormLabel>
            <FormControl>
              <Input placeholder="Enter annual income" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
