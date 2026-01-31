'use client';

import { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, BarChart3, Users } from 'lucide-react';

// ============================================
// ADMISSION ERROR BOUNDARY
// ============================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AdmissionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Admission Module Error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              An error occurred in the admission module. Please try refreshing the page.
            </p>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <Button
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload Page
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// ============================================
// COUNSELOR PERFORMANCE DASHBOARD
// ============================================

interface CounselorPerformanceData {
  counselorId: string;
  name: string;
  leadsAssigned: number;
  leadsConverted: number;
  conversionRate: number;
  avgResponseTime: string;
}

interface CounselorPerformanceDashboardProps {
  institutionId?: string;
  data?: CounselorPerformanceData[];
  loading?: boolean;
}

export function CounselorPerformanceDashboard({
  institutionId,
  data = [],
  loading = false
}: CounselorPerformanceDashboardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Counselor Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Counselor Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No counselor data available
          </p>
        ) : (
          <div className="space-y-4">
            {data.map((counselor) => (
              <div
                key={counselor.counselorId}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{counselor.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {counselor.leadsConverted}/{counselor.leadsAssigned} leads converted
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">
                    {counselor.conversionRate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg: {counselor.avgResponseTime}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// SOURCE ROI DASHBOARD
// ============================================

interface SourceROIData {
  sourceId: string;
  sourceName: string;
  totalLeads: number;
  conversions: number;
  cost: number;
  revenue: number;
  roi: number;
}

interface SourceROIDashboardProps {
  institutionId?: string;
  data?: SourceROIData[];
  loading?: boolean;
}

export function SourceROIDashboard({
  institutionId,
  data = [],
  loading = false
}: SourceROIDashboardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Source ROI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Source ROI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No source ROI data available
          </p>
        ) : (
          <div className="space-y-4">
            {data.map((source) => (
              <div
                key={source.sourceId}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{source.sourceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {source.conversions}/{source.totalLeads} converted
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${source.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {source.roi >= 0 ? '+' : ''}{source.roi.toFixed(1)}% ROI
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cost: ₹{source.cost.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
