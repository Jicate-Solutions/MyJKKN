'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save } from 'lucide-react';

export default function GeneralSettingsPage() {
  return (
    <ContentLayout title="General Settings">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">General Settings</h1>
            <p className="text-muted-foreground">Basic campus living configuration</p>
          </div>
          <Button><Save className="mr-2 h-4 w-4" />Save Changes</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Academic Configuration</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Current Academic Year</Label>
              <Select defaultValue="2025-26">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2026-27">2026-27</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Semester</Label>
              <Select defaultValue="even">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="odd">Odd Semester</SelectItem>
                  <SelectItem value="even">Even Semester</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Curfew Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Curfew Start Time</Label>
              <Input type="time" defaultValue="22:00" />
            </div>
            <div className="space-y-2">
              <Label>Curfew End Time</Label>
              <Input type="time" defaultValue="06:00" />
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <Label>Enable Curfew Enforcement</Label>
                <p className="text-sm text-muted-foreground">Flag late entries in access log</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Visitor Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Visitor Hours Start</Label>
              <Input type="time" defaultValue="09:00" />
            </div>
            <div className="space-y-2">
              <Label>Visitor Hours End</Label>
              <Input type="time" defaultValue="18:00" />
            </div>
            <div className="space-y-2">
              <Label>Max Visit Duration (hours)</Label>
              <Input type="number" defaultValue="4" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Require ID Proof</Label>
                <p className="text-sm text-muted-foreground">Mandatory for all visitors</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mess Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Meal Booking Cutoff (hours before)</Label>
              <Input type="number" defaultValue="2" />
            </div>
            <div className="space-y-2">
              <Label>Guest Meal Price (INR)</Label>
              <Input type="number" defaultValue="150" />
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <Label>Allow Meal Opt-out</Label>
                <p className="text-sm text-muted-foreground">Students can opt out of individual meals</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
