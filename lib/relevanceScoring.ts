/**
 * Relevance Scoring System for Buyer Request Discovery
 * 
 * This module computes relevance scores to rank buyer requests for sellers.
 * It determines which requests are shown and in what order.
 * 
 * Usage:
 *   import { calculateRelevanceScore, rankRequests, SCORE_WEIGHTS } from './relevanceScoring';
 */

// ============================================
// TYPES
// ============================================

export interface SellerProfile {
  // Categories the seller can fulfill
  categories: ('clothing' | 'cosmetics')[];
  
  // Brands the seller has
  brands: string[];
  
  // Sizes available (for clothing)
  sizes: string[];
  
  // Shades/variants available (for cosmetics)
  shades: string[];
  
  // Conditions the seller can offer
  conditions: string[];
  
  // Seller's location
  city: string;
  country: string;
  
  // Countries seller can ship to ('*' for international)
  shipsTo: string[];
  
  // Seller's minimum acceptable price
  minPrice: number;

  /** WGS84 — when set with `searchRadiusKm`, distance-based ranking is used with buyer coords */
  latitude?: number;
  longitude?: number;
  searchRadiusKm?: number;
}

export interface BuyerRequestData {
  id: string;
  category: 'clothing' | 'cosmetics';
  brand?: string;
  size?: string;           // Clothing
  shadeVariant?: string;   // Cosmetics
  condition?: string;
  city?: string;
  country?: string;
  deliveryMethod?: string; // 'Shipping' | 'Local pickup' | 'Both'
  maxBudget: number;
  /** From `buyer_requests.location` (PostGIS / GeoJSON) when available */
  latitude?: number;
  longitude?: number;
}

export interface ScoredRequest {
  request: BuyerRequestData;
  score: number;
  matchDetails: MatchDetails;
}

export interface MatchDetails {
  categoryMatch: boolean;
  brandMatch: boolean;
  variantMatch: boolean;  // size or shade
  conditionMatch: boolean;
  locationLevel: 'local' | 'country' | 'international';
  budgetCompatible: boolean;
  excluded: boolean;
  exclusionReason?: string;
  /** Haversine distance in km when both seller and buyer coordinates exist */
  distanceKm?: number;
}

// ============================================
// SCORING WEIGHTS (easily tunable)
// ============================================

export const SCORE_WEIGHTS = {
  // Positive weights
  CATEGORY_MATCH: 50,
  BRAND_MATCH_EXACT: 30,
  VARIANT_MATCH: 25,       // Size (clothing) or Shade (cosmetics)
  CONDITION_MATCH: 15,
  LOCATION_SAME_CITY: 20,
  LOCATION_SAME_COUNTRY: 10,
  BUDGET_COMPATIBLE: 10,
  
  // Negative weights
  BUDGET_INCOMPATIBLE: -30,
  
  // Thresholds
  MIN_DISPLAY_THRESHOLD: 40,
  FALLBACK_THRESHOLD: 20,  // Used when no results above MIN_DISPLAY_THRESHOLD
  
  // Budget tolerance (how far below minPrice is acceptable)
  BUDGET_TOLERANCE_PERCENT: 0.2,  // 20% below is tolerable
  BUDGET_FAR_BELOW_PERCENT: 0.5,  // 50% below = excluded
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize string for comparison (lowercase, trim)
 */
const normalize = (str?: string): string => {
  return (str || '').toLowerCase().trim();
};

/**
 * Check if two strings match (case-insensitive, partial match allowed)
 */
const stringsMatch = (a?: string, b?: string): boolean => {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
};

/**
 * Check if seller can ship to buyer's country
 */
const canShipTo = (sellerShipsTo: string[], buyerCountry?: string): boolean => {
  if (!buyerCountry) return true; // Unknown location, assume OK
  if (sellerShipsTo.includes('*')) return true; // Ships internationally
  return sellerShipsTo.some(country => stringsMatch(country, buyerCountry));
};

/**
 * Check if budget is far below seller's minimum (exclusion criteria)
 */
const isBudgetFarBelow = (buyerMax: number, sellerMin: number): boolean => {
  if (sellerMin === 0) return false;
  return buyerMax < sellerMin * (1 - SCORE_WEIGHTS.BUDGET_FAR_BELOW_PERCENT);
};

/**
 * Check if budget is compatible (buyer can afford)
 */
const isBudgetCompatible = (buyerMax: number, sellerMin: number): boolean => {
  if (sellerMin === 0) return true;
  return buyerMax >= sellerMin * (1 - SCORE_WEIGHTS.BUDGET_TOLERANCE_PERCENT);
};

/** Great-circle distance in km (WGS84) */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Parse PostGIS / GeoJSON geography from Supabase into lat/lng */
export function parseGeoPoint(location: unknown): { lat: number; lng: number } | null {
  if (location == null) return null;
  if (typeof location === 'object' && location !== null && 'type' in location) {
    const g = location as { type?: string; coordinates?: number[] };
    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const [lng, lat] = g.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
    }
  }
  if (typeof location === 'string') {
    const m = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (m) {
      return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
    }
  }
  return null;
}

