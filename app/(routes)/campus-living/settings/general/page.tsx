'use client';

/**
 * General Settings — /campus-living/settings/general
 *
 * STATUS 2026-04-24 (Agent D — settings real-save): Previous "Save Changes"
 * only showed a warning toast. Persistence is BLOCKED on a missing
 * `hostel_general_settings` table — Agent D did NOT ship a half-wired
 * save because that would reintroduce the silent-failure bug.
 *
 * BLOCKED ON (Agent A / migrations track):
 *   CREATE TABLE hostel_general_settings (
 *     id UUID PK,
 *     institution_id UUID NOT NULL REFERENCES institutions(id) UNIQUE,
 *     current_academic_year_id UUID REFERENCES academic_years(id),
 *     current_semester TEXT,                         -- 'odd' | 'even'
 *     curfew_start_time TIME NOT NULL DEFAULT '22:00',
 *     curfew_end_time TIME NOT NULL DEFAULT '06:00',
 *     curfew_enforcement_enabled BOOLEAN NOT NULL DEFAULT true,
 *     visitor_hours_start TIME NOT NULL DEFAULT '09:00',
 *     visitor_hours_end TIME NOT NULL DEFAULT '18:00',
 *     visitor_max_duration_hours INT NOT NULL DEFAULT 4,
 *     visitor_require_id_proof BOOLEAN NOT NULL DEFAULT true,
 *     mess_meal_cutoff_hours INT NOT NULL DEFAULT 2,
 *     mess_guest_meal_price NUMERIC(10,2) NOT NULL DEFAULT 150,
 *     mess_allow_opt_out BOOLEAN NOT NULL DEFAULT true,
 *     updated_by UUID,
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   -- + RLS (is_super_admin() OR is_admin() OR user_has_permission + role_has_institution_access)
 *   -- + seed a single row per institution on first save
 *
 * Until then this page stays in PreviewBanner mode. Inputs are disabled.
 * Save is disabled with an explicit "table missing" message.
 */

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
import { PreviewBanner } from '../../_components/preview-banner';

export default function GeneralSettingsPage() {
  return (
    <ContentLayout title="General Settings">
      <div className="space-y-6">
        <PreviewBanner
          feature="general settings"
          note="Blocked on missing table hostel_general_settings. The Save button is disabled and inputs are read-only. Curfew, visitor, and mess defaults will persist once Agent A lands the migration for this table."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">General Settings</h1>
            <p className="text-muted-foreground">Basic campus living configuration</p>
          </div>
          <Button
            disabled
            title="Disabled until hostel_general_settings table ships"
          >
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Academic Configuration</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Current Academic Year</Label>
              <Select defaultValue="2025-26" disabled>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2026-27">2026-27</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Semester</Label>
              <Select defaultValue="even" disabled>
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
              <Input type="time" defaultValue="22:00" disabled />
            </div>
            <div className="space-y-2">
              <Label>Curfew End Time</Label>
              <Input type="time" defaultValue="06:00" disabled />
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <Label>Enable Curfew Enforcement</Label>
                <p className="text-sm text-muted-foreground">Flag late entries in access log</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Visitor Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Visitor Hours Start</Label>
              <Input type="time" defaultValue="09:00" disabled />
            </div>
            <div className="space-y-2">
              <Label>Visitor Hours End</Label>
              <Input type="time" defaultValue="18:00" disabled />
            </div>
            <div className="space-y-2">
              <Label>Max Visit Duration (hours)</Label>
              <Input type="number" defaultValue="4" disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Require ID Proof</Label>
                <p className="text-sm text-muted-foreground">Mandatory for all visitors</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mess Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Meal Booking Cutoff (hours before)</Label>
              <Input type="number" defaultValue="2" disabled />
            </div>
            <div className="space-y-2">
              <Label>Guest Meal Price (INR)</Label>
              <Input type="number" defaultValue="150" disabled />
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <Label>Allow Meal Opt-out</Label>
                <p className="text-sm text-muted-foreground">Students can opt out of individual meals</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
