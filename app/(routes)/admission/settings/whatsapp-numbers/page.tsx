'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  Phone,
  Plus,
  Trash2,
  Star,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface WAPhoneNumber {
  id: string;
  institution_id: string;
  phone_number_id: string;
  business_account_id: string;
  display_number: string;
  verified_name: string | null;
  quality_rating: string;
  messaging_limit: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// API functions
// =============================================================================

async function fetchWANumbers(institutionId: string): Promise<WAPhoneNumber[]> {
  const res = await fetch(`/api/admission/settings/whatsapp-numbers?institution_id=${institutionId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch WhatsApp numbers');
  }
  const json = await res.json();
  return json.data || [];
}

async function addWANumber(data: {
  institution_id: string;
  phone_number_id: string;
  business_account_id: string;
  display_number: string;
  access_token?: string;
}): Promise<WAPhoneNumber> {
  const res = await fetch('/api/admission/settings/whatsapp-numbers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add number');
  }
  const json = await res.json();
  return json.data;
}

async function deleteWANumber(id: string): Promise<void> {
  const res = await fetch(`/api/admission/settings/whatsapp-numbers/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete number');
  }
}

async function setPrimaryNumber(id: string, institutionId: string): Promise<void> {
  const res = await fetch(`/api/admission/settings/whatsapp-numbers/${id}/primary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ institution_id: institutionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to set primary number');
  }
}

// =============================================================================
// Quality + Limit badge helpers
// =============================================================================

function QualityBadge({ rating }: { rating: string }) {
  const config: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    GREEN: { icon: CheckCircle, color: 'text-green-600 bg-green-100', label: 'Green' },
    YELLOW: { icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-100', label: 'Yellow' },
    RED: { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Red' },
  };
  const c = config[rating] || config.GREEN;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn('text-xs gap-1', c.color)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function MessagingLimitBadge({ limit }: { limit: string }) {
  const labels: Record<string, string> = {
    TIER_1K: '1K/day',
    TIER_10K: '10K/day',
    TIER_100K: '100K/day',
    UNLIMITED: 'Unlimited',
  };
  return (
    <Badge variant="secondary" className="text-xs">
      {labels[limit] || limit}
    </Badge>
  );
}

// =============================================================================
// Add Number Dialog
// =============================================================================

function AddNumberDialog({
  institutionId,
  onSuccess,
}: {
  institutionId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [displayNumber, setDisplayNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!phoneNumberId || !businessAccountId || !displayNumber) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);
    try {
      await addWANumber({
        institution_id: institutionId,
        phone_number_id: phoneNumberId,
        business_account_id: businessAccountId,
        display_number: displayNumber,
        access_token: accessToken || undefined,
      });
      toast.success('WhatsApp number added successfully');
      setOpen(false);
      setPhoneNumberId('');
      setBusinessAccountId('');
      setDisplayNumber('');
      setAccessToken('');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add number');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Number
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add WhatsApp Business Number</DialogTitle>
          <DialogDescription>
            Add a new WABA phone number for this institution. You can find these IDs in the Meta Business Manager.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Phone Number ID *</Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g., 123456789012345"
            />
            <p className="text-xs text-muted-foreground">Meta&apos;s phone_number_id from Business Manager</p>
          </div>
          <div className="space-y-2">
            <Label>Business Account ID *</Label>
            <Input
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="e.g., 987654321098765"
            />
            <p className="text-xs text-muted-foreground">WABA ID from Meta Business Manager</p>
          </div>
          <div className="space-y-2">
            <Label>Display Number *</Label>
            <Input
              value={displayNumber}
              onChange={(e) => setDisplayNumber(e.target.value)}
              placeholder="e.g., +91 98765 43210"
            />
          </div>
          <div className="space-y-2">
            <Label>Access Token (optional)</Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="If different from global token"
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the global WHATSAPP_ACCESS_TOKEN</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Number'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Page Content
// =============================================================================

function WhatsAppNumbersContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<WAPhoneNumber | null>(null);

  const { data: numbers, isLoading, refetch } = useQuery({
    queryKey: ['wa-phone-numbers', institutionId],
    queryFn: () => fetchWANumbers(institutionId),
    enabled: !!institutionId,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWANumber,
    onSuccess: () => {
      toast.success('Number removed');
      queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (id: string) => setPrimaryNumber(id, institutionId),
    onSuccess: () => {
      toast.success('Primary number updated');
      queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <PermissionGuard module="admission" action="manage">
      <ContentLayout title="WhatsApp Numbers">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>WhatsApp Numbers</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <AddNumberDialog
                institutionId={institutionId}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] })}
              />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Phone className="h-6 w-6 text-green-600" />
              WhatsApp Business Numbers
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage WABA phone numbers for your institution. Each institution can have multiple numbers.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Configured Numbers</CardTitle>
              <CardDescription>
                {(numbers || []).length} number{(numbers || []).length !== 1 ? 's' : ''} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (numbers || []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Phone className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No WhatsApp numbers configured</p>
                  <p className="text-sm mt-1">Add your first WABA number to get started</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Verified Name</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Messaging Limit</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(numbers || []).map((num) => (
                      <TableRow key={num.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{num.display_number}</p>
                            <p className="text-xs text-muted-foreground">ID: {num.phone_number_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {num.verified_name ? (
                            <div className="flex items-center gap-1">
                              <Shield className="h-3 w-3 text-blue-500" />
                              <span className="text-sm">{num.verified_name}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not verified</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <QualityBadge rating={num.quality_rating} />
                        </TableCell>
                        <TableCell>
                          <MessagingLimitBadge limit={num.messaging_limit} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn('h-8 w-8', num.is_primary && 'text-yellow-500')}
                            onClick={() => {
                              if (!num.is_primary) setPrimaryMutation.mutate(num.id);
                            }}
                            disabled={num.is_primary || setPrimaryMutation.isPending}
                          >
                            <Star className={cn('h-4 w-4', num.is_primary && 'fill-current')} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={num.is_active ? 'default' : 'secondary'}>
                            {num.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(num)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove WhatsApp Number</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deleteTarget?.display_number}? This will disconnect it from your institution. Active conversations will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionGuard>
  );
}

export default function WhatsAppNumbersPage() {
  return <WhatsAppNumbersContent />;
}
