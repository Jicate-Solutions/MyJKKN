/**
 * Types for User App Favorites Module
 * Handles favorite applications functionality for students
 */

export interface UserAppFavorite {
  id: string;
  user_id: string;
  application_id: string;
  created_at: string;
  updated_at: string;
}

import type {
  IntegrationType,
  AuthMethod,
  PlatformType,
  AppType,
  SensitivityLevel,
  SupportContact,
  ApiEndpoint
} from './applications';

export interface FavoriteApp {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category_id: string;
  category?: {
    id: string;
    name: string;
    description: string | null;
  };
  subcategory_id?: string | null;
  subcategory?: {
    id: string;
    name: string;
  };
  roles_access: string[];
  display_order: number;
  is_active: boolean;
  integration_type: IntegrationType;
  auth_method: AuthMethod;
  tags: string[];
  support_contact: SupportContact | null;
  supported_platforms: PlatformType;
  api_endpoints: ApiEndpoint[];
  application_type: AppType;
  data_sensitivity: SensitivityLevel;
  icon_path: string | null;
  screenshots: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  uses_parent_auth?: boolean;
  app_id?: string | null;
  api_key_hash?: string | null;
  allowed_redirect_uris?: string[] | null;
  allowed_scopes?: string[] | null;
  rate_limit_requests?: number;
  rate_limit_window_minutes?: number;
  last_auth_activity?: string | null;
  auth_enabled_at?: string | null;
  auth_enabled_by?: string | null;
  favorited_at: string;
}

export interface FavoritesService {
  // Core CRUD operations
  addFavorite: (applicationId: string) => Promise<UserAppFavorite>;
  removeFavorite: (applicationId: string) => Promise<void>;
  isFavorite: (applicationId: string) => boolean;
  toggleFavorite: (applicationId: string) => Promise<boolean>;

  // Data retrieval
  getFavorites: () => Promise<FavoriteApp[]>;
  getFavoriteCount: () => number;

  // State management
  favoriteIds: Set<string>;
  loading: boolean;
  error: string | null;
}

export interface UseFavoritesReturn extends FavoritesService {
  favorites: FavoriteApp[];
  refreshFavorites: () => Promise<void>;
}