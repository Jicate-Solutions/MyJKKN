'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  AlertTriangle,
  Shield,
  Ambulance,
  Flame,
  Building2,
  Plus,
  Loader2,
  Trash2,
  Mail,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useHostelEmergencyContacts,
  useCreateHostelEmergencyContact,
  useDeleteHostelEmergencyContact,
} from '@/hooks/campus-living/use-hostel-emergency-contacts';
import { BlockSelector } from '@/components/campus-living/block-selector';
import type { HostelEmergencyContact } from '@/types/campus-living';

const CONTACT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'medical', label: 'Medical' },
  { value: 'fire', label: 'Fire' },
  { value: 'police', label: 'Police / Security' },
  { value: 'warden', label: 'Warden' },
  { value: 'anti_ragging', label: 'Anti-Ragging' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Other' },
];

const TYPE_LABEL: Record<string, string> = {
  medical: 'Medical Emergency',
  fire: 'Fire Emergency',
  police: 'Police / Security',
  warden: 'Hostel Administration',
  anti_ragging: 'Anti-Ragging',
  family: 'Family',
  other: 'Other',
};

function categoryIcon(type: string | null) {
  switch (type) {
    case 'medical':
      return <Ambulance className="h-5 w-5 text-red-600" />;
    case 'fire':
      return <Flame className="h-5 w-5 text-orange-600" />;
    case 'police':
      return <Shield className="h-5 w-5 text-blue-600" />;
    case 'warden':
      return <Building2 className="h-5 w-5 text-green-600" />;
    case 'anti_ragging':
      return <AlertTriangle className="h-5 w-5 text-purple-600" />;
    default:
      return <Phone className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function EmergencyContactsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [createOpen, setCreateOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAltPhone, setFormAltPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formType, setFormType] = useState<string>('medical');
  const [formRelationship, setFormRelationship] = useState('');
  const [formBlockId, setFormBlockId] = useState<string>('all');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formAddress, setFormAddress] = useState('');

  const { data, isLoading } = useHostelEmergencyContacts(institutionId);
  const createMutation = useCreateHostelEmergencyContact();
  const deleteMutation = useDeleteHostelEmergencyContact();

  const contacts = data?.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, HostelEmergencyContact[]>();
    for (const c of contacts) {
      const key = c.contact_type || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    // Order categories to match the seeded taxonomy
    const order = ['medical', 'fire', 'police', 'warden', 'anti_ragging', 'family', 'other'];
    return order
      .map((key) => ({ key, contacts: map.get(key) ?? [] }))
      .filter((g) => g.contacts.length > 0);
  }, [contacts]);

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormAltPhone('');
    setFormEmail('');
    setFormType('medical');
    setFormRelationship('');
    setFormBlockId('all');
    setFormIsPrimary(false);
    setFormAddress('');
  };

  const handleCreate = () => {
    if (!institutionId) return;
    if (!formName.trim() || !formPhone.trim()) return;

    createMutation.mutate(
      {
        institution_id: institutionId,
        block_id: formBlockId !== 'all' ? formBlockId : null,
        learner_id: null,
        contact_name: formName.trim(),
        relationship: formRelationship.trim() || null,
        phone: formPhone.trim(),
        alt_phone: formAltPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim() || null,
        is_primary: formIsPrimary,
        contact_type: formType,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this contact?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <ContentLayout title="Emergency Contacts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Emergency Protocol &amp; Contacts</h1>
            <p className="text-muted-foreground">
              Per-institution emergency contact directory used by wardens, residents
              and on-call staff
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!institutionId}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>

        {/* Emergency Protocol */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Emergency Response Protocol
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-red-900">
              <li>Ensure safety of yourself and others nearby</li>
              <li>Call the relevant emergency number immediately (see contacts below)</li>
              <li>Alert the nearest warden or security guard</li>
              <li>Do not attempt to handle dangerous situations alone</li>
              <li>Follow evacuation routes if fire/structural emergency</li>
              <li>Stay calm and provide clear information to emergency responders</li>
              <li>Document the incident after everyone is safe</li>
            </ol>
          </CardContent>
        </Card>

        {/* Contact Cards */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading contacts…
            </CardContent>
          </Card>
        ) : contacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Phone className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium text-foreground">
                No emergency contacts configured yet
              </p>
              <p>
                Click <strong>Add Contact</strong> to start the institution-specific
                directory.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {grouped.map((group) => (
              <Card key={group.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {categoryIcon(group.key)}
                    {TYPE_LABEL[group.key] ?? group.key}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`p-4 rounded-lg border ${
                          contact.is_primary ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-sm">
                              {contact.contact_name}
                            </p>
                            {contact.relationship && (
                              <p className="text-xs text-muted-foreground">
                                {contact.relationship}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {contact.is_primary && (
                              <Badge variant="default" className="text-xs">
                                Primary
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-600"
                              onClick={() => handleDelete(contact.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-primary font-semibold text-sm"
                          >
                            {contact.phone}
                          </a>
                        </div>
                        {contact.alt_phone && (
                          <div className="flex items-center gap-2 mb-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <a
                              href={`tel:${contact.alt_phone}`}
                              className="text-muted-foreground text-xs"
                            >
                              {contact.alt_phone}
                            </a>
                          </div>
                        )}
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-muted-foreground text-xs"
                            >
                              {contact.email}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Emergency Contact</DialogTitle>
            <DialogDescription>
              Phone, email and category for the institution-wide emergency
              directory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Contact Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Chief Warden, Fire Station Kovilpatti"
              />
            </div>

            <div>
              <Label htmlFor="type">Category *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+91 98765 00001"
              />
            </div>

            <div>
              <Label htmlFor="alt">Alternate Phone</Label>
              <Input
                id="alt"
                value={formAltPhone}
                onChange={(e) => setFormAltPhone(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="relationship">Role / Relationship</Label>
              <Input
                id="relationship"
                value={formRelationship}
                onChange={(e) => setFormRelationship(e.target.value)}
                placeholder="e.g. Chief Warden, Father, Fire Marshal"
              />
            </div>

            <div>
              <Label htmlFor="block">Block (optional)</Label>
              {institutionId ? (
                <BlockSelector
                  institutionId={institutionId}
                  value={formBlockId}
                  onValueChange={setFormBlockId}
                  className="w-full"
                />
              ) : null}
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                rows={2}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formIsPrimary}
                onChange={(e) => setFormIsPrimary(e.target.checked)}
                className="rounded"
              />
              Mark as primary contact for this category
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending || !formName.trim() || !formPhone.trim()
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
