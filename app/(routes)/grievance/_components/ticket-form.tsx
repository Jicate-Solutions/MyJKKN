'use client';

// app/(routes)/grievance/_components/ticket-form.tsx
// F004: Grievance Ticketing System - Create Ticket Form

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useCreateGrievanceTicket } from '@/hooks/grievance';
import { createGrievanceTicketSchema, type CreateGrievanceTicketInput } from '@/lib/validations/grievance';
import type { GrievanceCategory, RaiserType } from '@/types/grievance';

interface TicketFormProps {
  institutionId: string;
  categories: GrievanceCategory[];
  defaultRaiserType: RaiserType;
  defaultRaiserId?: string;
  defaultRaiserName: string;
  defaultRaiserEmail?: string;
  defaultRaiserPhone?: string;
}

export function TicketForm({
  institutionId,
  categories,
  defaultRaiserType,
  defaultRaiserId,
  defaultRaiserName,
  defaultRaiserEmail,
  defaultRaiserPhone
}: TicketFormProps) {
  const router = useRouter();
  const { mutate: createTicket, isPending } = useCreateGrievanceTicket();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const form = useForm<CreateGrievanceTicketInput>({
    resolver: zodResolver(createGrievanceTicketSchema),
    defaultValues: {
      institution_id: institutionId,
      category_id: '',
      subject: '',
      description: '',
      priority: 'medium',
      raised_by_type: defaultRaiserType,
      raised_by_id: defaultRaiserId || undefined,
      raised_by_name: defaultRaiserName,
      raised_by_email: defaultRaiserEmail || '',
      raised_by_phone: defaultRaiserPhone || '',
      attachments: [],
      metadata: {}
    }
  });

  const onSubmit = (data: CreateGrievanceTicketInput) => {
    createTicket({
      institution_id: institutionId,
      category_id: data.category_id,
      subject: data.subject,
      description: data.description,
      priority: data.priority,
      raised_by_type: data.raised_by_type,
      raised_by_id: data.raised_by_id ?? undefined,
      raised_by_name: data.raised_by_name,
      raised_by_email: data.raised_by_email ?? undefined,
      raised_by_phone: data.raised_by_phone ?? undefined,
      attachments: (data.attachments ?? []) as { name: string; url: string; type: string; size: number }[],
      metadata: data.metadata ?? {}
    }, {
      onSuccess: (ticket) => {
        router.push(`/grievance/tickets/${ticket.id}`);
      }
    });
  };

  // Get parent categories (those without parent_id)
  const parentCategories = categories.filter((c) => !c.parent_id);

  // Get sub-categories for selected parent
  const subCategories = selectedParentId
    ? categories.filter((c) => c.parent_id === selectedParentId)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raise a Grievance</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Category Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  value={selectedParentId || ''}
                  onValueChange={(value) => {
                    setSelectedParentId(value);
                    // Reset the category_id when parent changes
                    form.setValue('category_id', '');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Select the main category of your grievance
                </FormDescription>
              </FormItem>

              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!selectedParentId || subCategories.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={subCategories.length === 0 ? 'No sub-categories' : 'Select sub-category'} />
                      </SelectTrigger>
                      <SelectContent>
                        {subCategories.length === 0 && selectedParentId && (
                          <SelectItem value={selectedParentId}>
                            {parentCategories.find((c) => c.id === selectedParentId)?.name || 'General'}
                          </SelectItem>
                        )}
                        {subCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Subject */}
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief description of your grievance" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Please provide detailed information about your grievance..."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include all relevant details to help us address your concern quickly
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - General inquiry</SelectItem>
                      <SelectItem value="medium">Medium - Standard issue</SelectItem>
                      <SelectItem value="high">High - Urgent matter</SelectItem>
                      <SelectItem value="urgent">Urgent - Critical issue</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Contact Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="raised_by_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="raised_by_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="raised_by_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+91 XXXXX XXXXX" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Grievance
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
