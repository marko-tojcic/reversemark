import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
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
    border: '#E5E7EB',
    divider: '#F3F4F6',
    success: '#10B981',
    warning: '#F59E0B',
    notifBg: '#FFF7ED',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  radius: {
    sm: 8,
    md: 12,
    full: 9999,
  },
  font: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    title: 18,
  },
};

type TabType = 'notifications' | 'messages';

// ============================================
// NOTIFICATION ITEM
// ============================================
interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    reference_id: string | null;
    read: boolean;
    created_at: string;
    action_url: string | null;
  };
  onPress: () => void;
  onExtend?: () => void;
}

const NotificationItem = ({ notification, onPress, onExtend }: NotificationItemProps) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'NEW_REQUEST_MATCH':
        return { name: 'compass', color: T.colors.accent };
      case 'NEW_OFFER_RECEIVED':
        return { name: 'checkmark-circle', color: T.colors.success };
      case 'REQUEST_EXPIRING':
        return { name: 'time', color: T.colors.warning };
      default:
        return { name: 'notifications', color: T.colors.textMuted };
    }
  };

  const icon = getIcon();

  return (
    <TouchableOpacity 
      style={[styles.notifItem, !notification.read && styles.notifItemUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Icon */}
      <View style={[styles.notifIcon, { backgroundColor: icon.color + '20' }]}>
        <Ionicons name={icon.name as any} size={20} color={icon.color} />
      </View>

      {/* Content */}
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]}>
          {notification.title}
        </Text>
        <Text style={styles.notifBody} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.notifTime}>
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </Text>

        {/* Extend button for expiring notifications */}
        {notification.type === 'REQUEST_EXPIRING' && onExtend && (
          <TouchableOpacity 
            style={styles.extendBtn}
            onPress={(e) => {
              e.stopPropagation();
              onExtend();
            }}
          >
            <Ionicons name="add-circle-outline" size={14} color={T.colors.accent} />
            <Text style={styles.extendBtnText}>Extend by 7 days</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unread indicator */}
      {!notification.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
};

// ============================================
// CONVERSATION ITEM
// ============================================
interface ConversationItemProps {
  conversation: any;
  userId: string;
  onPress: () => void;
}

const ConversationItem = ({ conversation, userId, onPress }: ConversationItemProps) => {
  const isBuyer = userId === conversation.buyer_id;
  const otherUser = isBuyer ? conversation.seller : conversation.buyer;
  const otherUserName = otherUser?.username || 'User';
  const requestTitle = conversation.request?.title || 'Request';
  const lastMessage = conversation.last_message;
  const isLastFromMe = lastMessage?.sender_id === userId;

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{otherUserName.charAt(0).toUpperCase()}</Text>
      </View>

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>{requestTitle}</Text>
          {lastMessage && (
            <Text style={styles.itemTime}>
              {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true }).replace('about ', '')}
            </Text>
          )}
        </View>
        <Text style={styles.itemSubtitle}>with {otherUserName}</Text>
        {lastMessage ? (
          <Text style={styles.itemPreview} numberOfLines={1}>
            {isLastFromMe && <Text style={styles.youPrefix}>You: </Text>}
            {lastMessage.body}
          </Text>
        ) : (
          <Text style={styles.itemPreviewEmpty}>Start chatting →</Text>
        )}
      </View>
      
      {/* Unread indicator */}
      {!isLastFromMe && lastMessage && (
        <View style={styles.unreadDot} />
      )}
    </TouchableOpacity>
  );
};

