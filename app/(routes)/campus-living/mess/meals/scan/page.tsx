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

  const handleManualEntry = () => {
    if (!manualInput.trim()) return;
    // TODO: Call API to validate and record meal scan
    setLastScan({
      student: 'Arun Kumar',
      roll: manualInput,
      status: 'success',
      message: 'Meal recorded successfully',
    });
    setManualInput('');
  };

  const todayStats = {
    total_scanned: 312,
    total_booked: 420,
    current_meal: 'Lunch',
    serving_time: '12:00 - 2:00 PM',
  };

  const recentScans = [
    { roll: 'CS2024001', name: 'Arun Kumar', time: '12:15 PM', status: 'success' },
    { roll: 'EC2024015', name: 'Priya Sharma', time: '12:14 PM', status: 'success' },
    { roll: 'ME2024003', name: 'Rahul Patel', time: '12:12 PM', status: 'success' },
    { roll: 'INVALID001', name: '-', time: '12:10 PM', status: 'error' },
    { roll: 'CS2024042', name: 'Sneha Reddy', time: '12:08 PM', status: 'success' },
  ];

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
