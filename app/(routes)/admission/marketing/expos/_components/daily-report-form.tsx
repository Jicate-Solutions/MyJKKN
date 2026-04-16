'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Loader2, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useCreateDailyReport } from '@/hooks/admission/use-expos';
import { PhotoUploadGrid } from './photo-upload-grid';
import type { ExpoEvent } from '@/types/admission';

interface DailyReportFormProps {
  expoEvent: ExpoEvent;
}

interface ExpenseFields {
  stall_fee: number;
  travel_expense: number;
  accommodation_expense: number;
  food_expense: number;
  printing_materials: number;
  miscellaneous_expense: number;
}

interface MetricFields {
  total_visitors: number;
  counselling_done: number;
  brochures_distributed: number;
  interested_students: number;
  leads_collected: number;
}

export function DailyReportForm({ expoEvent }: DailyReportFormProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const createDailyReport = useCreateDailyReport();

  const today = new Date().toISOString().split('T')[0];

  const [reportDate, setReportDate] = useState(today);
  const [dateError, setDateError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseFields>({
    stall_fee: 0,
    travel_expense: 0,
    accommodation_expense: 0,
    food_expense: 0,
    printing_materials: 0,
    miscellaneous_expense: 0,
  });

  const [metrics, setMetrics] = useState<MetricFields>({
    total_visitors: 0,
    counselling_done: 0,
    brochures_distributed: 0,
    interested_students: 0,
    leads_collected: 0,
  });

  const [stallPhotos, setStallPhotos] = useState<string[]>([]);
  const [eventPhotos, setEventPhotos] = useState<string[]>([]);
  const [visitorPhotos, setVisitorPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const institutionId =
    expoEvent.institution_id || profile?.institution_id || '';

  const totalExpense = Object.values(expenses).reduce(
    (sum, val) => sum + (val || 0),
    0
  );

  const validateDate = (date: string): boolean => {
    if (!date) {
      setDateError('Report date is required');
      return false;
    }
    if (date < expoEvent.start_date || date > expoEvent.end_date) {
      setDateError(
        `Date must be between ${expoEvent.start_date} and ${expoEvent.end_date}`
      );
      return false;
    }
    setDateError(null);
    return true;
  };

  const handleDateChange = (value: string) => {
    setReportDate(value);
    validateDate(value);
  };

  const handleExpenseChange = (field: keyof ExpenseFields, value: string) => {
    setExpenses((prev) => ({
      ...prev,
      [field]: parseFloat(value) || 0,
    }));
  };

  const handleMetricChange = (field: keyof MetricFields, value: string) => {
    setMetrics((prev) => ({
      ...prev,
      [field]: parseInt(value, 10) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateDate(reportDate)) return;

    await createDailyReport.mutateAsync(
      {
        expo_event_id: expoEvent.id,
        institution_id: institutionId,
        report_date: reportDate,
        ...expenses,
        ...metrics,
        stall_photos: stallPhotos,
        event_photos: eventPhotos,
        visitor_photos: visitorPhotos,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          router.push(`/admission/marketing/expos/${expoEvent.id}`);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/admission/marketing/expos/${expoEvent.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {expoEvent.event_name}
        </Link>
      </div>

      {/* Report Date */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Date</CardTitle>
          <CardDescription>
            Valid date range: {expoEvent.start_date} to {expoEvent.end_date}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1">
            <Label htmlFor="report_date">Date *</Label>
            <Input
              id="report_date"
              type="date"
              required
              value={reportDate}
              min={expoEvent.start_date}
              max={expoEvent.end_date}
              onChange={(e) => handleDateChange(e.target.value)}
              className={dateError ? 'border-red-500' : ''}
            />
            {dateError && (
              <p className="text-xs text-red-500">{dateError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
          <CardDescription>
            Enter all expenses incurred on this day
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="stall_fee">Stall Fee (₹)</Label>
              <Input
                id="stall_fee"
                type="number"
                min="0"
                step="0.01"
                value={expenses.stall_fee}
                onChange={(e) =>
                  handleExpenseChange('stall_fee', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="travel_expense">Travel Expense (₹)</Label>
              <Input
                id="travel_expense"
                type="number"
                min="0"
                step="0.01"
                value={expenses.travel_expense}
                onChange={(e) =>
                  handleExpenseChange('travel_expense', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accommodation_expense">
                Accommodation (₹)
              </Label>
              <Input
                id="accommodation_expense"
                type="number"
                min="0"
                step="0.01"
                value={expenses.accommodation_expense}
                onChange={(e) =>
                  handleExpenseChange('accommodation_expense', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="food_expense">Food Expense (₹)</Label>
              <Input
                id="food_expense"
                type="number"
                min="0"
                step="0.01"
                value={expenses.food_expense}
                onChange={(e) =>
                  handleExpenseChange('food_expense', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="printing_materials">
                Printing Materials (₹)
              </Label>
              <Input
                id="printing_materials"
                type="number"
                min="0"
                step="0.01"
                value={expenses.printing_materials}
                onChange={(e) =>
                  handleExpenseChange('printing_materials', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="miscellaneous_expense">
                Miscellaneous (₹)
              </Label>
              <Input
                id="miscellaneous_expense"
                type="number"
                min="0"
                step="0.01"
                value={expenses.miscellaneous_expense}
                onChange={(e) =>
                  handleExpenseChange('miscellaneous_expense', e.target.value)
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 mt-2">
            <span className="font-medium text-sm">Total Expense</span>
            <span className="flex items-center gap-0.5 text-lg font-bold">
              <IndianRupee className="h-4 w-4" />
              {(totalExpense ?? 0).toFixed(2)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Engagement Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement Metrics</CardTitle>
          <CardDescription>
            Record visitor and engagement numbers for the day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="total_visitors">Total Visitors</Label>
              <Input
                id="total_visitors"
                type="number"
                min="0"
                value={metrics.total_visitors}
                onChange={(e) =>
                  handleMetricChange('total_visitors', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="counselling_done">Counselling Done</Label>
              <Input
                id="counselling_done"
                type="number"
                min="0"
                value={metrics.counselling_done}
                onChange={(e) =>
                  handleMetricChange('counselling_done', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brochures_distributed">
                Brochures Distributed
              </Label>
              <Input
                id="brochures_distributed"
                type="number"
                min="0"
                value={metrics.brochures_distributed}
                onChange={(e) =>
                  handleMetricChange('brochures_distributed', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="interested_students">
                Interested Students
              </Label>
              <Input
                id="interested_students"
                type="number"
                min="0"
                value={metrics.interested_students}
                onChange={(e) =>
                  handleMetricChange('interested_students', e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leads_collected">Leads Collected</Label>
              <Input
                id="leads_collected"
                type="number"
                min="0"
                value={metrics.leads_collected}
                onChange={(e) =>
                  handleMetricChange('leads_collected', e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos</CardTitle>
          <CardDescription>
            Upload photos from the event day (JPEG, PNG, GIF, WebP)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PhotoUploadGrid
            label="Stall Photos"
            photoType="stall"
            institutionId={institutionId}
            eventId={expoEvent.id}
            reportDate={reportDate}
            photos={stallPhotos}
            onChange={setStallPhotos}
          />
          <PhotoUploadGrid
            label="Event Photos"
            photoType="event"
            institutionId={institutionId}
            eventId={expoEvent.id}
            reportDate={reportDate}
            photos={eventPhotos}
            onChange={setEventPhotos}
          />
          <PhotoUploadGrid
            label="Visitor Interaction Photos"
            photoType="visitor"
            institutionId={institutionId}
            eventId={expoEvent.id}
            reportDate={reportDate}
            photos={visitorPhotos}
            onChange={setVisitorPhotos}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
          <CardDescription>
            Any additional observations or remarks for the day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          asChild
        >
          <Link href={`/admission/marketing/expos/${expoEvent.id}`}>
            Cancel
          </Link>
        </Button>
        <Button
          type="submit"
          disabled={createDailyReport.isPending}
        >
          {createDailyReport.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Report
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
