'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Building2,
  BedDouble,
  Users,
  Home,
  Search,
  Filter,
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
  AlertCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for hostels
const mockHostels = [
  {
    id: 'HST-001',
    name: 'Krishna Hostel (Boys)',
    type: 'boys',
    totalRooms: 100,
    totalBeds: 300,
    occupiedBeds: 245,
    wardenName: 'Mr. Ramesh Kumar',
    wardenPhone: '+91 98765 43210',
    location: 'Block A, Main Campus',
    amenities: ['WiFi', 'AC Rooms', 'Mess', 'Gym', 'Parking'],
    feePerYear: 85000,
    status: 'active'
  },
  {
    id: 'HST-002',
    name: 'Lakshmi Hostel (Girls)',
    type: 'girls',
    totalRooms: 80,
    totalBeds: 240,
    occupiedBeds: 220,
    wardenName: 'Mrs. Lakshmi Devi',
    wardenPhone: '+91 98765 43211',
    location: 'Block B, Main Campus',
    amenities: ['WiFi', 'AC Rooms', 'Mess', 'Common Room', '24/7 Security'],
    feePerYear: 90000,
    status: 'active'
  },
  {
    id: 'HST-003',
    name: 'Annexe Hostel (Boys)',
    type: 'boys',
    totalRooms: 50,
    totalBeds: 150,
    occupiedBeds: 120,
    wardenName: 'Mr. Suresh Babu',
    wardenPhone: '+91 98765 43212',
    location: 'Near Sports Complex',
    amenities: ['WiFi', 'Mess', 'Study Room'],
    feePerYear: 65000,
    status: 'active'
  }
];

const mockAllocations = [
  {
    id: 'ALLOC-001',
    studentName: 'Rahul Sharma',
    studentId: 'STU-2026-001',
    hostelName: 'Krishna Hostel (Boys)',
    roomNumber: 'A-101',
    bedNumber: 'B1',
    allocatedDate: '2026-01-05',
    status: 'confirmed',
    paymentStatus: 'paid',
    program: 'B.Tech CSE'
  },
  {
    id: 'ALLOC-002',
    studentName: 'Priya Patel',
    studentId: 'STU-2026-002',
    hostelName: 'Lakshmi Hostel (Girls)',
    roomNumber: 'B-205',
    bedNumber: 'B2',
    allocatedDate: '2026-01-06',
    status: 'confirmed',
    paymentStatus: 'paid',
    program: 'B.Tech ECE'
  },
  {
    id: 'ALLOC-003',
    studentName: 'Amit Kumar',
    studentId: 'STU-2026-003',
    hostelName: 'Krishna Hostel (Boys)',
    roomNumber: null,
    bedNumber: null,
    allocatedDate: null,
    status: 'waitlisted',
    paymentStatus: 'pending',
    program: 'MBA',
    waitlistPosition: 5
  }
];

const mockWaitlist = [
  { id: 'WL-001', studentName: 'Amit Kumar', program: 'MBA', hostelPreference: 'Krishna Hostel', position: 1, appliedDate: '2026-01-10' },
  { id: 'WL-002', studentName: 'Sneha Reddy', program: 'B.Tech', hostelPreference: 'Lakshmi Hostel', position: 2, appliedDate: '2026-01-11' },
  { id: 'WL-003', studentName: 'Vikram Singh', program: 'M.Tech', hostelPreference: 'Krishna Hostel', position: 3, appliedDate: '2026-01-12' }
];

function HostelsPageContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isAllocateDialogOpen, setIsAllocateDialogOpen] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [allocatingWaitlistId, setAllocatingWaitlistId] = useState<string | null>(null);

  const totalBeds = mockHostels.reduce((sum, h) => sum + h.totalBeds, 0);
  const occupiedBeds = mockHostels.reduce((sum, h) => sum + h.occupiedBeds, 0);
  const availableBeds = totalBeds - occupiedBeds;
  const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      confirmed: 'bg-green-100 text-green-800',
      waitlisted: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      paid: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800'
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
          <Button variant="outline" size="sm" onClick={() => toast.success('Hostel data exported successfully')}>
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
                  <Label>Student</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stu1">Rahul Sharma (B.Tech CSE)</SelectItem>
                      <SelectItem value="stu2">Priya Patel (B.Tech ECE)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hostel</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select hostel" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockHostels.map(h => (
                        <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Room Number</Label>
                    <Input placeholder="e.g., A-101" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bed Number</Label>
                    <Input placeholder="e.g., B1" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAllocateDialogOpen(false)} disabled={isAllocating}>Cancel</Button>
                <Button
                  onClick={async () => {
                    setIsAllocating(true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    setIsAllocating(false);
                    setIsAllocateDialogOpen(false);
                    toast.success('Room allocated successfully');
                  }}
                  disabled={isAllocating}
                >
                  {isAllocating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
            <div className="text-2xl font-bold">{totalBeds} beds</div>
            <p className="text-xs text-muted-foreground">
              Across {mockHostels.length} hostels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{occupancyRate.toFixed(0)}%</div>
            <Progress value={occupancyRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {occupiedBeds} occupied / {availableBeds} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Beds</CardTitle>
            <Home className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{availableBeds}</div>
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
            <div className="text-2xl font-bold text-yellow-600">{mockWaitlist.length}</div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockHostels.map((hostel) => {
              const availableInHostel = hostel.totalBeds - hostel.occupiedBeds;
              const hostelOccupancy = (hostel.occupiedBeds / hostel.totalBeds) * 100;

              return (
                <Card key={hostel.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className={`h-5 w-5 ${hostel.type === 'boys' ? 'text-blue-500' : 'text-pink-500'}`} />
                        <div>
                          <CardTitle className="text-lg">{hostel.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {hostel.location}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge className={getStatusBadge(hostel.status)}>
                        {hostel.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{hostel.wardenName}</span>
                      <Phone className="h-4 w-4 ml-2" />
                      <span>{hostel.wardenPhone}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Occupancy</span>
                        <span className="font-medium">{hostelOccupancy.toFixed(0)}%</span>
                      </div>
                      <Progress value={hostelOccupancy} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{hostel.occupiedBeds} occupied</span>
                        <span className="text-green-600">{availableInHostel} available</span>
                      </div>
                    </div>

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

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-1 text-sm">
                        <IndianRupee className="h-4 w-4" />
                        <span className="font-semibold">{(hostel.feePerYear / 1000).toFixed(0)}K</span>
                        <span className="text-muted-foreground">/year</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => toast.info(`Viewing ${hostel.name} details`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toast.info(`Editing ${hostel.name}`)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Room Allocations</CardTitle>
              <CardDescription>Current hostel room assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockAllocations.map((alloc) => (
                  <div key={alloc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{alloc.studentName}</p>
                        <p className="text-sm text-muted-foreground">{alloc.program}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{alloc.hostelName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alloc.roomNumber ? `Room ${alloc.roomNumber}, Bed ${alloc.bedNumber}` : 'Not assigned'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Badge className={getStatusBadge(alloc.status)}>
                          {alloc.status}
                        </Badge>
                        <Badge className={getStatusBadge(alloc.paymentStatus)}>
                          {alloc.paymentStatus}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing allocation for ${alloc.studentName}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                    setIsProcessingQueue(true);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    setIsProcessingQueue(false);
                    toast.success('Processing waitlist queue');
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
              <div className="space-y-4">
                {mockWaitlist.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center font-bold text-yellow-600">
                        #{item.position}
                      </div>
                      <div>
                        <p className="font-medium">{item.studentName}</p>
                        <p className="text-sm text-muted-foreground">{item.program}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm">Preference: {item.hostelPreference}</p>
                        <p className="text-xs text-muted-foreground">Applied: {item.appliedDate}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setAllocatingWaitlistId(item.id);
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          setAllocatingWaitlistId(null);
                          toast.success(`${item.studentName} allocated from waitlist`);
                        }}
                        disabled={allocatingWaitlistId === item.id}
                      >
                        {allocatingWaitlistId === item.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-1" />
                        )}
                        Allocate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="space-y-6">
                {mockHostels.map((hostel) => (
                  <div key={hostel.id} className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Building2 className={`h-4 w-4 ${hostel.type === 'boys' ? 'text-blue-500' : 'text-pink-500'}`} />
                      {hostel.name}
                    </h4>
                    <div className="grid grid-cols-10 md:grid-cols-20 gap-1">
                      {Array.from({ length: hostel.totalRooms }, (_, i) => {
                        const isOccupied = i < Math.floor(hostel.occupiedBeds / 3);
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function HostelsPage() {
  return (
    <AdmissionErrorBoundary>
      <HostelsPageContent />
    </AdmissionErrorBoundary>
  );
}
