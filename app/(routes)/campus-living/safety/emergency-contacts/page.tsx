'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, AlertTriangle, Shield, Ambulance, Flame, Building2, Edit } from 'lucide-react';

export default function EmergencyContactsPage() {
  const emergencyContacts = [
    { category: 'Medical Emergency', contacts: [
      { name: 'Hostel Medical Room', phone: '+91 98765 00001', available: '24/7', primary: true },
      { name: 'JKKN Hospital', phone: '+91 98765 00002', available: '24/7', primary: false },
      { name: 'Ambulance', phone: '108', available: '24/7', primary: false },
    ]},
    { category: 'Fire Emergency', contacts: [
      { name: 'Fire Station - Kovilpatti', phone: '101', available: '24/7', primary: true },
      { name: 'Campus Fire Marshal', phone: '+91 98765 00003', available: '8 AM - 10 PM', primary: false },
    ]},
    { category: 'Police / Security', contacts: [
      { name: 'Police Control Room', phone: '100', available: '24/7', primary: true },
      { name: 'Campus Security Office', phone: '+91 98765 00004', available: '24/7', primary: false },
      { name: 'Women Helpline', phone: '181', available: '24/7', primary: false },
    ]},
    { category: 'Hostel Administration', contacts: [
      { name: 'Chief Warden', phone: '+91 98765 00005', available: '8 AM - 9 PM', primary: true },
      { name: 'Block A Warden', phone: '+91 98765 00006', available: '24/7 (on-site)', primary: false },
      { name: 'Block B Warden', phone: '+91 98765 00007', available: '24/7 (on-site)', primary: false },
      { name: 'Block C Warden', phone: '+91 98765 00008', available: '24/7 (on-site)', primary: false },
    ]},
    { category: 'Anti-Ragging', contacts: [
      { name: 'Anti-Ragging Committee Chair', phone: '+91 98765 00009', available: '24/7', primary: true },
      { name: 'UGC Anti-Ragging Helpline', phone: '1800-180-5522', available: '24/7', primary: false },
      { name: 'Anti-Ragging Email', phone: 'antiragging@jkkn.ac.in', available: '24/7', primary: false },
    ]},
  ];

  const getIcon = (category: string) => {
    switch (category) {
      case 'Medical Emergency': return <Ambulance className="h-5 w-5 text-red-600" />;
      case 'Fire Emergency': return <Flame className="h-5 w-5 text-orange-600" />;
      case 'Police / Security': return <Shield className="h-5 w-5 text-blue-600" />;
      case 'Hostel Administration': return <Building2 className="h-5 w-5 text-green-600" />;
      case 'Anti-Ragging': return <AlertTriangle className="h-5 w-5 text-purple-600" />;
      default: return <Phone className="h-5 w-5" />;
    }
  };

  return (
    <ContentLayout title="Emergency Contacts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Emergency Protocol & Contacts</h1>
            <p className="text-muted-foreground">
              Emergency contact numbers and response protocols
            </p>
          </div>
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Edit Contacts
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
        <div className="grid gap-6">
          {emergencyContacts.map((group) => (
            <Card key={group.category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getIcon(group.category)}
                  {group.category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.contacts.map((contact) => (
                    <div
                      key={contact.name}
                      className={`p-4 rounded-lg border ${contact.primary ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-medium text-sm">{contact.name}</p>
                        {contact.primary && <Badge variant="default" className="text-xs">Primary</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <a href={`tel:${contact.phone}`} className="text-primary font-semibold">
                          {contact.phone}
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">{contact.available}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
