// app/(routes)/system/api-management/_components/create-api-key-modal.tsx
'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { CalendarIcon, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  expires_at: z.date().optional(),
  read_only: z.boolean().default(true)
});

type FormValues = z.infer<typeof formSchema>;

interface CreateApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function CreateApiKeyModal({
  open,
  onClose,
  onCreate
}: CreateApiKeyModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [hasConfirmedCopy, setHasConfirmedCopy] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      read_only: true
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      const response = await fetch('/api/system/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: values.name,
          expires_at: values.expires_at?.toISOString(),
          permissions: {
            read: true,
            write: !values.read_only
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create API key');
      }

      const data = await response.json();
      if (!data.plainTextKey) {
        throw new Error('No API key returned from server');
      }

      setNewApiKey(data.plainTextKey);
      toast.success('API key created successfully');
      setHasCopied(false);
      setHasConfirmedCopy(false);
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create API key'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setHasCopied(true);
      toast.success('API key copied to clipboard');
    }
  };

  const handleClose = () => {
    // Only allow closing if they haven't created a new key or if they've confirmed copying
    if (!newApiKey || hasConfirmedCopy) {
      form.reset();
      setNewApiKey(null);
      setHasCopied(false);
      setHasConfirmedCopy(false);
      onClose();
      if (hasConfirmedCopy) {
        onCreate();
      }
    }
  };

  const confirmAndClose = () => {
    if (!hasCopied) {
      toast.error('Please copy the API key before proceeding');
      return;
    }
    setHasConfirmedCopy(true);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-[475px]'>
        <DialogHeader>
          <DialogTitle>
            {newApiKey ? 'Save Your API Key' : 'Create API Key'}
          </DialogTitle>
          <DialogDescription>
            {newApiKey
              ? "Make sure to copy your API key now. You won't be able to see it again!"
              : 'Create a new API key to access the API endpoints.'}
          </DialogDescription>
        </DialogHeader>

        {newApiKey ? (
          <div className='space-y-4 py-4'>
            <Alert variant='destructive'>
              <AlertDescription>
                This API key will only be shown once. Please copy it and store
                it securely.
              </AlertDescription>
            </Alert>
            <div className='flex items-center gap-2 p-4 bg-muted rounded-md'>
              <code className='flex-1 break-all text-sm font-mono'>
                {newApiKey}
              </code>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={copyToClipboard}
              >
                {hasCopied ? (
                  <Check className='h-4 w-4 text-green-500' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
            </div>
            <div className='text-sm text-muted-foreground'>
              {hasCopied ? (
                <span className='text-green-500'>✓ Copied to clipboard</span>
              ) : (
                'Click the copy button to copy the API key'
              )}
            </div>
            <DialogFooter className='gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => copyToClipboard()}
              >
                {hasCopied ? 'Copy Again' : 'Copy API Key'}
              </Button>
              <Button
                onClick={confirmAndClose}
                className={!hasCopied ? 'opacity-50' : ''}
              >
                I&apos;ve Copied the Key
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter API key name' {...field} />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for your API key
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='expires_at'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Expiration Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={`w-full pl-3 text-left font-normal ${
                              !field.value && 'text-muted-foreground'
                            }`}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date() || date > new Date('2100-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Optional: Set an expiration date for the API key
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='read_only'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                    <div className='space-y-0.5'>
                      <FormLabel>Read-only Access</FormLabel>
                      <FormDescription>
                        Only allow reading data, no modifications
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create API Key'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
