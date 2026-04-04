import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  Platform,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useSellerProfile } from '../../lib/useSellerProfile';
import { isToday, parseISO, formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
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
// DESIGN TOKENS
// ============================================
const T = {
  colors: {
    bg: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#717171',
    textMuted: '#9CA3AF',
    accent: '#007AFF',
    border: '#E8E8E8',
    badge: '#FF5A5F',
    success: '#10B981',
    warning: '#F59E0B',
    fulfilled: '#2563EB',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  radius: {
    sm: 8,
    md: 12,
  },
  font: {
    xs: 11,
    sm: 12,
    md: 14,
    lg: 15,
    title: 18,
  },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 10;
const HORIZONTAL_PADDING = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

// ============================================
// TYPES
// ============================================
type TabType = 'feed' | 'activity';

interface RawBuyerRequest {
  id: string;
  title: string;
  description: string;
  category_id: string;
  buyer_id: string;
  budget_min_eur: number;
  budget_max_eur: number;
  location_text: string;
  location?: unknown;
  status: string;
  created_at: string;
  expires_at?: string;
  condition_text: string | null;
    profiles: { username: string };
    categories: { name: string };
    photos: { id: string; storage_path: string }[] | null;
}

interface SectionData {
  type: 'section';
  title: string;
}

interface RequestData {
  type: 'request';
  request: ScoredRequest;
  rawRequest: RawBuyerRequest;
  isHighMatch: boolean;
}

type ListItem = SectionData | RequestData[];

// ============================================
// STATUS BADGE HELPER
// ============================================
const getStatusStyle = (status: string) => {
  switch (status) {
    case 'OPEN': return { bg: '#ECFDF5', text: T.colors.success, label: 'Open' };
    case 'IN_PROGRESS': return { bg: '#FEF3C7', text: T.colors.warning, label: 'In Progress' };
    case 'FULFILLED': return { bg: '#DBEAFE', text: T.colors.fulfilled, label: 'Fulfilled' };
    case 'COMPLETED': return { bg: '#DBEAFE', text: T.colors.fulfilled, label: 'Completed' };
    case 'CLOSED': return { bg: T.colors.bg, text: T.colors.textSecondary, label: 'Closed' };
    case 'EXPIRED': return { bg: '#FEE2E2', text: '#EF4444', label: 'Expired' };
    default: return { bg: T.colors.bg, text: T.colors.textSecondary, label: status };
  }
};

// ============================================
// REQUEST CARD (for Feed)
// ============================================
interface RequestCardProps {
  scoredRequest: ScoredRequest;
  rawRequest: RawBuyerRequest;
  onPress: () => void;
  onHaveThis: () => void;
  isHighMatch?: boolean;
}

const RequestCard = ({ scoredRequest, rawRequest, onPress, onHaveThis, isHighMatch }: RequestCardProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { request } = scoredRequest;
  
  useEffect(() => {
    if (rawRequest.photos && rawRequest.photos.length > 0) {
      supabase.storage
        .from('request_photos')
        .createSignedUrl(rawRequest.photos[0].storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setImageUrl(data.signedUrl);
        });
    }
  }, [rawRequest.photos]);

  const extractAttr = (text: string, key: string): string | null => {
    const match = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : null;
  };

  const brand = extractAttr(rawRequest.description, 'Brand') || request.brand;
  const size = extractAttr(rawRequest.description, 'Size') || request.size;
  const shade = extractAttr(rawRequest.description, 'Shade/Variant') || request.shadeVariant;
  const condition = rawRequest.condition_text || request.condition;
  const category = rawRequest.categories?.name?.toLowerCase() || request.category;
  const city = rawRequest.location_text?.split(',')[0]?.trim() || request.city;

  const meta: string[] = [];
  if (brand) meta.push(brand);
  if (size) meta.push(size);
  else if (shade) meta.push(shade);
  if (condition) meta.push(condition.split(' ')[0]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
        {/* Image */}
      <View style={styles.imageContainer}>
          {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons 
              name={category === 'clothing' ? 'shirt-outline' : 'sparkles-outline'} 
              size={28} 
              color={T.colors.textMuted} 
            />
          </View>
        )}
        {isHighMatch && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>Match</Text>
            </View>
          )}
        </View>
        
        {/* Content */}
        <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={2}>{rawRequest.title}</Text>
        
        {meta.length > 0 && (
          <Text style={styles.cardMeta} numberOfLines={1}>{meta.join(' · ')}</Text>
        )}
        
        <View style={styles.cardBottom}>
          <Text style={styles.cardBudget}>€{rawRequest.budget_max_eur}</Text>
          {city && <Text style={styles.cardCity} numberOfLines={1}>{city}</Text>}
        </View>

        <TouchableOpacity 
          style={styles.ctaBtn} 
          onPress={(e) => { e.stopPropagation(); onHaveThis(); }}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>I HAVE THIS</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ============================================
// ACTIVITY CARD (for My Activity tab)
// ============================================
interface ActivityCardProps {
  request: RawBuyerRequest;
  role: 'buyer' | 'seller';
  onPress: () => void;
}

const ActivityCard = ({ request, role, onPress }: ActivityCardProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const statusStyle = getStatusStyle(request.status);
  
  useEffect(() => {
    if (request.photos && request.photos.length > 0) {
      supabase.storage
        .from('request_photos')
        .createSignedUrl(request.photos[0].storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setImageUrl(data.signedUrl);
        });
    }
  }, [request.photos]);

  const category = request.categories?.name?.toLowerCase() || '';
  const city = request.location_text?.split(',')[0]?.trim() || '';

  return (
    <TouchableOpacity style={styles.activityCard} onPress={onPress} activeOpacity={0.9}>
      {/* Image */}
      <View style={styles.activityImageContainer}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.activityImage} />
        ) : (
          <View style={styles.activityImagePlaceholder}>
            <Ionicons 
              name={category === 'clothing' ? 'shirt-outline' : 'sparkles-outline'} 
              size={24} 
              color={T.colors.textMuted} 
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.activityContent}>
        <View style={styles.activityTop}>
          <Text style={styles.activityTitle} numberOfLines={1}>{request.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          </View>
          </View>
          
        <Text style={styles.activityMeta}>
          €{request.budget_max_eur} · {city}
          </Text>
          
        <View style={styles.activityBottom}>
          <View style={styles.roleChip}>
            <Ionicons 
              name={role === 'buyer' ? 'cart-outline' : 'pricetag-outline'} 
              size={12} 
              color={T.colors.textSecondary} 
            />
            <Text style={styles.roleChipText}>
              {role === 'buyer' ? 'Your request' : 'You offered'}
            </Text>
          </View>
          <Text style={styles.activityTime}>
            {formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
    </TouchableOpacity>
  );
};

// ============================================
// SECTION HEADER
// ============================================
const SectionHeader = ({ title }: { title: string }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

// ============================================
// EMPTY STATE
// ============================================
const EmptyState = ({ type, onCreateRequest }: { type: TabType; onCreateRequest: () => void }) => (
  <View style={styles.emptyState}>
    <Ionicons 
      name={type === 'feed' ? 'search-outline' : 'time-outline'} 
      size={32} 
      color={T.colors.textMuted} 
    />
    <Text style={styles.emptyTitle}>
      {type === 'feed' ? 'No requests right now' : 'No activity yet'}
    </Text>
    <Text style={styles.emptySubtitle}>
      {type === 'feed' 
        ? 'Check back later or post a request' 
        : 'Your in-progress and past requests will appear here'}
    </Text>
    {type === 'feed' && (
      <TouchableOpacity style={styles.emptyBtn} onPress={onCreateRequest}>
        <Text style={styles.emptyBtnText}>Post a request</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ============================================
// CARD ROW (2 cards side by side)
// ============================================
const CardRow = ({ items, router }: { items: RequestData[]; router: any }) => (
  <View style={styles.cardRow}>
    {items.map((item) => (
      <RequestCard
        key={item.rawRequest.id}
        scoredRequest={item.request}
        rawRequest={item.rawRequest}
        onPress={() => router.push(`/requests/${item.rawRequest.id}`)}
        onHaveThis={() => router.push(`/requests/${item.rawRequest.id}`)}
        isHighMatch={item.isHighMatch}
      />
    ))}
    {items.length === 1 && <View style={styles.cardSpacer} />}
  </View>
);

// ============================================
// MAIN SCREEN
// ============================================
export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { sellerProfile: loadedSellerProfile, isLoading: loadingSellerProfile } = useSellerProfile();
  const [activeTab, setActiveTab] = useState<TabType>('feed');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const sellerProfile: SellerProfile =
    loadedSellerProfile ?? getDefaultSellerProfile();

  // ============================================
  // FEED TAB DATA (Open requests)
  // ============================================
  const { data: rawRequests, isLoading: loadingFeed, isError: errorFeed, refetch: refetchFeed } = useQuery({
    queryKey: ['buyerRequests', user?.id],
    queryFn: async () => {
      try {
        // @ts-ignore - Custom function not in generated types
        await supabase.rpc('run_request_expiry');
      } catch (e) {
        console.log('Expiry check skipped:', e);
      }

      // Build query - exclude user's own requests from feed
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
        .limit(50);

      // Exclude current user's requests (they appear in My Activity instead)
      if (user?.id) {
        query = query.neq('buyer_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as RawBuyerRequest[];
    },
    enabled: activeTab === 'feed',
  });

  // ============================================
  // ACTIVITY TAB DATA (User's requests + requests they offered on)
  // ============================================
  const { data: activityData, isLoading: loadingActivity, refetch: refetchActivity } = useQuery({
    queryKey: ['userActivity', user?.id],
    queryFn: async () => {
      if (!user) return { buyerRequests: [], sellerOffers: [] };

      // 1. Get user's own requests (all statuses)
      const { data: buyerReqs, error: buyerError } = await supabase
        .from('buyer_requests')
        .select(`
          *,
          profiles:buyer_id(username),
          categories:category_id(name),
          photos:buyer_request_photos(id, storage_path)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (buyerError) throw buyerError;

      // 2. Get requests where user made an offer
      const { data: userOffers, error: offersError } = await supabase
        .from('offers')
        .select('request_id')
        .eq('seller_id', user.id);

      if (offersError) throw offersError;

      const offerRequestIds = (userOffers || []).map(o => o.request_id);
      
      let sellerReqs: RawBuyerRequest[] = [];
      if (offerRequestIds.length > 0) {
        const { data: sellerData, error: sellerError } = await supabase
          .from('buyer_requests')
          .select(`
            *,
            profiles:buyer_id(username),
            categories:category_id(name),
            photos:buyer_request_photos(id, storage_path)
          `)
          .in('id', offerRequestIds)
          .order('created_at', { ascending: false });

        if (sellerError) throw sellerError;
        sellerReqs = (sellerData || []) as RawBuyerRequest[];
      }

      return {
        buyerRequests: (buyerReqs || []) as RawBuyerRequest[],
        sellerOffers: sellerReqs,
      };
    },
    enabled: activeTab === 'activity' && !!user,
  });

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'feed') refetchFeed();
      else refetchActivity();
    }, [activeTab, refetchFeed, refetchActivity])
  );

  // Process feed data
  const feedListData = useMemo((): ListItem[] => {
    if (!rawRequests || rawRequests.length === 0) return [];

    const parsedRequests: BuyerRequestData[] = rawRequests.map(req => parseRequestToData(req));
    const scored = rankRequests(parsedRequests, sellerProfile, {
      minThreshold: SCORE_WEIGHTS.FALLBACK_THRESHOLD,
      maxResults: 50,
      allowFallback: true,
    });

    const rawMap = new Map(rawRequests.map(r => [r.id, r]));
    const highMatches: RequestData[] = [];
    const nearby: RequestData[] = [];
    const newToday: RequestData[] = [];
    const other: RequestData[] = [];

    scored.forEach(sr => {
      const raw = rawMap.get(sr.request.id);
      if (!raw) return;
      const isNew = isToday(parseISO(raw.created_at));
      const isNearby = sr.matchDetails.locationLevel === 'local';
      const isHigh = sr.score >= 70;

      const item: RequestData = { type: 'request', request: sr, rawRequest: raw, isHighMatch: isHigh };

      if (isHigh) highMatches.push(item);
      else if (isNearby) nearby.push(item);
      else if (isNew) newToday.push(item);
      else other.push(item);
    });

    const toPairs = (items: RequestData[]): RequestData[][] => {
      const pairs: RequestData[][] = [];
      for (let i = 0; i < items.length; i += 2) {
        pairs.push(items.slice(i, i + 2));
      }
      return pairs;
    };

    const result: ListItem[] = [];
    
    if (highMatches.length > 0) {
      result.push({ type: 'section', title: '🔥 High match' });
      result.push(...toPairs(highMatches));
    }
    if (nearby.length > 0) {
      result.push({ type: 'section', title: '📍 Nearby' });
      result.push(...toPairs(nearby));
    }
    if (newToday.length > 0) {
      result.push({ type: 'section', title: '✨ New today' });
      result.push(...toPairs(newToday));
    }
    if (other.length > 0) {
      if (result.length > 0) result.push({ type: 'section', title: 'All requests' });
      result.push(...toPairs(other));
    }
    
    return result;
  }, [rawRequests, sellerProfile]);

  // Process activity data
  const activityListData = useMemo(() => {
    if (!activityData) return [];

    const { buyerRequests, sellerOffers } = activityData;
    
    // Combine and dedupe
    const seenIds = new Set<string>();
    const items: { request: RawBuyerRequest; role: 'buyer' | 'seller' }[] = [];

    // Add buyer requests first
    buyerRequests.forEach(req => {
      if (!seenIds.has(req.id)) {
        seenIds.add(req.id);
        items.push({ request: req, role: 'buyer' });
      }
    });

    // Add seller offers (excluding ones that are also buyer's requests)
    sellerOffers.forEach(req => {
      if (!seenIds.has(req.id)) {
        seenIds.add(req.id);
        items.push({ request: req, role: 'seller' });
      }
    });

    // Sort by date
    items.sort((a, b) => new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime());

    // Group by status
    const open = items.filter(i => i.request.status === 'OPEN');
    const inProgress = items.filter(i => i.request.status === 'IN_PROGRESS');
    const fulfilled = items.filter(i => ['FULFILLED', 'COMPLETED'].includes(i.request.status));
    const closed = items.filter(i => ['CLOSED', 'EXPIRED', 'CANCELED'].includes(i.request.status));

    return { open, inProgress, fulfilled, closed };
  }, [activityData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (activeTab === 'feed') await refetchFeed();
    else await refetchActivity();
    setIsRefreshing(false);
  };

  const renderFeedItem = ({ item }: { item: ListItem }) => {
    if ('type' in item && item.type === 'section') {
      return <SectionHeader title={item.title} />;
    }
    return <CardRow items={item as RequestData[]} router={router} />;
  };

  const isLoading =
    activeTab === 'feed'
      ? loadingFeed || loadingSellerProfile
      : loadingActivity;

  if (isLoading && !rawRequests && !activityData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={T.colors.accent} />
      </View>
    );
  }

  if (activeTab === 'feed' && errorFeed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Something went wrong</Text>
        <TouchableOpacity onPress={() => refetchFeed()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Tabs */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Requests</Text>
        
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'feed' && styles.tabActive]}
            onPress={() => setActiveTab('feed')}
          >
            <Ionicons 
              name="compass-outline" 
              size={16} 
              color={activeTab === 'feed' ? T.colors.accent : T.colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>
              Discover
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'activity' && styles.tabActive]}
            onPress={() => setActiveTab('activity')}
          >
            <Ionicons 
              name="time-outline" 
              size={16} 
              color={activeTab === 'activity' ? T.colors.accent : T.colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>
              My Activity
            </Text>
        </TouchableOpacity>
        </View>
      </View>

      {/* Feed Tab */}
      {activeTab === 'feed' && (
      <FlatList
          data={feedListData}
          renderItem={renderFeedItem}
          keyExtractor={(item, i) => {
            if ('type' in item && item.type === 'section') return `section-${i}`;
            return `row-${i}`;
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={T.colors.textMuted}
            />
          }
          ListEmptyComponent={<EmptyState type="feed" onCreateRequest={() => router.push('/(tabs)/sell')} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
        />
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <FlatList
          data={[1]} // Single item to render sections
          renderItem={() => {
            const { open, inProgress, fulfilled, closed } = activityListData as any || {};
            const hasData = (open?.length || 0) + (inProgress?.length || 0) + (fulfilled?.length || 0) + (closed?.length || 0) > 0;

            if (!hasData) {
              return <EmptyState type="activity" onCreateRequest={() => {}} />;
            }

            return (
              <View>
                {open?.length > 0 && (
                  <>
                    <SectionHeader title="🟢 Your Open Requests" />
                    {open.map((item: { request: RawBuyerRequest; role: 'buyer' | 'seller' }) => (
                      <ActivityCard
                        key={item.request.id}
                        request={item.request}
                        role={item.role}
                        onPress={() => router.push(`/requests/${item.request.id}`)}
                      />
                    ))}
                  </>
                )}

                {inProgress?.length > 0 && (
                  <>
                    <SectionHeader title="⏳ In Progress" />
                    {inProgress.map((item: { request: RawBuyerRequest; role: 'buyer' | 'seller' }) => (
                      <ActivityCard
                        key={item.request.id}
                        request={item.request}
                        role={item.role}
                        onPress={() => router.push(`/requests/${item.request.id}`)}
                      />
                    ))}
                  </>
                )}

                {fulfilled?.length > 0 && (
                  <>
                    <SectionHeader title="✅ Fulfilled" />
                    {fulfilled.map((item: { request: RawBuyerRequest; role: 'buyer' | 'seller' }) => (
                      <ActivityCard
                        key={item.request.id}
                        request={item.request}
                        role={item.role}
                        onPress={() => router.push(`/requests/${item.request.id}`)}
                      />
                    ))}
                  </>
                )}

                {closed?.length > 0 && (
                  <>
                    <SectionHeader title="📁 Past" />
                    {closed.map((item: { request: RawBuyerRequest; role: 'buyer' | 'seller' }) => (
                      <ActivityCard
                        key={item.request.id}
                        request={item.request}
                        role={item.role}
                        onPress={() => router.push(`/requests/${item.request.id}`)}
                      />
                    ))}
                  </>
                )}
              </View>
            );
          }}
          keyExtractor={() => 'activity-content'}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={T.colors.textMuted}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB - only on Feed tab */}
      {activeTab === 'feed' && (
            <TouchableOpacity 
          style={styles.fab} 
              onPress={() => router.push('/(tabs)/sell')}
          activeOpacity={0.9}
            >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.fabText}>Request</Text>
            </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.colors.bg,
  },
  
  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.sm,
    backgroundColor: T.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.colors.border,
  },
  headerTitle: {
    fontSize: T.font.title,
    fontWeight: '700',
    color: T.colors.text,
    letterSpacing: -0.3,
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    marginTop: T.spacing.md,
    gap: T.spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: T.spacing.sm,
    paddingHorizontal: T.spacing.md,
    borderRadius: T.radius.sm,
    backgroundColor: T.colors.bg,
    gap: T.spacing.xs,
  },
  tabActive: {
    backgroundColor: '#EBF5FF',
  },
  tabText: {
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.textMuted,
  },
  tabTextActive: {
    color: T.colors.accent,
  },

  // List
  listContent: {
    padding: HORIZONTAL_PADDING,
    paddingBottom: 100,
  },

  // Card Row
  cardRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  cardSpacer: {
    width: CARD_WIDTH,
  },

  // Section Header
  sectionHeader: {
    paddingTop: T.spacing.md,
    paddingBottom: T.spacing.sm,
  },
  sectionTitle: {
    fontSize: T.font.sm,
    fontWeight: '600',
    color: T.colors.textSecondary,
    letterSpacing: 0.2,
  },

  // Card (Feed)
  card: {
    width: CARD_WIDTH,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: T.colors.bg,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.colors.bg,
  },
  matchBadge: {
    position: 'absolute',
    top: T.spacing.sm,
    left: T.spacing.sm,
    backgroundColor: T.colors.badge,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  matchBadgeText: {
    fontSize: T.font.xs,
    fontWeight: '600',
    color: '#FFF',
  },
  cardContent: {
    padding: T.spacing.sm,
  },
  cardTitle: {
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.text,
    lineHeight: 18,
    minHeight: 36,
  },
  cardMeta: {
    fontSize: T.font.xs,
    color: T.colors.textSecondary,
    marginTop: 4,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardBudget: {
    fontSize: T.font.md,
    fontWeight: '700',
    color: T.colors.text,
  },
  cardCity: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
    maxWidth: 60,
  },
  ctaBtn: {
    backgroundColor: T.colors.accent,
    paddingVertical: T.spacing.sm,
    borderRadius: T.radius.sm,
    marginTop: T.spacing.sm,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: T.font.xs,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: 0.3,
  },

  // Activity Card
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.md,
    padding: T.spacing.md,
    marginBottom: T.spacing.sm,
    borderWidth: 1,
    borderColor: T.colors.border,
    gap: T.spacing.md,
  },
  activityImageContainer: {
    width: 56,
    height: 56,
    borderRadius: T.radius.sm,
    overflow: 'hidden',
    backgroundColor: T.colors.bg,
  },
  activityImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  activityImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: T.spacing.sm,
  },
  activityTitle: {
    flex: 1,
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.text,
  },
  statusBadge: {
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: T.font.xs,
    fontWeight: '600',
  },
  activityMeta: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
    marginTop: 2,
  },
  activityBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: T.spacing.xs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.xs,
  },
  roleChipText: {
    fontSize: T.font.xs,
    color: T.colors.textSecondary,
  },
  activityTime: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.text,
    paddingVertical: T.spacing.sm + 2,
    paddingHorizontal: T.spacing.lg,
    borderRadius: 20,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  fabText: {
    fontSize: T.font.md,
    fontWeight: '600',
    color: '#FFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: T.spacing.lg,
  },
  emptyTitle: {
    fontSize: T.font.lg,
    fontWeight: '600',
    color: T.colors.text,
    marginTop: T.spacing.md,
  },
  emptySubtitle: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
    marginTop: T.spacing.xs,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: T.spacing.lg,
    backgroundColor: T.colors.accent,
    paddingVertical: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    borderRadius: T.radius.sm,
  },
  emptyBtnText: {
    fontSize: T.font.md,
    fontWeight: '600',
    color: '#FFF',
  },

  // Error
  errorText: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    marginBottom: T.spacing.sm,
  },
  retryText: {
    fontSize: T.font.md,
    color: T.colors.accent,
    fontWeight: '500',
  },
});
