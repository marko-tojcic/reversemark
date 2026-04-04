-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create enum types
CREATE TYPE public.request_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'FULFILLED',
  'CLOSED',
  'EXPIRED',
  'COMPLETED',  -- Legacy, kept for backward compatibility
  'CANCELED'
);

CREATE TYPE public.offer_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN'
);

-- Create tables
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  username TEXT UNIQUE NOT NULL,
  avatar_path TEXT
);

-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  name TEXT UNIQUE NOT NULL
);

-- Buyer requests table
CREATE TABLE public.buyer_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  condition_text TEXT,
  budget_min_eur NUMERIC NOT NULL,
  budget_max_eur NUMERIC NOT NULL,
  location_text TEXT NOT NULL,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  status public.request_status NOT NULL DEFAULT 'OPEN'::public.request_status,
  accepted_offer_id UUID,

  CONSTRAINT buyer_requests_budget_check 
    CHECK (budget_min_eur <= budget_max_eur AND budget_min_eur >= 0 AND budget_max_eur >= 0)
);

-- Buyer request photos table
CREATE TABLE public.buyer_request_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  request_id UUID NOT NULL REFERENCES public.buyer_requests(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  
  CONSTRAINT buyer_request_photos_sort_order_check CHECK (sort_order >= 0)
);

-- Offers table
-- Simplified for "I HAVE THIS" intent signaling (v1)
-- price_eur and message are optional - the core action is just claiming intent
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  request_id UUID NOT NULL REFERENCES public.buyer_requests(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_eur NUMERIC, -- Optional in v1
  message TEXT, -- Optional in v1
  status public.offer_status NOT NULL DEFAULT 'PENDING'::public.offer_status,
  
  -- Prevent duplicate offers from same seller
  CONSTRAINT offers_request_seller_unique UNIQUE (request_id, seller_id),
  CONSTRAINT offers_price_check CHECK (price_eur IS NULL OR price_eur >= 0)
);

-- Update buyer_requests to reference accepted_offer_id with FK
ALTER TABLE public.buyer_requests 
  ADD CONSTRAINT buyer_requests_accepted_offer_id_fkey 
  FOREIGN KEY (accepted_offer_id) REFERENCES public.offers(id) ON DELETE RESTRICT;

-- Conversations table
-- Chat unlocks ONLY after buyer accepts an offer
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.buyer_requests(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  CONSTRAINT conversations_buyer_seller_different CHECK (buyer_id <> seller_id),
  CONSTRAINT conversations_offer_unique UNIQUE (offer_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX buyer_requests_created_at_idx ON public.buyer_requests(created_at DESC);
CREATE INDEX buyer_requests_status_idx ON public.buyer_requests(status);
CREATE INDEX buyer_requests_category_id_idx ON public.buyer_requests(category_id);
CREATE INDEX buyer_requests_location_idx ON public.buyer_requests USING GIST(location);
CREATE INDEX buyer_requests_buyer_id_idx ON public.buyer_requests(buyer_id);

CREATE INDEX offers_request_id_idx ON public.offers(request_id);
CREATE INDEX offers_seller_id_idx ON public.offers(seller_id);

CREATE INDEX conversations_request_id_idx ON public.conversations(request_id);
CREATE INDEX conversations_buyer_id_idx ON public.conversations(buyer_id);
CREATE INDEX conversations_seller_id_idx ON public.conversations(seller_id);
CREATE INDEX conversations_last_message_at_idx ON public.conversations(last_message_at DESC);

CREATE INDEX messages_conversation_id_created_at_idx ON public.messages(conversation_id, created_at);
CREATE INDEX messages_sender_id_idx ON public.messages(sender_id);

-- Set up Storage buckets
-- This part needs to be performed in the Supabase dashboard 
-- or via the Supabase API, but here's the SQL that would be equivalent

-- Create request_photos bucket (set this up in the Supabase dashboard)
-- CREATE BUCKET IF NOT EXISTS request_photos;

-- Create avatars bucket (we'll need to set this up in the Supabase dashboard)
-- CREATE BUCKET IF NOT EXISTS avatars;

-- Set up Row Level Security (RLS)
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_request_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Profiles: public read; update only own row; insert only own id
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT USING (true);

-- Allow authenticated users to insert their own profile
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create a trigger to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', new.email)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categories: public read; no client-side writes
CREATE POLICY categories_select_policy ON public.categories
  FOR SELECT USING (true);

-- Buyer requests: 
-- 1. Anyone can read OPEN requests
-- 2. Buyer can always read their own requests (any status)
-- 3. Sellers who made offers can read the request (to see status updates)
-- 4. Authenticated users can insert their own requests
-- 5. Buyer can update own requests
CREATE POLICY buyer_requests_select_policy ON public.buyer_requests
  FOR SELECT USING (
    status = 'OPEN'::public.request_status
    OR buyer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.offers o 
      WHERE o.request_id = buyer_requests.id 
      AND o.seller_id = auth.uid()
    )
  );

CREATE POLICY buyer_requests_insert_policy ON public.buyer_requests
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND buyer_id = auth.uid()
  );

CREATE POLICY buyer_requests_update_policy ON public.buyer_requests
  FOR UPDATE 
  TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

-- Buyer request photos: read based on request visibility; write only by request owner
CREATE POLICY buyer_request_photos_select_policy ON public.buyer_request_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = buyer_request_photos.request_id 
      AND (br.status = 'OPEN'::public.request_status OR br.buyer_id = auth.uid())
    )
  );