// ============================================
// MAIN SCORING FUNCTION
// ============================================

/**
 * Calculate relevance score for a single buyer request
 * 
 * @param request - The buyer request to score
 * @param seller - The seller's profile/preferences
 * @returns ScoredRequest with score and match details
 */
export function calculateRelevanceScore(
  request: BuyerRequestData,
  seller: SellerProfile
): ScoredRequest {
  let score = 0;
  const matchDetails: MatchDetails = {
    categoryMatch: false,
    brandMatch: false,
    variantMatch: false,
    conditionMatch: false,
    locationLevel: 'international',
    budgetCompatible: false,
    excluded: false,
  };

  // ========================================
  // HARD FILTERS (exclusion criteria)
  // ========================================

  // 1. Category mismatch → exclude
  const categoryMatches = seller.categories.includes(request.category);
  if (!categoryMatches) {
    return {
      request,
      score: -Infinity,
      matchDetails: {
        ...matchDetails,
        excluded: true,
        exclusionReason: 'Category mismatch',
      },
    };
  }

  // 2. Cannot ship to buyer's country → exclude
  if (!canShipTo(seller.shipsTo, request.country)) {
    return {
      request,
      score: -Infinity,
      matchDetails: {
        ...matchDetails,
        excluded: true,
        exclusionReason: 'Cannot ship to buyer location',
      },
    };
  }

  // 3. Budget far below seller's minimum → exclude
  if (isBudgetFarBelow(request.maxBudget, seller.minPrice)) {
    return {
      request,
      score: -Infinity,
      matchDetails: {
        ...matchDetails,
        excluded: true,
        exclusionReason: 'Budget too low',
      },
    };
  }

  // ========================================
  // SCORING FACTORS
  // ========================================

  // Category match: +50
  matchDetails.categoryMatch = true;
  score += SCORE_WEIGHTS.CATEGORY_MATCH;

  // Brand match: +30 (if exact match)
  if (request.brand && seller.brands.length > 0) {
    const brandMatches = seller.brands.some(b => stringsMatch(b, request.brand));
    if (brandMatches) {
      matchDetails.brandMatch = true;
      score += SCORE_WEIGHTS.BRAND_MATCH_EXACT;
    }
  }

  // Variant match: +25
  if (request.category === 'clothing' && request.size) {
    // Clothing: check size match
    const sizeMatches = seller.sizes.some(s => stringsMatch(s, request.size));
    if (sizeMatches) {
      matchDetails.variantMatch = true;
      score += SCORE_WEIGHTS.VARIANT_MATCH;
    }
  } else if (request.category === 'cosmetics' && request.shadeVariant) {
    // Cosmetics: check shade/variant match
    const shadeMatches = seller.shades.some(s => stringsMatch(s, request.shadeVariant));
    if (shadeMatches) {
      matchDetails.variantMatch = true;
      score += SCORE_WEIGHTS.VARIANT_MATCH;
    }
  }

  // Condition match: +15
  if (request.condition && seller.conditions.length > 0) {
    const conditionMatches = seller.conditions.some(c => stringsMatch(c, request.condition));
    if (conditionMatches) {
      matchDetails.conditionMatch = true;
      score += SCORE_WEIGHTS.CONDITION_MATCH;
    }
  }

  // Location relevance: distance when coords exist; else city / country strings
  const radiusKm = seller.searchRadiusKm ?? 50;
  const sellerLat = seller.latitude;
  const sellerLng = seller.longitude;
  const buyerLat = request.latitude;
  const buyerLng = request.longitude;

  if (
    sellerLat != null &&
    sellerLng != null &&
    buyerLat != null &&
    buyerLng != null
  ) {
    const d = haversineKm(sellerLat, sellerLng, buyerLat, buyerLng);
    matchDetails.distanceKm = d;
    if (d <= radiusKm) {
      matchDetails.locationLevel = 'local';
      const t = 1 - d / Math.max(radiusKm, 0.001);
      score += SCORE_WEIGHTS.LOCATION_SAME_CITY * Math.max(0, Math.min(1, t));
    } else if (request.country && seller.country && stringsMatch(request.country, seller.country)) {
      matchDetails.locationLevel = 'country';
      score += SCORE_WEIGHTS.LOCATION_SAME_COUNTRY;
    } else {
      matchDetails.locationLevel = 'international';
    }
  } else if (request.city && stringsMatch(request.city, seller.city)) {
    matchDetails.locationLevel = 'local';
    score += SCORE_WEIGHTS.LOCATION_SAME_CITY;
  } else if (request.country && stringsMatch(request.country, seller.country)) {
    matchDetails.locationLevel = 'country';
    score += SCORE_WEIGHTS.LOCATION_SAME_COUNTRY;
  } else {
    matchDetails.locationLevel = 'international';
  }

  // Budget compatibility: +10 if compatible, -30 if incompatible
  if (isBudgetCompatible(request.maxBudget, seller.minPrice)) {
    matchDetails.budgetCompatible = true;
    score += SCORE_WEIGHTS.BUDGET_COMPATIBLE;
  } else {
    matchDetails.budgetCompatible = false;
    score += SCORE_WEIGHTS.BUDGET_INCOMPATIBLE;
  }

  return {
    request,
    score,
    matchDetails,
  };
}

