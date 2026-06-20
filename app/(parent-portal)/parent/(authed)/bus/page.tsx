'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Bus, Phone, MapPin } from 'lucide-react';
import { useParentBus } from '@/hooks/parent/use-parent-features';

export default function BusPage() {
  const { data, isLoading } = useParentBus();
  const bus = data?.data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Bus Tracking</h1>
      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !bus ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Bus className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No bus route assigned.
        </Card>
      ) : (
        <>
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b6d41]/10 text-[#0b6d41]">
                <Bus className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{bus.routeName}</p>
                {bus.busNumber && <p className="text-xs text-muted-foreground">Bus {bus.busNumber}</p>}
              </div>
            </div>
            <div className="space-y-1 border-t pt-3 text-sm">
              {bus.driverName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-medium">{bus.driverName}</span>
                </div>
              )}
              {bus.driverContact && (
                <a href={`tel:${bus.driverContact}`} className="flex items-center justify-between">
                  <span className="text-muted-foreground">Contact</span>
                  <span className="flex items-center gap-1 font-medium text-[#0b6d41]">
                    <Phone className="h-3.5 w-3.5" /> {bus.driverContact}
                  </span>
                </a>
              )}
              {bus.stopName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Your stop</span>
                  <span className="font-medium">{bus.stopName}</span>
                </div>
              )}
            </div>
          </Card>

          {bus.stops.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Route stops</h2>
              <ul className="space-y-2">
                {bus.stops.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-[#0b6d41]" />
                    <span className="flex-1">{s.name ?? `Stop ${i + 1}`}</span>
                    <span className="text-xs text-muted-foreground">
                      {[s.pickup_time, s.drop_time].filter(Boolean).join(' / ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground">Live GPS tracking coming soon.</p>
        </>
      )}
    </div>
  );
}
