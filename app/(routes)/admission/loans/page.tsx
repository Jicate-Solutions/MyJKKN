'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Wallet,
  Building2,
  Users,
  TrendingUp,
  Search,
  Filter,
  Plus,
  Download,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Eye,
  Edit,
  ExternalLink,
  IndianRupee,
  Percent,
  Calculator,
  GraduationCap,
  Calendar,
  Phone,
  Mail,
  AlertCircle,
  ArrowRight,
  Banknote,
  CreditCard,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for loan partners
const mockLoanPartners = [
  {
    id: 'LP-001',
    name: 'HDFC Credila',
    logo: null,
    interestRate: { min: 9.5, max: 13.5 },
    maxLoanAmount: 2000000,
    processingFee: 1,
    tenureRange: { min: 1, max: 15 },
    disbursementTime: '7-10 days',
    collateralRequired: false,
    eligibility: 'Indian students with confirmed admission',
    applicationsCount: 45,
    approvedCount: 38,
    status: 'active'
  },
  {
    id: 'LP-002',
    name: 'State Bank of India (SBI)',
    logo: null,
    interestRate: { min: 8.5, max: 10.5 },
    maxLoanAmount: 1500000,
    processingFee: 0.5,
    tenureRange: { min: 1, max: 15 },
    disbursementTime: '10-15 days',
    collateralRequired: true,
    eligibility: 'For loans above ₹7.5 lakhs collateral required',
    applicationsCount: 62,
    approvedCount: 55,
    status: 'active'
  },
  {
    id: 'LP-003',
    name: 'Avanse Financial',
    logo: null,
    interestRate: { min: 10.5, max: 14.5 },
    maxLoanAmount: 2500000,
    processingFee: 1.5,
    tenureRange: { min: 1, max: 12 },
    disbursementTime: '5-7 days',
    collateralRequired: false,
    eligibility: 'No collateral for loans up to ₹40 lakhs',
    applicationsCount: 28,
    approvedCount: 22,
    status: 'active'
  },
  {
    id: 'LP-004',
    name: 'Axis Bank',
    logo: null,
    interestRate: { min: 9.0, max: 12.5 },
    maxLoanAmount: 1000000,
    processingFee: 1,
    tenureRange: { min: 1, max: 10 },
    disbursementTime: '7-12 days',
    collateralRequired: false,
    eligibility: 'Co-applicant with stable income required',
    applicationsCount: 35,
    approvedCount: 28,
    status: 'active'
  }
];

const mockApplications = [
  {
    id: 'LA-001',
    studentName: 'Rahul Kumar',
    studentId: 'STU-2026-001',
    program: 'B.Tech Computer Science',
    loanPartner: 'HDFC Credila',
    loanAmount: 450000,
    status: 'approved',
    appliedDate: '2026-01-10',
    approvedDate: '2026-01-15',
    interestRate: 10.5,
    tenure: 7,
    emiAmount: 7850
  },
  {
    id: 'LA-002',
    studentName: 'Priya Sharma',
    studentId: 'STU-2026-002',
    program: 'MBA',
    loanPartner: 'SBI',
    loanAmount: 800000,
    status: 'processing',
    appliedDate: '2026-01-12',
    approvedDate: null,
    interestRate: null,
    tenure: null,
    emiAmount: null
  },
  {
    id: 'LA-003',
    studentName: 'Amit Singh',
    studentId: 'STU-2026-003',
    program: 'B.Tech Mechanical',
    loanPartner: 'Avanse Financial',
    loanAmount: 350000,
    status: 'documents_pending',
    appliedDate: '2026-01-14',
    approvedDate: null,
    interestRate: null,
    tenure: null,
    emiAmount: null
  }
];

function LoansPageContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEligibilityOpen, setIsEligibilityOpen] = useState(false);
  const [loanAmount, setLoanAmount] = useState([500000]);
  const [tenure, setTenure] = useState([5]);
  const [isApplyingLoan, setIsApplyingLoan] = useState(false);
  const [applyingPartnerId, setApplyingPartnerId] = useState<string | null>(null);
  const [isSchedulingConsultation, setIsSchedulingConsultation] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);

  const totalApplications = mockApplications.length;
  const approvedApplications = mockApplications.filter(a => a.status === 'approved').length;
  const totalLoanAmount = mockApplications.reduce((sum, a) => sum + a.loanAmount, 0);
  const approvedLoanAmount = mockApplications
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + a.loanAmount, 0);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      documents_pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      disbursed: 'bg-purple-100 text-purple-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const calculateEMI = (principal: number, rate: number, years: number) => {
    const monthlyRate = rate / 12 / 100;
    const months = years * 12;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(emi);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-green-500" />
            Loan Connect & Financial Aid
          </h1>
          <p className="text-muted-foreground">Education loan partners and student financing</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isExportingReport}
            onClick={async () => {
              setIsExportingReport(true);
              await new Promise(resolve => setTimeout(resolve, 1000));
              toast.success('Loan report exported successfully');
              setIsExportingReport(false);
            }}
          >
            {isExportingReport ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export Report
          </Button>
          <Dialog open={isEligibilityOpen} onOpenChange={setIsEligibilityOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Calculator className="h-4 w-4 mr-2" />
                Check Eligibility
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Loan Eligibility Calculator</DialogTitle>
                <DialogDescription>Check your education loan eligibility and EMI estimate</DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Loan Amount Required: ₹{loanAmount[0].toLocaleString()}</Label>
                    <Slider
                      value={loanAmount}
                      onValueChange={setLoanAmount}
                      max={2500000}
                      min={100000}
                      step={50000}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>₹1 Lakh</span>
                      <span>₹25 Lakhs</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Repayment Tenure: {tenure[0]} years</Label>
                    <Slider
                      value={tenure}
                      onValueChange={setTenure}
                      max={15}
                      min={1}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1 Year</span>
                      <span>15 Years</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {mockLoanPartners.slice(0, 3).map((partner) => {
                    const emi = calculateEMI(loanAmount[0], (partner.interestRate.min + partner.interestRate.max) / 2, tenure[0]);
                    return (
                      <Card key={partner.id} className="text-center">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{partner.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold">₹{emi.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">EMI/month</p>
                          <p className="text-xs mt-2">
                            {partner.interestRate.min}% - {partner.interestRate.max}%
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEligibilityOpen(false)}>Close</Button>
                <Button
                  disabled={isApplyingLoan}
                  onClick={async () => {
                    setIsApplyingLoan(true);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    toast.success('Loan application submitted successfully');
                    setIsApplyingLoan(false);
                    setIsEligibilityOpen(false);
                  }}
                >
                  {isApplyingLoan ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Apply Now
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Loan Partners</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockLoanPartners.filter(p => p.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">Active partners</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              {approvedApplications} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Loan Facilitated</CardTitle>
            <IndianRupee className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{(approvedLoanAmount / 100000).toFixed(1)}L
            </div>
            <p className="text-xs text-muted-foreground">Total approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((approvedApplications / totalApplications) * 100).toFixed(0)}%
            </div>
            <Progress value={(approvedApplications / totalApplications) * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Loan Partners</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="compare">Compare Loans</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockLoanPartners.map((partner) => (
              <Card key={partner.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Banknote className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{partner.name}</CardTitle>
                        <CardDescription>
                          {partner.disbursementTime} processing
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={partner.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {partner.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Interest Rate</p>
                      <p className="font-semibold text-lg">
                        {partner.interestRate.min}% - {partner.interestRate.max}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Max Loan</p>
                      <p className="font-semibold text-lg">
                        ₹{(partner.maxLoanAmount / 100000).toFixed(0)}L
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Processing Fee</p>
                      <p className="font-semibold">{partner.processingFee}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenure</p>
                      <p className="font-semibold">{partner.tenureRange.min}-{partner.tenureRange.max} years</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {partner.collateralRequired ? (
                      <Badge variant="outline" className="text-orange-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Collateral Required
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        No Collateral
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">{partner.eligibility}</p>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Applications: </span>
                      <span className="font-semibold">{partner.applicationsCount}</span>
                      <span className="text-muted-foreground"> ({partner.approvedCount} approved)</span>
                    </div>
                    <Button
                      size="sm"
                      disabled={applyingPartnerId === partner.id}
                      onClick={async () => {
                        setApplyingPartnerId(partner.id);
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        toast.success(`Application sent to ${partner.name}`);
                        setApplyingPartnerId(null);
                      }}
                    >
                      {applyingPartnerId === partner.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          Apply
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Loan Applications</CardTitle>
              <CardDescription>Track student loan application status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <GraduationCap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{app.studentName}</p>
                        <p className="text-sm text-muted-foreground">{app.program}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-semibold">₹{(app.loanAmount / 100000).toFixed(1)}L</p>
                        <p className="text-xs text-muted-foreground">{app.loanPartner}</p>
                      </div>
                      {app.status === 'approved' && (
                        <div className="text-right">
                          <p className="text-sm">EMI: ₹{app.emiAmount?.toLocaleString()}/mo</p>
                          <p className="text-xs text-muted-foreground">
                            {app.interestRate}% for {app.tenure} years
                          </p>
                        </div>
                      )}
                      <Badge className={getStatusBadge(app.status)}>
                        {app.status.replace('_', ' ')}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => toast.success('Opening application details')}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compare Loan Partners</CardTitle>
              <CardDescription>Side-by-side comparison of all loan options</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Partner</th>
                      <th className="text-center py-3 px-4">Interest Rate</th>
                      <th className="text-center py-3 px-4">Max Loan</th>
                      <th className="text-center py-3 px-4">Processing Fee</th>
                      <th className="text-center py-3 px-4">Tenure</th>
                      <th className="text-center py-3 px-4">Collateral</th>
                      <th className="text-center py-3 px-4">Processing Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockLoanPartners.map((partner) => (
                      <tr key={partner.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{partner.name}</td>
                        <td className="text-center py-3 px-4">
                          {partner.interestRate.min}% - {partner.interestRate.max}%
                        </td>
                        <td className="text-center py-3 px-4">
                          ₹{(partner.maxLoanAmount / 100000).toFixed(0)}L
                        </td>
                        <td className="text-center py-3 px-4">{partner.processingFee}%</td>
                        <td className="text-center py-3 px-4">
                          {partner.tenureRange.min}-{partner.tenureRange.max} yrs
                        </td>
                        <td className="text-center py-3 px-4">
                          {partner.collateralRequired ? (
                            <Badge variant="outline" className="text-orange-600">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600">No</Badge>
                          )}
                        </td>
                        <td className="text-center py-3 px-4">{partner.disbursementTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Document Checklist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Admission letter / Fee structure
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    KYC documents (Aadhaar, PAN)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Academic mark sheets
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Income proof (co-applicant)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Bank statements (6 months)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Passport photos
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-purple-500" />
                  FAQs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">What is the moratorium period?</p>
                  <p className="text-muted-foreground">Course duration + 6-12 months</p>
                </div>
                <div>
                  <p className="font-medium">Is co-applicant mandatory?</p>
                  <p className="text-muted-foreground">Yes, for most banks (parent/guardian)</p>
                </div>
                <div>
                  <p className="font-medium">Tax benefits available?</p>
                  <p className="text-muted-foreground">Yes, under Section 80E of Income Tax</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-5 w-5 text-green-500" />
                  Support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>+91 98765 43210</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>loans@jkkn.ac.in</span>
                </div>
                <p className="text-muted-foreground">
                  Available Mon-Sat, 9 AM - 6 PM
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isSchedulingConsultation}
                  onClick={async () => {
                    setIsSchedulingConsultation(true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    toast.success('Consultation scheduled successfully');
                    setIsSchedulingConsultation(false);
                  }}
                >
                  {isSchedulingConsultation ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    'Schedule Consultation'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LoansPage() {
  return (
    <AdmissionErrorBoundary>
      <LoansPageContent />
    </AdmissionErrorBoundary>
  );
}
