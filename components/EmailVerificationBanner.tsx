import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { isEmailVerified } from '../lib/emailVerification';
import { Colors, Spacing, FontSizes, FontWeights } from '../constants/theme';

export function EmailVerificationBanner() {
  const { user, resendSignupVerification } = useAuth();
  const [sending, setSending] = useState(false);

  if (!user || isEmailVerified(user)) {
    return null;
  }

  const onResend = async () => {
    setSending(true);
    try {
      const { error } = await resendSignupVerification();
      if (error) {
        Alert.alert('Could not send', error.message);
      } else {
        Alert.alert('Check your inbox', 'We sent another confirmation email.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Ionicons name="mail-unread-outline" size={20} color="#92400E" style={styles.icon} />
      <View style={styles.textCol}>
        <Text style={styles.title}>Please verify your email to use the marketplace.</Text>
        <Text style={styles.sub}>
          Create requests, send offers, and message others after you confirm your address.
        </Text>
        <TouchableOpacity
          onPress={onResend}
          disabled={sending}
          style={styles.resendBtn}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#B45309" />
          ) : (
            <Text style={styles.resendText}>Resend confirmation email</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    ...(Platform.OS === 'web' ? ({ zIndex: 10 } as const) : null),
  },
  icon: { marginTop: 2 },
  textCol: { flex: 1 },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#92400E',
  },
  sub: {
    fontSize: FontSizes.xs,
    color: '#B45309',
    marginTop: 4,
    lineHeight: 18,
  },
  resendBtn: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  resendText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: '#B45309',
    textDecorationLine: 'underline',
  },
});
