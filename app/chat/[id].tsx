import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { requireEmailVerified } from '../../lib/guards';
import { notifyNewMessage } from '../../lib/pushEvents';
import { format } from 'date-fns/format';
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
    bubbleUser: '#007AFF',
    bubbleOther: '#F3F4F6',
    border: '#E5E7EB',
    divider: '#F3F4F6',
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
    lg: 16,
    full: 9999,
  },
  font: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
  },
};

// ============================================
// MESSAGE BUBBLE
// ============================================
interface MessageBubbleProps {
  message: {
    id: string;
    body: string;
    created_at: string;
    sender_id: string;
  };
  isFromCurrentUser: boolean;
}

const MessageBubble = ({ message, isFromCurrentUser }: MessageBubbleProps) => (
  <View style={[
    styles.bubbleContainer,
    isFromCurrentUser ? styles.bubbleContainerRight : styles.bubbleContainerLeft
  ]}>
    <View style={[
      styles.bubble,
      isFromCurrentUser ? styles.bubbleUser : styles.bubbleOther
    ]}>
      <Text style={[
        styles.bubbleText,
        isFromCurrentUser ? styles.bubbleTextUser : styles.bubbleTextOther
      ]}>
        {message.body}
      </Text>
    </View>
    <Text style={styles.bubbleTime}>
      {format(new Date(message.created_at), 'HH:mm')}
    </Text>
  </View>
);

// ============================================
// MAIN CHAT SCREEN
// ============================================
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Fetch conversation details (including request status)
  const { data: conversation, isLoading: loadingConv } = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          request:request_id(id, title, status),
          buyer:buyer_id(username),
          seller:seller_id(username)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  // Check if chat is read-only (request is closed/fulfilled/expired)
  const isChatReadOnly = conversation?.request?.status && 
    ['FULFILLED', 'CLOSED', 'EXPIRED', 'COMPLETED', 'CANCELED'].includes(conversation.request.status);

  // Fetch messages
  const { data: messages, isLoading: loadingMsgs, refetch } = useQuery({
    queryKey: ['messages', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!id,
  });

  // Scroll to bottom
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, () => refetch())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [id, refetch]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user || !text.trim()) throw new Error('Invalid');
      
      const { error: msgError } = await supabase
        .from('messages')
        .insert([{ conversation_id: id, sender_id: user.id, body: text.trim() }]);
      if (msgError) throw msgError;

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', id);
    },
    onSuccess: () => {
      if (id) notifyNewMessage(String(id));
      setMessage('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    if (!requireEmailVerified(user)) return;
    sendMutation.mutate(message);
  };

  // Get other user's name
  const otherUserName = conversation
    ? (user?.id === conversation.buyer_id 
        ? (conversation.seller as any)?.username 
        : (conversation.buyer as any)?.username)
    : '';

  // Loading
  if (loadingConv || loadingMsgs) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.colors.accent} />
        </View>
      </>
    );
  }

  // Not found
  if (!conversation) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Conversation not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={T.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Chat with {otherUserName}
            </Text>
            <Text style={styles.headerSubtitle}>
              {(conversation.request?.status as string) === 'IN_PROGRESS'
                ? 'Transaction in progress'
                : ['FULFILLED', 'COMPLETED'].includes((conversation.request?.status as string) || '')
                  ? 'Completed'
                  : 'Active chat'}
            </Text>
          </View>
        </View>

        {/* Request Card Link */}
        {conversation.request && (
          <TouchableOpacity 
            style={styles.requestCard}
            onPress={() => router.push(`/requests/${conversation.request.id}`)}
            activeOpacity={0.8}
          >
            <View style={styles.requestCardIcon}>
              <Ionicons name="document-text-outline" size={20} color={T.colors.accent} />
            </View>
            <View style={styles.requestCardContent}>
              <Text style={styles.requestCardTitle} numberOfLines={1}>
                {conversation.request.title}
              </Text>
              <Text style={styles.requestCardHint}>Tap to view request details</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.chatArea}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isFromCurrentUser={item.sender_id === user?.id}
              />
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={48} color={T.colors.textMuted} />
                <Text style={styles.emptyChatText}>Start the conversation</Text>
              </View>
            }
          />

          {/* Input or Read-Only Banner */}
          {isChatReadOnly ? (
            <View style={styles.readOnlyBanner}>
              <Ionicons name="lock-closed-outline" size={16} color={T.colors.textMuted} />
              <Text style={styles.readOnlyText}>
                This chat is read-only. The request has been {conversation?.request?.status?.toLowerCase()}.
              </Text>
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor={T.colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!message.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="send" size={18} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
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
    marginBottom: T.spacing.lg,
  },
  backBtn: {
    paddingVertical: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    backgroundColor: T.colors.accent,
    borderRadius: T.radius.sm,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.md,
    backgroundColor: T.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.colors.border,
    gap: T.spacing.md,
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: T.colors.divider,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: T.font.lg,
    fontWeight: '600',
    color: T.colors.text,
  },
  headerSubtitle: {
    fontSize: T.font.sm,
    color: T.colors.textSecondary,
    marginTop: 2,
  },

  // Chat Area
  chatArea: {
    flex: 1,
  },
  messagesList: {
    padding: T.spacing.lg,
    paddingBottom: T.spacing.xl,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyChatText: {
    fontSize: T.font.md,
    color: T.colors.textMuted,
    marginTop: T.spacing.md,
  },

  // Message Bubble
  bubbleContainer: {
    marginVertical: T.spacing.xs,
    maxWidth: '80%',
  },
  bubbleContainerRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleContainerLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.lg,
  },
  bubbleUser: {
    backgroundColor: T.colors.bubbleUser,
    borderBottomRightRadius: T.spacing.xs,
  },
  bubbleOther: {
    backgroundColor: T.colors.bubbleOther,
    borderBottomLeftRadius: T.spacing.xs,
  },
  bubbleText: {
    fontSize: T.font.md,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#FFF',
  },
  bubbleTextOther: {
    color: T.colors.text,
  },
  bubbleTime: {
    fontSize: T.font.xs,
    color: T.colors.textMuted,
    marginTop: T.spacing.xs,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: T.spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : T.spacing.md,
    backgroundColor: T.colors.surface,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    gap: T.spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: T.colors.bg,
    borderRadius: T.radius.full,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md,
    fontSize: T.font.md,
    color: T.colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },

  // Read-only Banner
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: T.spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : T.spacing.lg,
    backgroundColor: T.colors.divider,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    gap: T.spacing.sm,
  },
  readOnlyText: {
    flex: 1,
    fontSize: T.font.sm,
    color: T.colors.textMuted,
  },

  // Request Card Link
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.accentSoft,
    marginHorizontal: T.spacing.lg,
    marginTop: T.spacing.md,
    padding: T.spacing.md,
    borderRadius: T.radius.md,
    gap: T.spacing.md,
  },
  requestCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestCardContent: {
    flex: 1,
  },
  requestCardTitle: {
    fontSize: T.font.md,
    fontWeight: '600',
    color: T.colors.text,
  },
  requestCardHint: {
    fontSize: T.font.xs,
    color: T.colors.accent,
    marginTop: 2,
  },
});
