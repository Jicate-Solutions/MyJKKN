'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Form,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  profileChangeSchema,
  type ProfileChangeFormValues,
  getChangedFields,
} from '@/lib/validations/profile-change-request';
import { LearnerProfile } from '@/types/learner-profile';
import { useMemo } from 'react';

interface ProfileEditFormProps {
  learner: LearnerProfile;
  onCancel: () => void;
  onSubmit: (changedFields: Record<string, { old: any; new: any }>) => void;
}

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export default function ProfileEditForm({ learner, onCancel, onSubmit }: ProfileEditFormProps) {
  // Initialize form with default values from learner profile
  const form = useForm<ProfileChangeFormValues>({
    resolver: zodResolver(profileChangeSchema),
    defaultValues: {
      // Contact Details
      student_mobile: learner.student_mobile || '',
      student_email: learner.student_email || '',
      alternate_mobile: undefined,

      // Parent/Guardian Information
      father_name: learner.father_name || '',
      father_mobile: learner.father_mobile || '',
      father_occupation: learner.father_occupation || undefined,
      mother_name: learner.mother_name || '',
      mother_mobile: learner.mother_mobile || '',
      mother_occupation: learner.mother_occupation || undefined,
      guardian_name: undefined,
      guardian_mobile: undefined,
      guardian_occupation: undefined,
      annual_income: learner.annual_income || undefined,

      // Address Information (mapping from learner profile to schema fields)
      permanent_address: learner.permanent_address_street || '',
      permanent_city: learner.permanent_address_district || '',
      permanent_state: learner.permanent_address_state || '',
      permanent_pincode: learner.permanent_address_pin_code || '',
      present_address: undefined,
      present_city: undefined,
      present_state: undefined,
      present_pincode: undefined,

      // Other Details
      blood_group: learner.blood_group as any,
      religion: learner.religion || '',
      community: learner.community || '',
      caste: learner.caste || undefined,
      hostel_required: learner.accommodation_type === 'hostel',
      transport_required: learner.bus_required || false,
      accommodation_type: learner.accommodation_type || '',
    },
  });

  // Get changed fields by comparing current form values with original learner data
  const changedFields = useMemo(() => {
    const formValues = form.getValues();
    const originalData: any = {
      student_mobile: learner.student_mobile,
      student_email: learner.student_email,
      father_name: learner.father_name,
      father_mobile: learner.father_mobile,
      father_occupation: learner.father_occupation,
      mother_name: learner.mother_name,
      mother_mobile: learner.mother_mobile,
      mother_occupation: learner.mother_occupation,
      annual_income: learner.annual_income,
      permanent_address: learner.permanent_address_street,
      permanent_city: learner.permanent_address_district,
      permanent_state: learner.permanent_address_state,
      permanent_pincode: learner.permanent_address_pin_code,
      blood_group: learner.blood_group,
      religion: learner.religion,
      community: learner.community,
      caste: learner.caste,
      hostel_required: learner.accommodation_type === 'hostel',
      transport_required: learner.bus_required,
      accommodation_type: learner.accommodation_type,
    };

    return getChangedFields(formValues, originalData);
  }, [form.watch(), learner]);

  const hasChanges = Object.keys(changedFields).length > 0;

  const handleSubmit = (values: ProfileChangeFormValues) => {
    const changes = getChangedFields(values, {
      student_mobile: learner.student_mobile,
      student_email: learner.student_email,
      father_name: learner.father_name,
      father_mobile: learner.father_mobile,
      father_occupation: learner.father_occupation,
      mother_name: learner.mother_name,
      mother_mobile: learner.mother_mobile,
      mother_occupation: learner.mother_occupation,
      annual_income: learner.annual_income,
      permanent_address: learner.permanent_address_street,
      permanent_city: learner.permanent_address_district,
      permanent_state: learner.permanent_address_state,
      permanent_pincode: learner.permanent_address_pin_code,
      blood_group: learner.blood_group,
      religion: learner.religion,
      community: learner.community,
      caste: learner.caste,
      hostel_required: learner.accommodation_type === 'hostel',
      transport_required: learner.bus_required,
      accommodation_type: learner.accommodation_type,
    } as any);

    onSubmit(changes);
  };

  return (
    <Card className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <Tabs defaultValue="contact" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="contact">Contact Details</TabsTrigger>
              <TabsTrigger value="parent">Parent/Guardian</TabsTrigger>
              <TabsTrigger value="address">Address Info</TabsTrigger>
              <TabsTrigger value="other">Other Details</TabsTrigger>
            </TabsList>

            {/* Tab 1: Contact Details */}
            <TabsContent value="contact" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="student_mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student Mobile</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="10-digit mobile number"
                          {...field}
                          maxLength={10}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="student_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student Email</FormLabel>
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
                  name="alternate_mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alternate Mobile (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="10-digit mobile number"
                          {...field}
                          maxLength={10}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </TabsContent>

            {/* Tab 2: Parent/Guardian Information */}
            <TabsContent value="parent" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Father Information */}
                <FormField
                  control={form.control}
                  name="father_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Father&apos;s Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter father's name" {...field} />
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
                        <Input
                          placeholder="10-digit mobile number"
                          {...field}
                          maxLength={10}
                        />
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
                      <FormLabel>Father&apos;s Occupation (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter occupation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Mother Information */}
                <FormField
                  control={form.control}
                  name="mother_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mother&apos;s Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter mother's name" {...field} />
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
                        <Input
                          placeholder="10-digit mobile number"
                          {...field}
                          maxLength={10}
                        />
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
                      <FormLabel>Mother&apos;s Occupation (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter occupation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Guardian Information */}
                <FormField
                  control={form.control}
                  name="guardian_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guardian&apos;s Name (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter guardian's name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="guardian_mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guardian&apos;s Mobile (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="10-digit mobile number"
                          {...field}
                          maxLength={10}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="guardian_occupation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guardian&apos;s Occupation (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter occupation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="annual_income"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Income (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter annual income" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </TabsContent>

            {/* Tab 3: Address Information */}
            <TabsContent value="address" className="space-y-6">
              {/* Permanent Address */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Permanent Address</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="permanent_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter permanent address"
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="permanent_city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City/District</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter city" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permanent_state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter state" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permanent_pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pincode</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="6-digit pincode"
                            {...field}
                            maxLength={6}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Present Address */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Present Address (Optional)</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="present_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter present address"
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="present_city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City/District</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter city" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="present_state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter state" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="present_pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pincode</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="6-digit pincode"
                            {...field}
                            maxLength={6}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab 4: Other Details */}
            <TabsContent value="other" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="blood_group"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blood Group</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select blood group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BLOOD_GROUP_OPTIONS.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
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
                  name="religion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Religion</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter religion" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="community"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Community</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter community" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="caste"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caste (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter caste" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hostel_required"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Hostel Required</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="transport_required"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Transport Required</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accommodation_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accommodation Type</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Day Scholar, Hostel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!hasChanges}>
              Preview Changes ({Object.keys(changedFields).length})
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