// ============================================
// RANKING FUNCTION
// ============================================

/**
 * Rank a list of buyer requests by relevance score
 * 
 * @param requests - Array of buyer requests
 * @param seller - The seller's profile/preferences
 * @param options - Ranking options
 * @returns Sorted array of scored requests (highest score first)
 */
export function rankRequests(
  requests: BuyerRequestData[],
  seller: SellerProfile,
  options: {
    minThreshold?: number;
    maxResults?: number;
    allowFallback?: boolean;
  } = {}
): ScoredRequest[] {
  const {
    minThreshold = SCORE_WEIGHTS.MIN_DISPLAY_THRESHOLD,
    maxResults = 50,
    allowFallback = true,
  } = options;

  // Score all requests
  const scoredRequests = requests.map(request => 
    calculateRelevanceScore(request, seller)
  );

  // Filter out excluded requests (score = -Infinity)
  let eligibleRequests = scoredRequests.filter(sr => !sr.matchDetails.excluded);

  // Filter by minimum threshold
  let filteredRequests = eligibleRequests.filter(sr => sr.score >= minThreshold);

  // Fallback: if no results, lower threshold to avoid empty state
  if (filteredRequests.length === 0 && allowFallback) {
    filteredRequests = eligibleRequests.filter(
      sr => sr.score >= SCORE_WEIGHTS.FALLBACK_THRESHOLD
    );
  }

  // Sort by score descending
  filteredRequests.sort((a, b) => b.score - a.score);

  // Limit results
  return filteredRequests.slice(0, maxResults);
}

// ============================================
// UTILITY: Parse request description to BuyerRequestData
// ============================================

/**
 * Parse a buyer request's description into structured data
 */
