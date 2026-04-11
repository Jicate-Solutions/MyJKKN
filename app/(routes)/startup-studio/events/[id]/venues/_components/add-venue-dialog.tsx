'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useAddEventVenue } from '@/hooks/startup-studio';
import { toast } from 'sonner';

interface AddVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  dayType: 'build_day' | 'demo_day';
}

export function AddVenueDialog({
  open,
  onOpenChange,
  eventId,
  dayType,
}: AddVenueDialogProps) {
  const [venueName, setVenueName] = useState('');
  const [capacity, setCapacity] = useState('50');
  const [locationInfo, setLocationInfo] = useState('');

  const addVenue = useAddEventVenue();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim()) {
      toast.error('Venue name is required');
      return;
    }

    try {
      await addVenue.mutateAsync({
        eventId,
        data: {
          day_type: dayType,
          venue_name: venueName.trim(),
          capacity: parseInt(capacity) || 50,
          location_info: locationInfo.trim() || undefined,
        },
      });
      toast.success('Venue added successfully');
      setVenueName('');
      setCapacity('50');
      setLocationInfo('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to add venue');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {dayType === 'build_day' ? 'Build Day' : 'Demo Day'} Venue
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name">Venue Name</Label>
            <Input
              id="venue-name"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="e.g., Main Hall, Lab A1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (teams)</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              max="500"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-info">Location Info (optional)</Label>
            <Input
              id="location-info"
              value={locationInfo}
              onChange={(e) => setLocationInfo(e.target.value)}
              placeholder="e.g., Ground Floor, Block A"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addVenue.isPending}>
              {addVenue.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Venue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
