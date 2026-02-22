'use client';

import { useState, useMemo, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  useLoanPartners,
  useLoanApplications,
  useLoanAnalytics,
  useLoanMutations,
  useEMICalculator,
} from '@/hooks/admission/use-loans';
import { useAdmissionLeads } from '@/hooks/admission';
import type { LoanPartner, LoanApplicationStatus } from '@/lib/services/admission/loan-service';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  Wallet,
  Building2,
  Calculator,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  IndianRupee,
  Clock,
  CheckCircle2,
  TrendingUp,
  FileText,
  Banknote,
  BarChart3,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_OPTIONS: { value: LoanApplicationStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'documents_pending', label: 'Docs Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'rejected', label: 'Rejected' },
];

function formatINR(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toLocaleString('en-IN');
}

function formatINRFull(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
    under_review: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    documents_pending: 'bg-orange-100 text-orange-700 border-orange-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    disbursed: 'bg-purple-100 text-purple-700 border-purple-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  };

  const labelMap: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under Review',
    documents_pending: 'Docs Pending',
    approved: 'Approved',
    disbursed: 'Disbursed',
    rejected: 'Rejected',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border', colorMap[status] || 'bg-gray-100 text-gray-700')}>
      {labelMap[status] || status}
    </span>
  );
}

// =============================================================================
// NEW APPLICATION DIALOG
// =============================================================================

interface NewApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  partners: LoanPartner[];
}

