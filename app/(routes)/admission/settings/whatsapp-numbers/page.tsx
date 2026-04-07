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
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
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
  Search,
  CloudDownload,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PersonalConnectionTab } from './_components/personal-connection-tab';
import { NumberDetailSheet } from './_components/number-detail-sheet';
import { PersonalTemplatesTab } from './_components/personal-templates-tab';
import { AutoTriggerTab } from './_components/auto-trigger-tab';
import { TemplateManagerTab } from './_components/template-manager-tab';
import { AnalyticsTab } from './_components/analytics-tab';
import { HealthTab } from './_components/health-tab';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  verified_name?: string;
  quality_rating?: string;
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
// Discover from Meta Dialog
// =============================================================================

interface DiscoveredNumber {
  phone_number_id: string;
  display_number: string;
  verified_name: string;
  quality_rating: string;
  platform_type: string;
  verification_status: string;
  status: string;
  messaging_limit: string;
  waba_id: string;
  waba_name: string;
  already_added: boolean;
}

function DiscoverDialog({
  institutionId,
  onSuccess,
}: {
  institutionId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredNumber[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      const res = await fetch(`/api/admission/settings/whatsapp-numbers/discover?institution_id=${institutionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Discovery failed');
      setDiscovered(data.discovered || []);
      if (data.total === 0) {
        setError('No phone numbers found on your Meta account. Make sure the access token has whatsapp_business_management permission.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAdd = async (num: DiscoveredNumber) => {
    setAddingId(num.phone_number_id);
    try {
      const res = await fetch('/api/admission/settings/whatsapp-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: institutionId,
          phone_number_id: num.phone_number_id,
          business_account_id: num.waba_id,
          display_number: num.display_number,
          verified_name: num.verified_name,
          quality_rating: num.quality_rating,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add number');
      }
      toast.success(`Added ${num.display_number} (${num.verified_name})`);
      // Mark as added in local state
      setDiscovered(prev =>
        prev.map(d =>
          d.phone_number_id === num.phone_number_id ? { ...d, already_added: true } : d
        )
      );
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add number');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && discovered.length === 0) handleDiscover(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Search className="h-4 w-4 mr-2" />
          Discover from Meta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discover WhatsApp Numbers</DialogTitle>
          <DialogDescription>
            Phone numbers found on your Meta Business Account. Click + to add any number to MyJKKN.
          </DialogDescription>
        </DialogHeader>

        {isDiscovering && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Scanning Meta Business Account...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-500 text-sm">{error}</div>
        )}

        {!isDiscovering && discovered.length > 0 && (
          <div className="space-y-3">
            {/* Group by WABA */}
            {Array.from(new Set(discovered.map(d => d.waba_id))).map(wabaId => {
              const wabaNumbers = discovered.filter(d => d.waba_id === wabaId);
              const wabaName = wabaNumbers[0]?.waba_name || wabaId;
              return (
                <div key={wabaId} className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">{wabaName}</h4>
                  {wabaNumbers.map(num => (
                    <div
                      key={num.phone_number_id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border',
                        num.already_added ? 'bg-muted/50 opacity-60' : 'bg-card'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{num.display_number}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {num.verified_name}
                          <QualityBadge rating={num.quality_rating} />
                          <Badge variant="outline" className="text-xs">
                            {num.platform_type === 'CLOUD_API' ? 'Cloud API' : num.platform_type}
                          </Badge>
                        </div>
                      </div>
                      {num.already_added ? (
                        <Badge variant="secondary">Already added</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAdd(num)}
                          disabled={addingId === num.phone_number_id}
                        >
                          {addingId === num.phone_number_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleDiscover} disabled={isDiscovering}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isDiscovering && 'animate-spin')} />
            Re-scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Sync from Meta Button
// =============================================================================

function SyncFromMetaButton({ institutionId, onDone }: { institutionId: string; onDone: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/admission/settings/whatsapp-numbers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_id: institutionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      const updated = data.results?.filter((r: { status: string }) => r.status === 'updated').length || 0;
      if (updated > 0) {
        toast.success(`Synced ${updated} number(s) with latest Meta data`);
      } else {
        toast.info('All numbers are up to date');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
      <CloudDownload className={cn('h-4 w-4 mr-2', isSyncing && 'animate-spin')} />
      {isSyncing ? 'Syncing...' : 'Sync from Meta'}
    </Button>
  );
}

// =============================================================================
// Page Content
// =============================================================================

function WhatsAppNumbersContent() {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';
  const isSuperAdmin = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<WAPhoneNumber | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<WAPhoneNumber | null>(null);

  // Department selector for Personal WhatsApp
  const userDepartmentId = profile?.department_id || '';
  const [selectedInstForDept, setSelectedInstForDept] = useState<string>(institutionId);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(userDepartmentId);
  const personalWaDeptId = isSuperAdmin ? selectedDeptId : userDepartmentId;

  // For super admins: load institutions list for cascading selector
  const { institutions: allInstitutions } = useInstitutionsWithAccess();

  // Fetch departments based on selected institution
  const deptInstitutionId = isSuperAdmin ? selectedInstForDept : institutionId;
  const { data: deptData } = useDepartments({
    institution_id: deptInstitutionId,
    page: 1,
    limit: 100,
    isActive: true,
  });

  // Reset department when institution changes
  useEffect(() => {
    if (isSuperAdmin) {
      setSelectedDeptId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstForDept]);

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
              <SyncFromMetaButton
                institutionId={institutionId}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] })}
              />
              <DiscoverDialog
                institutionId={institutionId}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] })}
              />
              <AddNumberDialog
                institutionId={institutionId}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wa-phone-numbers'] })}
              />
            </div>
          </div>

          <Tabs defaultValue="business" className="w-full">
            <TabsList>
              <TabsTrigger value="business">Business Numbers</TabsTrigger>
              <TabsTrigger value="personal">Personal WhatsApp</TabsTrigger>
              <TabsTrigger value="templates">Message Templates</TabsTrigger>
              <TabsTrigger value="template-manager">Template Manager</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="health">Account Health</TabsTrigger>
              <TabsTrigger value="auto-triggers">Auto-Triggers</TabsTrigger>
            </TabsList>

            <TabsContent value="business" className="space-y-6">
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
                      <TableRow key={num.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedNumber(num)}>
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
                            onClick={(e) => {
                              e.stopPropagation();
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
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(num); }}
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
            </TabsContent>

            <TabsContent value="personal">
              <div className="space-y-4">
                {/* Cascading Institution → Department selector for super admins */}
                {isSuperAdmin && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="space-y-2">
                      <Label>Institution</Label>
                      <Select value={selectedInstForDept} onValueChange={setSelectedInstForDept}>
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue placeholder="Select institution..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allInstitutions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedInstForDept && (
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                          <SelectTrigger className="w-full max-w-sm">
                            <SelectValue placeholder="Select department..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(deptData?.data || []).map((dept: any) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.department_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Select institution and department to manage its WhatsApp connection.
                    </p>
                  </div>
                )}

                {personalWaDeptId ? (
                  <PersonalConnectionTab departmentId={personalWaDeptId} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {isSuperAdmin
                      ? 'Select an institution and department above to manage its WhatsApp connection.'
                      : 'No department assigned to your profile. Contact admin.'}
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-6">
              {institutionId ? (
                <PersonalTemplatesTab institutionId={institutionId} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No institution selected.
                </p>
              )}
            </TabsContent>

            <TabsContent value="template-manager" className="space-y-6">
              {institutionId ? (
                <TemplateManagerTab institutionId={institutionId} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No institution selected.</p>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              {institutionId ? (
                <AnalyticsTab institutionId={institutionId} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No institution selected.</p>
              )}
            </TabsContent>

            <TabsContent value="health" className="space-y-6">
              {institutionId ? (
                <HealthTab institutionId={institutionId} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No institution selected.</p>
              )}
            </TabsContent>

            <TabsContent value="auto-triggers" className="space-y-6">
              {institutionId ? (
                <AutoTriggerTab institutionId={institutionId} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No institution selected.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>

      {/* Number Detail Sheet */}
      <NumberDetailSheet
        number={selectedNumber}
        open={!!selectedNumber}
        onOpenChange={(open) => { if (!open) setSelectedNumber(null); }}
        onSetPrimary={(id) => {
          setPrimaryMutation.mutate(id);
          setSelectedNumber(null);
        }}
      />

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
