'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ScanLine,
  QrCode,
  Keyboard,
  CheckCircle2,
  XCircle,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useScanMeal, useMessMeals } from '@/hooks/campus-living/use-mess-meals';

export default function MealScanPage() {
  const [scanMode, setScanMode] = useState<'qr' | 'manual'>('qr');
  const [selectedMeal, setSelectedMeal] = useState('lunch');
  const [manualInput, setManualInput] = useState('');
  const [lastScan, setLastScan] = useState<{
    student: string;
    roll: string;
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const scanMealMutation = useScanMeal();
  const today = new Date().toISOString().split('T')[0];
  const { data: mealsData } = useMessMeals(institutionId, { date: today, meal_type: selectedMeal as any });

  const mealRecords: any[] = (mealsData as any)?.data || mealsData || [];

  const handleManualEntry = async () => {
    if (!manualInput.trim()) return;
    try {
      await scanMealMutation.mutateAsync({
        institution_id: institutionId,
        learner_id: manualInput.trim(),
        menu_id: null,
        date: today,
        meal_type: selectedMeal as any,
        consumed: true,
        scan_method: 'manual' as any,
        scan_time: new Date().toISOString(),
        is_guest_meal: false,
        guest_name: null,
        guest_count: 0,
        feedback_rating: null,
        feedback_comment: null,
      });
      setLastScan({
        student: manualInput.trim(),
        roll: manualInput,
        status: 'success',
        message: 'Meal recorded successfully',
      });
    } catch {
      setLastScan({
        student: '-',
        roll: manualInput,
        status: 'error',
        message: 'Failed to record meal scan',
      });
    }
    setManualInput('');
  };

  const todayStats = {
    total_scanned: mealRecords.length,
    total_booked: mealRecords.length > 0 ? (mealRecords[0]?.booked_count || mealRecords.length) : 0,
    current_meal: selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1),
    serving_time: selectedMeal === 'breakfast' ? '7:00 - 9:00 AM' : selectedMeal === 'lunch' ? '12:00 - 2:00 PM' : selectedMeal === 'snacks' ? '4:00 - 5:00 PM' : '7:00 - 9:00 PM',
  };

  const recentScans = mealRecords.slice(0, 5).map((r: any) => ({
    roll: r.learner_id || r.roll || '-',
    name: r.learner_name || r.student || r.learner_id || '-',
    time: r.scan_time ? new Date(r.scan_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
    status: r.consumed ? 'success' : 'error',
  }));

  return (
    <ContentLayout title="Meal Scan">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/mess/meals">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Meal Scan</h1>
            <p className="text-muted-foreground">Scan QR codes or enter roll numbers to record meals</p>
          </div>
        </div>

        {/* Current Meal Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current Meal</p>
                  <p className="text-lg font-semibold">{todayStats.current_meal}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Serving Time</p>
                  <p className="text-lg font-semibold">{todayStats.serving_time}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Select value={selectedMeal} onValueChange={setSelectedMeal}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="snacks">Snacks</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-primary">
                    {todayStats.total_scanned} / {todayStats.total_booked}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scan Area */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scan Entry</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={scanMode === 'qr' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScanMode('qr')}
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    QR Code
                  </Button>
                  <Button
                    variant={scanMode === 'manual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScanMode('manual')}
                  >
                    <Keyboard className="mr-2 h-4 w-4" />
                    Manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {scanMode === 'qr' ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg aspect-square max-w-sm mx-auto flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground font-medium">QR Scanner Active</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Point camera at student QR code
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-center text-muted-foreground">
                    Camera permission required for QR scanning
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="roll">Roll Number / Student ID</Label>
                    <div className="flex gap-2">
                      <Input
                        id="roll"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="Enter roll number..."
                        onKeyDown={(e) => e.key === 'Enter' && handleManualEntry()}
                        autoFocus
                      />
                      <Button onClick={handleManualEntry}>
                        <ScanLine className="mr-2 h-4 w-4" />
                        Record
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Last Scan Result */}
              {lastScan && (
                <div
                  className={`mt-4 p-4 rounded-lg border ${
                    lastScan.status === 'success'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {lastScan.status === 'success' ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">{lastScan.student}</p>
                      <p className="text-sm text-muted-foreground">
                        {lastScan.roll} - {lastScan.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Scans */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Scans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {scan.status === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{scan.name}</p>
                        <p className="text-xs text-muted-foreground">{scan.roll}</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{scan.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
