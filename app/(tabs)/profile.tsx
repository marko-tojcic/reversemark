import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { getUserRating } from '../../lib/ratings';
import { useAuth } from '../../lib/auth';
import { deleteAccountViaEdgeFunction } from '../../lib/deleteAccount';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [username, setUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Query to fetch user profile
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      setUsername(data.username || '');
      return data;
    },
    enabled: !!user,
  });

  const { data: trustStats } = useQuery({
    queryKey: ['userRating', user?.id],
    queryFn: () => getUserRating(user!.id),
    enabled: !!user,
  });

  // Update username mutation
  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      if (!user) throw new Error('User not authenticated');
      if (!newUsername.trim()) throw new Error('Username cannot be empty');
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ username: newUsername.trim() })
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setIsEditing(false);
      Alert.alert('Success', 'Username updated successfully');
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update username: ${(error as Error).message}`);
    },
  });

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/auth/sign-in');
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and marketplace data. You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              const { error } = await deleteAccountViaEdgeFunction();
              if (error) {
                Alert.alert(
                  'Could not delete account',
                  `${error.message}\n\nEnsure the delete-account Edge Function is deployed (see supabase/functions/delete-account) and your project URL is correct.`
                );
                return;
              }
              await signOut();
              queryClient.clear();
              router.replace('/auth/sign-in');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  // Handle save username
  const handleSaveUsername = () => {
    if (username.trim() && username !== profile?.username) {
      updateUsernameMutation.mutate(username);
    } else {
      setUsername(profile?.username || '');
      setIsEditing(false);
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async () => {
    if (!user) return;
    
    try {
      // Request permissions
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'We need camera roll permission to upload photos');
          return;
        }
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploading(true);
        
        const selectedImage = result.assets[0];
        
        // Create a unique filename
        const fileExt = selectedImage.uri.split('.').pop() || 'jpg';
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const contentType =
          fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';
        
        let uploadError: { message: string } | null = null;

        if (Platform.OS === 'web') {
          const response = await fetch(selectedImage.uri);
          const fileData = await response.blob();
          const { error } = await supabase.storage
            .from('avatars')
            .upload(fileName, fileData, { contentType, upsert: true });
          uploadError = error;
        } else {
          const b64 = selectedImage.base64;
          if (!b64) {
            throw new Error('Could not read image. Try another photo.');
          }
          const body = decode(b64);
          const { error } = await supabase.storage
            .from('avatars')
            .upload(fileName, body, { contentType, upsert: true });
          uploadError = error;
        }

        if (uploadError) throw uploadError;
        
        // Update the profile with the avatar path
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_path: fileName })
          .eq('id', user.id);

        if (updateError) throw updateError;
        
        // Refetch profile data
        refetch();
        Alert.alert('Success', 'Avatar updated successfully');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  // Get avatar URL
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  React.useEffect(() => {
    if (profile?.avatar_path) {
      const fetchAvatar = async () => {
        try {
          const { data } = await supabase.storage
            .from('avatars')
            .createSignedUrl(profile.avatar_path!, 3600);
          
          if (data?.signedUrl) {
            setAvatarUrl(data.signedUrl);
          }
        } catch (error) {
          console.error('Error fetching avatar:', error);
        }
      };
      
      fetchAvatar();
    }
  }, [profile?.avatar_path]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text>Please sign in to view your profile</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/auth/sign-in')}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Avatar section */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleAvatarUpload}
          disabled={isUploading}
        >
          {isUploading ? (
            <View style={styles.avatar}>
              <ActivityIndicator color="#007BFF" />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={50} color="#ccc" />
            </View>
          )}
          <View style={styles.editAvatarButton}>
            <Ionicons name="camera" size={16} color="white" />
          </View>
        </TouchableOpacity>
      </View>
      
      {/* User info section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user.email}</Text>
        </View>
        
        {trustStats != null && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Trust</Text>
            <Text style={styles.infoValue}>
              ⭐ {trustStats.total_reviews > 0 ? trustStats.average_rating.toFixed(1) : '—'} (
              {trustStats.total_reviews} {trustStats.total_reviews === 1 ? 'review' : 'reviews'})
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Username</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoFocus
            />
          ) : (
            <Text style={styles.infoValue}>{profile?.username || 'Not set'}</Text>
          )}
        </View>
        
        {isEditing ? (
          <View style={styles.editButtonsRow}>
            <TouchableOpacity
              style={[styles.editButton, styles.cancelButton]}
              onPress={() => {
                setUsername(profile?.username || '');
                setIsEditing(false);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.editButton, styles.saveButton]}
              onPress={handleSaveUsername}
              disabled={updateUsernameMutation.isPending}
            >
              {updateUsernameMutation.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.editUsernameButton}
            onPress={() => setIsEditing(true)}
          >
            <Text style={styles.editUsernameText}>Edit Username</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <TouchableOpacity
        style={styles.deleteAccountButton}
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount}
      >
        {isDeletingAccount ? (
          <ActivityIndicator color="#dc3545" />
        ) : (
          <Text style={styles.deleteAccountButtonText}>Delete account</Text>
        )}
      </TouchableOpacity>

      {/* Sign out button */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
      >
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  button: {
    backgroundColor: '#007BFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007BFF',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 8,
    fontSize: 16,
  },
  editButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 5,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#007BFF',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  editUsernameButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  editUsernameText: {
    color: '#007BFF',
    fontWeight: '500',
  },
  deleteAccountButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 5,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteAccountButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 5,
    padding: 16,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '500',
  },
});
