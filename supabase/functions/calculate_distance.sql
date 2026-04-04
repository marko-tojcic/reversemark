-- Function to calculate distance between user and request
CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, request_id uuid)
RETURNS double precision AS $$
DECLARE
    distance_meters double precision;
    distance_km double precision;
BEGIN
    -- Get the distance in meters between the user location and the request location
    SELECT ST_Distance(
        ST_SetSRID(ST_Point(lon1, lat1), 4326)::geography,
        location::geography
    )
    INTO distance_meters
    FROM buyer_requests
    WHERE id = request_id;
    
    -- Convert to kilometers
    distance_km := distance_meters / 1000.0;
    
    RETURN distance_km;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow public access to this function
GRANT EXECUTE ON FUNCTION public.calculate_distance TO PUBLIC;
