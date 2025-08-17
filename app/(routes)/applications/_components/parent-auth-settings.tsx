'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Shield,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  AlertCircle,
  Users
} from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';

interface ParentAuthSettingsProps {
  form: UseFormReturn<any>;
  isEditing?: boolean;
  existingApiKey?: string | null;
}

export function ParentAuthSettings({
  form,
  isEditing,
  existingApiKey
}: ParentAuthSettingsProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const usesParentAuth = form.watch('uses_parent_auth');

  // Generate API key
  const generateApiKey = () => {
    const prefix = 'app';
    const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${prefix}_${randomBytes.substring(0, 16)}_${randomBytes.substring(16, 32)}`;
  };

  // Generate app ID from app name
  const generateAppId = (appName: string) => {
    const cleanName = appName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    const timestamp = Date.now().toString(36);
    return `${cleanName}_${timestamp}`;
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Watch app name for generating app ID
  const appName = form.watch('name');
  
  useEffect(() => {
    if (usesParentAuth && appName && !form.getValues('app_id')) {
      form.setValue('app_id', generateAppId(appName));
    }
  }, [appName, usesParentAuth, form]);

  const handleGenerateApiKey = () => {
    const newApiKey = generateApiKey();
    setGeneratedApiKey(newApiKey);
    form.setValue('api_key', newApiKey);
  };

  const availableScopes = [
    { value: 'read', label: 'Read', description: 'Read user profile data' },
    { value: 'write', label: 'Write', description: 'Modify user data' },
    { value: 'profile', label: 'Profile', description: 'Access user profile' },
    { value: 'admin', label: 'Admin', description: 'Administrative access' }
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Parent App Authentication</CardTitle>
          </div>
          <FormField
            control={form.control}
            name="uses_parent_auth"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormLabel className="text-sm">Enable</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <CardDescription>
          Allow this application to use MyJKKN authentication instead of
          separate login
        </CardDescription>
      </CardHeader>

      {usesParentAuth && (
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              When enabled, users will log in through MyJKKN and be redirected
              to your application with authentication tokens. No separate user
              management needed.
            </AlertDescription>
          </Alert>

          {/* App ID */}
          <FormField
            control={form.control}
            name="app_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Application ID</FormLabel>
                <FormDescription>
                  Unique identifier for authentication (auto-generated)
                </FormDescription>
                <div className="flex gap-2">
                  <FormControl>
                    <Input {...field} value={field.value || ''} readOnly />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(field.value || '', 'app_id')}
                  >
                    {copiedField === 'app_id' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <FormDescription>
              Secret key for authenticating your application
            </FormDescription>
            {!isEditing || generatedApiKey ? (
              <div className="space-y-2">
                {generatedApiKey && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      <strong>Save this API key now!</strong> It won&apos;t be shown
                      again.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={generatedApiKey || '••••••••••••••••••••'}
                    readOnly
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    disabled={!generatedApiKey}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(generatedApiKey || '', 'api_key')
                    }
                    disabled={!generatedApiKey}
                  >
                    {copiedField === 'api_key' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {!generatedApiKey && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateApiKey}
                    className="w-full"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Generate API Key
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value="API Key already set (hidden for security)"
                  disabled
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateApiKey}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>
            )}
          </div>

          {/* Redirect URIs */}
          <FormField
            control={form.control}
            name="allowed_redirect_uris"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Allowed Redirect URIs</FormLabel>
                <FormDescription>
                  Allowed callback URLs after authentication (one per line)
                </FormDescription>
                <FormControl>
                  <Textarea
                    placeholder={`https://yourapp.myjkkn.ac.in/auth/callback
http://localhost:3000/auth/callback`}
                    value={field.value?.join('\n') || ''}
                    onChange={(e) => {
                      const uris = e.target.value
                        .split('\n')
                        .map((uri) => uri.trim())
                        .filter((uri) => uri.length > 0);
                      field.onChange(uris);
                    }}
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Allowed Scopes */}
          <FormField
            control={form.control}
            name="allowed_scopes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Permission Scopes</FormLabel>
                <FormDescription>
                  Select the permissions this app can access
                </FormDescription>
                <div className="grid grid-cols-2 gap-4">
                  {availableScopes.map((scope) => (
                    <div
                      key={scope.value}
                      className="flex items-start space-x-2"
                    >
                      <Checkbox
                        checked={field.value?.includes(scope.value)}
                        onCheckedChange={(checked) => {
                          const currentScopes = field.value || [];
                          if (checked) {
                            field.onChange([...currentScopes, scope.value]);
                          } else {
                            field.onChange(
                              currentScopes.filter((s: string) => s !== scope.value)
                            );
                          }
                        }}
                      />
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {scope.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {scope.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Access Control Note */}
          <Alert className="border-blue-200 bg-blue-50">
            <Users className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <strong>Role-Based Access:</strong> The authentication will use the roles configured in the &quot;Access Control&quot; section above. Only users with the selected roles can authenticate to this child application.
            </AlertDescription>
          </Alert>

          {/* Rate Limiting */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="rate_limit_requests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rate Limit (Requests)</FormLabel>
                  <FormDescription>Max requests per window</FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rate_limit_window_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Window (Minutes)</FormLabel>
                  <FormDescription>Time window for rate limit</FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Integration Guide Link */}
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <strong>Need help integrating?</strong> Check out our{' '}
              <a
                href="/application-hub/api-guidelines"
                target="_blank"
                className="font-medium underline"
              >
                Child App Integration Guide
              </a>{' '}
              for step-by-step instructions.
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}