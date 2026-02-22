'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Building2,
  BedDouble,
  Users,
  Home,
  Search,
  Plus,
  Download,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  MapPin,
  Phone,
  User,
  Calendar,
  IndianRupee,
  Wifi,
  Utensils,
  Car,
  Shield,
  Eye,
  Edit,
  UserPlus,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useHostels, useHostelAllocations, useHostelWaitlist, useAllocateHostelRoom, useUpdateWaitlistStatus } from '@/hooks/admission/use-data-quality';

function HostelsPageContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAllocateDialogOpen, setIsAllocateDialogOpen] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [allocFormStudentId, setAllocFormStudentId] = useState('');
  const [allocFormHostelId, setAllocFormHostelId] = useState('');
  const [allocFormRoom, setAllocFormRoom] = useState('');
  const [allocFormBed, setAllocFormBed] = useState('');

  const { data: hostels, isLoading: hostelsLoading } = useHostels();
  const { data: allocations, isLoading: allocationsLoading } = useHostelAllocations();
  const { data: waitlist, isLoading: waitlistLoading } = useHostelWaitlist();
  const allocateRoom = useAllocateHostelRoom();
  const updateWaitlistStatus = useUpdateWaitlistStatus();

  const hostelList = hostels || [];
  const allocationList = allocations || [];
  const waitlistList = waitlist || [];

  const totalBeds = hostelList.reduce((sum, h) => sum + (h.total_beds || 0), 0);
  const occupiedBeds = hostelList.reduce((sum, h) => sum + (h.occupied_beds || 0), 0);
  const availableBeds = hostelList.reduce((sum, h) => sum + (h.available_beds || 0), 0);
  const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      confirmed: 'bg-green-100 text-green-800',
      allocated: 'bg-green-100 text-green-800',
      waitlisted: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      paid: 'bg-green-100 text-green-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getAmenityIcon = (amenity: string) => {
    switch (amenity.toLowerCase()) {
      case 'wifi': return <Wifi className="h-3 w-3" />;
      case 'mess': return <Utensils className="h-3 w-3" />;
      case 'parking': return <Car className="h-3 w-3" />;
      case '24/7 security': return <Shield className="h-3 w-3" />;
      default: return <CheckCircle2 className="h-3 w-3" />;
    }
  };

  return (
    <ContentLayout title="Hostels">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Hostels</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-500" />
            Hostel Allocation
          </h1>
          <p className="text-muted-foreground">Manage hostel rooms, allocations, and waitlists</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (!hostelList.length) { toast.info('No hostel data to export'); return; }
            const headers = ['Hostel Name','Code','Type','Total Rooms','Total Beds','Occupied','Available','Occupancy %','Active','Fee/Semester','Fee/Month'];
            const rows = hostelList.map(h => [
              h.hostel_name, h.hostel_code || '', h.hostel_type,
              h.total_rooms, h.total_beds, h.occupied_beds, h.available_beds,
              h.total_beds > 0 ? ((h.occupied_beds / h.total_beds) * 100).toFixed(1) : '0',
              h.is_active ? 'Yes' : 'No',
              h.base_fee_per_semester ?? '', h.base_fee_per_month ?? '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `hostels-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast.success('Hostel data exported');
          }}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={isAllocateDialogOpen} onOpenChange={setIsAllocateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Allocate Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Allocate Hostel Room</DialogTitle>
                <DialogDescription>Assign a room to a confirmed student</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Student ID</Label>
                  <Input placeholder="Enter student UUID..." value={allocFormStudentId} onChange={e => setAllocFormStudentId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hostel</Label>
                  <Select value={allocFormHostelId} onValueChange={setAllocFormHostelId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select hostel" />
                    </SelectTrigger>
                    <SelectContent>
                      {hostelList.map(h => (
                        <SelectItem key={h.id} value={h.id}>{h.hostel_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Room Number</Label>
                    <Input placeholder="e.g., A-101" value={allocFormRoom} onChange={e => setAllocFormRoom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bed Number</Label>
                    <Input placeholder="e.g., B1" value={allocFormBed} onChange={e => setAllocFormBed(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAllocateDialogOpen(false)} disabled={allocateRoom.isPending}>Cancel</Button>
                <Button
                  onClick={async () => {
                    if (!allocFormStudentId || !allocFormHostelId) {
                      toast.error('Student and hostel are required');
                      return;
                    }
                    try {
                      await allocateRoom.mutateAsync({
                        student_id: allocFormStudentId,
                        hostel_id: allocFormHostelId,
                      });
                      setIsAllocateDialogOpen(false);
                      setAllocFormStudentId('');
                      setAllocFormHostelId('');
                      setAllocFormRoom('');
                      setAllocFormBed('');
                      toast.success('Room allocated successfully');
                    } catch {
                      toast.error('Failed to allocate room');
                    }
                  }}
                  disabled={allocateRoom.isPending}
                >
                  {allocateRoom.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Allocate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
            <BedDouble className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hostelsLoading ? '...' : `${totalBeds} beds`}</div>
            <p className="text-xs text-muted-foreground">
              Across {hostelList.length} hostels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hostelsLoading ? '...' : `${occupancyRate.toFixed(0)}%`}</div>
            <Progress value={occupancyRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {hostelsLoading ? '' : `${occupiedBeds} occupied / ${availableBeds} available`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Beds</CardTitle>
            <Home className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{hostelsLoading ? '...' : availableBeds}</div>
            <p className="text-xs text-muted-foreground">
              Ready for allocation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Waitlist</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{waitlistLoading ? '...' : waitlistList.length}</div>
            <p className="text-xs text-muted-foreground">
              Students waiting
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Hostels</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
          <TabsTrigger value="rooms">Room Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {hostelsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hostelList.map((hostel) => {
                const hostelOccupancy = hostel.total_beds > 0 ? (hostel.occupied_beds / hostel.total_beds) * 100 : 0;

                return (
                  <Card key={hostel.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className={`h-5 w-5 ${hostel.hostel_type === 'boys' ? 'text-blue-500' : 'text-pink-500'}`} />
                          <div>
                            <CardTitle className="text-lg">{hostel.hostel_name}</CardTitle>
                            <CardDescription className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {hostel.address || hostel.hostel_type}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge className={getStatusBadge(hostel.is_active ? 'active' : 'inactive')}>
                          {hostel.is_active ? 'active' : 'inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {hostel.warden_name && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{hostel.warden_name}</span>
                          {hostel.warden_phone && (
                            <>
                              <Phone className="h-4 w-4 ml-2" />
                              <span>{hostel.warden_phone}</span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Occupancy</span>
                          <span className="font-medium">{hostelOccupancy.toFixed(0)}%</span>
                        </div>
                        <Progress value={hostelOccupancy} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{hostel.occupied_beds} occupied</span>
                          <span className="text-green-600">{hostel.available_beds} available</span>
                        </div>
                      </div>

                      {hostel.amenities && hostel.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {hostel.amenities.slice(0, 4).map((amenity, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs flex items-center gap-1">
                              {getAmenityIcon(amenity)}
                              {amenity}
                            </Badge>
                          ))}
                          {hostel.amenities.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{hostel.amenities.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-1 text-sm">
                          <IndianRupee className="h-4 w-4" />
                          <span className="font-semibold">
                            {hostel.base_fee_per_semester
                              ? `${(hostel.base_fee_per_semester / 1000).toFixed(0)}K/sem`
                              : hostel.base_fee_per_month
                              ? `${(hostel.base_fee_per_month / 1000).toFixed(0)}K/mo`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => toast.info(`Viewing ${hostel.hostel_name} details`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toast.info(`Editing ${hostel.hostel_name}`)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {hostelList.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-500">
                  No hostels found
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Room Allocations</CardTitle>
              <CardDescription>Current hostel room assignments</CardDescription>
            </CardHeader>
            <CardContent>
              {allocationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {allocationList.map((alloc) => (
                    <div key={alloc.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{alloc.student_id}</p>
                          <p className="text-sm text-muted-foreground">{alloc.academic_year || ''} {alloc.semester || ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{alloc.hostel_name || 'Unknown Hostel'}</p>
                          <p className="text-xs text-muted-foreground">
                            {alloc.room_number ? `Room ${alloc.room_number}` : 'Not assigned'}
                            {alloc.bed_number ? `, Bed ${alloc.bed_number}` : ''}
                          </p>
                        </div>
                        <Badge className={getStatusBadge(alloc.allocation_status)}>
                          {alloc.allocation_status}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Viewing allocation details')}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {allocationList.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No allocations found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Waitlist Queue</CardTitle>
                  <CardDescription>Students waiting for hostel allocation</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!waitlistList.length) { toast.info('No entries in waitlist'); return; }
                    setIsProcessingQueue(true);
                    let processed = 0;
                    for (const entry of waitlistList.filter(w => w.request_status === 'pending')) {
                      try {
                        await updateWaitlistStatus.mutateAsync({ id: entry.id, status: 'waitlisted' });
                        processed++;
                      } catch { /* skip failed entries */ }
                    }
                    setIsProcessingQueue(false);
                    toast.success(`Processed ${processed} waitlist entries`);
                  }}
                  disabled={isProcessingQueue}
                >
                  {isProcessingQueue ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Process Queue
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {waitlistLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {waitlistList.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center font-bold text-yellow-600">
                          #{item.waitlist_position || '-'}
                        </div>
                        <div>
                          <p className="font-medium">{item.student_id}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.preferred_room_type || ''} {item.prefer_ac ? '(AC)' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm">
                            Preference: {item.preferred_hostel_name || item.preferred_hostel_type || 'Any'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Applied: {new Date(item.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className={getStatusBadge(item.request_status)}>
                          {item.request_status}
                        </Badge>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await updateWaitlistStatus.mutateAsync({ id: item.id, status: 'allocated' });
                              toast.success('Student allocated from waitlist');
                            } catch {
                              toast.error('Failed to allocate student');
                            }
                          }}
                          disabled={updateWaitlistStatus.isPending}
                        >
                          {updateWaitlistStatus.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4 mr-1" />
                          )}
                          Allocate
                        </Button>
                      </div>
                    </div>
                  ))}
                  {waitlistList.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No students on waitlist</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Room Matrix</CardTitle>
              <CardDescription>Visual overview of room occupancy</CardDescription>
            </CardHeader>
            <CardContent>
              {hostelsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-6">
                  {hostelList.map((hostel) => (
                    <div key={hostel.id} className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Building2 className={`h-4 w-4 ${hostel.hostel_type === 'boys' ? 'text-blue-500' : 'text-pink-500'}`} />
                        {hostel.hostel_name}
                      </h4>
                      <div className="grid grid-cols-10 md:grid-cols-20 gap-1">
                        {Array.from({ length: hostel.total_rooms || 0 }, (_, i) => {
                          const isOccupied = hostel.total_beds > 0 ? i < Math.floor(hostel.occupied_beds / Math.max(1, Math.ceil(hostel.total_beds / hostel.total_rooms))) : false;
                          return (
                            <div
                              key={i}
                              className={`w-6 h-6 rounded text-xs flex items-center justify-center ${
                                isOccupied
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-green-100 text-green-600'
                              }`}
                              title={`Room ${i + 1}: ${isOccupied ? 'Occupied' : 'Available'}`}
                            >
                              {i + 1}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded bg-green-100" /> Available
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded bg-red-100" /> Occupied
                        </span>
                      </div>
                    </div>
                  ))}
                  {hostelList.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No hostels found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function HostelsPage() {
  return (
    <AdmissionErrorBoundary>
      <HostelsPageContent />
    </AdmissionErrorBoundary>
  );
}
