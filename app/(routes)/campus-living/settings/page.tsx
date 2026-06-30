'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Settings, IndianRupee, CalendarDays, Wrench, Bell, GitBranch, ArrowRight, LayoutGrid, CalendarRange, Wifi, Wind, ListChecks, Package, Calculator, Sparkles, UtensilsCrossed, RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export default function SettingsPage() {
  const { isSuperAdmin } = usePermissions();

  const settingsPages = [
    { title: 'Allocations & Eligibility', desc: 'Unified config — categories, program eligibility & physical room rules on one page, with a live resolver that shows what the allocation engine will do', href: '/campus-living/settings/allocations', icon: ListChecks },
    { title: 'General Settings', desc: 'Basic campus living configuration, academic year, hostel names', href: '/campus-living/settings/general', icon: Settings },
    { title: 'Hostel Rooms Categories', desc: 'Manage hostel rooms categories — Boys, Girls, Mixed hostels', href: '/campus-living/settings/categories', icon: LayoutGrid },
    { title: 'Program Eligibility', desc: 'Set allowed room & mess categories per program — institution default plus per-program overrides', href: '/campus-living/settings/program-eligibility', icon: ListChecks },
    { title: 'Amenities', desc: 'Catalog of informational amenities (Wi-Fi, Balcony, Attached Bath) assignable to rooms and blocks', href: '/campus-living/settings/amenities', icon: Wifi },
    { title: 'Billable Amenities', desc: 'Amenities that carry a monthly fee (AC, premium services) with fee models and commitment terms', href: '/campus-living/settings/billable-amenities', icon: Wind },
    { title: 'Hostel Years', desc: 'Define hostel calendar years — name, start & end dates (scopes fee config)', href: '/campus-living/settings/hostel-years', icon: CalendarRange },
    { title: 'Admission Packages', desc: 'Bundle a Classic room for a flat price; learners pick mess separately and can opt-in to Premium upgrades', href: '/campus-living/settings/packages', icon: Package },
    { title: 'Fee Configuration', desc: 'Room-type fees, AC charges, deposit amounts, payment modes', href: '/campus-living/settings/fee-config', icon: IndianRupee },
    { title: 'Fees & Economics', desc: 'Unified money config — fees, billable amenities, packages, block economics & hostel years in one page', href: '/campus-living/settings/fees-economics', icon: Calculator },
    { title: 'Block Economics', desc: 'Enter each block’s yearly running costs and one-time investments — powers ROI, margin & payback on the Bed Economics dashboard', href: '/campus-living/settings/block-economics', icon: Calculator, superAdminOnly: true },
    { title: 'Housekeeping Booking', desc: 'Slot length, daily window, capacity, advance booking, cancellation cutoff, and per-tier weekly quotas — with a live plain-English preview', href: '/campus-living/settings/housekeeping', icon: Sparkles, superAdminOnly: true },
    { title: 'Choose Your Menu', desc: 'Per-mode × per-tier toggles for menu personalization, voting, and special-day proposals — with a live plain-English preview of what residents experience', href: '/campus-living/settings/choose-your-menu', icon: UtensilsCrossed, superAdminOnly: true },
    { title: 'Mess & Daily Services', desc: 'One unified page for the daily-living services — menu personalization, room-cleaning slots, the amenities catalog, and maintenance SLAs', href: '/campus-living/settings/mess-services', icon: Sparkles, superAdminOnly: true },
    { title: 'Leave Types', desc: 'Configure leave types, max days, parent consent requirements', href: '/campus-living/settings/leave-types', icon: CalendarDays },
    { title: 'Menu Loop', desc: 'Review the self-improving loop’s menu proposals — accept, reject, or mark edited — and read the causal-validity guard that proves measured lift is real, not regression to the mean', href: '/campus-living/mess/menu-loop', icon: RefreshCw, superAdminOnly: true },
    { title: 'Maintenance SLA', desc: 'Set SLA targets by category and priority level', href: '/campus-living/settings/maintenance-sla', icon: Wrench },
    { title: 'Notification Rules', desc: 'Email, SMS, and push notification preferences', href: '/campus-living/settings/notification-rules', icon: Bell },
    { title: 'Approval Chains', desc: 'Configure approval workflows for leave, curfew, visitors', href: '/campus-living/settings/approval-chains', icon: GitBranch },
    { title: 'Policies & Workflows', desc: 'One page to manage curfew, leave types, approval chains, notification rules and general defaults', href: '/campus-living/settings/policies-workflows', icon: ListChecks },
  ];

  return (
    <ContentLayout title="Settings">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Campus Living Settings</h1>
          <p className="text-muted-foreground">Configure rules, fees, SLAs, and operational settings</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {settingsPages
            .filter((page) => !('superAdminOnly' in page && page.superAdminOnly) || isSuperAdmin)
            .map((page) => (
            <Link key={page.href} href={page.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <page.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{page.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{page.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