CREATE POLICY buyer_request_photos_insert_policy ON public.buyer_request_photos
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = buyer_request_photos.request_id 
      AND br.buyer_id = auth.uid()
    )
  );

CREATE POLICY buyer_request_photos_update_policy ON public.buyer_request_photos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = buyer_request_photos.request_id 
      AND br.buyer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = buyer_request_photos.request_id 
      AND br.buyer_id = auth.uid()
    )
  );

CREATE POLICY buyer_request_photos_delete_policy ON public.buyer_request_photos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = buyer_request_photos.request_id 
      AND br.buyer_id = auth.uid()
    )
  );

-- Offers: only buyer of request and the seller can read;
-- seller can create/withdraw; buyer can accept/reject
CREATE POLICY offers_select_policy ON public.offers
  FOR SELECT USING (
    seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = offers.request_id 
      AND br.buyer_id = auth.uid()
    )
  );

CREATE POLICY offers_insert_policy ON public.offers
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = offers.request_id 
      AND br.status = 'OPEN'::public.request_status
    )
  );

CREATE POLICY offers_update_policy ON public.offers
  FOR UPDATE USING (
    seller_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = offers.request_id 
      AND br.buyer_id = auth.uid()
    )
  )
  WITH CHECK (
    seller_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.buyer_requests br
      WHERE br.id = offers.request_id 
      AND br.buyer_id = auth.uid()
    )
  );

-- Conversations: only buyer/seller can access; requires accepted offer
CREATE POLICY conversations_select_policy ON public.conversations
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY conversations_insert_policy ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (buyer_id, seller_id)
    AND EXISTS (
      SELECT 1 FROM public.offers o 
      WHERE o.id = offer_id AND o.status = 'ACCEPTED'
    )
  );

CREATE POLICY conversations_update_policy ON public.conversations
  FOR UPDATE USING (buyer_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Messages: only conversation participants can read/write
CREATE POLICY messages_select_policy ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id 
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

CREATE POLICY messages_insert_policy ON public.messages
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id 
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

CREATE POLICY messages_update_policy ON public.messages
  FOR UPDATE USING (
    -- Only allow recipient to update read_at
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id 
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
      AND messages.sender_id <> auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id 
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
      AND messages.sender_id <> auth.uid()
    )
  );

-- Create a function to check seller is not the buyer
CREATE OR REPLACE FUNCTION check_seller_not_buyer()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.buyer_requests 
    WHERE id = NEW.request_id AND buyer_id = NEW.seller_id
  ) THEN
    RAISE EXCEPTION 'Seller cannot be the same as buyer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER ensure_seller_not_buyer
BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION check_seller_not_buyer();

-- ============================================
-- AUTO-EXPIRY FUNCTION FOR STALE REQUESTS
-- ============================================
-- Function to auto-expire OPEN requests older than 14 days
CREATE OR REPLACE FUNCTION public.expire_stale_requests()
RETURNS void AS $$
BEGIN
  UPDATE public.buyer_requests
  SET status = 'EXPIRED'::public.request_status
  WHERE status = 'OPEN'::public.request_status
    AND created_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function that can be called from RPC to run expiry and return count
