'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { PartnerStatus, SourceType } from '@/types/solutions'

// Client data interface - accepts both SHClient and service Client types
interface ClientData {
  name?: string
  industry_sector?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  address?: string | null
  city?: string | null
  company_size?: string | null
  source_type?: SourceType | null
  source_department_id?: string | null
  partner_status?: PartnerStatus
}

// Form validation schema
const clientFormSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  industry: z.string().min(2, 'Industry is required'),
  contact_person: z.string().min(2, 'Contact person name is required'),
  contact_phone: z.string().min(10, 'Valid phone number is required'),
  contact_email: z.string().email('Valid email is required').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  company_size: z.string().optional(),
  source_type: z.enum(['placement', 'alumni', 'clinical', 'referral', 'direct', 'yi', 'intent']).nullable().optional(),
  source_department_id: z.string().optional(),
  partner_status: z.enum(['standard', 'yi', 'alumni', 'mou', 'referral']),
})

type ClientFormValues = z.infer<typeof clientFormSchema>

interface ClientFormProps {
  client?: ClientData
  onSubmit: (data: ClientFormValues) => Promise<void>
  isLoading?: boolean
}

// Source type options
const sourceTypeOptions: { value: SourceType; label: string }[] = [
  { value: 'placement', label: 'Placement Cell' },
  { value: 'alumni', label: 'Alumni Network' },
  { value: 'clinical', label: 'Clinical Services' },
  { value: 'referral', label: 'Referral' },
  { value: 'direct', label: 'Direct Inquiry' },
  { value: 'yi', label: 'Young Indians' },
  { value: 'intent', label: 'Intent Platform' },
]

// Partner status options
const partnerStatusOptions: { value: PartnerStatus; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'No partner discount' },
  { value: 'yi', label: 'YI Partner', description: '50% partner discount' },
  { value: 'alumni', label: 'Alumni', description: '50% partner discount' },
  { value: 'mou', label: 'MoU Partner', description: '50% partner discount' },
  { value: 'referral', label: 'Referral Partner', description: '50% partner discount (auto after 2 referrals)' },
]

// Industry suggestions
const industryOptions = [
  'Agriculture',
  'Automotive',
  'Banking & Finance',
  'Construction',
  'Education',
  'Energy',
  'Food & Beverage',
  'Government',
  'Healthcare',
  'Hospitality',
  'IT & Software',
  'Legal',
  'Manufacturing',
  'Media & Entertainment',
  'Non-Profit',
  'Pharmaceutical',
  'Real Estate',
  'Retail',
  'Telecommunications',
  'Transportation & Logistics',
  'Other',
]

// Company size options
const companySizeOptions = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '501-1000 employees',
  '1000+ employees',
]

export function ClientForm({ client, onSubmit, isLoading }: ClientFormProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name || '',
      industry: client?.industry_sector || '',
      contact_person: client?.contact_person || '',
      contact_phone: client?.contact_phone || '',
      contact_email: client?.contact_email || '',
      address: client?.address || '',
      city: client?.city || '',
      company_size: client?.company_size || '',
      source_type: client?.source_type || null,
      source_contact_name: client?.source_contact_name || '',
      partner_status: client?.partner_status || 'standard',
    },
  })

  const handleSubmit = async (data: ClientFormValues) => {
    // Clean up empty strings to null
    const cleanedData = {
      ...data,
      contact_email: data.contact_email || null,
      address: data.address || null,
      city: data.city || null,
      company_size: data.company_size || null,
      source_contact_name: data.source_contact_name || null,
    }
    await onSubmit(cleanedData as ClientFormValues)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Company Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Company Information</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {industryOptions.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="company_size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Size</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {companySizeOptions.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
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
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Chennai" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="123 Business Park, Main Road" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Contact Information</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="contact_person"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person *</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
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
                  <FormLabel>Phone Number *</FormLabel>
                  <FormControl>
                    <Input placeholder="+91 98765 43210" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
        </div>

        {/* Source & Partner Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Source & Partnership</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="source_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="How did they find us?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sourceTypeOptions.map((option) => (
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
              name="source_contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referred By / Source Contact</FormLabel>
                  <FormControl>
                    <Input placeholder="Name of referrer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="partner_status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partner Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {partnerStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Partners automatically receive 50% discount on all solutions
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {client ? 'Update Client' : 'Create Client'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
