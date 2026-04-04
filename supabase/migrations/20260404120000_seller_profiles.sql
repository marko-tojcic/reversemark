-- Seller preferences (single row per user) — source of truth for discovery ranking
CREATE TABLE IF NOT EXISTS public.seller_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_categories TEXT[] NOT NULL DEFAULT '{}',
  preferred_brands TEXT[] NOT NULL DEFAULT '{}',
  clothing_sizes TEXT[] NOT NULL DEFAULT '{}',
  cosmetic_types TEXT[] NOT NULL DEFAULT '{}',
  location GEOGRAPHY(Point, 4326),
  search_radius_km INTEGER NOT NULL DEFAULT 50 CHECK (search_radius_km > 0 AND search_radius_km <= 20000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seller_profiles_updated_at_idx ON public.seller_profiles (updated_at DESC);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_profiles_select_own"
  ON public.seller_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "seller_profiles_insert_own"
  ON public.seller_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_profiles_update_own"
  ON public.seller_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_profiles_delete_own"
  ON public.seller_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Returns seller profile for the current user with lat/lng extracted from geography
CREATE OR REPLACE FUNCTION public.get_my_seller_profile()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN sp.user_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'user_id', sp.user_id,
        'preferred_categories', sp.preferred_categories,
        'preferred_brands', sp.preferred_brands,
        'clothing_sizes', sp.clothing_sizes,
        'cosmetic_types', sp.cosmetic_types,
        'search_radius_km', sp.search_radius_km,
        'updated_at', sp.updated_at,
        'lat', CASE WHEN sp.location IS NOT NULL THEN ST_Y(sp.location::geometry) END,
        'lng', CASE WHEN sp.location IS NOT NULL THEN ST_X(sp.location::geometry) END
      )
    END
  FROM public.seller_profiles sp
  WHERE sp.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_seller_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_seller_profile() TO authenticated;

-- Upsert seller profile; builds geography from lat/lng (WGS84)
CREATE OR REPLACE FUNCTION public.upsert_my_seller_profile(
  p_preferred_categories TEXT[],
  p_preferred_brands TEXT[],
  p_clothing_sizes TEXT[],
  p_cosmetic_types TEXT[],
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_search_radius_km INTEGER
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.seller_profiles (
    user_id,
    preferred_categories,
    preferred_brands,
    clothing_sizes,
    cosmetic_types,
    location,
    search_radius_km,
    updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_preferred_categories, '{}'),
    COALESCE(p_preferred_brands, '{}'),
    COALESCE(p_clothing_sizes, '{}'),
    COALESCE(p_cosmetic_types, '{}'),
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ELSE NULL
    END,
    COALESCE(NULLIF(p_search_radius_km, 0), 50),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    preferred_categories = EXCLUDED.preferred_categories,
    preferred_brands = EXCLUDED.preferred_brands,
    clothing_sizes = EXCLUDED.clothing_sizes,
    cosmetic_types = EXCLUDED.cosmetic_types,
    location = EXCLUDED.location,
    search_radius_km = EXCLUDED.search_radius_km,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_seller_profile(TEXT[], TEXT[], TEXT[], TEXT[], DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_seller_profile(TEXT[], TEXT[], TEXT[], TEXT[], DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
