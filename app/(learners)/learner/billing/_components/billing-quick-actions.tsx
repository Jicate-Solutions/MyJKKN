'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
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
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  CreditCard,
  Download,
  FileText,
  Calculator,
  Calendar,
  Phone,
  Mail,
  Bell,
  Settings,
  HelpCircle,
  Receipt,
  AlertTriangle,
  Clock,
  TrendingUp,
  Wallet,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface BillingQuickActionsProps {
  outstandingAmount: number;
  hasOverdue: boolean;
  onPayNow?: (amount?: number) => void;
  showAllActions?: boolean;
}

export function BillingQuickActions({
  outstandingAmount,
  hasOverdue,
  onPayNow,
  showAllActions = false
}: BillingQuickActionsProps) {
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPaymentPlanDialog, setShowPaymentPlanDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentPlan, setPaymentPlan] = useState({
    installments: 3,
    monthlyAmount: 0,
    startDate: '',
    reason: ''
  });

  const quickActions = [
    {
      id: 'pay-now',
      title: 'Pay Now',
      description: 'Make a payment for outstanding bills',
      icon: CreditCard,
      color: 'bg-green-100 text-green-700 hover:bg-green-200',
      badge: outstandingAmount > 0 ? formatCurrency(outstandingAmount) : null,
      badgeVariant: 'destructive' as const,
      urgent: hasOverdue,
      action: () => onPayNow?.(outstandingAmount),
      disabled: outstandingAmount === 0
    },
    {
      id: 'payment-plan',
      title: 'Payment Plan',
      description: 'Request installment payment plan',
      icon: Calendar,
      color: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
      badge: outstandingAmount > 0 ? 'Available' : null,
      badgeVariant: 'secondary' as const,
      action: () => setShowPaymentPlanDialog(true),
      disabled: outstandingAmount === 0
    },
    {
      id: 'download-bills',
      title: 'Download Bills',
      description: 'Download all bills as PDF',
      icon: Download,
      color: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
      action: () => handleDownloadBills()
    },
    {
      id: 'payment-calculator',
      title: 'EMI Calculator',
      description: 'Calculate payment installments',
      icon: Calculator,
      color: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
      action: () => handleEMICalculator()
    }
  ];

  const supportActions = [
    {
      id: 'contact-support',
      title: 'Contact Support',
      description: 'Get help with billing issues',
      icon: Phone,
      color: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      action: () => setShowContactDialog(true)
    },
    {
      id: 'email-reminder',
      title: 'Email Reminder',
      description: 'Get payment reminders via email',
      icon: Mail,
      color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
      action: () => handleEmailReminder()
    },
    {
      id: 'notification-settings',
      title: 'Notifications',
      description: 'Manage billing notifications',
      icon: Bell,
      color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
      action: () => handleNotificationSettings()
    },
    {
      id: 'billing-help',
      title: 'Billing Help',
      description: 'View billing FAQ and guides',
      icon: HelpCircle,
      color: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
      action: () => handleBillingHelp()
    }
  ];

  const handleDownloadBills = () => {
    console.log('Downloading all bills...');
    // Implementation for downloading bills
  };

  const handleEMICalculator = () => {
    console.log('Opening EMI calculator...');
    // Implementation for EMI calculator
  };

  const handleEmailReminder = () => {
    console.log('Setting up email reminder...');
    // Implementation for email reminder
  };

  const handleNotificationSettings = () => {
    console.log('Opening notification settings...');
    // Implementation for notification settings
  };

  const handleBillingHelp = () => {
    console.log('Opening billing help...');
    // Implementation for billing help
  };

  const handleCustomPayment = () => {
    const amount = parseFloat(customAmount);
    if (amount > 0) {
      onPayNow?.(amount);
      setShowPaymentDialog(false);
      setCustomAmount('');
    }
  };

  const handlePaymentPlanRequest = () => {
    console.log('Requesting payment plan:', paymentPlan);
    // Implementation for payment plan request
    setShowPaymentPlanDialog(false);
  };

  const calculateMonthlyAmount = (installments: number) => {
    if (outstandingAmount > 0 && installments > 0) {
      return Math.ceil(outstandingAmount / installments);
    }
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Quick Actions
            {hasOverdue && (
              <Badge variant="destructive" className="ml-2">
                Urgent
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action) => (
              <div
                key={action.id}
                className={`relative p-4 rounded-lg border-2 border-dashed transition-all duration-200 ${
                  action.disabled
                    ? 'opacity-50 cursor-not-allowed border-gray-200'
                    : `${action.color} border-transparent cursor-pointer hover:shadow-md`
                }`}
                onClick={action.disabled ? undefined : action.action}
              >
                {action.urgent && (
                  <div className="absolute -top-2 -right-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 animate-pulse" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-white shadow-sm">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium">{action.title}</h3>
                      {action.badge && (
                        <Badge variant={action.badgeVariant} className="text-xs">
                          {action.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm opacity-80">{action.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Support & Help Actions */}
      {showAllActions && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              Support & Help
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {supportActions.map((action) => (
                <div
                  key={action.id}
                  className={`p-4 rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer ${action.color} border-transparent hover:shadow-md`}
                  onClick={action.action}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-white shadow-sm">
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{action.title}</h3>
                      <p className="text-sm opacity-80">{action.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full" disabled={outstandingAmount === 0}>
            <Wallet className="h-4 w-4 mr-2" />
            Custom Payment Amount
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Custom Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Payment Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                min="1"
                max={outstandingAmount}
              />
              <p className="text-sm text-gray-600 mt-1">
                Outstanding amount: {formatCurrency(outstandingAmount)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomPayment} disabled={!customAmount || parseFloat(customAmount) <= 0}>
              Proceed to Pay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Plan Dialog */}
      <Dialog open={showPaymentPlanDialog} onOpenChange={setShowPaymentPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Payment Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="installments">Number of Installments</Label>
              <Select
                value={paymentPlan.installments.toString()}
                onValueChange={(value) => setPaymentPlan(prev => ({
                  ...prev,
                  installments: parseInt(value),
                  monthlyAmount: calculateMonthlyAmount(parseInt(value))
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Monthly Amount</Label>
              <div className="text-lg font-semibold text-green-600">
                {formatCurrency(calculateMonthlyAmount(paymentPlan.installments))}
              </div>
            </div>

            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={paymentPlan.startDate}
                onChange={(e) => setPaymentPlan(prev => ({ ...prev, startDate: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div>
              <Label htmlFor="reason">Reason for Payment Plan</Label>
              <Textarea
                id="reason"
                placeholder="Please explain why you need a payment plan..."
                value={paymentPlan.reason}
                onChange={(e) => setPaymentPlan(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentPlanDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePaymentPlanRequest}
              disabled={!paymentPlan.startDate || !paymentPlan.reason.trim()}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Support Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Billing Support</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <Phone className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-medium">Phone Support</h3>
                <p className="text-sm text-gray-600">Available 9 AM - 6 PM</p>
                <p className="font-semibold text-blue-600">+91 123 456 7890</p>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <Mail className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-medium">Email Support</h3>
                <p className="text-sm text-gray-600">Response within 24 hours</p>
                <p className="font-semibold text-green-600">billing@jkkn.edu.in</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowContactDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}