export function parseRequestToData(
  request: {
    id: string;
    description: string;
    budget_max_eur: number;
    location_text?: string | null;
    condition_text?: string | null;
    categories?: { name: string } | null;
    location?: unknown;
  }
): BuyerRequestData {
  const description = request.description || '';
  const categoryName = (request.categories?.name || '').toLowerCase();
  const category: 'clothing' | 'cosmetics' = 
    categoryName.includes('cosmetics') ? 'cosmetics' : 'clothing';

  // Parse description for metadata
  const lines = description.split('\n');
  const metadata: Record<string, string> = {};
  
  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).toLowerCase().trim();
      const value = line.substring(colonIndex + 1).trim();
      if (value) {
        if (key.includes('brand')) metadata.brand = value;
        if (key.includes('item type') || key.includes('looking for')) metadata.itemType = value;
        if (key.includes('product type')) metadata.productType = value;
        if (key.includes('size')) metadata.size = value;
        if (key.includes('shade') || key.includes('variant')) metadata.shadeVariant = value;
        if (key.includes('condition')) metadata.condition = value;
        if (key.includes('delivery')) metadata.deliveryMethod = value;
      }
    }
  });

  // Parse location
  const locationParts = (request.location_text || '').split(',').map(s => s.trim());
  const city = locationParts[0] || undefined;
  const country = locationParts[1] || undefined;

  const geo = parseGeoPoint(request.location);

  return {
    id: request.id,
    category,
    brand: metadata.brand,
    size: metadata.size,
    shadeVariant: metadata.shadeVariant,
    condition: metadata.condition || request.condition_text || undefined,
    city,
    country,
    deliveryMethod: metadata.deliveryMethod,
    maxBudget: request.budget_max_eur || 0,
    latitude: geo?.lat,
    longitude: geo?.lng,
  };
}

// ============================================
// DEFAULT SELLER PROFILE (for users without preferences set)
// ============================================

export function getDefaultSellerProfile(): SellerProfile {
  return {
    categories: ['clothing', 'cosmetics'], // Can sell both
    brands: [],                             // No brand preference
    sizes: [],                              // No size preference
    shades: [],                             // No shade preference
    conditions: [                           // Can offer any condition
      'New with tags',
      'New without tags', 
      'Used – like new',
      'Used – good',
      'Brand new, sealed',
    ],
    city: '',
    country: '',
    shipsTo: ['*'],                         // Ships internationally
    minPrice: 0,                            // No minimum price
    searchRadiusKm: 50,
  };
}

// ============================================
// SCORE EXPLANATION (for debugging/transparency)
// ============================================

export function explainScore(scoredRequest: ScoredRequest): string {
  const { score, matchDetails } = scoredRequest;
  
  if (matchDetails.excluded) {
    return `Excluded: ${matchDetails.exclusionReason}`;
  }

  const parts: string[] = [];
  
  if (matchDetails.categoryMatch) parts.push(`Category: +${SCORE_WEIGHTS.CATEGORY_MATCH}`);
  if (matchDetails.brandMatch) parts.push(`Brand: +${SCORE_WEIGHTS.BRAND_MATCH_EXACT}`);
  if (matchDetails.variantMatch) parts.push(`Size/Shade: +${SCORE_WEIGHTS.VARIANT_MATCH}`);
  if (matchDetails.conditionMatch) parts.push(`Condition: +${SCORE_WEIGHTS.CONDITION_MATCH}`);
  
  if (matchDetails.locationLevel === 'local') {
    parts.push(`Local: +${SCORE_WEIGHTS.LOCATION_SAME_CITY}`);
  } else if (matchDetails.locationLevel === 'country') {
    parts.push(`Same Country: +${SCORE_WEIGHTS.LOCATION_SAME_COUNTRY}`);
  }
  
  if (matchDetails.budgetCompatible) {
    parts.push(`Budget OK: +${SCORE_WEIGHTS.BUDGET_COMPATIBLE}`);
  } else {
    parts.push(`Budget Low: ${SCORE_WEIGHTS.BUDGET_INCOMPATIBLE}`);
  }

  return `Score: ${score} (${parts.join(', ')})`;
}
