/**
 * IMS Units & Unit Conversions
 */

export interface ImsUnit {
  id: string;
  name: string;
  abbreviation: string;
  is_base_unit: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImsUnitConversion {
  id: string;
  store_id: string | null;
  item_id: string | null;
  from_unit_id: string;
  to_unit_id: string;
  conversion_factor: number;
  created_at: string;
  updated_at: string;
}

export interface ImsUnitConversionWithRelations extends ImsUnitConversion {
  from_unit: ImsUnit;
  to_unit: ImsUnit;
  item?: { id: string; name: string } | null;
}

export interface ImsUnitFilters {
  search?: string;
  is_base_unit?: boolean;
  page?: number;
  limit?: number;
}

export interface ImsUnitConversionFilters {
  item_id?: string;
  search?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export type CreateImsUnitDto = Omit<ImsUnit, 'id' | 'created_at' | 'updated_at'>;
export type UpdateImsUnitDto = Partial<CreateImsUnitDto>;
export type CreateImsUnitConversionDto = Omit<ImsUnitConversion, 'id' | 'created_at' | 'updated_at'>;
export type UpdateImsUnitConversionDto = Partial<CreateImsUnitConversionDto>;
