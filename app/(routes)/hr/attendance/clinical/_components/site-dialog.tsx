'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ExternalLink, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getBrowserPosition, useSaveClinicalSite } from '@/hooks/hr/use-clinical-duty';
import { getErrorMessage } from '@/lib/utils';
import { parseMapCoordinates } from '@/lib/utils/parse-map-coordinates';
import type { ClinicalDutySite } from '@/types/hr-clinical-duty';
import { mapsUrl, type InstitutionOption } from './shared';

const numberIn = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((s) => Number.isFinite(Number(s)), `${label} must be a number`)
    .refine((s) => Number(s) >= min && Number(s) <= max, `${label} must be between ${min} and ${max}`);

const schema = z.object({
  institutionId: z.string().min(1, 'Select an institution'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  lat: numberIn('Latitude', -90, 90),
  lng: numberIn('Longitude', -180, 180),
  radiusM: numberIn('Radius', 30, 2000),
  isActive: z.boolean(),
});

type Values = z.infer<typeof schema>;

const toValues = (site: ClinicalDutySite | null, institutionId: string): Values => ({
  institutionId: site?.institution_id ?? institutionId,
  name: site?.name ?? '',
  lat: site ? String(site.lat) : '',
  lng: site ? String(site.lng) : '',
  radiusM: site ? String(site.radius_m) : '100',
  isActive: site?.is_active ?? true,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: ClinicalDutySite | null;
  institutions: InstitutionOption[];
  defaultInstitutionId: string;
}

export function SiteDialog({ open, onOpenChange, site, institutions, defaultInstitutionId }: Props) {
  const save = useSaveClinicalSite();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(site, defaultInstitutionId),
  });

  const [pasted, setPasted] = useState('');
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      form.reset(toValues(site, defaultInstitutionId));
      setPasted('');
      setPasteMsg(null);
    }
  }, [open, site, defaultInstitutionId, form]);

  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const hasCoords =
    lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  const readPasted = (text: string) => {
    setPasted(text);
    if (!text.trim()) {
      setPasteMsg(null);
      return;
    }
    const r = parseMapCoordinates(text);
    if (r.ok) {
      form.setValue('lat', r.value.lat.toFixed(6), { shouldValidate: true });
      form.setValue('lng', r.value.lng.toFixed(6), { shouldValidate: true });
      setPasteMsg({ ok: true, text: `Found ${r.value.lat.toFixed(6)}, ${r.value.lng.toFixed(6)}` });
    } else {
      setPasteMsg({
        ok: false,
        text:
          r.reason === 'short_link'
            ? 'That is a short link. Open it in Google Maps and paste the full link from the address bar, or the coordinates.'
            : 'No coordinates found in that text.',
      });
    }
  };

  const fillFromDevice = async () => {
    try {
      const p = await getBrowserPosition();
      form.setValue('lat', p.lat.toFixed(6), { shouldValidate: true });
      form.setValue('lng', p.lng.toFixed(6), { shouldValidate: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const onSubmit = (v: Values) => {
    save.mutate(
      {
        id: site?.id,
        institutionId: v.institutionId,
        name: v.name,
        lat: Number(v.lat),
        lng: Number(v.lng),
        radiusM: Math.round(Number(v.radiusM)),
        isActive: v.isActive,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{site ? 'Edit duty site' : 'Add duty site'}</DialogTitle>
          <DialogDescription>
            Staff can punch only within the radius of an allowed site.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="institutionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution <span className="text-red-500">*</span></FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(site)}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {institutions.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site name <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="e.g. District Hospital" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-1.5">
              <Label htmlFor="map-paste">Paste a Google Maps link or coordinates</Label>
              <Input
                id="map-paste"
                value={pasted}
                onChange={(e) => readPasted(e.target.value)}
                placeholder={`https://www.google.com/maps/place/…  or  11.4445, 77.1251`}
              />
              {pasteMsg && (
                <p className={`text-xs ${pasteMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {pasteMsg.text}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                In Google Maps, right-click the place and click the coordinates to copy them, or
                copy the full link from the address bar. Short links (maps.app.goo.gl) cannot be read.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="lat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lng"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={fillFromDevice}>
                <LocateFixed className="mr-1 h-3.5 w-3.5" />
                Use my current location
              </Button>
              {hasCoords && (
                <a
                  href={mapsUrl(Number(lat), Number(lng))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Open in Google Maps
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <FormField
              control={form.control}
              name="radiusM"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Radius (metres) <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormLabel>Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : site ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