CREATE OR REPLACE FUNCTION public.run_request_expiry()
RETURNS integer AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.buyer_requests
    SET status = 'EXPIRED'::public.request_status
    WHERE status = 'OPEN'::public.request_status
      AND created_at < NOW() - INTERVAL '14 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOTIFICATIONS SYSTEM
-- ============================================

-- Notification type enum
CREATE TYPE public.notification_type AS ENUM (
  'NEW_REQUEST_MATCH',   -- Seller: new request they can fulfill
  'NEW_OFFER_RECEIVED',  -- Buyer: someone made an offer
  'REQUEST_EXPIRING'     -- Buyer: request expires in 3 days
);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_id UUID, -- request_id or offer_id depending on type
  read BOOLEAN DEFAULT FALSE NOT NULL,
  action_url TEXT -- optional deep link
);

-- Indexes for notifications
CREATE INDEX notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX notifications_user_id_read_idx ON public.notifications(user_id, read);
CREATE INDEX notifications_created_at_idx ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Notifications RLS: users can only see their own notifications
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow system to insert notifications (via security definer functions)
CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- NOTIFICATION TRIGGER FUNCTIONS
-- ============================================

-- Function to notify buyer when an offer is received
CREATE OR REPLACE FUNCTION public.notify_on_new_offer()
RETURNS TRIGGER AS $$
DECLARE
  request_title TEXT;
  buyer_id UUID;
BEGIN
  -- Get request details
  SELECT br.title, br.buyer_id INTO request_title, buyer_id
  FROM public.buyer_requests br
  WHERE br.id = NEW.request_id;

  -- Create notification for buyer
  INSERT INTO public.notifications (user_id, type, title, body, reference_id, action_url)
  VALUES (
    buyer_id,
    'NEW_OFFER_RECEIVED'::public.notification_type,
    'Good news! Someone can fulfill your request',
    'Open to respond: ' || request_title,
    NEW.request_id,
    '/requests/' || NEW.request_id::text
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new offers
CREATE TRIGGER on_new_offer_notify
AFTER INSERT ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_offer();

-- Function to extend a request by 7 days (resets created_at to simulate extension)
CREATE OR REPLACE FUNCTION public.extend_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  request_owner UUID;
BEGIN
  -- Check ownership
  SELECT buyer_id INTO request_owner
  FROM public.buyer_requests
  WHERE id = request_id AND status = 'OPEN'::public.request_status;

  IF request_owner IS NULL OR request_owner <> auth.uid() THEN
    RETURN FALSE;
  END IF;

  -- Extend by updating created_at to now (gives another 14 days)
  UPDATE public.buyer_requests
  SET created_at = NOW()
  WHERE id = request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for expiring requests and notify (run via cron or RPC)
CREATE OR REPLACE FUNCTION public.notify_expiring_requests()
RETURNS INTEGER AS $$
DECLARE
  notified_count INTEGER := 0;
  request_record RECORD;
BEGIN
  -- Find OPEN requests expiring in ~3 days (created 11 days ago)
  FOR request_record IN
    SELECT id, buyer_id, title
    FROM public.buyer_requests
    WHERE status = 'OPEN'::public.request_status
      AND created_at < NOW() - INTERVAL '11 days'
      AND created_at >= NOW() - INTERVAL '12 days'
      -- Prevent duplicate notifications
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.reference_id = buyer_requests.id
          AND n.type = 'REQUEST_EXPIRING'::public.notification_type
          AND n.created_at > NOW() - INTERVAL '7 days'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, reference_id, action_url)
    VALUES (
      request_record.buyer_id,
      'REQUEST_EXPIRING'::public.notification_type,
      'Your request expires in 3 days',
      'Still looking? ' || request_record.title,
      request_record.id,
      '/requests/' || request_record.id::text
    );
    notified_count := notified_count + 1;
  END LOOP;

  RETURN notified_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert categories (only Clothing and Cosmetics supported)
INSERT INTO public.categories (name) VALUES
  ('Clothing'),
  ('Cosmetics');
