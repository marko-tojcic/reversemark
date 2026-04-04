import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '../../constants/theme';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';

export default function TabLayout() {
  return (
    <View style={styles.root}>
      <EmailVerificationBanner />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: Spacing.sm,
          paddingTop: Spacing.sm,
        },
        tabBarLabelStyle: {
          fontSize: FontSizes.xs,
          fontWeight: FontWeights.medium,
        },
        tabBarIconStyle: {
          marginBottom: -Spacing.xs,
        },
        headerStyle: {
          backgroundColor: Colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTitleStyle: {
          fontWeight: FontWeights.bold,
          fontSize: FontSizes.lg,
          color: Colors.textPrimary,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'home' : 'home-outline'} 
              size={24} 
              color={color} 
            />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Find',
          headerTitle: 'Find Requests',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'compass' : 'compass-outline'} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Sell',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'add-circle' : 'add-circle-outline'} 
              size={32} 
              color={Colors.primary}
            />
          ),
          tabBarLabel: () => null,
          headerTitle: 'Create Request',
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'person' : 'person-outline'} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});