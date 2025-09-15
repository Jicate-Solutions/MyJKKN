import { useState, useEffect, useCallback } from 'react';
import { LearnerBillingService } from '@/lib/services/learner/learner-billing-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  LearnerBillingDetails,
  LearnerBillingFilters,
  BillingChartData,
  BillingNotification,
  PaymentRequest,
  PaymentResponse
} from '@/types/learner-billing';

export function useLearnerBilling(
  initialFilters: LearnerBillingFilters = { view_mode: 'current_semester' }
) {
  const { profile } = useAuth();
  const [billingData, setBillingData] = useState<LearnerBillingDetails | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LearnerBillingFilters>(initialFilters);

  const fetchBillingData = useCallback(async () => {
    if (!profile?.id) {
      setError('Profile not found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get student ID from profile
      const studentId = profile.email
        ? await LearnerBillingService.getStudentIdFromProfile(profile.email)
        : await LearnerBillingService.getStudentIdFromProfileId(profile.id);

      if (!studentId) {
        setError('Student record not found');
        return;
      }

      const data = await LearnerBillingService.getStudentBillingDetails(
        studentId,
        filters
      );
      setBillingData(data);
    } catch (err) {
      console.error('Error fetching billing data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch billing data'
      );
    } finally {
      setLoading(false);
    }
  }, [profile, filters]);

  const updateFilters = useCallback(
    (newFilters: Partial<LearnerBillingFilters>) => {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const refreshData = useCallback(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  return {
    billingData,
    loading,
    error,
    filters,
    updateFilters,
    refreshData
  };
}

export function useLearnerBillingNotifications() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<BillingNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;

    try {
      setLoading(true);
      setError(null);

      const studentId = profile.email
        ? await LearnerBillingService.getStudentIdFromProfile(profile.email)
        : await LearnerBillingService.getStudentIdFromProfileId(profile.id);

      if (!studentId) {
        setError('Student record not found');
        return;
      }

      const data = await LearnerBillingService.getBillingNotifications(
        studentId
      );
      setNotifications(data);
    } catch (err) {
      console.error('Error fetching billing notifications:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch notifications'
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchNotifications();

    // Set up real-time notifications (if needed)
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === notificationId ? { ...notif, is_read: true } : notif
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, is_read: true }))
    );
  }, []);

  return {
    notifications,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refreshNotifications: fetchNotifications
  };
}

