// types/postal-code.ts
// Postal Code master — TN post offices (pincode → district + lat/long) behind
// the address-section pincode auto-fill and "View on Map" links.

// Type alias (not interface) so rows satisfy the shared DataTable/export
// Record constraints if ever needed (same lesson as SchoolMaster).
export type PostalCode = {
  id: string;
  pincode: string;
  office_name: string;
  division: string | null;
  district: string; // canonical lib/data/locations.ts display name
  district_id: string; // locations.ts district id — binds directly to the address cascade
  state: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export interface PincodeDistrictOption {
  district: string;
  district_id: string;
}

export interface PincodeLookupResult {
  offices: PostalCode[];
  /** Distinct districts across the offices — 1 entry for ~93% of pincodes. */
  districts: PincodeDistrictOption[];
}

export interface PostalCodeFilters {
  district?: string; // canonical display name (postal_codes.district)
  search?: string; // office name contains OR pincode prefix
  is_active?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreatePostalCodeInput {
  pincode: string;
  office_name: string;
  division?: string | null;
  district: string;
  district_id: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
}

export type UpdatePostalCodeInput = Partial<CreatePostalCodeInput>;
