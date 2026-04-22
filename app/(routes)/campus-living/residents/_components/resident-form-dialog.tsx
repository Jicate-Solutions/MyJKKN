'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  useCreateHostelResident,
  useUpdateHostelResident,
} from '@/hooks/campus-living/use-hostel-residents';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HostelResident,
  HostelResidentType,
} from '@/types/hostel-residents';
import { HOSTEL_RESIDENT_TYPES } from '@/types/hostel-residents';
import { Loader2, Search, User } from 'lucide-react';

type FoundProfile = { id: string; full_name: string | null; email: string | null };

interface ResidentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  resident?: HostelResident;
}

export function ResidentFormDialog({
  open,
  onOpenChange,
  mode,
  resident,
}: ResidentFormDialogProps) {
  const { profile } = useAuth();
  const createMut = useCreateHostelResident();
  const updateMut = useUpdateHostelResident();

  const [profileId, setProfileId] = useState<string>(resident?.profile_id ?? '');
  const [residentType, setResidentType] = useState<HostelResidentType | ''>(
    resident?.resident_type ?? ''
  );
  const [idProofType, setIdProofType] = useState<string>(resident?.id_proof_type ?? '');
  const [idProofNumber, setIdProofNumber] = useState<string>(
    resident?.id_proof_number ?? ''
  );
  const [notes, setNotes] = useState<string>(resident?.notes ?? '');
  const [isActive, setIsActive] = useState<boolean>(resident?.is_active ?? true);

  // Debounced profile search (edit mode: search disabled, already have profile_id)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<FoundProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');

  useEffect(() => {
    if (mode === 'edit' || !searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
          .limit(10);
        setSearchResults((data ?? []) as FoundProfile[]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm, mode]);

  // Reset form on open/close / mode change
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && resident) {
      setProfileId(resident.profile_id);
      setResidentType(resident.resident_type);
      setIdProofType(resident.id_proof_type ?? '');
      setIdProofNumber(resident.id_proof_number ?? '');
      setNotes(resident.notes ?? '');
      setIsActive(resident.is_active);
    } else {
      setProfileId('');
      setResidentType('');
      setIdProofType('');
      setIdProofNumber('');
      setNotes('');
      setIsActive(true);
      setSearchTerm('');
      setSelectedProfileName('');
    }
  }, [open, mode, resident]);

  const isPending = createMut.isPending || updateMut.isPending;
  const institutionId = profile?.institution_id ?? '';
  const canSubmit = !!profileId && !!residentType && !!institutionId && !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !residentType) return;

    if (mode === 'create') {
      await createMut.mutateAsync({
        institution_id: institutionId,
        profile_id: profileId,
        resident_type: residentType,
        id_proof_type: idProofType || null,
        id_proof_number: idProofNumber || null,
        is_active: isActive,
        notes: notes || null,
      });
    } else if (resident) {
      await updateMut.mutateAsync({
        id: resident.id,
        payload: {
          resident_type: residentType,
          id_proof_type: idProofType || null,
          id_proof_number: idProofNumber || null,
          is_active: isActive,
          notes: notes || null,
        },
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Add Resident' : 'Edit Resident'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Classify an existing MyJKKN user as a hostel resident. No new user account is created.'
                : "Update this resident's classification or details. The underlying user profile is not affected."}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            {/* Profile picker — create mode only */}
            {mode === 'create' && (
              <div className='space-y-2'>
                <Label htmlFor='profile-search'>
                  Person <span className='text-destructive'>*</span>
                </Label>
                {profileId ? (
                  <div className='flex items-center justify-between gap-2 rounded-md border p-2'>
                    <div className='flex items-center gap-2'>
                      <User className='h-4 w-4 text-muted-foreground' />
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium'>{selectedProfileName || profileId}</span>
                        <span className='text-xs text-muted-foreground font-mono'>{profileId}</span>
                      </div>
                    </div>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setProfileId('');
                        setSelectedProfileName('');
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className='relative'>
                      <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                      <Input
                        id='profile-search'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder='Search by name or email (min 2 chars)'
                        className='pl-9'
                      />
                    </div>
                    {searching && (
                      <p className='text-xs text-muted-foreground'>Searching...</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className='max-h-[200px] overflow-y-auto rounded-md border'>
                        {searchResults.map((p) => (
                          <button
                            type='button'
                            key={p.id}
                            className='w-full text-left p-2 hover:bg-accent border-b last:border-0'
                            onClick={() => {
                              setProfileId(p.id);
                              setSelectedProfileName(p.full_name ?? p.email ?? p.id);
                              setSearchTerm('');
                              setSearchResults([]);
                            }}
                          >
                            <div className='text-sm font-medium'>
                              {p.full_name ?? <span className='text-muted-foreground italic'>(no name)</span>}
                            </div>
                            <div className='text-xs text-muted-foreground'>{p.email ?? '—'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Resident type */}
            <div className='space-y-2'>
              <Label htmlFor='resident-type'>
                Resident Type <span className='text-destructive'>*</span>
              </Label>
              <Select
                value={residentType}
                onValueChange={(v) => setResidentType(v as HostelResidentType)}
              >
                <SelectTrigger id='resident-type'>
                  <SelectValue placeholder='Select type' />
                </SelectTrigger>
                <SelectContent>
                  {HOSTEL_RESIDENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className='capitalize'>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ID proof */}
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='id-proof-type'>ID Proof Type</Label>
                <Input
                  id='id-proof-type'
                  value={idProofType}
                  onChange={(e) => setIdProofType(e.target.value)}
                  placeholder='Aadhaar / Passport / ...'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='id-proof-number'>ID Number</Label>
                <Input
                  id='id-proof-number'
                  value={idProofNumber}
                  onChange={(e) => setIdProofNumber(e.target.value)}
                  placeholder='XXXX-XXXX-XXXX'
                  className='font-mono'
                />
              </div>
            </div>

            {/* Notes */}
            <div className='space-y-2'>
              <Label htmlFor='resident-notes'>Notes</Label>
              <Textarea
                id='resident-notes'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Any context worth recording (special requirements, tenure end, etc.)'
                rows={3}
              />
            </div>

            {/* Active */}
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <Label htmlFor='resident-active'>Active</Label>
                <p className='text-xs text-muted-foreground'>
                  Inactive residents can still be referenced by allocations but are hidden from default lists.
                </p>
              </div>
              <Switch id='resident-active' checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!canSubmit}>
              {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {mode === 'create' ? 'Add Resident' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
