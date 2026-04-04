import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing, FontSizes, FontWeights } from '../../constants/theme';

interface TagProps {
  label: string;
  variant?: 'primary' | 'neutral' | 'success';
  style?: ViewStyle;
}

export const Tag: React.FC<TagProps> = ({ label, variant = 'neutral', style }) => {
  return (
    <View style={[styles.tag, styles[variant], style]}>
      <Text style={[styles.text, styles[`text_${variant}`]]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  primary: {
    backgroundColor: Colors.primaryLight,
  },
  neutral: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  success: {
    backgroundColor: '#E6F7ED',
  },
  text: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
  },
  text_primary: {
    color: Colors.primary,
  },
  text_neutral: {
    color: Colors.textSecondary,
  },
  text_success: {
    color: Colors.success,
  },
});
