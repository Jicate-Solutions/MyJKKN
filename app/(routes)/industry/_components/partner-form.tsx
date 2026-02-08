'use client';

// ============================================================================
// Partner Form Component
// Reusable form for creating and editing industry partners
// ============================================================================

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreatePartner, useUpdatePartner } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useToast } from '@/hooks/use-toast';
import type { IndustryPartner, PartnershipType } from '@/types/industry';
import { Loader2, Save, X } from 'lucide-react';

const PARTNERSHIP_TYPES: { value: PartnershipType; label: string }[] = [
  { value: 'mou', label: 'MOU (Memorandum of Understanding)' },
  { value: 'placement', label: 'Placement Partner' },
  { value: 'project', label: 'Project Collaboration' },
  { value: 'mentorship', label: 'Mentorship Program' },
  { value: 'sponsorship', label: 'Sponsorship' },
  { value: 'internship', label: 'Internship Program' },
  { value: 'training', label: 'Training Partner' }
];

const INDUSTRY_SECTORS = [
  'Technology',
  'Healthcare',
  'Finance & Banking',
  'Manufacturing',
  'Education',
  'Retail',
  'Automotive',
  'Construction',
  'Media & Entertainment',
  'Agriculture',
  'Energy',
  'Consulting',
  'Hospitality',
  'Logistics',
  'Other'
];

const partnerSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  industry_sector: z.string().optional(),
  partnership_type: z.enum(['mou', 'placement', 'project', 'mentorship', 'sponsorship', 'internship', 'training']).optional(),
  contact_person: z.string().optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  partnership_start_date: z.string().optional(),
  partnership_end_date: z.string().optional(),
  description: z.string().optional(),
  website_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  mou_document_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  is_active: z.boolean().default(true)
});

type PartnerFormValues = z.infer<typeof partnerSchema>;

interface PartnerFormProps {
  partner?: IndustryPartner;
  mode: 'create' | 'edit';
}

export function PartnerForm({ partner, mode }: PartnerFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createMutation = useCreatePartner();
  const updateMutation = useUpdatePartner(partner?.id || '');

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      company_name: partner?.company_name || '',
      industry_sector: partner?.industry_sector || undefined,
      partnership_type: partner?.partnership_type || undefined,
      contact_person: partner?.contact_person || '',
      contact_email: partner?.contact_email || '',
      contact_phone: partner?.contact_phone || '',
      partnership_start_date: partner?.partnership_start_date || '',
      partnership_end_date: partner?.partnership_end_date || '',
      description: partner?.company_description || '',
      website_url: partner?.company_website || '',
      mou_document_url: partner?.mou_document_url || '',
      is_active: partner?.is_active ?? true
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: PartnerFormValues) => {
    try {
      // Clean up empty strings and ensure company_name is always present
      const cleanedValues = {
        ...values,
        company_name: values.company_name, // Explicitly include required field
        contact_email: values.contact_email || undefined,
        website_url: values.website_url || undefined,
        mou_document_url: values.mou_document_url || undefined
      };

      if (mode === 'create') {
        await createMutation.mutateAsync({
          institution_id: institutionId,
          company_name: cleanedValues.company_name,
          industry_sector: cleanedValues.industry_sector,
          partnership_type: cleanedValues.partnership_type,
          contact_person: cleanedValues.contact_person,
          contact_email: cleanedValues.contact_email,
          contact_phone: cleanedValues.contact_phone,
          partnership_start_date: cleanedValues.partnership_start_date,
          partnership_end_date: cleanedValues.partnership_end_date,
          company_description: cleanedValues.description,
          company_website: cleanedValues.website_url,
          mou_document_url: cleanedValues.mou_document_url,
          is_active: cleanedValues.is_active
        });
        toast({
          title: 'Partner created',
          description: 'The industry partner has been created successfully.'
        });
      } else {
        const { description, website_url, ...rest } = cleanedValues;
        await updateMutation.mutateAsync({
          ...rest,
          company_description: description,
          company_website: website_url
        });
        toast({
          title: 'Partner updated',
          description: 'The industry partner has been updated successfully.'
        });
      }
      router.push('/industry/partners');
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${mode} partner. Please try again.`,
        variant: 'destructive'
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter company name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="industry_sector"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industry Sector</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sector" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRY_SECTORS.map((sector) => (
                          <SelectItem key={sector} value={sector}>
                            {sector}
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
                name="partnership_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partnership Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PARTNERSHIP_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the partnership..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="contact_person"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person</FormLabel>
                  <FormControl>
                    <Input placeholder="Primary contact name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 XXXXX XXXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Partnership Details */}
        <Card>
          <CardHeader>
            <CardTitle>Partnership Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="partnership_start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="partnership_end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Leave blank for ongoing partnership</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="mou_document_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MOU Document URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://drive.google.com/..." {...field} />
                  </FormControl>
                  <FormDescription>Link to the signed MOU document</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Partnership</FormLabel>
                    <FormDescription>
                      Mark this partnership as active or inactive
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {mode === 'create' ? 'Create Partner' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
