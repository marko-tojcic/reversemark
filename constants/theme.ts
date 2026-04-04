// Design system constants inspired by Vinted

export const Colors = {
  // Primary
  primary: '#09B1BA', // Soft teal/green
  primaryDark: '#078C93',
  primaryLight: '#E6F7F8',
  
  // Neutrals
  background: '#F8F9FA',
  surface: '#FFFFFF',
  border: '#E8ECED',
  
  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#6C757D',
  textMuted: '#ADB5BD',
  
  // Semantic
  success: '#28A745',
  warning: '#FFC107',
  error: '#DC3545',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  
  // Chat
  chatBubbleUser: '#09B1BA',
  chatBubbleOther: '#F0F2F5',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
};

export const Layout = {
  maxWidth: 720,
  cardPadding: Spacing.lg,
  screenPadding: Spacing.lg,
};