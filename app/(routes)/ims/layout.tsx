'use client';

import { Store, ArrowRight } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StoreSwitcher } from '@/components/ims/store-switcher';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';

export default function ImsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { storeId, isStoreSelected, isSuperAdmin, isStoreAdmin, isResolving } = useImsStoreContext();

  // Allow the stores settings page through always — that's where stores are created
  const isStoreManagementPage = pathname?.startsWith('/ims/settings/stores');

  // Admin-like users: super_admin OR store_admin
  // store_admin manages their institution's IMS store — they need the picker if no store resolves,
  // NOT the dead-end "No Store Assigned" message that regular users see.
  const isAdminLike = isSuperAdmin || isStoreAdmin;

  // Gate A: Zustand not yet hydrated from localStorage (storeId is undefined on first render)
  if (storeId === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading store...</div>
      </div>
    );
  }

  // Gate B: Non-super-admin auto-resolution in progress (fetching their institution's store)
  if (isResolving) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Connecting to store...</div>
      </div>
    );
  }

  // Gate C: Regular user whose institution has no IMS store set up
  // store_admin and super_admin are excluded — they see Gate D with a store picker instead
  if (!isStoreSelected && !isAdminLike && !isStoreManagementPage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Store className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No Store Assigned</h2>
            <p className="text-muted-foreground text-sm">
              Your institution does not have an IMS store set up yet.
              Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Gate D: Admin-like user (super_admin or store_admin) without a store selected
  // super_admin must always pick manually; store_admin lands here only when auto-resolution
  // fails (e.g. institution_id mismatch or no store created yet for their institution)
  if (!isStoreSelected && isAdminLike && !isStoreManagementPage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Store className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Select a Store</h2>
            <p className="text-muted-foreground text-sm">
              {isSuperAdmin
                ? 'As a super admin, please select which store you want to manage. Each store operates as an independent IMS instance.'
                : 'Please select your store to continue, or register a new one if none exists yet.'}
            </p>
            <div className="max-w-[280px] mx-auto">
              <StoreSwitcher />
            </div>
            <div className="pt-2">
              <Button
                variant="link"
                size="sm"
                onClick={() => router.push('/ims/settings/stores')}
              >
                Register a new store
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky store switcher header bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between px-4 py-2 max-w-[280px]">
          <StoreSwitcher />
        </div>
      </div>
      {children}
    </div>
  );
}
