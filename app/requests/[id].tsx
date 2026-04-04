import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { getUserRating, submitRating } from '../../lib/ratings';
import { notifyNewOffer, notifyOfferStatus } from '../../lib/pushEvents';
import { useAuth } from '../../lib/auth';
import { requireEmailVerified } from '../../lib/guards';
import { format, formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

// ============================================
// DESIGN TOKENS
// ============================================
const T = {
  colors: {
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    accent: '#007AFF',
    accentSoft: '#EBF5FF',
    success: '#10B981',
    successSoft: '#ECFDF5',
    warning: '#F59E0B',
    error: '#EF4444',
    border: '#E5E7EB',
    divider: '#F3F4F6',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
  },
  font: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    title: 24,
  },
};

// ============================================
// STATUS CHIP
// ============================================
const StatusChip = ({ status }: { status: string }) => {
  const getStatusStyle = () => {
    switch (status) {
      case 'OPEN': return { bg: T.colors.successSoft, text: T.colors.success, label: 'OPEN' };
      case 'IN_PROGRESS': return { bg: '#FEF3C7', text: T.colors.warning, label: 'IN PROGRESS' };
      case 'FULFILLED': return { bg: '#DBEAFE', text: '#2563EB', label: 'FULFILLED ✓' };
      case 'CLOSED': return { bg: T.colors.divider, text: T.colors.textSecondary, label: 'CLOSED' };
      case 'EXPIRED': return { bg: '#FEE2E2', text: T.colors.error, label: 'EXPIRED' };
      case 'COMPLETED': return { bg: '#DBEAFE', text: '#2563EB', label: 'COMPLETED ✓' };
      case 'CANCELED': return { bg: '#FEE2E2', text: T.colors.error, label: 'CANCELED' };
      default: return { bg: T.colors.divider, text: T.colors.textSecondary, label: status };
    }
  };
  const style = getStatusStyle();
  return (
    <View style={[styles.statusChip, { backgroundColor: style.bg }]}>
      <Text style={[styles.statusChipText, { color: style.text }]}>{style.label}</Text>
    </View>
  );
};

// Helper: Check if request is in a "closed" state (no more actions allowed)
const isRequestClosed = (status: string) => {
  return ['FULFILLED', 'CLOSED', 'EXPIRED', 'COMPLETED', 'CANCELED'].includes(status);
};

// ============================================
// DETAIL ROW
// ============================================
const DetailRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>
      <Text style={styles.detailIconText}>{icon}</Text>
    </View>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

// ============================================
// COLLAPSIBLE SECTION
// ============================================
const CollapsibleSection = ({ title, children, defaultOpen = false }: { 
  title: string; 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setIsOpen(!isOpen)}>
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.colors.textSecondary} />
      </TouchableOpacity>
      {isOpen && <View style={styles.collapsibleContent}>{children}</View>}
    </View>
  );
};

// ============================================
// OFFER CARD (for buyer view)
// ============================================
const OfferCard = ({ 
  offer, 
  onAccept, 
  onDecline,
  canRespond,
}: { 
  offer: any; 
  onAccept: (sellerId: string) => void;
  onDecline: () => void;
  canRespond: boolean;
}) => (
  <View style={styles.offerCard}>
    <View style={styles.offerTop}>
      <View style={styles.offerSellerInfo}>
        <View style={styles.offerAvatar}>
          <Ionicons name="person" size={16} color={T.colors.textMuted} />
        </View>
        <Text style={styles.offerSeller}>{offer.profiles?.username || 'Seller'}</Text>
      </View>
      <Text style={styles.offerTime}>{formatDistanceToNow(new Date(offer.created_at), { addSuffix: true })}</Text>
    </View>
    
    <View style={styles.offerIntent}>
      <Ionicons name="checkmark-circle" size={20} color={T.colors.success} />
      <Text style={styles.offerIntentText}>Can fulfill this request</Text>
    </View>

    {canRespond && offer.status === 'PENDING' && (
      <View style={styles.offerActions}>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(offer.seller_id)}>
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    )}

    {offer.status === 'ACCEPTED' && (
      <View style={styles.offerStatusBadge}>
        <Ionicons name="checkmark" size={14} color={T.colors.success} />
        <Text style={[styles.offerStatusText, { color: T.colors.success }]}>Accepted</Text>
      </View>
    )}

    {offer.status === 'REJECTED' && (
      <View style={styles.offerStatusBadge}>
        <Ionicons name="close" size={14} color={T.colors.error} />
        <Text style={[styles.offerStatusText, { color: T.colors.error }]}>Declined</Text>
      </View>
    )}
  </View>
);