// ============================================
// MAIN SCREEN
// ============================================
export default function InboxScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('notifications');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ============================================
  // NOTIFICATIONS QUERY
  // ============================================
  const { 
    data: notifications, 
    isLoading: loadingNotifs, 
    refetch: refetchNotifs 
  } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // ============================================
  // CONVERSATIONS QUERY
  // ============================================
  const { 
    data: conversations, 
    isLoading: loadingConvs, 
    refetch: refetchConvs 
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          request:request_id(id, title),
          buyer:buyer_id(username),
          seller:seller_id(username)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch last message for each
      const withMessages = await Promise.all(
        (data || []).map(async (conv) => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('body, created_at, sender_id')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          return { ...conv, last_message: lastMsg || null };
        })
      );

      return withMessages;
    },
    enabled: !!user,
  });

  // ============================================
  // MARK NOTIFICATION AS READ
  // ============================================
  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notifId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // ============================================
  // EXTEND REQUEST MUTATION
  // ============================================
  const extendMutation = useMutation({
    mutationFn: async (requestId: string) => {
      // @ts-ignore - Custom function
      const { data, error } = await supabase.rpc('extend_request', { 
        request_id: requestId 
      });
      if (error) throw error;
      if (!data) throw new Error('Could not extend request');
      return data;
    },
    onSuccess: () => {
      Alert.alert('Extended!', 'Your request has been extended by 7 days.');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['buyerRequests'] });
      queryClient.invalidateQueries({ queryKey: ['userActivity'] });
    },
    onError: (error) => {
      Alert.alert('Error', (error as Error).message);
    },
  });

  // ============================================
  // REALTIME SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    if (!user) return;

    // Subscribe to new notifications
    const notifChannel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => refetchNotifs())
      .subscribe();

    // Subscribe to new messages
    const msgChannel = supabase
      .channel('inbox-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => refetchConvs())
      .subscribe();

    return () => {
      notifChannel.unsubscribe();
      msgChannel.unsubscribe();
    };
  }, [user, refetchNotifs, refetchConvs]);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'notifications') refetchNotifs();
      else refetchConvs();
    }, [activeTab, refetchNotifs, refetchConvs])
  );

  // ============================================
  // HANDLERS
  // ============================================
  const handleNotificationPress = (notif: any) => {
    // Mark as read
    if (!notif.read) {
      markReadMutation.mutate(notif.id);
    }

    // Navigate to action
    if (notif.action_url) {
      router.push(notif.action_url);
    }
  };

  const handleExtendRequest = (requestId: string) => {
    Alert.alert(
      'Extend Request?',
      'This will extend your request by 7 more days.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Extend', onPress: () => extendMutation.mutate(requestId) },
      ]
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (activeTab === 'notifications') await refetchNotifs();
    else await refetchConvs();
    setIsRefreshing(false);
  };

  // ============================================
  // COUNTS
  // ============================================
  const unreadNotifCount = notifications?.filter(n => !n.read).length || 0;

  // ============================================
  // LOADING STATE
  // ============================================
  const isLoading = activeTab === 'notifications' ? loadingNotifs : loadingConvs;

  if (isLoading && !notifications && !conversations) {
        return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inbox</Text>
        </View>
          <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.colors.accent} />
        </View>
          </View>
        );
      }

        return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inbox</Text>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'notifications' && styles.tabActive]}
            onPress={() => setActiveTab('notifications')}
          >
            <Ionicons 
              name="notifications-outline" 
              size={16} 
              color={activeTab === 'notifications' ? T.colors.accent : T.colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>
              Notifications
            </Text>
            {unreadNotifCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadNotifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
            onPress={() => setActiveTab('messages')}
          >
            <Ionicons 
              name="chatbubbles-outline" 
              size={16} 
              color={activeTab === 'messages' ? T.colors.accent : T.colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>
              Messages
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <FlatList
          data={notifications || []}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onPress={() => handleNotificationPress(item)}
              onExtend={item.type === 'REQUEST_EXPIRING' && item.reference_id 
                ? () => handleExtendRequest(item.reference_id!) 
                : undefined}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={T.colors.textMuted}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={64} color={T.colors.textMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>
                You'll be notified when someone can fulfill your request
            </Text>
          </View>
      }
        />
      )}

      {/* Messages Tab */}
      {activeTab === 'messages' && (
        <FlatList
          data={conversations || []}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              userId={user?.id || ''}
              onPress={() => router.push(`/chat/${item.id}`)}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={T.colors.textMuted}
            />
          }
          ListEmptyComponent={
          <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={64} color={T.colors.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
                When a buyer accepts your offer, you can chat here
            </Text>
          </View>
          }
        />
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
    padding: T.spacing.xl,
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
  tabBadge: {
    backgroundColor: T.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 2,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },

  // List
  listContent: {
    paddingBottom: 100,
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: T.colors.divider,
    marginLeft: 72,
  },

  // Notification Item
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: T.spacing.lg,
    backgroundColor: T.colors.surface,
    gap: T.spacing.md,
  },
  notifItemUnread: {
    backgroundColor: T.colors.notifBg,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: T.font.md,
    fontWeight: '500',
    color: T.colors.text,
    lineHeight: 20,
  },
  notifTitleUnread: {
    fontWeight: '600',
  },
  notifBody: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
    marginTop: T.spacing.xs,
  },
  extendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.xs,
    marginTop: T.spacing.sm,
    paddingVertical: T.spacing.xs,
    paddingHorizontal: T.spacing.sm,
    backgroundColor: '#EBF5FF',
    borderRadius: T.radius.sm,
    alignSelf: 'flex-start',
  },
  extendBtnText: {
    fontSize: T.font.sm,
    fontWeight: '600',
    color: T.colors.accent,
  },

  // Conversation Item
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: T.spacing.lg,
    backgroundColor: T.colors.surface,
    gap: T.spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: T.font.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: T.spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: T.font.md,
    fontWeight: '600',
    color: T.colors.text,
  },
  itemTime: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
  },
  itemSubtitle: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
  },
  itemPreview: {
    fontSize: T.font.sm,
    color: T.colors.textMuted,
    marginTop: 2,
  },
  itemPreviewEmpty: {
    fontSize: T.font.sm,
    color: T.colors.accent,
    marginTop: 2,
  },
  youPrefix: {
    color: T.colors.textSecondary,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: T.colors.accent,
  },

  // Empty state
  emptyTitle: {
    fontSize: T.font.lg,
    fontWeight: '600',
    color: T.colors.text,
    marginTop: T.spacing.lg,
  },
  emptySubtitle: {
    fontSize: T.font.md,
    color: T.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: T.spacing.sm,
  },
});
