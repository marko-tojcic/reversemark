-- Ratings (trust layer): one review per reviewer per request, after request is COMPLETED
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.buyer_requests(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ratings_reviewer_request_unique UNIQUE (reviewer_id, request_id),
  CONSTRAINT ratings_no_self_review CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX IF NOT EXISTS ratings_reviewee_id_idx ON public.ratings (reviewee_id);
CREATE INDEX IF NOT EXISTS ratings_request_id_idx ON public.ratings (request_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_select_participants
  ON public.ratings FOR SELECT
  TO authenticated
  USING (reviewer_id = auth.uid() OR reviewee_id = auth.uid());

CREATE POLICY ratings_insert_none
  ON public.ratings FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY ratings_update_none
  ON public.ratings FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY ratings_delete_none
  ON public.ratings FOR DELETE
  TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.get_user_rating(p_user_id uuid)
RETURNS TABLE (average_rating numeric, total_reviews bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating::numeric), 2), 0)::numeric AS average_rating,
    COUNT(*)::bigint AS total_reviews
  FROM public.ratings
  WHERE reviewee_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_rating(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_rating(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_rating(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_rating(
  p_request_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_status public.request_status;
  v_seller uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  IF auth.uid() = p_reviewee_id THEN
    RAISE EXCEPTION 'Cannot rate yourself';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ratings r
    WHERE r.request_id = p_request_id AND r.reviewer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have already rated this request';
  END IF;

  SELECT br.buyer_id, br.status
  INTO v_buyer, v_status
  FROM public.buyer_requests br
  WHERE br.id = p_request_id
  FOR SHARE;

  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_status IS DISTINCT FROM 'COMPLETED'::public.request_status THEN
    RAISE EXCEPTION 'Request must be completed before rating';
  END IF;

  SELECT o.seller_id INTO v_seller
  FROM public.offers o
  WHERE o.request_id = p_request_id
    AND o.status = 'ACCEPTED'::public.offer_status
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'No accepted offer for this request';
  END IF;

  IF NOT (
    (auth.uid() = v_buyer AND p_reviewee_id = v_seller)
    OR (auth.uid() = v_seller AND p_reviewee_id = v_buyer)
  ) THEN
    RAISE EXCEPTION 'You can only rate the other participant';
  END IF;

  INSERT INTO public.ratings (request_id, reviewer_id, reviewee_id, rating, comment)
  VALUES (
    p_request_id,
    auth.uid(),
    p_reviewee_id,
    p_rating,
    NULLIF(trim(p_comment), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rating(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, uuid, integer, text) TO authenticated;