// ============================================
// MAIN SCREEN
// ============================================
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSkipped, setRatingSkipped] = useState(false);

  // Fetch request
  const { data: request, isLoading, isError } = useQuery({
    queryKey: ['buyerRequest', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_requests')
        .select(`
          *,
          profiles:buyer_id(id, username, created_at),
          categories:category_id(name),
          photos:buyer_request_photos(id, storage_path, sort_order),
          accepted_offer:offers!buyer_requests_accepted_offer_id_fkey(seller_id)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch offers (for buyer)
  const { data: offers } = useQuery({
    queryKey: ['offers', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offers')
        .select(`*, profiles:seller_id(username)`)
        .eq('request_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!request && request.profiles?.id === user?.id,
  });

  // Check if seller already made an offer
  const { data: existingOffer, isLoading: isCheckingOffer } = useQuery({
    queryKey: ['userOffer', id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('request_id', id)
        .eq('seller_id', user?.id || '')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!request && request.profiles?.id !== user?.id,
  });

  const acceptedSellerId = useMemo(() => {
    if (!request) return null;
    const joined = (request as { accepted_offer?: { seller_id: string } | null }).accepted_offer?.seller_id;
    if (joined) return joined;
    const acc = offers?.find((o: { status: string }) => o.status === 'ACCEPTED');
    return acc?.seller_id ?? null;
  }, [request, offers]);

  const { data: myRating, isLoading: myRatingLoading } = useQuery({
    queryKey: ['myRating', id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ratings')
        .select('id')
        .eq('request_id', id as string)
        .eq('reviewer_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled:
      !!user &&
      !!id &&
      request?.status === 'COMPLETED' &&
      !!acceptedSellerId &&
      (request.buyer_id === user.id || acceptedSellerId === user.id),
  });

  const { data: sellerTrust } = useQuery({
    queryKey: ['userRating', acceptedSellerId],
    queryFn: () => getUserRating(acceptedSellerId!),
    enabled: !!acceptedSellerId,
  });

  const { data: buyerTrust } = useQuery({
    queryKey: ['userRating', request?.buyer_id],
    queryFn: () => getUserRating(request!.buyer_id),
    enabled: !!request?.buyer_id && !!user && !!acceptedSellerId && acceptedSellerId === user.id,
  });

  // Fetch photos
  React.useEffect(() => {
    if (request?.photos && request.photos.length > 0) {
      const fetchPhotos = async () => {
        const results = await Promise.all(
          request.photos.map(async (p: any) => {
            const { data } = await supabase.storage
              .from('request_photos')
              .createSignedUrl(p.storage_path, 3600);
            return { id: p.id, url: data?.signedUrl || '' };
          })
        );
        setPhotos(results.filter(p => p.url));
      };
      fetchPhotos();
    }
  }, [request]);

  // ============================================
  // "I HAVE THIS" - Create Offer Mutation
  // ============================================
  const createOfferMutation = useMutation({
    mutationFn: async () => {
      if (!user || !request) throw new Error('Not authenticated');
      
      // Simple insert - minimal data, just intent signaling
      const { data, error } = await supabase
        .from('offers')
        .insert([{
          request_id: id,
          seller_id: user.id,
          status: 'PENDING' as const,
          price_eur: 0, // Not used in v1, but required by schema until migration
          message: '', // Not used in v1, but required by schema until migration
        }])
        .select()
        .single();
      
      if (error) {
        // Handle unique constraint violation gracefully
        if (error.code === '23505') {
          throw new Error('You have already submitted an offer for this request');
        }
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      notifyNewOffer(data.id);
      queryClient.invalidateQueries({ queryKey: ['userOffer', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['offers', id] });
    },
    onError: (error) => {
      Alert.alert('Error', (error as Error).message);
    },
  });

  // Handle "I HAVE THIS" tap - no confirmation, instant action
  const handleIHaveThis = async () => {
    if (isSubmittingOffer || existingOffer) return;
    if (!requireEmailVerified(user)) return;
    setIsSubmittingOffer(true);
    try {
      await createOfferMutation.mutateAsync();
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // ============================================
  // Accept/Decline Offer Mutations (for buyer)
  // ============================================
  const acceptOfferMutation = useMutation({
    mutationFn: async ({ offerId, sellerId }: { offerId: string; sellerId: string }) => {
      if (!user || !request) throw new Error('Missing data');

      // 1. Update offer status
      const { error: offerError } = await supabase
        .from('offers')
        .update({ status: 'ACCEPTED' })
        .eq('id', offerId);
      if (offerError) throw offerError;

      // 2. Update request status
      const { error: requestError } = await supabase
        .from('buyer_requests')
        .update({ status: 'IN_PROGRESS', accepted_offer_id: offerId })
        .eq('id', id);
      if (requestError) throw requestError;

      // 3. Create conversation linked to this accepted offer
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert([{
          offer_id: offerId,
          request_id: id,
          buyer_id: user.id,
          seller_id: sellerId,
          last_message_at: new Date().toISOString(),
        }])
        .select()
        .single();
      
      if (convError) throw convError;
      return conversation;
    },
    onSuccess: (conversation, variables) => {
      notifyOfferStatus(variables.offerId, 'accepted', conversation.id);
      queryClient.invalidateQueries({ queryKey: ['buyerRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['offers', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      router.push(`/chat/${conversation.id}`);
    },
    onError: (error) => Alert.alert('Error', (error as Error).message),
  });

  const declineOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'REJECTED' })
        .eq('id', offerId);
      if (error) throw error;
    },
    onSuccess: (_data, offerId) => {
      notifyOfferStatus(offerId, 'rejected');
      queryClient.invalidateQueries({ queryKey: ['offers', id] });
    },
    onError: (error) => Alert.alert('Error', (error as Error).message),
  });

  const handleAccept = (offerId: string, sellerId: string) => {
    if (!requireEmailVerified(user)) return;
    acceptOfferMutation.mutate({ offerId, sellerId });
  };

  const handleDecline = (offerId: string) => {
    if (!requireEmailVerified(user)) return;
    declineOfferMutation.mutate(offerId);
  };

  const submitRatingMutation = useMutation({
    mutationFn: async () => {
      if (!user || !request || !acceptedSellerId) throw new Error('Missing data');
      const revieweeId =
        request.buyer_id === user.id ? acceptedSellerId : request.buyer_id;
      await submitRating({
        requestId: String(id),
        revieweeId,
        rating: ratingStars,
        comment: ratingComment.trim() || null,
      });
    },
    onSuccess: () => {
      setRatingModalVisible(false);
      setRatingComment('');
      queryClient.invalidateQueries({ queryKey: ['myRating', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['userRating'] });
      Alert.alert('Thanks', 'Your review was submitted.');
    },
    onError: (error) => Alert.alert('Error', (error as Error).message),
  });

  // ============================================
  // Update Request Status (for buyer)
  // ============================================
  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CLOSED' | 'EXPIRED' | 'COMPLETED' | 'CANCELED' }) => {
      const { error } = await supabase.from('buyer_requests').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['buyerRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['buyerRequests'] });
      if (variables.status === 'COMPLETED') {
        setRatingModalVisible(true);
        setRatingStars(5);
        setRatingComment('');
        setRatingSkipped(false);
      } else {
        Alert.alert('Updated', 'Request status changed.');
      }
    },
    onError: (error) => Alert.alert('Error', (error as Error).message),
  });

  useEffect(() => {
    if (myRating?.id) setRatingModalVisible(false);
  }, [myRating]);

  useEffect(() => {
    if (myRatingLoading) return;
    if (
      !request ||
      request.status !== 'COMPLETED' ||
      !user ||
      !acceptedSellerId ||
      ratingSkipped ||
      myRating
    ) {
      return;
    }
    const participant = request.buyer_id === user.id || acceptedSellerId === user.id;
    if (participant) setRatingModalVisible(true);
  }, [request, user, acceptedSellerId, ratingSkipped, myRating, myRatingLoading]);

  // Mark as complete (for buyer after IN_PROGRESS) — enables mutual ratings
  const handleMarkComplete = () => {
    Alert.alert(
      'Mark transaction complete?',
      'Confirm you received the item (or the deal is done). Chat becomes read-only and you can rate the other person.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, complete',
          style: 'default',
          onPress: () => updateStatusMutation.mutate({ status: 'COMPLETED' }),
        },
      ]
    );
  };

  // Close request manually handler (for buyer)
  const handleCloseRequest = () => {
    Alert.alert(
      'Close Request?',
      'This will close the request without marking it as fulfilled.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Yes, Close', 
          style: 'destructive',
          onPress: () => updateStatusMutation.mutate({ status: 'CLOSED' })
        },
      ]
    );
  };

  // ============================================
  // Render
  // ============================================
  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={T.colors.accent} /></View>;
  }
  
  if (isError || !request) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={T.colors.textMuted} />
        <Text style={styles.errorText}>Could not load request</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isBuyer = user?.id === request.buyer_id;
  const requestClosed = isRequestClosed(request.status);
  const canMakeOffer = !isBuyer && request.status === 'OPEN' && !existingOffer && !isCheckingOffer;
  const hasSubmittedOffer = !isBuyer && !!existingOffer;
  const canMarkComplete = isBuyer && request.status === 'IN_PROGRESS';

  // Extract structured data from description
  const extractAttr = (text: string, key: string): string | null => {
    const match = text?.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : null;
  };

  const brand = extractAttr(request.description, 'Brand');
  const size = extractAttr(request.description, 'Size');
  const shade = extractAttr(request.description, 'Shade/Variant');
  const color = extractAttr(request.description, 'Color');
  const delivery = extractAttr(request.description, 'Delivery');
  const condition = request.condition_text;
  const locationParts = request.location_text?.split(',') || [];
  const city = locationParts[0]?.trim();
  const country = locationParts[1]?.trim();

  // Build compact facts string
  const facts: string[] = [];
  if (brand) facts.push(brand);
  if (condition) facts.push(condition);
  facts.push(`€${request.budget_min_eur}–${request.budget_max_eur}`);
  if (city) facts.push(city);

  // Count pending offers for buyer
  const pendingOffersCount = offers?.filter((o: any) => o.status === 'PENDING').length || 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={T.colors.text} />
          </TouchableOpacity>
          <StatusChip status={request.status} />
        </View>

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Image */}
          <View style={styles.imageSection}>
            {photos.length > 0 ? (
              <Image source={{ uri: photos[0].url }} style={styles.mainImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={32} color={T.colors.textMuted} />
                <Text style={styles.placeholderText}>Reference photo not provided</Text>
              </View>
            )}
          </View>

          {/* Title & Facts */}
          <View style={styles.headerSection}>
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.factsRow}>{facts.join(' · ')}</Text>
            {acceptedSellerId && isBuyer && sellerTrust && (
              <Text style={styles.trustLine} accessibilityRole="text">
                Seller · ⭐ {sellerTrust.total_reviews > 0 ? sellerTrust.average_rating.toFixed(1) : '—'} (
                {sellerTrust.total_reviews} {sellerTrust.total_reviews === 1 ? 'review' : 'reviews'})
              </Text>
            )}
            {acceptedSellerId === user?.id && buyerTrust && (
              <Text style={styles.trustLine} accessibilityRole="text">
                Buyer · ⭐ {buyerTrust.total_reviews > 0 ? buyerTrust.average_rating.toFixed(1) : '—'} (
                {buyerTrust.total_reviews} {buyerTrust.total_reviews === 1 ? 'review' : 'reviews'})
              </Text>
            )}
          </View>

          {/* Item Details */}
          <View style={styles.section}>
            {brand && <DetailRow icon="🏷" label="Brand" value={brand} />}
            {(size || shade) && <DetailRow icon="📏" label={size ? "Size" : "Shade"} value={size || shade || ''} />}
            {color && color !== 'Any' && <DetailRow icon="🎨" label="Color" value={color} />}
            {condition && <DetailRow icon="✨" label="Condition" value={condition} />}
            {delivery && <DetailRow icon="📦" label="Delivery" value={delivery} />}
          </View>

          {/* Description */}
          {request.description && (
            <CollapsibleSection title="Description">
              <Text style={styles.descriptionText}>{request.description}</Text>
            </CollapsibleSection>
          )}

          {/* Location */}
          <View style={styles.section}>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={18} color={T.colors.textSecondary} />
              <Text style={styles.locationText}>
                {city}{country ? `, ${country}` : ''}
              </Text>
            </View>
            {delivery && (
              <View style={styles.locationRow}>
                <Ionicons name="cube-outline" size={18} color={T.colors.textSecondary} />
                <Text style={styles.locationText}>{delivery}</Text>
              </View>
            )}
          </View>

          {/* Seller's Offer Status */}
          {hasSubmittedOffer && (
            <View style={styles.offerSentSection}>
              <View style={styles.offerSentContent}>
                <Ionicons name="checkmark-circle" size={24} color={T.colors.success} />
                <View style={styles.offerSentText}>
                  <Text style={styles.offerSentTitle}>Offer Sent</Text>
                  <Text style={styles.offerSentSubtitle}>
                    {existingOffer?.status === 'PENDING' && 'Waiting for buyer response'}
                    {existingOffer?.status === 'ACCEPTED' && 'Your offer was accepted!'}
                    {existingOffer?.status === 'REJECTED' && 'Your offer was declined'}
                  </Text>
                </View>
              </View>
              {existingOffer?.status === 'ACCEPTED' && (
                <View style={styles.acceptedBadge}>
                  <Text style={styles.acceptedBadgeText}>ACCEPTED</Text>
                </View>
              )}
              {existingOffer?.status === 'REJECTED' && (
                <View style={[styles.acceptedBadge, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.acceptedBadgeText, { color: T.colors.error }]}>DECLINED</Text>
                </View>
              )}
            </View>
          )}

          {/* Offers Section (for buyer) */}
          {isBuyer && offers && offers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Offers ({pendingOffersCount} pending)
              </Text>
              {offers.map((offer: any) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  onAccept={(sellerId) => handleAccept(offer.id, sellerId)}
                  onDecline={() => handleDecline(offer.id)}
                  canRespond={request.status === 'OPEN'}
                />
              ))}
            </View>
          )}

          {/* Closed Request Banner */}
          {requestClosed && (
            <View style={styles.closedBanner}>
              <Ionicons 
                name={request.status === 'FULFILLED' || request.status === 'COMPLETED' ? 'checkmark-circle' : request.status === 'EXPIRED' ? 'time' : 'close-circle'} 
                size={20} 
                color={request.status === 'FULFILLED' || request.status === 'COMPLETED' ? '#2563EB' : T.colors.textMuted} 
              />
              <Text style={styles.closedBannerText}>
                {request.status === 'FULFILLED' && 'This request has been fulfilled'}
                {request.status === 'EXPIRED' && 'This request has expired (14+ days old)'}
                {request.status === 'CLOSED' && 'This request has been closed'}
                {request.status === 'CANCELED' && 'This request has been canceled'}
                {request.status === 'COMPLETED' && 'This transaction is complete — thank you for using the marketplace'}
              </Text>
            </View>
          )}

          {/* Buyer Actions: Mark complete */}
          {canMarkComplete && (
            <View style={styles.section}>
              <Text style={styles.fulfillmentHint}>
                Did you receive the item successfully?
              </Text>
              <TouchableOpacity 
                style={styles.fulfillBtn} 
                onPress={handleMarkComplete}
              >
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.fulfillBtnText}>Mark transaction complete</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.closeRequestBtn} 
                onPress={handleCloseRequest}
              >
                <Text style={styles.closeRequestBtnText}>Close without fulfilling</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Buyer Info */}
          <View style={styles.buyerInfo}>
            <Text style={styles.buyerInfoText}>
              Requested by {request.profiles?.username}
              {request.profiles?.created_at && ` · Member since ${format(new Date(request.profiles.created_at), 'yyyy')}`}
            </Text>
          </View>

          {/* Bottom Spacer */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Sticky CTA for Sellers */}
        {canMakeOffer && (
          <View style={styles.stickyCTA}>
            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={handleIHaveThis}
              disabled={isSubmittingOffer}
              activeOpacity={0.8}
            >
              {isSubmittingOffer ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.primaryBtnText}>I HAVE THIS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Offer Sent State for Sellers */}
        {hasSubmittedOffer && existingOffer?.status === 'PENDING' && (
          <View style={styles.stickyCTA}>
            <View style={styles.offerSentBtn}>
              <Ionicons name="checkmark-circle" size={20} color={T.colors.success} />
              <Text style={styles.offerSentBtnText}>OFFER SENT ✓</Text>
            </View>
          </View>
        )}

        {/* Cancel button for buyer (only when OPEN) */}
        {isBuyer && request.status === 'OPEN' && (
          <View style={styles.stickyCTA}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={() => Alert.alert('Cancel Request?', 'This cannot be undone.', [
                { text: 'No', style: 'cancel' },
                { text: 'Yes, Cancel', style: 'destructive', onPress: () => updateStatusMutation.mutate({ status: 'CANCELED' }) },
              ])}
            >
              <Text style={styles.cancelBtnText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={ratingModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setRatingSkipped(true);
            setRatingModalVisible(false);
          }}
        >
          <KeyboardAvoidingView
            style={styles.ratingModalKb}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.ratingModalRoot}>
              <View style={styles.ratingModalCard}>
                <Text style={styles.ratingModalTitle}>How was your experience?</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRatingStars(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons
                        name={n <= ratingStars ? 'star' : 'star-outline'}
                        size={36}
                        color={n <= ratingStars ? '#FBBF24' : T.colors.border}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.ratingCommentInput}
                  placeholder="Leave a short review (optional)"
                  placeholderTextColor={T.colors.textMuted}
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.ratingSubmitBtn, submitRatingMutation.isPending && { opacity: 0.7 }]}
                  onPress={() => submitRatingMutation.mutate()}
                  disabled={submitRatingMutation.isPending}
                >
                  {submitRatingMutation.isPending ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.ratingSubmitBtnText}>Submit review</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ratingLaterBtn}
                  onPress={() => {
                    setRatingSkipped(true);
                    setRatingModalVisible(false);
                  }}
                >
                  <Text style={styles.ratingLaterText}>Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </>
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
    padding: T.spacing.xl,
  },
  errorText: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    marginTop: T.spacing.md,
  },
  retryBtn: {
    marginTop: T.spacing.lg,
    paddingVertical: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    backgroundColor: T.colors.accent,
    borderRadius: T.radius.sm,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.md,
    backgroundColor: T.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.colors.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: T.colors.divider,
  },
  statusChip: {
    paddingHorizontal: T.spacing.md,
    paddingVertical: T.spacing.xs + 2,
    borderRadius: T.radius.full,
  },
  statusChipText: {
    fontSize: T.font.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: T.spacing.xl,
  },

  // Image
  imageSection: {
    backgroundColor: T.colors.surface,
    padding: T.spacing.lg,
  },
  mainImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: T.radius.lg,
    backgroundColor: T.colors.divider,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: T.radius.lg,
    backgroundColor: T.colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    marginTop: T.spacing.sm,
    fontSize: T.font.sm,
    color: T.colors.textMuted,
  },

  // Header
  headerSection: {
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.xl,
  },
  title: {
    fontSize: T.font.title,
    fontWeight: '700',
    color: T.colors.text,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  factsRow: {
    marginTop: T.spacing.sm,
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    lineHeight: 22,
  },
  trustLine: {
    marginTop: T.spacing.sm,
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
  },

  ratingModalKb: {
    flex: 1,
  },
  ratingModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: T.spacing.lg,
  },
  ratingModalCard: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.xl,
  },
  ratingModalTitle: {
    fontSize: T.font.lg,
    fontWeight: '700',
    color: T.colors.text,
    textAlign: 'center',
    marginBottom: T.spacing.lg,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: T.spacing.sm,
    marginBottom: T.spacing.lg,
  },
  ratingCommentInput: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.sm,
    padding: T.spacing.md,
    minHeight: 80,
    fontSize: T.font.md,
    color: T.colors.text,
    textAlignVertical: 'top',
    marginBottom: T.spacing.lg,
  },
  ratingSubmitBtn: {
    backgroundColor: T.colors.accent,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
  },
  ratingSubmitBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: T.font.md,
  },
  ratingLaterBtn: {
    marginTop: T.spacing.md,
    paddingVertical: T.spacing.sm,
    alignItems: 'center',
  },
  ratingLaterText: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    fontWeight: '500',
  },

  // Section
  section: {
    backgroundColor: T.colors.surface,
    marginTop: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.lg,
  },
  sectionTitle: {
    fontSize: T.font.lg,
    fontWeight: '600',
    color: T.colors.text,
    marginBottom: T.spacing.md,
  },

  // Detail Row
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: T.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: T.colors.divider,
  },
  detailIcon: {
    width: 28,
  },
  detailIconText: {
    fontSize: 16,
  },
  detailLabel: {
    flex: 1,
    fontSize: T.font.md,
    color: T.colors.textSecondary,
  },
  detailValue: {
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.text,
  },

  // Collapsible
  collapsibleSection: {
    backgroundColor: T.colors.surface,
    marginTop: T.spacing.sm,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.lg,
  },
  collapsibleTitle: {
    fontSize: T.font.md,
    fontWeight: '600',
    color: T.colors.text,
  },
  collapsibleContent: {
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.lg,
  },
  descriptionText: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    lineHeight: 22,
  },

  // Location
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  locationText: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
  },

  // Buyer Info
  buyerInfo: {
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.xl,
  },
  buyerInfoText: {
    fontSize: T.font.sm,
    color: T.colors.textMuted,
    textAlign: 'center',
  },

  // Offer Sent Section (for sellers)
  offerSentSection: {
    backgroundColor: T.colors.successSoft,
    marginTop: T.spacing.sm,
    marginHorizontal: T.spacing.lg,
    borderRadius: T.radius.md,
    padding: T.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offerSentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.md,
  },
  offerSentText: {
    gap: 2,
  },
  offerSentTitle: {
    fontSize: T.font.md,
    fontWeight: '600',
    color: T.colors.success,
  },
  offerSentSubtitle: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
  },
  acceptedBadge: {
    backgroundColor: T.colors.successSoft,
    paddingHorizontal: T.spacing.md,
    paddingVertical: T.spacing.xs,
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: T.colors.success,
  },
  acceptedBadgeText: {
    fontSize: T.font.xs,
    fontWeight: '700',
    color: T.colors.success,
  },

  // Offer Card (for buyer)
  offerCard: {
    backgroundColor: T.colors.bg,
    borderRadius: T.radius.md,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
  },
  offerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.spacing.md,
  },
  offerSellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
  },
  offerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerSeller: {
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.text,
  },
  offerTime: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
  },
  offerIntent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingVertical: T.spacing.md,
    paddingHorizontal: T.spacing.md,
    backgroundColor: T.colors.successSoft,
    borderRadius: T.radius.sm,
  },
  offerIntentText: {
    fontSize: T.font.md,
    color: T.colors.success,
    fontWeight: '500',
  },
  offerActions: {
    flexDirection: 'row',
    gap: T.spacing.md,
    marginTop: T.spacing.lg,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: T.colors.success,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.sm,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: T.font.md,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: T.colors.divider,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.sm,
    alignItems: 'center',
  },
  declineBtnText: {
    color: T.colors.textSecondary,
    fontWeight: '600',
    fontSize: T.font.md,
  },
  offerStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.xs,
    marginTop: T.spacing.md,
    justifyContent: 'center',
  },
  offerStatusText: {
    fontSize: T.font.sm,
    fontWeight: '600',
  },

  // Closed Banner
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.divider,
    marginHorizontal: T.spacing.lg,
    marginTop: T.spacing.md,
    padding: T.spacing.lg,
    borderRadius: T.radius.md,
    gap: T.spacing.md,
  },
  closedBannerText: {
    flex: 1,
    fontSize: T.font.md,
    color: T.colors.textSecondary,
  },

  // Fulfill Button
  fulfillmentHint: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
    textAlign: 'center',
    marginBottom: T.spacing.md,
  },
  fulfillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    backgroundColor: '#2563EB',
    paddingVertical: T.spacing.lg,
    borderRadius: T.radius.md,
  },
  fulfillBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: T.font.md,
  },
  closeRequestBtn: {
    paddingVertical: T.spacing.md,
    alignItems: 'center',
    marginTop: T.spacing.sm,
  },
  closeRequestBtnText: {
    color: T.colors.textMuted,
    fontSize: T.font.sm,
  },

  // Cancel Button (moved from inline style)
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: T.colors.error,
    paddingVertical: T.spacing.lg,
    borderRadius: T.radius.md,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: T.colors.error,
    fontWeight: '600',
    fontSize: T.font.md,
  },

  // Sticky CTA
  stickyCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: T.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : T.spacing.lg,
    backgroundColor: T.colors.surface,
    borderTopWidth: 1,
    borderTopColor: T.colors.divider,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    backgroundColor: T.colors.accent,
    paddingVertical: T.spacing.lg,
    borderRadius: T.radius.md,
  },
  primaryBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: T.font.lg,
    letterSpacing: 0.3,
  },
  offerSentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    backgroundColor: T.colors.successSoft,
    paddingVertical: T.spacing.lg,
    borderRadius: T.radius.md,
    borderWidth: 2,
    borderColor: T.colors.success,
  },
  offerSentBtnText: {
    color: T.colors.success,
    fontWeight: '700',
    fontSize: T.font.lg,
    letterSpacing: 0.3,
  },
});
