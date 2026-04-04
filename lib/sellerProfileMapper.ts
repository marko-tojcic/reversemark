import type { SellerProfile } from './relevanceScoring';

/** JSON returned by `get_my_seller_profile` RPC */
export type SellerProfileJson = {
  user_id: string;
  preferred_categories: string[];
  preferred_brands: string[];
  clothing_sizes: string[];
  cosmetic_types: string[];
  search_radius_km: number;
  updated_at: string;
  lat?: number | null;
  lng?: number | null;
};

function normalizeCategoryToken(raw: string): ('clothing' | 'cosmetics') | null {
  const t = raw.toLowerCase().trim();
  if (!t) return null;
  if (t.includes('cosmetic')) return 'cosmetics';
  if (t.includes('cloth')) return 'clothing';
  if (t === 'clothing') return 'clothing';
  if (t === 'cosmetics') return 'cosmetics';
  return null;
}

/**
 * Maps DB seller profile JSON to the scoring `SellerProfile` shape.
 */
export function sellerProfileJsonToScoring(row: SellerProfileJson): SellerProfile {
  const cats = new Set<'clothing' | 'cosmetics'>();
  for (const c of row.preferred_categories || []) {
    const n = normalizeCategoryToken(c);
    if (n) cats.add(n);
  }
  const categories: ('clothing' | 'cosmetics')[] =
    cats.size > 0 ? Array.from(cats) : ['clothing', 'cosmetics'];

  const lat = row.lat != null && Number.isFinite(row.lat) ? row.lat : undefined;
  const lng = row.lng != null && Number.isFinite(row.lng) ? row.lng : undefined;

  return {
    categories,
    brands: (row.preferred_brands || []).map((b) => b.trim()).filter(Boolean),
    sizes: (row.clothing_sizes || []).map((s) => s.trim()).filter(Boolean),
    shades: (row.cosmetic_types || []).map((s) => s.trim()).filter(Boolean),
    conditions: [
      'New with tags',
      'New without tags',
      'Used – like new',
      'Used – good',
      'Brand new, sealed',
    ],
    city: '',
    country: '',
    shipsTo: ['*'],
    minPrice: 0,
    latitude: lat,
    longitude: lng,
    searchRadiusKm: Math.max(1, row.search_radius_km ?? 50),
  };
}
