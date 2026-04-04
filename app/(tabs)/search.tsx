import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  Image,
  RefreshControl,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, FontWeights, BorderRadius, Shadows } from '../../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSellerProfile } from '../../lib/useSellerProfile';
import {
  SellerProfile,
  BuyerRequestData,
  ScoredRequest,
  rankRequests,
  parseRequestToData,
  getDefaultSellerProfile,
  SCORE_WEIGHTS,
} from '../../lib/relevanceScoring';

// ============================================
// TYPES & CONSTANTS
// ============================================

type CategoryFilter = 'all' | 'clothing' | 'cosmetics';
type LocationFilter = 'all' | 'local' | 'country' | 'international';

interface FilterState {
  category: CategoryFilter;
  location: LocationFilter;
  brands: string[];
}

interface RawBuyerRequest {
  id: string;
  created_at: string;
  title: string;
  description: string;
  condition_text: string | null;
  budget_min_eur: number;
  budget_max_eur: number;
  location_text: string;
  location?: unknown;
  status: string;
  profiles: { username: string };
    categories: { name: string };
    photos: { id: string; storage_path: string }[] | null;
}

// Storage keys
const FILTER_STORAGE_KEY = 'seller_discovery_filters';

// ============================================
// REQUEST CARD COMPONENT
// ============================================

interface RequestCardProps {
  scoredRequest: ScoredRequest;
  rawRequest: RawBuyerRequest;
  onPress: () => void;
}

