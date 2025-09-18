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
  Download,
  FileText,
  Calculator,
  Calendar,
  Phone,
  Mail,
  Bell,
  HelpCircle,
  Receipt,
  AlertTriangle,
  Clock,
  TrendingUp,
  Wallet,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Eye,
  Info,
  BarChart3
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface BillingQuickActionsProps {
  outstandingAmount: number;
  hasOverdue: boolean;
  showAllActions?: boolean;
}

export function BillingQuickActions({
  outstandingAmount,
  hasOverdue,
  showAllActions = false
}: BillingQuickActionsProps) {
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showPaymentInfoDialog, setShowPaymentInfoDialog] = useState(false);

  const viewActions = [
    {
      id: 'view-bills',
      title: 'View Bill Details',
      description: 'View detailed bill information and status',
      icon: Receipt,
      color: 'bg-green-100 text-green-700 hover:bg-green-200',
      badge: outstandingAmount > 0 ? formatCurrency(outstandingAmount) : 'Up to date',
      badgeVariant: outstandingAmount > 0 ? 'destructive' : 'default' as const,
      urgent: hasOverdue,
      action: () => handleViewBillDetails()
    },
    {
      id: 'payment-info',
      title: 'Payment Information',
      description: 'View payment methods and instructions',
      icon: Info,
      color: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
      badge: 'Available',
      badgeVariant: 'secondary' as const,
      action: () => setShowPaymentInfoDialog(true)
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
      title: 'Payment Calculator',
      description: 'Calculate payment amounts and due dates',
      icon: Calculator,
      color: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
      action: () => handlePaymentCalculator()
    }
  ];

  const supportActions = [
    {
      id: 'contact-support',
      title: 'Contact Support',
      description: 'Get help with billing inquiries',
      icon: Phone,
      color: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      action: () => setShowContactDialog(true)
    },
    {
      id: 'email-reminder',
      title: 'Payment Reminders',
      description: 'View payment reminder settings',
      icon: Mail,
      color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
      action: () => handleViewReminders()
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

  const handleViewBillDetails = () => {
    console.log('Viewing bill details...');
    // Implementation for viewing bill details
  };

  const handleDownloadBills = () => {
    console.log('Downloading all bills...');
    // Implementation for downloading bills
  };

  const handlePaymentCalculator = () => {
    console.log('Opening payment calculator...');
    // Implementation for payment calculator
  };

  const handleViewReminders = () => {
    console.log('Viewing payment reminders...');
    // Implementation for viewing reminders
  };

  const handleNotificationSettings = () => {
    console.log('Opening notification settings...');
    // Implementation for notification settings
  };

  const handleBillingHelp = () => {
    console.log('Opening billing help...');
    // Implementation for billing help
  };

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <Card className="bg-gradient-to-br from-blue-50 via-gray-50 to-green-50 border-0 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-[#0b6d41]" />
            Billing Information
            {hasOverdue && (
              <Badge variant="destructive" className="ml-2 animate-pulse">
                Attention Required
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {viewActions.map((action) => (
              <div
                key={action.id}
                className={`relative p-4 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${action.color} border-transparent hover:shadow-lg hover:scale-105`}
                onClick={action.action}
              >
                {action.urgent && (
                  <div className="absolute -top-2 -right-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 animate-bounce" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-full bg-white shadow-md">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">{action.title}</h3>
                      {action.badge && (
                        <Badge variant={action.badgeVariant as any} className="text-xs">
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
        <Card className="bg-gradient-to-br from-purple-50 via-gray-50 to-blue-50 border-0 shadow-xl">
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
                  className={`p-4 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer ${action.color} border-transparent hover:shadow-lg hover:scale-105`}
                  onClick={action.action}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-full bg-white shadow-md">
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{action.title}</h3>
                      <p className="text-sm opacity-80">{action.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Information Dialog */}
      <Dialog open={showPaymentInfoDialog} onOpenChange={setShowPaymentInfoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Payment Information
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-800 mb-2">Online Payment Available</h3>
              <p className="text-sm text-blue-700 mb-3">
                For security and convenience, all payments are processed through the main JKKN application.
              </p>
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <ExternalLink className="h-4 w-4" />
                <span>Visit the main application to make payments</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Outstanding Amount</span>
                <span className="font-bold text-red-600">{formatCurrency(outstandingAmount)}</span>
              </div>

              {hasOverdue && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-700">Immediate payment required for overdue bills</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-medium text-green-800 mb-2">Payment Methods Accepted</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Credit/Debit Cards</li>
                <li>• Net Banking</li>
                <li>• UPI Payments</li>
                <li>• Digital Wallets</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPaymentInfoDialog(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Support Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-600" />
              Contact Billing Support
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center space-y-4">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <Phone className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-blue-800">Phone Support</h3>
                <p className="text-sm text-blue-600">Available 9 AM - 6 PM</p>
                <p className="font-bold text-blue-700 text-lg">+91 123 456 7890</p>
              </div>

              <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                <Mail className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold text-green-800">Email Support</h3>
                <p className="text-sm text-green-600">Response within 24 hours</p>
                <p className="font-bold text-green-700 text-lg">billing@jkkn.edu.in</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl">
              <h4 className="font-medium mb-2">Before contacting support:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Have your student ID ready</li>
                <li>• Note down the bill number if applicable</li>
                <li>• Describe your query clearly</li>
              </ul>
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