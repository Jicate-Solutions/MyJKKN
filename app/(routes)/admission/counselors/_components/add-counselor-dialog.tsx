'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import toast from 'react-hot-toast';

interface AddCounselorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
  onSuccess?: () => void;
}

interface ProfileSearchResult {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

export function AddCounselorDialog({
  open,
  onOpenChange,
  institutionId: propInstitutionId,
  onSuccess,
}: AddCounselorDialogProps) {
  const { institutions } = useInstitutionsWithAccess();
  const supabase = createClientSupabaseClient();

  // Form state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState(propInstitutionId || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [maxLeads, setMaxLeads] = useState(50);
  const [specializations, setSpecializations] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Pre-select institution from prop
  useEffect(() => {
    if (propInstitutionId) {
      setInstitutionId(propInstitutionId);
    }
  }, [propInstitutionId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedUserId(null);
      setName('');
      setEmail('');
      setPhone('');
      setMaxLeads(50);
      setSpecializations('');
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      setInstitutionId(propInstitutionId || '');
    }
  }, [open, propInstitutionId]);

  // Debounced profile search
  const searchProfiles = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(10);

        if (error) {
          console.error('[admission/counselors] Profile search failed:', error);
          return;
        }

        setSearchResults(data || []);
        setShowResults(true);
      } catch (err) {
        console.error('[admission/counselors] Profile search error:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [supabase]
  );

  // Debounce search input
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(() => {
      searchProfiles(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchProfiles]);

  const handleSelectProfile = (profile: ProfileSearchResult) => {
    setSelectedUserId(profile.id);
    setName(profile.full_name || '');
    setEmail(profile.email || '');
    setPhone(profile.phone || '');
    setSearchQuery(profile.full_name || profile.email || '');
    setShowResults(false);
  };

  const handleClearProfile = () => {
    setSelectedUserId(null);
    setSearchQuery('');
    setName('');
    setEmail('');
    setPhone('');
  };

  const handleSubmit = async () => {
    // Validate required fields
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!institutionId) {
      toast.error('Please select an institution');
      return;
    }

    // Parse specializations
    const specs = specializations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('admission_counselors')
        .insert({
          user_id: selectedUserId || null,
          institution_id: institutionId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          max_leads: maxLeads,
          specializations: specs,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message || 'Failed to add counselor');
        return;
      }

      toast.success('Counselor added successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('[admission/counselors] Add counselor error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Counselor</DialogTitle>
          <DialogDescription>
            Create a new admission counselor. Optionally link to an existing user profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Link to existing user */}
          <div className="space-y-2">
            <Label htmlFor="search-user">Link to Existing User (optional)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-user"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedUserId) {
                    handleClearProfile();
                  }
                }}
                className="pl-9"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {showResults && searchResults.length > 0 && (
              <div className="border rounded-md max-h-40 overflow-y-auto bg-popover">
                {searchResults.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                    onClick={() => handleSelectProfile(profile)}
                  >
                    <p className="font-medium">{profile.full_name}</p>
                    <p className="text-xs text-muted-foreground">{profile.email}</p>
                  </button>
                ))}
              </div>
            )}
            {showResults && searchResults.length === 0 && !isSearching && (
              <p className="text-xs text-muted-foreground px-1">No users found</p>
            )}
            {selectedUserId && (
              <div className="flex items-center justify-between text-xs text-green-600 bg-green-50 rounded px-2 py-1">
                <span>Linked to existing user profile</span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 font-medium"
                  onClick={handleClearProfile}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="Phone number (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* Institution */}
          <div className="space-y-2">
            <Label htmlFor="institution">
              Institution <span className="text-red-500">*</span>
            </Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="institution">
                <SelectValue placeholder="Select institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Leads */}
          <div className="space-y-2">
            <Label htmlFor="max-leads">Max Leads</Label>
            <Input
              id="max-leads"
              type="number"
              min={1}
              value={maxLeads}
              onChange={(e) => setMaxLeads(parseInt(e.target.value) || 50)}
            />
          </div>

          {/* Specializations */}
          <div className="space-y-2">
            <Label htmlFor="specializations">Specializations</Label>
            <Input
              id="specializations"
              placeholder="e.g. Engineering, Medical, Arts (comma-separated)"
              value={specializations}
              onChange={(e) => setSpecializations(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter comma-separated values
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Counselor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