export function useLearnerBillingCharts(
  billingData: LearnerBillingDetails | null
) {
  const [charts, setCharts] = useState<Record<string, BillingChartData>>({});

  useEffect(() => {
    if (!billingData) {
      setCharts({});
      return;
    }

    const stats = billingData.billing_stats;

    // Payment Status Pie Chart
    const paymentStatusChart: BillingChartData = {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Unpaid', 'Overdue', 'Partially Paid'],
        datasets: [
          {
            label: 'Bills by Status',
            data: [
              stats.paid_bills,
              stats.unpaid_bills,
              stats.overdue_bills,
              stats.total_bills -
                stats.paid_bills -
                stats.unpaid_bills -
                stats.overdue_bills
            ],
            backgroundColor: [
              '#10B981', // Green for paid
              '#F59E0B', // Amber for unpaid
              '#EF4444', // Red for overdue
              '#6B7280' // Gray for partially paid
            ]
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          title: {
            display: true,
            text: 'Payment Status Distribution'
          }
        }
      }
    };

    // Monthly Payment Trend
    const paymentTrendChart: BillingChartData = {
      type: 'line',
      data: {
        labels: stats.monthly_breakdown.map((m) => `${m.month} ${m.year}`),
        datasets: [
          {
            label: 'Amount Billed',
            data: stats.monthly_breakdown.map((m) => m.total_billed),
            borderColor: '#3B82F6',
            backgroundColor: '#3B82F640',
            borderWidth: 2,
            fill: false
          },
          {
            label: 'Amount Paid',
            data: stats.monthly_breakdown.map((m) => m.total_paid),
            borderColor: '#10B981',
            backgroundColor: '#10B98140',
            borderWidth: 2,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Monthly Payment Trends'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Amount (₹)'
            }
          }
        }
      }
    };

    // Category-wise Spending
    const categoryChart: BillingChartData = {
      type: 'bar',
      data: {
        labels: stats.category_wise_breakdown.map((c) => c.category_name),
        datasets: [
          {
            label: 'Amount (₹)',
            data: stats.category_wise_breakdown.map((c) => c.total_amount),
            backgroundColor: [
              '#3B82F6',
              '#10B981',
              '#F59E0B',
              '#EF4444',
              '#8B5CF6',
              '#F97316'
            ]
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Category-wise Expenses'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Amount (₹)'
            }
          }
        }
      }
    };

    // Payment Methods Distribution
    const paymentMethodChart: BillingChartData = {
      type: 'pie',
      data: {
        labels: stats.payment_method_stats.map((p) => p.payment_mode),
        datasets: [
          {
            label: 'Usage',
            data: stats.payment_method_stats.map((p) => p.count),
            backgroundColor: [
              '#3B82F6',
              '#10B981',
              '#F59E0B',
              '#EF4444',
              '#8B5CF6'
            ]
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          title: {
            display: true,
            text: 'Payment Methods Used'
          }
        }
      }
    };

    // Outstanding vs Paid Comparison
    const outstandingChart: BillingChartData = {
      type: 'combo',
      data: {
        labels: ['Total Billed', 'Amount Paid', 'Outstanding'],
        datasets: [
          {
            type: 'bar',
            label: 'Amount (₹)',
            data: [
              stats.total_amount_billed,
              stats.total_amount_paid,
              stats.outstanding_amount
            ],
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'],
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Percentage',
            data: [
              100,
              (stats.total_amount_paid / stats.total_amount_billed) * 100,
              (stats.outstanding_amount / stats.total_amount_billed) * 100
            ],
            borderColor: '#EF4444',
            backgroundColor: '#EF444440',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Payment Overview'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Amount (₹)'
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Percentage (%)'
            }
          }
        }
      }
    };

    setCharts({
      paymentStatus: paymentStatusChart,
      paymentTrend: paymentTrendChart,
      categoryBreakdown: categoryChart,
      paymentMethods: paymentMethodChart,
      outstandingComparison: outstandingChart
    });
  }, [billingData]);

  return charts;
}

export function useLearnerPayment() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiatePayment = useCallback(
    async (
      billIds: string[],
      paymentMode: PaymentRequest['payment_mode'],
      amount: number
    ): Promise<PaymentResponse | null> => {
      if (!profile?.id) {
        setError('Profile not found');
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        const studentId = profile.email
          ? await LearnerBillingService.getStudentIdFromProfile(profile.email)
          : await LearnerBillingService.getStudentIdFromProfileId(profile.id);

        if (!studentId) {
          setError('Student record not found');
          return null;
        }

        const paymentRequest: PaymentRequest = {
          bill_ids: billIds,
          payment_mode: paymentMode,
          amount,
          return_url: `${window.location.origin}/learner/billing/payment-success`,
          webhook_url: `${window.location.origin}/api/payment-webhook`,
          metadata: {
            student_id: studentId,
            timestamp: Date.now()
          }
        };

        const response = await LearnerBillingService.initiatePayment(
          studentId,
          paymentRequest
        );

        return response;
      } catch (err) {
        console.error('Error initiating payment:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initiate payment'
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile]
  );

  const getPaymentMethods = useCallback(async () => {
    if (!profile?.id) return [];

    const studentId = profile.email
      ? await LearnerBillingService.getStudentIdFromProfile(profile.email)
      : await LearnerBillingService.getStudentIdFromProfileId(profile.id);

    if (!studentId) return [];

    return await LearnerBillingService.getAvailablePaymentMethods(studentId);
  }, [profile]);

  const requestPaymentPlan = useCallback(
    async (
      billIds: string[],
      plan: {
        installments: number;
        monthly_amount: number;
        start_date: string;
        reason: string;
      }
    ) => {
      if (!profile?.id) {
        setError('Profile not found');
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        const studentId = profile.email
          ? await LearnerBillingService.getStudentIdFromProfile(profile.email)
          : await LearnerBillingService.getStudentIdFromProfileId(profile.id);

        if (!studentId) {
          setError('Student record not found');
          return null;
        }

        const response = await LearnerBillingService.requestPaymentPlan(
          studentId,
          billIds,
          plan
        );

        return response;
      } catch (err) {
        console.error('Error requesting payment plan:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to request payment plan'
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile]
  );

  return {
    loading,
    error,
    initiatePayment,
    getPaymentMethods,
    requestPaymentPlan
  };
}
