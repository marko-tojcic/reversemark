import { useAuth } from './auth';
import { supabase } from './supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SellerProfileJson } from './sellerProfileMapper';
import { sellerProfileJsonToScoring } from './sellerProfileMapper';
import type { SellerProfile } from './relevanceScoring';

const QUERY_KEY = 'sellerProfile';

function parseRpcProfile(data: unknown): SellerProfileJson | null {
  if (data == null) return null;
  if (typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.user_id !== 'string') return null;
  return {
    user_id: o.user_id,
    preferred_categories: Array.isArray(o.preferred_categories)
      ? (o.preferred_categories as string[])
      : [],
    preferred_brands: Array.isArray(o.preferred_brands) ? (o.preferred_brands as string[]) : [],
    clothing_sizes: Array.isArray(o.clothing_sizes) ? (o.clothing_sizes as string[]) : [],
    cosmetic_types: Array.isArray(o.cosmetic_types) ? (o.cosmetic_types as string[]) : [],
    search_radius_km: typeof o.search_radius_km === 'number' ? o.search_radius_km : 50,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : new Date().toISOString(),
    lat: typeof o.lat === 'number' ? o.lat : o.lat == null ? null : Number(o.lat),
    lng: typeof o.lng === 'number' ? o.lng : o.lng == null ? null : Number(o.lng),
  };
}

export type UpsertSellerProfileInput = {
  preferred_categories: string[];
  preferred_brands: string[];
  clothing_sizes: string[];
  cosmetic_types: string[];
  lat: number | null;
  lng: number | null;
  search_radius_km: number;
};

/**
 * Single source of truth for seller discovery preferences (Supabase).
 */
export function useSellerProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async (): Promise<SellerProfileJson | null> => {
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_my_seller_profile');
      if (error) throw error;
      return parseRpcProfile(data);
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (input: UpsertSellerProfileInput) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.rpc('upsert_my_seller_profile', {
        p_preferred_categories: input.preferred_categories,
        p_preferred_brands: input.preferred_brands,
        p_clothing_sizes: input.clothing_sizes,
        p_cosmetic_types: input.cosmetic_types,
        p_lat: input.lat,
        p_lng: input.lng,
        p_search_radius_km: input.search_radius_km,
      });
      if (error) throw error;

      // Update cache immediately so `needsSetup` clears before `router.replace` — otherwise
      // invalidate-only refetch races navigation and the gate still thinks there is no profile.
      const next: SellerProfileJson = {
        user_id: user.id,
        preferred_categories: input.preferred_categories,
        preferred_brands: input.preferred_brands,
        clothing_sizes: input.clothing_sizes,
        cosmetic_types: input.cosmetic_types,
        search_radius_km: input.search_radius_km,
        updated_at: new Date().toISOString(),
        lat: input.lat,
        lng: input.lng,
      };
      queryClient.setQueryData<SellerProfileJson | null>([QUERY_KEY, user.id], next);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user.id] });
    },
  });

  const row = query.data ?? null;
  const sellerProfile: SellerProfile | null = row ? sellerProfileJsonToScoring(row) : null;

  const needsSetup =
    !!user && query.isSuccess && row === null;

  return {
    profileRow: row,
    sellerProfile,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error,
    needsSetup,
    refetch: query.refetch,
    upsertProfile: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