function NewApplicationDialog({ open, onOpenChange, institutionId, partners }: NewApplicationDialogProps) {
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [loanAmount, setLoanAmount] = useState(500000);
  const [tenureMonths, setTenureMonths] = useState(60);
  const [notes, setNotes] = useState('');
  const [leadSearch, setLeadSearch] = useState('');

  const { calculateEMI, calculateTotalInterest, calculateTotalPayment } = useEMICalculator();
  const { createApplication } = useLoanMutations();

  // Search leads
  const { leads, isLoading: leadsLoading } = useAdmissionLeads({
    institution_id: institutionId,
    search: leadSearch,
    page: 1,
    limit: 10,
  });

  const activePartners = partners.filter(p => p.is_active);
  const selectedPartner = activePartners.find(p => p.id === selectedPartnerId);
  const interestRate = selectedPartner?.interest_rate_min || 10;

  const emi = calculateEMI(loanAmount, interestRate, tenureMonths);
  const totalInterest = calculateTotalInterest(loanAmount, interestRate, tenureMonths);
  const totalPayment = calculateTotalPayment(loanAmount, interestRate, tenureMonths);

  const handleSubmit = async () => {
    if (!selectedLeadId) {
      toast.error('Please select a learner');
      return;
    }
    if (!selectedPartnerId) {
      toast.error('Please select a loan partner');
      return;
    }
    if (loanAmount <= 0) {
      toast.error('Loan amount must be greater than 0');
      return;
    }

    try {
      await createApplication.mutateAsync({
        institutionId,
        input: {
          lead_id: selectedLeadId,
          partner_id: selectedPartnerId,
          loan_amount: loanAmount,
          tenure_months: tenureMonths,
          interest_rate: interestRate,
          emi_amount: emi,
          notes: notes || undefined,
        },
      });
      onOpenChange(false);
      // Reset form
      setSelectedPartnerId('');
      setSelectedLeadId('');
      setLoanAmount(500000);
      setTenureMonths(60);
      setNotes('');
      setLeadSearch('');
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            New Loan Application
          </DialogTitle>
          <DialogDescription>
            Create a loan application for a learner with a partner bank/NBFC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Learner Search */}
          <div className="space-y-2">
            <Label>Search Learner</Label>
            <Input
              placeholder="Type learner name, email, or phone..."
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                setSelectedLeadId('');
              }}
            />
            {leadSearch.length >= 2 && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {leadsLoading ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Searching...
                  </div>
                ) : leads.length === 0 ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">No learners found</div>
                ) : (
                  leads.map((lead: any) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setLeadSearch(lead.full_name || lead.name || '');
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between',
                        selectedLeadId === lead.id && 'bg-muted'
                      )}
                    >
                      <span className="font-medium">{lead.full_name || lead.name}</span>
                      <span className="text-xs text-muted-foreground">{lead.phone || lead.email}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLeadId && (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs text-green-600">Learner selected</span>
              </div>
            )}
          </div>

          {/* Partner Selection */}
          <div className="space-y-2">
            <Label>Loan Partner</Label>
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a loan partner" />
              </SelectTrigger>
              <SelectContent>
                {activePartners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name}
                    {partner.interest_rate_min && partner.interest_rate_max
                      ? ` (${partner.interest_rate_min}% - ${partner.interest_rate_max}%)`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Loan Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Loan Amount</Label>
              <span className="text-sm font-mono font-medium">{formatINRFull(loanAmount)}</span>
            </div>
            <Slider
              value={[loanAmount]}
              onValueChange={(v) => setLoanAmount(v[0])}
              min={100000}
              max={5000000}
              step={50000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1L</span>
              <span>50L</span>
            </div>
          </div>

          {/* Tenure */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tenure</Label>
              <span className="text-sm font-mono font-medium">{tenureMonths} months ({(tenureMonths / 12).toFixed(1)} years)</span>
            </div>
            <Slider
              value={[tenureMonths]}
              onValueChange={(v) => setTenureMonths(v[0])}
              min={12}
              max={120}
              step={6}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 year</span>
              <span>10 years</span>
            </div>
          </div>

          {/* Live EMI Calculation */}
          {selectedPartnerId && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-1.5">
                <Calculator className="h-4 w-4" />
                EMI Estimate ({interestRate}% p.a.)
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Monthly EMI</p>
                  <p className="text-lg font-bold text-primary">{formatINRFull(emi)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Interest</p>
                  <p className="text-lg font-bold text-orange-600">{formatINRFull(totalInterest)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Payment</p>
                  <p className="text-lg font-bold">{formatINRFull(totalPayment)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any additional notes about this loan application..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createApplication.isPending}>
            {createApplication.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Create Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// PARTNER DIALOG (Add/Edit)
// =============================================================================

interface PartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  editingPartner?: LoanPartner | null;
}

function PartnerDialog({ open, onOpenChange, institutionId, editingPartner }: PartnerDialogProps) {
  const [name, setName] = useState(editingPartner?.name || '');
  const [contactPerson, setContactPerson] = useState(editingPartner?.contact_person || '');
  const [contactEmail, setContactEmail] = useState(editingPartner?.contact_email || '');
  const [contactPhone, setContactPhone] = useState(editingPartner?.contact_phone || '');
  const [rateMin, setRateMin] = useState(editingPartner?.interest_rate_min?.toString() || '');
  const [rateMax, setRateMax] = useState(editingPartner?.interest_rate_max?.toString() || '');
  const [maxAmount, setMaxAmount] = useState(editingPartner?.max_loan_amount?.toString() || '');
  const [processingFee, setProcessingFee] = useState(editingPartner?.processing_fee_percent?.toString() || '');
  const [maxTenure, setMaxTenure] = useState(editingPartner?.max_tenure_months?.toString() || '120');
  const [collateralRequired, setCollateralRequired] = useState(editingPartner?.collateral_required || false);
  const [approvalRate, setApprovalRate] = useState(editingPartner?.approval_rate?.toString() || '');
  const [avgDays, setAvgDays] = useState(editingPartner?.avg_processing_days?.toString() || '');
  const [documentsRequired, setDocumentsRequired] = useState(editingPartner?.documents_required?.join(', ') || '');

  const { createPartner, updatePartner } = useLoanMutations();
  const isSaving = createPartner.isPending || updatePartner.isPending;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Partner name is required');
      return;
    }

    const input = {
      name: name.trim(),
      contact_person: contactPerson.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      interest_rate_min: rateMin ? parseFloat(rateMin) : undefined,
      interest_rate_max: rateMax ? parseFloat(rateMax) : undefined,
      max_loan_amount: maxAmount ? parseFloat(maxAmount) : undefined,
      processing_fee_percent: processingFee ? parseFloat(processingFee) : undefined,
      max_tenure_months: maxTenure ? parseInt(maxTenure) : undefined,
      collateral_required: collateralRequired,
      approval_rate: approvalRate ? parseFloat(approvalRate) : undefined,
      avg_processing_days: avgDays ? parseInt(avgDays) : undefined,
      documents_required: documentsRequired
        ? documentsRequired.split(',').map(d => d.trim()).filter(Boolean)
        : undefined,
    };

    try {
      if (editingPartner) {
        await updatePartner.mutateAsync({ partnerId: editingPartner.id, input });
      } else {
        await createPartner.mutateAsync({ institutionId, input });
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {editingPartner ? 'Edit Loan Partner' : 'Add Loan Partner'}
          </DialogTitle>
          <DialogDescription>
            {editingPartner ? 'Update partner details.' : 'Add a new bank or NBFC partner for education loans.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Partner Name *</Label>
            <Input placeholder="e.g., HDFC Credila" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input placeholder="Name" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input placeholder="+91..." value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input placeholder="email@bank.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Min Interest Rate (%)</Label>
              <Input type="number" step="0.1" placeholder="8.5" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max Interest Rate (%)</Label>
              <Input type="number" step="0.1" placeholder="12.5" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Max Loan Amount</Label>
              <Input type="number" placeholder="5000000" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Processing Fee (%)</Label>
              <Input type="number" step="0.1" placeholder="1.0" value={processingFee} onChange={(e) => setProcessingFee(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Max Tenure (months)</Label>
              <Input type="number" placeholder="120" value={maxTenure} onChange={(e) => setMaxTenure(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Approval Rate (%)</Label>
              <Input type="number" step="0.1" placeholder="85" value={approvalRate} onChange={(e) => setApprovalRate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Avg Processing Days</Label>
              <Input type="number" placeholder="7" value={avgDays} onChange={(e) => setAvgDays(e.target.value)} />
            </div>
            <div className="space-y-2 flex items-end gap-2">
              <div className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  id="collateral"
                  checked={collateralRequired}
                  onChange={(e) => setCollateralRequired(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="collateral" className="cursor-pointer text-sm">
                  Collateral Required
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Required Documents (comma-separated)</Label>
            <Textarea
              placeholder="Aadhaar Card, PAN Card, Income Proof, Admission Letter, Fee Structure..."
              value={documentsRequired}
              onChange={(e) => setDocumentsRequired(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editingPartner ? 'Update Partner' : 'Add Partner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// UPDATE STATUS DIALOG
// =============================================================================

interface UpdateStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  currentStatus: string;
}

function UpdateStatusDialog({ open, onOpenChange, applicationId, currentStatus }: UpdateStatusDialogProps) {
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [decisionNotes, setDecisionNotes] = useState('');
  const { updateApplication } = useLoanMutations();

  const handleUpdate = async () => {
    try {
      await updateApplication.mutateAsync({
        applicationId,
        input: {
          status: newStatus as LoanApplicationStatus,
          decision_notes: decisionNotes || undefined,
        },
      });
      onOpenChange(false);
      setDecisionNotes('');
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Application Status</DialogTitle>
          <DialogDescription>Change the status of this loan application.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Decision notes or remarks..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUpdate} disabled={updateApplication.isPending}>
            {updateApplication.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// TAB 1: APPLICATIONS
// =============================================================================

function ApplicationsTab({ institutionId, partners }: { institutionId: string; partners: LoanPartner[] }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewAppOpen, setIsNewAppOpen] = useState(false);
  const [statusDialogApp, setStatusDialogApp] = useState<{ id: string; status: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    status: statusFilter !== 'all' ? statusFilter as LoanApplicationStatus : undefined,
    partner_id: partnerFilter !== 'all' ? partnerFilter : undefined,
    search: searchQuery || undefined,
  }), [statusFilter, partnerFilter, searchQuery]);

  const { applications, isLoading, refetch } = useLoanApplications(institutionId, filters);
  const { deleteApplication } = useLoanMutations();

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteApplication.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search learner name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={partnerFilter} onValueChange={setPartnerFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Partners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {partners.filter(p => p.is_active).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button onClick={() => setIsNewAppOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Application
          </Button>
        </div>
      </div>

      {/* Applications Table */}
      <Card>
        <CardContent className="p-0">
          {applications.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No loan applications yet</p>
              <p className="text-sm">Create the first loan application to get started.</p>
              <Button className="mt-4" onClick={() => setIsNewAppOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Application
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">EMI</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{app.lead?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{app.lead?.phone || app.lead?.email || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{app.partner?.name || 'Unknown'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatINRFull(Number(app.loan_amount))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {app.emi_amount ? formatINRFull(Number(app.emi_amount)) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {app.applied_at ? format(new Date(app.applied_at), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatusDialogApp({ id: app.id, status: app.status })}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Status
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive h-8 w-8"
                          onClick={() => setDeleteConfirmId(app.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Application Dialog */}
      {isNewAppOpen && (
        <NewApplicationDialog
          open={isNewAppOpen}
          onOpenChange={setIsNewAppOpen}
          institutionId={institutionId}
          partners={partners}
        />
      )}

      {/* Update Status Dialog */}
      {statusDialogApp && (
        <UpdateStatusDialog
          open={!!statusDialogApp}
          onOpenChange={(open) => { if (!open) setStatusDialogApp(null); }}
          applicationId={statusDialogApp.id}
          currentStatus={statusDialogApp.status}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loan Application</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this loan application. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// TAB 2: PARTNERS
// =============================================================================

function PartnersTab({ institutionId, partners, isLoading, refetch }: {
  institutionId: string;
  partners: LoanPartner[];
  isLoading: boolean;
  refetch: () => void;
}) {
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<LoanPartner | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { deletePartner } = useLoanMutations();

  const handleEdit = useCallback((partner: LoanPartner) => {
    setEditingPartner(partner);
    setIsPartnerDialogOpen(true);
  }, []);

  const handleNewPartner = useCallback(() => {
    setEditingPartner(null);
    setIsPartnerDialogOpen(true);
  }, []);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deletePartner.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Loan Partners</h3>
          <p className="text-sm text-muted-foreground">
            {partners.filter(p => p.is_active).length} active partners
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button onClick={handleNewPartner}>
            <Plus className="h-4 w-4 mr-1" /> Add Partner
          </Button>
        </div>
      </div>

      {partners.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No loan partners yet</p>
            <p className="text-sm">Add your first bank or NBFC partner to start managing loan applications.</p>
            <Button className="mt-4" onClick={handleNewPartner}>
              <Plus className="h-4 w-4 mr-1" /> Add Partner
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((partner) => (
            <Card key={partner.id} className={cn('relative', !partner.is_active && 'opacity-60')}>
              {!partner.is_active && (
                <Badge variant="secondary" className="absolute top-3 right-3 text-xs">
                  Inactive
                </Badge>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{partner.name}</CardTitle>
                      {partner.contact_person && (
                        <CardDescription className="text-xs">{partner.contact_person}</CardDescription>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">
                      {partner.interest_rate_min && partner.interest_rate_max
                        ? `${partner.interest_rate_min}% - ${partner.interest_rate_max}%`
                        : partner.interest_rate_min
                        ? `From ${partner.interest_rate_min}%`
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Amount</p>
                    <p className="font-medium">
                      {partner.max_loan_amount ? formatINR(Number(partner.max_loan_amount)) : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Tenure</p>
                    <p className="font-medium">{partner.max_tenure_months} months</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Processing Fee</p>
                    <p className="font-medium">
                      {partner.processing_fee_percent ? `${partner.processing_fee_percent}%` : 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  {partner.approval_rate !== null && partner.approval_rate !== undefined && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {partner.approval_rate}% Approval
                    </Badge>
                  )}
                  {partner.avg_processing_days !== null && partner.avg_processing_days !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {partner.avg_processing_days}d Avg
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {partner.collateral_required ? (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                      <Shield className="h-3 w-3 mr-1" /> Collateral Required
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      No Collateral
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {partner.active_applications_count || 0} Active Apps
                  </Badge>
                </div>

                <div className="flex items-center justify-end gap-1 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(partner)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {partner.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteConfirmId(partner.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Deactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Partner Dialog */}
      {isPartnerDialogOpen && (
        <PartnerDialog
          open={isPartnerDialogOpen}
          onOpenChange={(open) => {
            setIsPartnerDialogOpen(open);
            if (!open) setEditingPartner(null);
          }}
          institutionId={institutionId}
          editingPartner={editingPartner}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Loan Partner</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the loan partner. Existing applications will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// TAB 3: EMI CALCULATOR
// =============================================================================

function EMICalculatorTab({ partners }: { partners: LoanPartner[] }) {
  const [loanAmount, setLoanAmount] = useState(500000);
  const [interestRate, setInterestRate] = useState(10);
  const [tenureMonths, setTenureMonths] = useState(60);

  const { calculateEMI, calculateTotalInterest, calculateTotalPayment } = useEMICalculator();

  const emi = calculateEMI(loanAmount, interestRate, tenureMonths);
  const totalInterest = calculateTotalInterest(loanAmount, interestRate, tenureMonths);
  const totalPayment = calculateTotalPayment(loanAmount, interestRate, tenureMonths);

  // Build comparison table data
  const activePartners = partners.filter(p => p.is_active && p.interest_rate_min);
  const comparisonData = activePartners.map((partner) => {
    const rateMin = partner.interest_rate_min || 0;
    const rateMax = partner.interest_rate_max || rateMin;
    const emiMin = calculateEMI(loanAmount, rateMin, tenureMonths);
    const emiMax = calculateEMI(loanAmount, rateMax, tenureMonths);
    const totalMin = calculateTotalPayment(loanAmount, rateMin, tenureMonths);
    const totalMax = calculateTotalPayment(loanAmount, rateMax, tenureMonths);
    const interestMin = calculateTotalInterest(loanAmount, rateMin, tenureMonths);
    const interestMax = calculateTotalInterest(loanAmount, rateMax, tenureMonths);

    return {
      name: partner.name,
      rateRange: `${rateMin}% - ${rateMax}%`,
      emiRange: emiMin === emiMax
        ? formatINRFull(emiMin)
        : `${formatINRFull(emiMin)} - ${formatINRFull(emiMax)}`,
      totalRange: totalMin === totalMax
        ? formatINRFull(totalMin)
        : `${formatINRFull(totalMin)} - ${formatINRFull(totalMax)}`,
      interestRange: interestMin === interestMax
        ? formatINRFull(interestMin)
        : `${formatINRFull(interestMin)} - ${formatINRFull(interestMax)}`,
      collateral: partner.collateral_required ? 'Yes' : 'No',
      maxTenure: `${partner.max_tenure_months} months`,
      processingFee: partner.processing_fee_percent ? `${partner.processing_fee_percent}%` : '-',
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calculator Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              EMI Calculator
            </CardTitle>
            <CardDescription>
              Calculate monthly EMI for education loans
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Loan Amount */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Loan Amount</Label>
                <div className="flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                    className="w-32 h-8 text-right font-mono"
                  />
                </div>
              </div>
              <Slider
                value={[loanAmount]}
                onValueChange={(v) => setLoanAmount(v[0])}
                min={100000}
                max={5000000}
                step={50000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 Lakh</span>
                <span>50 Lakhs</span>
              </div>
            </div>

            {/* Interest Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Interest Rate (% p.a.)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-20 h-8 text-right font-mono"
                />
              </div>
              <Slider
                value={[interestRate]}
                onValueChange={(v) => setInterestRate(v[0])}
                min={6}
                max={18}
                step={0.25}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>6%</span>
                <span>18%</span>
              </div>
            </div>

            {/* Tenure */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Loan Tenure</Label>
                <span className="text-sm font-mono font-medium">{tenureMonths} months ({(tenureMonths / 12).toFixed(1)} yrs)</span>
              </div>
              <Slider
                value={[tenureMonths]}
                onValueChange={(v) => setTenureMonths(v[0])}
                min={12}
                max={120}
                step={6}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 year</span>
                <span>10 years</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Loan Breakdown</CardTitle>
            <CardDescription>
              Based on your inputs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Monthly EMI */}
            <div className="text-center p-6 bg-primary/5 rounded-xl">
              <p className="text-sm text-muted-foreground mb-1">Monthly EMI</p>
              <p className="text-4xl font-bold text-primary">{formatINRFull(emi)}</p>
            </div>

            {/* Breakdown cards */}
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span className="text-sm">Principal Amount</span>
                </div>
                <span className="font-mono font-medium">{formatINRFull(loanAmount)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                  <span className="text-sm">Total Interest</span>
                </div>
                <span className="font-mono font-medium text-orange-600">{formatINRFull(totalInterest)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/80 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Payment</span>
                </div>
                <span className="font-mono font-bold text-lg">{formatINRFull(totalPayment)}</span>
              </div>
            </div>

            {/* Interest percentage */}
            <div className="text-center text-sm text-muted-foreground">
              Interest is <span className="font-semibold text-foreground">{loanAmount > 0 ? ((totalInterest / loanAmount) * 100).toFixed(1) : 0}%</span> of the principal
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Partner Comparison Table */}
      {comparisonData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Partner-wise EMI Comparison
            </CardTitle>
            <CardDescription>
              EMI comparison for {formatINRFull(loanAmount)} over {tenureMonths} months across all partners
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Interest Rate</TableHead>
                  <TableHead className="text-right">Monthly EMI</TableHead>
                  <TableHead className="text-right">Total Interest</TableHead>
                  <TableHead className="text-right">Total Payment</TableHead>
                  <TableHead>Collateral</TableHead>
                  <TableHead>Processing Fee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonData.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.rateRange}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.emiRange}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-orange-600">{row.interestRange}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">{row.totalRange}</TableCell>
                    <TableCell>{row.collateral}</TableCell>
                    <TableCell>{row.processingFee}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// TAB 4: ANALYTICS
// =============================================================================

function AnalyticsTab({ institutionId }: { institutionId: string }) {
  const { analytics, isLoading } = useLoanAnalytics(institutionId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No analytics data available</p>
        <p className="text-sm">Create some loan applications first to see analytics.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: '#6b7280',
    submitted: '#3b82f6',
    under_review: '#eab308',
    documents_pending: '#f97316',
    approved: '#22c55e',
    disbursed: '#a855f7',
    rejected: '#ef4444',
  };

  const pieData = analytics.status_distribution.map((item) => ({
    name: STATUS_OPTIONS.find(s => s.value === item.status)?.label || item.status,
    value: item.count,
    fill: statusColors[item.status] || '#6b7280',
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Total Applications
            </CardDescription>
            <CardTitle className="text-3xl">{analytics.total_applications}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{analytics.pending} pending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Approved
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{analytics.approved}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {analytics.total_applications > 0
                ? `${Math.round((analytics.approved / analytics.total_applications) * 100)}% approval rate`
                : 'No applications yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-purple-600" />
              Disbursed Amount
            </CardDescription>
            <CardTitle className="text-3xl">
              {analytics.total_disbursed_amount > 0 ? formatINR(analytics.total_disbursed_amount) : '0'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{analytics.disbursed} disbursements</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Avg Processing
            </CardDescription>
            <CardTitle className="text-3xl">{analytics.avg_processing_days}d</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">average days to decision</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Partner-wise Approval Rate */}
        {analytics.partner_analytics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Partner-wise Approval Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.partner_analytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="partner_name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'Approval Rate']} />
                  <Bar dataKey="approval_rate" fill="#22c55e" radius={[4, 4, 0, 0]} name="Approval Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Status Distribution */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Monthly Trend */}
      {analytics.monthly_trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Monthly Loan Application Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="applications"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Applications"
                />
                <Line
                  type="monotone"
                  dataKey="approved"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Approved"
                />
                <Line
                  type="monotone"
                  dataKey="disbursed"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Disbursed"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Partner Performance Table */}
      {analytics.partner_analytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partner Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Disbursed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Approval Rate</TableHead>
                  <TableHead className="text-right">Avg Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.partner_analytics.map((pa) => (
                  <TableRow key={pa.partner_id}>
                    <TableCell className="font-medium">{pa.partner_name}</TableCell>
                    <TableCell className="text-right">{pa.total_applications}</TableCell>
                    <TableCell className="text-right text-green-600">{pa.approved}</TableCell>
                    <TableCell className="text-right text-red-600">{pa.rejected}</TableCell>
                    <TableCell className="text-right text-purple-600">{pa.disbursed}</TableCell>
                    <TableCell className="text-right">{pa.pending}</TableCell>
                    <TableCell className="text-right font-medium">{pa.approval_rate}%</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatINR(pa.avg_loan_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE CONTENT
// =============================================================================

function LoansPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const { partners, isLoading: partnersLoading, refetch: refetchPartners } = useLoanPartners(selectedInstitutionId);

  const isLoading = accessLoading || partnersLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (!selectedInstitutionId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No institution selected</p>
        <p className="text-sm">Please select an institution to manage loan applications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Loan Connect & Financial Aid</h2>
          <p className="text-muted-foreground">
            Manage education loan partners, track learner applications, and compare EMI options
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="applications" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="applications" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="partners" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            Partners
          </TabsTrigger>
          <TabsTrigger value="calculator" className="flex items-center gap-1.5">
            <Calculator className="h-4 w-4" />
            EMI Calculator
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="mt-6">
          <ApplicationsTab
            institutionId={selectedInstitutionId}
            partners={partners}
          />
        </TabsContent>

        <TabsContent value="partners" className="mt-6">
          <PartnersTab
            institutionId={selectedInstitutionId}
            partners={partners}
            isLoading={partnersLoading}
            refetch={refetchPartners}
          />
        </TabsContent>

        <TabsContent value="calculator" className="mt-6">
          <EMICalculatorTab partners={partners} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <AnalyticsTab institutionId={selectedInstitutionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// PAGE EXPORT
// =============================================================================

export default function LoansPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Loan Connect">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Loan Connect</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AdmissionErrorBoundary>
          <LoansPageContent />
        </AdmissionErrorBoundary>
      </ContentLayout>
    </PermissionGuard>
  );
}