const RequestCard = ({ scoredRequest, rawRequest, onPress }: RequestCardProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { request, score, matchDetails } = scoredRequest;
  const isClothing = request.category === 'clothing';
  
  useEffect(() => {
    const fetchImage = async () => {
      if (rawRequest.photos && rawRequest.photos.length > 0) {
        try {
          const { data } = await supabase.storage
            .from('request_photos')
            .createSignedUrl(rawRequest.photos[0].storage_path, 3600);
          if (data?.signedUrl) setImageUrl(data.signedUrl);
        } catch (error) {
          console.error('Error fetching image:', error);
        }
      }
    };
    fetchImage();
  }, [rawRequest.photos]);

  // Relevance indicator color
  const getRelevanceColor = () => {
    if (score >= 100) return Colors.success;
    if (score >= 70) return Colors.primary;
    if (score >= 50) return Colors.warning;
    return Colors.textMuted;
  };

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.95}>
      {/* Left: Photo */}
      <View style={styles.cardImageContainer}>
          {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons 
              name={isClothing ? "shirt-outline" : "sparkles-outline"} 
              size={32} 
              color={Colors.textMuted} 
            />
          </View>
        )}
        {/* Category Badge */}
        <View style={[styles.categoryBadge, isClothing ? styles.clothingBadge : styles.cosmeticsBadge]}>
          <Text style={styles.categoryBadgeText}>
            {isClothing ? '👕' : '💄'}
          </Text>
        </View>
        {/* Relevance Score Indicator */}
        <View style={[styles.scoreIndicator, { backgroundColor: getRelevanceColor() }]}>
          <Text style={styles.scoreText}>{Math.round(score)}</Text>
        </View>
      </View>

      {/* Right: Details */}
      <View style={styles.cardContent}>
        {/* Brand + Type */}
        <Text style={styles.cardBrand} numberOfLines={1}>
          {request.brand || 'Any Brand'}
        </Text>
        <Text style={styles.cardType} numberOfLines={1}>
          {isClothing ? (request.size ? `Size ${request.size}` : 'Any Size') : (request.shadeVariant || 'Any Shade')}
        </Text>

        {/* Match Indicators */}
        <View style={styles.matchIndicators}>
          {matchDetails.brandMatch && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
              <Text style={styles.matchBadgeText}>Brand</Text>
            </View>
          )}
          {matchDetails.variantMatch && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
              <Text style={styles.matchBadgeText}>{isClothing ? 'Size' : 'Shade'}</Text>
            </View>
          )}
          {matchDetails.conditionMatch && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
              <Text style={styles.matchBadgeText}>Cond.</Text>
            </View>
          )}
        </View>
        
        {/* Condition */}
        <View style={styles.conditionRow}>
          <Ionicons name="shield-checkmark-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.conditionText} numberOfLines={1}>
            {request.condition || 'Any condition'}
          </Text>
          </View>
          
        {/* Location + Delivery */}
        <View style={styles.locationRow}>
          <Ionicons 
            name={matchDetails.locationLevel === 'local' ? 'location' : 'location-outline'} 
            size={12} 
            color={matchDetails.locationLevel === 'local' ? Colors.success : Colors.textMuted} 
          />
          <Text style={[
            styles.locationText,
            matchDetails.locationLevel === 'local' && styles.locationTextHighlight
          ]} numberOfLines={1}>
            {request.city}{request.country ? `, ${request.country}` : ''}
            {matchDetails.locationLevel === 'local' && ' • Local'}
            {matchDetails.locationLevel === 'country' && ' • Same Country'}
          </Text>
        </View>

        {/* Budget */}
        <View style={styles.budgetContainer}>
          <Text style={styles.budgetLabel}>Max Budget</Text>
          <View style={styles.budgetValueContainer}>
            <Text style={[
              styles.budgetValue,
              !matchDetails.budgetCompatible && styles.budgetValueLow
            ]}>
              €{request.maxBudget}
            </Text>
            {!matchDetails.budgetCompatible && (
              <Ionicons name="alert-circle" size={14} color={Colors.warning} style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ============================================
// FILTER CHIP COMPONENT
// ============================================

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  icon?: string;
  count?: number;
}

const FilterChip = ({ label, isActive, onPress, icon, count }: FilterChipProps) => (
  <TouchableOpacity
    style={[styles.filterChip, isActive && styles.filterChipActive]}
    onPress={onPress}
  >
    {icon && (
      <Ionicons 
        name={icon as any} 
        size={14} 
        color={isActive ? Colors.surface : Colors.textSecondary} 
        style={styles.filterChipIcon}
      />
    )}
    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </Text>
  </TouchableOpacity>
);

// ============================================
// MAIN COMPONENT
// ============================================

export default function FindRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { sellerProfile: loadedSellerProfile, isLoading: loadingSellerProfile } = useSellerProfile();
  const baseSellerProfile: SellerProfile =
    loadedSellerProfile ?? getDefaultSellerProfile();
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: 'all',
    location: 'all',
    brands: [],
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load saved filters on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedFilters = await AsyncStorage.getItem(FILTER_STORAGE_KEY);
        if (savedFilters) {
          setFilters(JSON.parse(savedFilters));
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  // Save filters when changed
  const updateFilters = useCallback(async (newFilters: FilterState) => {
    setFilters(newFilters);
    try {
      await AsyncStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(newFilters));
    } catch (error) {
      console.error('Error saving filters:', error);
    }
  }, []);

  // Build seller profile based on filters
  const effectiveSellerProfile = useMemo((): SellerProfile => {
    const profile = { ...baseSellerProfile };
    
    // Apply category filter
    if (filters.category !== 'all') {
      profile.categories = [filters.category];
    }
    
    // Apply brand filters if any
    if (filters.brands.length > 0) {
      profile.brands = filters.brands;
    }
    
    return profile;
  }, [baseSellerProfile, filters]);

  // Fetch buyer requests
  const { data: rawRequests, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['discoveryRequests', user?.id],
    queryFn: async () => {
      // Lazy expiry: Run expiry check before fetching requests
      try {
        // @ts-ignore - Custom function not in generated types
        await supabase.rpc('run_request_expiry');
      } catch (e) {
        console.log('Expiry check skipped:', e);
      }

      // Build query - exclude user's own requests
      let query = supabase
        .from('buyer_requests')
        .select(`
          *,
          profiles:buyer_id(username),
          categories:category_id(name),
          photos:buyer_request_photos(id, storage_path)
        `)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })
        .limit(100);

      // Exclude current user's requests (they appear in My Activity instead)
      if (user?.id) {
        query = query.neq('buyer_id', user.id);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []) as RawBuyerRequest[];
    },
  });

  // Refetch when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Process and rank requests using relevance scoring
  const rankedRequests = useMemo(() => {
    if (!rawRequests || rawRequests.length === 0) return [];
    
    // Parse raw requests to structured data
    const parsedRequests: BuyerRequestData[] = rawRequests.map(req => 
      parseRequestToData(req)
    );
    
    // Rank using the relevance scoring module
    let scored = rankRequests(parsedRequests, effectiveSellerProfile, {
      minThreshold: SCORE_WEIGHTS.MIN_DISPLAY_THRESHOLD,
      maxResults: 50,
      allowFallback: true,
    });
    
    // Apply location filter (post-processing)
    if (filters.location === 'local') {
      scored = scored.filter(sr => sr.matchDetails.locationLevel === 'local');
    } else if (filters.location === 'country') {
      scored = scored.filter(sr => 
        sr.matchDetails.locationLevel === 'local' || 
        sr.matchDetails.locationLevel === 'country'
      );
    } else if (filters.location === 'international') {
      scored = scored.filter(sr => sr.matchDetails.locationLevel === 'international');
    }
    
    return scored;
  }, [rawRequests, effectiveSellerProfile, filters.location]);

  // Create a map for quick lookup of raw request data
  const rawRequestMap = useMemo(() => {
    const map = new Map<string, RawBuyerRequest>();
    rawRequests?.forEach(req => map.set(req.id, req));
    return map;
  }, [rawRequests]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Stats
  const isLoading = loadingRequests || loadingSellerProfile;

  const totalEligible = rawRequests?.length || 0;
  const clothingCount = rankedRequests.filter(r => r.request.category === 'clothing').length;
  const cosmeticsCount = rankedRequests.filter(r => r.request.category === 'cosmetics').length;
  const avgScore = rankedRequests.length > 0 
    ? Math.round(rankedRequests.reduce((sum, r) => sum + r.score, 0) / rankedRequests.length)
    : 0;

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top']}>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Find Requests
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/seller-setup')}
            style={styles.prefsBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Seller preferences"
          >
            <Ionicons name="settings-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerMetricsRow}>
          <Text style={styles.metricsText}>
            <Text style={styles.metricsEm}>{totalEligible}</Text>
            <Text style={styles.metricsDim}> open</Text>
            <Text style={styles.metricsDim}> · </Text>
            <Text style={styles.metricsEm}>{rankedRequests.length}</Text>
            <Text style={styles.metricsDim}> shown</Text>
          </Text>
          {avgScore > 0 && (
            <View style={styles.avgScoreBadge}>
              <Text style={styles.avgScoreText}>Avg {avgScore}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          Ranked by relevance · Score ≥{SCORE_WEIGHTS.MIN_DISPLAY_THRESHOLD} shown
        </Text>
        </View>

      {/* Quick Category Filters */}
      <View style={styles.quickFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          <FilterChip
            label="All"
            count={totalEligible}
            isActive={filters.category === 'all'}
            onPress={() => updateFilters({ ...filters, category: 'all' })}
            icon="grid-outline"
          />
          <FilterChip
            label="Clothing"
            count={clothingCount}
            isActive={filters.category === 'clothing'}
            onPress={() => updateFilters({ ...filters, category: 'clothing' })}
            icon="shirt-outline"
          />
          <FilterChip
            label="Cosmetics"
            count={cosmeticsCount}
            isActive={filters.category === 'cosmetics'}
            onPress={() => updateFilters({ ...filters, category: 'cosmetics' })}
            icon="sparkles-outline"
          />
          
          <View style={styles.filterDivider} />
          
          <FilterChip
            label="Local"
            isActive={filters.location === 'local'}
            onPress={() => updateFilters({ ...filters, location: filters.location === 'local' ? 'all' : 'local' })}
            icon="location"
          />
          <FilterChip
            label="Country"
            isActive={filters.location === 'country'}
            onPress={() => updateFilters({ ...filters, location: filters.location === 'country' ? 'all' : 'country' })}
            icon="flag-outline"
          />
          <FilterChip
            label="International"
            isActive={filters.location === 'international'}
            onPress={() => updateFilters({ ...filters, location: filters.location === 'international' ? 'all' : 'international' })}
            icon="globe-outline"
          />
        </ScrollView>
        </View>

      {/* Score Legend */}
      <View style={styles.scoreLegendWrap}>
        <Text style={styles.scoreLegendHeading}>Match strength</Text>
        <View style={styles.scoreLegend}>
          <View style={styles.scoreLegendItem}>
            <View style={[styles.scoreDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.scoreLegendText}>100+ High</Text>
          </View>
          <View style={styles.scoreLegendItem}>
            <View style={[styles.scoreDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.scoreLegendText}>70+ Good</Text>
          </View>
          <View style={styles.scoreLegendItem}>
            <View style={[styles.scoreDot, { backgroundColor: Colors.warning }]} />
            <Text style={styles.scoreLegendText}>50+ Fair</Text>
          </View>
        </View>
      </View>

        {/* Results */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Calculating relevance...</Text>
          </View>
      ) : rankedRequests.length > 0 ? (
          <FlatList
          data={rankedRequests}
          renderItem={({ item }) => {
            const rawRequest = rawRequestMap.get(item.request.id);
            if (!rawRequest) return null;
            return (
              <RequestCard 
                scoredRequest={item}
                rawRequest={rawRequest}
                onPress={() => router.push(`/requests/${item.request.id}`)}
              />
            );
          }}
          keyExtractor={item => item.request.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          />
        ) : (
          <View style={styles.emptyState}>
          <Ionicons name="funnel-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No matching requests</Text>
            <Text style={styles.emptySubtitle}>
            Requests below score {SCORE_WEIGHTS.MIN_DISPLAY_THRESHOLD} are hidden.{'\n'}
            Try adjusting filters or check back later.
            </Text>
              <TouchableOpacity 
            style={styles.resetButton}
            onPress={() => updateFilters({
              category: 'all',
              location: 'all',
              brands: [],
            })}
          >
            <Text style={styles.resetButtonText}>Reset Filters</Text>
                </TouchableOpacity>
        </View>
      )}
    </View>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  prefsBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  headerMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  metricsText: {
    flexShrink: 1,
    fontSize: FontSizes.sm,
    lineHeight: FontSizes.sm * 1.35,
  },
  metricsEm: {
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  metricsDim: {
    fontWeight: FontWeights.regular,
    color: Colors.textSecondary,
  },
  avgScoreBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  avgScoreText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primaryDark,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    lineHeight: FontSizes.xs * 1.45,
  },
  // Quick Filters
  quickFilters: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filtersScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipIcon: {
    marginRight: Spacing.xs,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.surface,
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  // Score Legend
  scoreLegendWrap: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scoreLegendHeading: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    letterSpacing: 0.2,
  },
  scoreLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scoreLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scoreLegendText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  // List
  listContent: {
    padding: Spacing.lg,
  },
  itemSeparator: {
    height: Spacing.md,
  },
  // Request Card
  requestCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  cardImageContainer: {
    width: 110,
    height: 150,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clothingBadge: {
    backgroundColor: '#E3F2FD',
  },
  cosmeticsBadge: {
    backgroundColor: '#FCE4EC',
  },
  categoryBadgeText: {
    fontSize: 12,
  },
  scoreIndicator: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  scoreText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.surface,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  cardBrand: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  cardType: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  matchIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.success}15`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 2,
  },
  matchBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  conditionText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  locationText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    flex: 1,
  },
  locationTextHighlight: {
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  budgetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  budgetLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  budgetValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  budgetValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  budgetValueLow: {
    color: Colors.warning,
  },
  // Loading & Empty States
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: FontSizes.md * 1.5,
  },
  resetButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  resetButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.surface,
  },
});
