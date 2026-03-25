'use client';

/**
 * LTI Tool Dialog Component
 * Form dialog for creating and editing LTI tools
 *
 * Created: 2026-01-12
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { LtiTool } from '@/types/lti';

const toolFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  tool_type: z.enum(['matlab_grader', 'matlab_online', 'matlab_academy', 'matlab_production_server']),
  client_id: z.string().min(10, 'Client ID must be at least 10 characters'),
  deployment_id: z.string().min(1, 'Deployment ID is required'),
  platform_id: z.string().url('Must be a valid URL').optional(),
  launch_url: z.string().url('Must be a valid URL'),
  public_keyset_url: z.string().url('Must be a valid URL'),
  oidc_auth_url: z.string().url('Must be a valid URL'),
  redirect_uri: z.string().url('Must be a valid URL'),
  supports_deep_linking: z.boolean().default(false),
  supports_grade_passback: z.boolean().default(false),
  supports_names_roles: z.boolean().default(false),
  is_active: z.boolean().default(true),
  license_expiry_date: z.string().optional()
});

type ToolFormValues = z.infer<typeof toolFormSchema>;

interface LtiToolDialogProps {
  mode: 'create' | 'edit';
  tool?: LtiTool;
  onSuccess?: () => void;
  children: React.ReactNode;
}

export function LtiToolDialog({ mode, tool, onSuccess, children }: LtiToolDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<ToolFormValues>({
    resolver: zodResolver(toolFormSchema),
    defaultValues: {
      name: '',
      tool_type: 'matlab_grader',
      client_id: '',
      deployment_id: '',
      platform_id: 'https://myjkkn.jkkn.ac.in',
      launch_url: '',
      public_keyset_url: '',
      oidc_auth_url: '',
      redirect_uri: '',
      supports_deep_linking: false,
      supports_grade_passback: false,
      supports_names_roles: false,
      is_active: true,
      license_expiry_date: ''
    }
  });

  // Update form when tool changes (edit mode)
  useEffect(() => {
    if (mode === 'edit' && tool) {
      form.reset({
        name: tool.name,
        tool_type: tool.tool_type as any,
        client_id: tool.client_id,
        deployment_id: tool.deployment_id,
        platform_id: tool.platform_id || 'https://myjkkn.jkkn.ac.in',
        launch_url: tool.launch_url,
        public_keyset_url: tool.public_keyset_url,
        oidc_auth_url: tool.oidc_auth_url,
        redirect_uri: tool.redirect_uri,
        supports_deep_linking: tool.supports_deep_linking,
        supports_grade_passback: tool.supports_grade_passback,
        supports_names_roles: tool.supports_names_roles,
        is_active: tool.is_active,
        license_expiry_date: tool.license_expiry_date || ''
      });
    }
  }, [mode, tool, form]);

  const onSubmit = async (values: ToolFormValues) => {
    try {
      setLoading(true);

      const url = mode === 'create'
        ? '/api/lti/tools'
        : `/api/lti/tools/${tool?.id}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save tool');
      }

      toast({
        title: 'Success',
        description: mode === 'create'
          ? 'LTI tool registered successfully'
          : 'LTI tool updated successfully'
      });

      setOpen(false);
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      console.error('Failed to save tool:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save tool. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Register New LTI Tool' : 'Edit LTI Tool'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Register a new LTI 1.3 tool integration with MyJKKN. You\'ll need credentials from the tool provider (e.g., MathWorks).'
              : 'Update the configuration for this LTI tool.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Basic Information</h3>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool Name</FormLabel>
                    <FormControl>
                      <Input placeholder="MATLAB Grader" {...field} />
                    </FormControl>
                    <FormDescription>Display name for this tool</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tool Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tool type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="matlab_grader">MATLAB Grader</SelectItem>
                        <SelectItem value="matlab_online">MATLAB Online</SelectItem>
                        <SelectItem value="matlab_academy">MATLAB Academy</SelectItem>
                        <SelectItem value="matlab_production_server">MATLAB Production Server</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* LTI 1.3 Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">LTI 1.3 Configuration</h3>

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Provided by tool vendor" {...field} />
                    </FormControl>
                    <FormDescription>Unique identifier from tool provider</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deployment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deployment ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Deployment identifier" {...field} />
                    </FormControl>
                    <FormDescription>Deployment identifier from tool provider</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platform_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform ID (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://myjkkn.jkkn.ac.in" {...field} />
                    </FormControl>
                    <FormDescription>MyJKKN platform identifier</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Endpoint URLs */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Endpoint URLs</h3>

              <FormField
                control={form.control}
                name="launch_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Launch URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://tool.example.com/lti/launch" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="public_keyset_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Public Keyset URL (JWKS)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://tool.example.com/lti/jwks" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="oidc_auth_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OIDC Auth URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://tool.example.com/lti/oidc" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="redirect_uri"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Redirect URI</FormLabel>
                    <FormControl>
                      <Input placeholder="https://tool.example.com/lti/redirect" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Features */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Features</h3>

              <FormField
                control={form.control}
                name="supports_grade_passback"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Grade Passback (AGS)</FormLabel>
                      <FormDescription>
                        Tool can send grades back to MyJKKN
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supports_names_roles"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Names & Roles (NRPS)</FormLabel>
                      <FormDescription>
                        Tool can fetch student roster from MyJKKN
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supports_deep_linking"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Deep Linking</FormLabel>
                      <FormDescription>
                        Tool supports content selection and embedding
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Status & License */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Status & License</h3>

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Only active tools can be launched
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="license_expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Expiry Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      Tool will be blocked after expiry
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : mode === 'create' ? 'Register Tool' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
