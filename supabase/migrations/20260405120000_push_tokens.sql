-- Push notification device tokens (Expo)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_tokens_user_token_unique UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_select_own
  ON public.push_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY push_tokens_insert_own
  ON public.push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_update_own
  ON public.push_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_delete_own
  ON public.push_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Sellers to notify when a new buyer request is created (category + radius)
CREATE OR REPLACE FUNCTION public.seller_user_ids_for_request_push(p_request_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.user_id
  FROM public.seller_profiles sp
  INNER JOIN public.buyer_requests br ON br.id = p_request_id
  INNER JOIN public.categories c ON c.id = br.category_id
  WHERE sp.user_id <> br.buyer_id
    AND EXISTS (
      SELECT 1
      FROM unnest(sp.preferred_categories) AS u(cat)
      WHERE lower(trim(cat)) = lower(trim(c.name))
    )
    AND (
      sp.location IS NULL
      OR br.location IS NULL
      OR ST_DWithin(sp.location, br.location, (sp.search_radius_km * 1000)::double precision)
    );
$$;

REVOKE ALL ON FUNCTION public.seller_user_ids_for_request_push(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_user_ids_for_request_push(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seller_user_ids_for_request_push(uuid) TO postgres;
