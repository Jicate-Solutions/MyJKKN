'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  X,
  User,
  Building2,
  Globe,
  Flame,
  ThermometerSun,
  ThermometerSnowflake,
} from 'lucide-react';
import { searchNetworkerContacts } from '../actions';
import type { NetworkerContact } from '@/lib/networker/client';

// ============================================
// TYPES
// ============================================

export interface SelectedContact {
  networker_contact_id: string;
  client_name: string;
  client_organization: string;
}

interface NetworkerContactPickerProps {
  value: SelectedContact | null;
  onChange: (contact: SelectedContact | null) => void;
  disabled?: boolean;
}

// ============================================
// HELPERS
// ============================================

function TemperatureBadge({ temperature }: { temperature: string | null }) {
  if (!temperature) return null;

  const config: Record<string, { icon: typeof Flame; color: string; label: string }> = {
    hot: { icon: Flame, color: 'bg-red-100 text-red-700 border-red-200', label: 'Hot' },
    warm: { icon: ThermometerSun, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Warm' },
    cold: { icon: ThermometerSnowflake, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Cold' },
  };

  const c = config[temperature];
  if (!c) return null;
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={`text-xs ${c.color}`}>
      <Icon className="h-3 w-3 mr-0.5" />
      {c.label}
    </Badge>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function NetworkerContactPicker({
  value,
  onChange,
  disabled = false,
}: NetworkerContactPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NetworkerContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);

    const res = await searchNetworkerContacts(q);

    if (res.success) {
      setResults(res.data);
      setShowDropdown(res.data.length > 0);
    } else {
      setError(res.error || 'Search failed');
      setResults([]);
      setShowDropdown(false);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(query), 300);
    } else {
      setResults([]);
      setShowDropdown(false);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (contact: NetworkerContact) => {
    onChange({
      networker_contact_id: contact.id,
      client_name: contact.name,
      client_organization: contact.organization || '',
    });
    setQuery('');
    setShowDropdown(false);
    setResults([]);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  // If a contact is selected, show the selected card
  if (value) {
    return (
      <div className="space-y-2">
        <Label>Client (from Networker)</Label>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{value.client_name}</p>
                  {value.client_organization && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {value.client_organization}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleClear}
                disabled={disabled}
                title="Remove contact"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Search mode
  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>Client (from Networker)</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts by name or organization..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          disabled={disabled}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
        />
        {loading && (
          <div className="absolute right-2.5 top-2.5">
            <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {query.length > 0 && query.length < 2 && (
        <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
      )}

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute z-50 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-b-0"
              onClick={() => handleSelect(contact)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{contact.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {contact.organization && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contact.organization}
                      </span>
                    )}
                    {contact.role && (
                      <span className="truncate">{contact.role}</span>
                    )}
                  </div>
                  {contact.sector && (
                    <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                      <Globe className="h-3 w-3" />
                      {contact.sector}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <TemperatureBadge temperature={contact.temperature} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && query.length >= 2 && results.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          No contacts found in Networker. You can still select a client from the dropdown below.
        </p>
      )}
    </div>
  );
}
