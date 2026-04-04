import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  ActivityIndicator,
  Image,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { geoPointToPostgis, GeoPoint } from '../../types/supabase';
import { Colors, Spacing, FontSizes, FontWeights, BorderRadius, Shadows } from '../../constants/theme';
import { Card } from '../../components/ui/Card';
import { requireEmailVerified } from '../../lib/guards';

// ============================================
// TYPES & CONSTANTS
// ============================================

type CategoryType = 'clothing' | 'cosmetics';

// Clothing options
const CLOTHING_ITEM_TYPES = ['T-shirt', 'Hoodie', 'Jeans', 'Jacket', 'Dress', 'Sweater', 'Shorts', 'Skirt', 'Coat', 'Other'];
const CLOTHING_SIZES_TOPS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CLOTHING_SIZES_BOTTOMS = ['26', '28', '30', '32', '34', '36', '38', '40', 'W28/L30', 'W30/L32', 'W32/L32', 'W34/L32', 'Other'];
const CLOTHING_SIZES_SHOES = ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45', 'EU 46', 'US 6', 'US 7', 'US 8', 'US 9', 'US 10', 'US 11', 'US 12', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
const CLOTHING_CONDITIONS = ['New with tags', 'New without tags', 'Used – like new', 'Used – good'];
const CLOTHING_COLORS = ['Any', 'Black', 'White', 'Gray', 'Navy', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Pink', 'Other'];
const DELIVERY_METHODS = ['Shipping', 'Local pickup', 'Both'];

// Cosmetics options
const COSMETICS_PRODUCT_TYPES = ['Foundation', 'Lipstick', 'Mascara', 'Eyeshadow', 'Skincare', 'Fragrance', 'Concealer', 'Blush', 'Bronzer', 'Primer', 'Setting spray', 'Other'];
const COSMETICS_CONDITIONS = ['Brand new, sealed'];
const COSMETICS_AUTHENTICITY = ['Authentic only'];

// Form data types
interface ClothingFormData {
  itemType: string;
  brand: string;
  size: string;
  condition: string;
  color: string;
  city: string;
  country: string;
  deliveryMethod: string;
  maxBudget: string;
}

interface CosmeticsFormData {
  productType: string;
  brand: string;
  productName: string;
  shadeVariant: string;
  condition: string;
  authenticity: string;
  city: string;
  country: string;
  maxBudget: string;
}

// ============================================
// SELECT OPTION COMPONENT
// ============================================

interface SelectOptionProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SelectOption = ({ label, options, value, onChange, placeholder }: SelectOptionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity 
        style={styles.selectButton}
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text style={[styles.selectButtonText, !value && styles.selectPlaceholder]}>
          {value || placeholder || `Select ${label.toLowerCase()}`}
        </Text>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={Colors.textMuted} />
      </TouchableOpacity>
      
      {isOpen && (
        <View style={styles.optionsContainer}>
          <ScrollView style={styles.optionsScroll} nestedScrollEnabled>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.optionItem, value === option && styles.optionItemSelected]}
                onPress={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                <Text style={[styles.optionText, value === option && styles.optionTextSelected]}>
                  {option}
                </Text>
                {value === option && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function SellScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 1 state
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  
  // Step 2 - Clothing form
  const [clothingForm, setClothingForm] = useState<ClothingFormData>({
    itemType: '',
    brand: '',
    size: '',
    condition: '',
    color: 'Any',
    city: '',
    country: '',
    deliveryMethod: '',
    maxBudget: '',
  });
  
  // Step 2 - Cosmetics form
  const [cosmeticsForm, setCosmeticsForm] = useState<CosmeticsFormData>({
    productType: '',
    brand: '',
    productName: '',
    shadeVariant: '',
    condition: 'Brand new, sealed',
    authenticity: 'Authentic only',
    city: '',
    country: '',
    maxBudget: '',
  });
  
  // Location state
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  // Fetch categories to get IDs
  const { data: categories } = useQuery({
    queryKey: ['categories-posting'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or('name.ilike.%clothing%,name.ilike.%cosmetics%');
      if (error) throw error;
      return data || [];
    },
  });

  // Get user's GPS location (for geopoint)
  useEffect(() => {
    const getLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch (error) {
        console.error('Error getting location:', error);
      }
    };
    getLocation();
  }, []);

  // Fetch current location and reverse geocode to get city/country
  const useCurrentLocation = async (formType: 'clothing' | 'cosmetics') => {
    setIsFetchingLocation(true);
    console.log('Starting location fetch...');
    
    try {
      // For web platform, use browser's geolocation API
      if (Platform.OS === 'web') {
        console.log('Using web geolocation...');
        
        if (!navigator.geolocation) {
          Alert.alert('Not supported', 'Geolocation is not supported by your browser');
          setIsFetchingLocation(false);
          return;
        }
        
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            console.log('Web location received:', position.coords);
            const { latitude, longitude } = position.coords;
            
            setLocation({ latitude, longitude });
            
            // Use reverse geocoding API
            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
              );
              const data = await response.json();
              console.log('Geocode result:', data);
              
              const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
              const country = data.address?.country || '';
              
              if (formType === 'clothing') {
                setClothingForm(prev => ({ ...prev, city, country }));
              } else {
                setCosmeticsForm(prev => ({ ...prev, city, country }));
              }
            } catch (geoError) {
              console.error('Geocoding error:', geoError);
              Alert.alert('Note', 'Got location but could not determine city. Please enter manually.');
            }
            
            setIsFetchingLocation(false);
          },
          (error) => {
            console.error('Web geolocation error:', error);
            Alert.alert('Location Error', error.message || 'Failed to get location');
            setIsFetchingLocation(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
        return;
      }
      
      // For native platforms (iOS/Android)
      console.log('Using native location...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need location permission to auto-fill your address');
        setIsFetchingLocation(false);
        return;
      }

      // Try to get last known position first (instant)
      let loc = await Location.getLastKnownPositionAsync({});
      console.log('Last known position:', loc);
      
      // If no cached position, get current with timeout
      if (!loc) {
        console.log('Getting current position...');
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
        });
        console.log('Current position:', loc);
      }

      if (!loc) {
        Alert.alert('Location Error', 'Could not get your location. Please enter manually.');
        setIsFetchingLocation(false);
        return;
      }
      
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      // Reverse geocode to get address
      console.log('Reverse geocoding...');
      const addresses = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      console.log('Addresses:', addresses);

      if (addresses && addresses.length > 0) {
        const address = addresses[0];
        const city = address.city || address.subregion || address.district || address.region || '';
        const country = address.country || '';
        
        if (formType === 'clothing') {
          setClothingForm(prev => ({ ...prev, city, country }));
        } else {
          setCosmeticsForm(prev => ({ ...prev, city, country }));
        }
        
        if (!city && !country) {
          Alert.alert('Note', 'Could not determine city/country. Please enter manually.');
        }
      } else {
        Alert.alert('Location Error', 'Could not determine your address. Please enter manually.');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Location Error', 'Failed to get your location. Please enter manually.');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // Pick photo
  const pickImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'We need camera roll permission to upload photos');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  // Generate title from form data
  const generateTitle = (): string => {
    if (selectedCategory === 'clothing') {
      const parts = [clothingForm.brand, clothingForm.itemType, clothingForm.size].filter(Boolean);
      return parts.join(' ') || 'Clothing Request';
    } else {
      const parts = [cosmeticsForm.brand, cosmeticsForm.productName].filter(Boolean);
      return parts.join(' ') || 'Cosmetics Request';
    }
  };

  // Generate description from form data
  const generateDescription = (): string => {
    if (selectedCategory === 'clothing') {
      return `Looking for: ${clothingForm.itemType}\nBrand: ${clothingForm.brand}\nSize: ${clothingForm.size}\nCondition: ${clothingForm.condition}\nColor: ${clothingForm.color}\nDelivery: ${clothingForm.deliveryMethod}`;
    } else {
      return `Looking for: ${cosmeticsForm.productType}\nBrand: ${cosmeticsForm.brand}\nProduct: ${cosmeticsForm.productName}\nShade/Variant: ${cosmeticsForm.shadeVariant}\nCondition: ${cosmeticsForm.condition}\nAuthenticity: ${cosmeticsForm.authenticity}`;
    }
  };

  // Submit mutation
  const createRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      if (!selectedCategory) throw new Error('Category not selected');
      
      const categoryId = categories?.find(c => 
        c.name.toLowerCase().includes(selectedCategory)
      )?.id;
      
      if (!categoryId) throw new Error('Category not found');

      const form = selectedCategory === 'clothing' ? clothingForm : cosmeticsForm;
      const maxBudget = parseFloat(form.maxBudget);
      
      if (isNaN(maxBudget) || maxBudget <= 0) {
        throw new Error('Please enter a valid budget');
      }

      // Create location point (use default if not available)
      const locationPoint = location || { latitude: 0, longitude: 0 };
      const locationText = `${form.city}, ${form.country}`;

      // Build metadata object for structured data
      const metadata = selectedCategory === 'clothing' 
        ? {
            category: 'clothing',
            itemType: clothingForm.itemType,
            brand: clothingForm.brand,
            size: clothingForm.size,
            condition: clothingForm.condition,
            color: clothingForm.color,
            deliveryMethod: clothingForm.deliveryMethod,
          }
        : {
            category: 'cosmetics',
            productType: cosmeticsForm.productType,
            brand: cosmeticsForm.brand,
            productName: cosmeticsForm.productName,
            shadeVariant: cosmeticsForm.shadeVariant,
            condition: cosmeticsForm.condition,
            authenticity: cosmeticsForm.authenticity,
          };

      // Create buyer request
      const { data: requestData, error: requestError } = await supabase
        .from('buyer_requests')
        .insert([{
          buyer_id: user.id,
          title: generateTitle(),
          description: generateDescription(),
          category_id: categoryId,
          condition_text: selectedCategory === 'clothing' ? clothingForm.condition : cosmeticsForm.condition,
          budget_min_eur: 0,
          budget_max_eur: maxBudget,
          location_text: locationText,
          location: geoPointToPostgis(locationPoint),
          status: 'OPEN',
        }])
        .select()
        .single();

      if (requestError) throw requestError;

      // Upload photo if exists
      if (photo) {
        const fileExt = photo.uri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `${requestData.id}/${fileName}`;
        
        // Determine content type
        const contentType = fileExt === 'png' ? 'image/png' : 
                           fileExt === 'gif' ? 'image/gif' : 
                           fileExt === 'webp' ? 'image/webp' : 'image/jpeg';
        
        let uploadError;
        
        if (Platform.OS === 'web') {
          // For web, use fetch and blob
          const response = await fetch(photo.uri);
          const fileData = await response.blob();
          
          const { error } = await supabase.storage
            .from('request_photos')
            .upload(filePath, fileData, { contentType });
          uploadError = error;
        } else {
          // Native: use base64 from ImagePicker (avoids expo-file-system/legacy + FilePermissionService issues in release APKs)
          const b64 = photo.base64;
          if (!b64) {
            throw new Error('Could not read image. Try another photo.');
          }
          const arrayBuffer = decode(b64);
          const { error } = await supabase.storage
            .from('request_photos')
            .upload(filePath, arrayBuffer, { contentType });
          uploadError = error;
        }

        if (!uploadError) {
          await supabase
            .from('buyer_request_photos')
            .insert([{ request_id: requestData.id, storage_path: filePath, sort_order: 0 }]);
        } else {
          console.error('Photo upload error:', uploadError);
        }
      }
      
      return requestData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyerRequests'] });
      queryClient.invalidateQueries({ queryKey: ['discoveryRequests'] });
      
      // Reset form
      resetForm();
      
      // Show success message and redirect to home
      Alert.alert(
        '🎉 Request Posted!', 
        'Your request has been published. Sellers can now see it and make offers.',
        [
          { 
            text: 'Go to Home', 
            onPress: () => router.replace('/(tabs)/home')
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert('Error', (error as Error).message);
    },
  });

  const resetForm = () => {
    setCurrentStep(1);
    setPhoto(null);
    setSelectedCategory(null);
    setClothingForm({
      itemType: '', brand: '', size: '', condition: '', color: 'Any',
      city: '', country: '', deliveryMethod: '', maxBudget: '',
    });
    setCosmeticsForm({
      productType: '', brand: '', productName: '', shadeVariant: '',
      condition: 'Brand new, sealed', authenticity: 'Authentic only',
      city: '', country: '', maxBudget: '',
    });
  };

  // Validation
  const canProceedStep1 = selectedCategory !== null;
  
  const canProceedStep2 = () => {
    if (selectedCategory === 'clothing') {
      return clothingForm.itemType && clothingForm.brand && clothingForm.size && 
             clothingForm.condition && clothingForm.city && clothingForm.country && 
             clothingForm.deliveryMethod && clothingForm.maxBudget;
    } else {
      return cosmeticsForm.productType && cosmeticsForm.brand && cosmeticsForm.productName && 
             cosmeticsForm.shadeVariant && cosmeticsForm.city && cosmeticsForm.country && 
             cosmeticsForm.maxBudget;
    }
  };

  const handleSubmit = () => {
    if (!requireEmailVerified(user)) return;
    setIsSubmitting(true);
    createRequestMutation.mutate();
    setIsSubmitting(false);
  };

  // ============================================
  // RENDER STEP 1: Photo + Category Selection
  // ============================================
  const renderStep1 = () => (
    <ScrollView style={styles.stepContainer} contentContainerStyle={styles.stepContent}>
      <Text style={styles.stepTitle}>What are you looking for?</Text>
      <Text style={styles.stepSubtitle}>Add a photo and select a category</Text>
      
      {/* Photo Upload */}
      <Card style={styles.photoCard}>
        <Text style={styles.sectionTitle}>Photo (optional)</Text>
        <Text style={styles.helperText}>Help sellers understand what you want</Text>
        
        {photo ? (
          <View style={styles.photoPreviewContainer}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhoto(null)}>
              <Ionicons name="close-circle" size={28} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoUploadArea} onPress={pickImage}>
            <Ionicons name="camera-outline" size={48} color={Colors.primary} />
            <Text style={styles.photoUploadText}>Tap to add photo</Text>
          </TouchableOpacity>
        )}
      </Card>

      {/* Category Selection */}
      <Card style={styles.categoryCard}>
        <Text style={styles.sectionTitle}>Category *</Text>
        <Text style={styles.helperText}>Select what you're looking for</Text>
        
        <View style={styles.categoryButtons}>
          <TouchableOpacity
            style={[styles.categoryBtn, selectedCategory === 'clothing' && styles.categoryBtnSelected]}
            onPress={() => setSelectedCategory('clothing')}
          >
            <View style={[styles.categoryIcon, selectedCategory === 'clothing' && styles.categoryIconSelected]}>
              <Ionicons name="shirt-outline" size={32} color={selectedCategory === 'clothing' ? Colors.surface : Colors.primary} />
            </View>
            <Text style={[styles.categoryBtnText, selectedCategory === 'clothing' && styles.categoryBtnTextSelected]}>
              Clothing
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.categoryBtn, selectedCategory === 'cosmetics' && styles.categoryBtnSelected]}
            onPress={() => setSelectedCategory('cosmetics')}
          >
            <View style={[styles.categoryIcon, selectedCategory === 'cosmetics' && styles.categoryIconSelected]}>
              <Ionicons name="sparkles-outline" size={32} color={selectedCategory === 'cosmetics' ? Colors.surface : Colors.primary} />
            </View>
            <Text style={[styles.categoryBtnText, selectedCategory === 'cosmetics' && styles.categoryBtnTextSelected]}>
              Cosmetics
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Next Button */}
      <TouchableOpacity
        style={[styles.nextButton, !canProceedStep1 && styles.nextButtonDisabled]}
        onPress={() => canProceedStep1 && setCurrentStep(2)}
        disabled={!canProceedStep1}
      >
        <Text style={styles.nextButtonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
      </TouchableOpacity>
    </ScrollView>
  );

  // ============================================
  // RENDER STEP 2: Category-specific Form
  // ============================================
  const renderStep2Clothing = () => (
    <ScrollView style={styles.stepContainer} contentContainerStyle={styles.stepContent}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep(1)}>
        <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
      
      <Text style={styles.stepTitle}>Clothing Details</Text>
      <Text style={styles.stepSubtitle}>Help sellers find exactly what you need</Text>

      <Card>
        <SelectOption
          label="Item Type *"
          options={CLOTHING_ITEM_TYPES}
          value={clothingForm.itemType}
          onChange={(v) => setClothingForm({...clothingForm, itemType: v})}
        />
        
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Brand *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Nike, Zara, H&M"
            placeholderTextColor={Colors.textMuted}
            value={clothingForm.brand}
            onChangeText={(v) => setClothingForm({...clothingForm, brand: v})}
          />
        </View>

        <SelectOption
          label="Size *"
          options={clothingForm.itemType.toLowerCase().includes('shoe') ? CLOTHING_SIZES_SHOES : 
                   ['jeans', 'shorts', 'skirt'].includes(clothingForm.itemType.toLowerCase()) ? CLOTHING_SIZES_BOTTOMS : 
                   CLOTHING_SIZES_TOPS}
          value={clothingForm.size}
          onChange={(v) => setClothingForm({...clothingForm, size: v})}
        />

        <SelectOption
          label="Condition *"
          options={CLOTHING_CONDITIONS}
          value={clothingForm.condition}
          onChange={(v) => setClothingForm({...clothingForm, condition: v})}
        />

        <SelectOption
          label="Color"
          options={CLOTHING_COLORS}
          value={clothingForm.color}
          onChange={(v) => setClothingForm({...clothingForm, color: v})}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Location & Delivery</Text>
        
        {/* Use Current Location Button */}
        <TouchableOpacity
          style={styles.useLocationButton}
          onPress={() => useCurrentLocation('clothing')}
          disabled={isFetchingLocation}
        >
          {isFetchingLocation ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="navigate" size={20} color={Colors.primary} />
          )}
          <Text style={styles.useLocationText}>
            {isFetchingLocation ? 'Getting location...' : 'Use Current Location'}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>City *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your city"
            placeholderTextColor={Colors.textMuted}
            value={clothingForm.city}
            onChangeText={(v) => setClothingForm({...clothingForm, city: v})}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Country *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your country"
            placeholderTextColor={Colors.textMuted}
            value={clothingForm.country}
            onChangeText={(v) => setClothingForm({...clothingForm, country: v})}
          />
        </View>

        <SelectOption
          label="Delivery Method *"
          options={DELIVERY_METHODS}
          value={clothingForm.deliveryMethod}
          onChange={(v) => setClothingForm({...clothingForm, deliveryMethod: v})}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Budget</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Max Budget (EUR) *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Maximum you're willing to pay"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={clothingForm.maxBudget}
            onChangeText={(v) => setClothingForm({...clothingForm, maxBudget: v})}
          />
        </View>
      </Card>

      <TouchableOpacity
        style={[styles.nextButton, !canProceedStep2() && styles.nextButtonDisabled]}
        onPress={() => canProceedStep2() && setCurrentStep(3)}
        disabled={!canProceedStep2()}
      >
        <Text style={styles.nextButtonText}>Review Request</Text>
        <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep2Cosmetics = () => (
    <ScrollView style={styles.stepContainer} contentContainerStyle={styles.stepContent}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep(1)}>
        <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
      
      <Text style={styles.stepTitle}>Cosmetics Details</Text>
      <Text style={styles.stepSubtitle}>Help sellers find exactly what you need</Text>

      <Card>
        <SelectOption
          label="Product Type *"
          options={COSMETICS_PRODUCT_TYPES}
          value={cosmeticsForm.productType}
          onChange={(v) => setCosmeticsForm({...cosmeticsForm, productType: v})}
        />
        
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Brand *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. MAC, Fenty Beauty, Dior"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticsForm.brand}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, brand: v})}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Exact Product Name *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Studio Fix Fluid Foundation"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticsForm.productName}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, productName: v})}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Shade / Variant *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. NC30, Ruby Woo, Rose"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticsForm.shadeVariant}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, shadeVariant: v})}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Condition</Text>
          <View style={styles.fixedValue}>
            <Text style={styles.fixedValueText}>{cosmeticsForm.condition}</Text>
            <Ionicons name="lock-closed" size={16} color={Colors.textMuted} />
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Authenticity</Text>
          <View style={styles.fixedValue}>
            <Text style={styles.fixedValueText}>{cosmeticsForm.authenticity}</Text>
            <Ionicons name="lock-closed" size={16} color={Colors.textMuted} />
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Location</Text>
        <Text style={styles.helperText}>Shipping only for cosmetics</Text>
        
        {/* Use Current Location Button */}
        <TouchableOpacity
          style={styles.useLocationButton}
          onPress={() => useCurrentLocation('cosmetics')}
          disabled={isFetchingLocation}
        >
          {isFetchingLocation ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="navigate" size={20} color={Colors.primary} />
          )}
          <Text style={styles.useLocationText}>
            {isFetchingLocation ? 'Getting location...' : 'Use Current Location'}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>City *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your city"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticsForm.city}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, city: v})}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Country *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your country"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticsForm.country}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, country: v})}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Budget</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Max Budget (EUR) *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Maximum you're willing to pay"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={cosmeticsForm.maxBudget}
            onChangeText={(v) => setCosmeticsForm({...cosmeticsForm, maxBudget: v})}
          />
        </View>
      </Card>

      <TouchableOpacity
        style={[styles.nextButton, !canProceedStep2() && styles.nextButtonDisabled]}
        onPress={() => canProceedStep2() && setCurrentStep(3)}
        disabled={!canProceedStep2()}
      >
        <Text style={styles.nextButtonText}>Review Request</Text>
        <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
      </TouchableOpacity>
    </ScrollView>
  );

  // ============================================
  // RENDER STEP 3: Review Screen
  // ============================================
  const renderStep3 = () => {
    const form = selectedCategory === 'clothing' ? clothingForm : cosmeticsForm;
    
    return (
      <ScrollView style={styles.stepContainer} contentContainerStyle={styles.stepContent}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep(2)}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          <Text style={styles.backButtonText}>Edit</Text>
        </TouchableOpacity>
        
        <Text style={styles.stepTitle}>Review Your Request</Text>
        <Text style={styles.stepSubtitle}>This is how sellers will see your request</Text>

        {/* Preview Card */}
        <Card style={styles.previewCard}>
          {/* Photo */}
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.previewPhoto} />
          ) : (
            <View style={styles.previewNoPhoto}>
              <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.previewNoPhotoText}>No photo</Text>
            </View>
          )}

          {/* Category Badge */}
          <View style={styles.previewCategoryBadge}>
            <Text style={styles.previewCategoryText}>
              {selectedCategory === 'clothing' ? '👕 Clothing' : '💄 Cosmetics'}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.previewTitle}>{generateTitle()}</Text>

          {/* Details */}
          <View style={styles.previewDetails}>
            {selectedCategory === 'clothing' ? (
              <>
                <DetailRow label="Item Type" value={clothingForm.itemType} />
                <DetailRow label="Brand" value={clothingForm.brand} />
                <DetailRow label="Size" value={clothingForm.size} />
                <DetailRow label="Condition" value={clothingForm.condition} />
                <DetailRow label="Color" value={clothingForm.color} />
                <DetailRow label="Delivery" value={clothingForm.deliveryMethod} />
              </>
            ) : (
              <>
                <DetailRow label="Product Type" value={cosmeticsForm.productType} />
                <DetailRow label="Brand" value={cosmeticsForm.brand} />
                <DetailRow label="Product" value={cosmeticsForm.productName} />
                <DetailRow label="Shade" value={cosmeticsForm.shadeVariant} />
                <DetailRow label="Condition" value={cosmeticsForm.condition} />
              </>
            )}
            <DetailRow label="Location" value={`${form.city}, ${form.country}`} />
          </View>

          {/* Budget */}
          <View style={styles.previewBudget}>
            <Text style={styles.previewBudgetLabel}>Max Budget</Text>
            <Text style={styles.previewBudgetValue}>€{form.maxBudget}</Text>
          </View>
        </Card>

        <Text style={styles.confirmText}>Is everything correct?</Text>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Post Request</Text>
              <Ionicons name="checkmark-circle" size={24} color={Colors.surface} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // Detail row component for review screen
  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Progress Bar */}
      <View style={styles.progressBar}>
        {[1, 2, 3].map((step) => (
          <View key={step} style={styles.progressStep}>
            <View style={[styles.progressDot, currentStep >= step && styles.progressDotActive]} />
            {step < 3 && <View style={[styles.progressLine, currentStep > step && styles.progressLineActive]} />}
          </View>
        ))}
      </View>

      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && selectedCategory === 'clothing' && renderStep2Clothing()}
      {currentStep === 2 && selectedCategory === 'cosmetics' && renderStep2Cosmetics()}
      {currentStep === 3 && renderStep3()}
    </KeyboardAvoidingView>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  progressLine: {
    width: 60,
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  progressLineActive: {
    backgroundColor: Colors.primary,
  },
  stepContainer: {
    flex: 1,
  },
  stepContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  backButtonText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    marginLeft: Spacing.xs,
    fontWeight: FontWeights.medium,
  },
  // Cards
  photoCard: {
    marginBottom: Spacing.lg,
  },
  categoryCard: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  helperText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  useLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}10`,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  useLocationText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  // Photo upload
  photoUploadArea: {
    aspectRatio: 1,
    maxHeight: 200,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}10`,
  },
  photoUploadText: {
    fontSize: FontSizes.md,
    color: Colors.primary,
    marginTop: Spacing.sm,
    fontWeight: FontWeights.medium,
  },
  photoPreviewContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: BorderRadius.xl,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -10,
    right: '25%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
  },
  // Category buttons
  categoryButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  categoryBtn: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}10`,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  categoryIconSelected: {
    backgroundColor: Colors.primary,
  },
  categoryBtnText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
  },
  categoryBtnTextSelected: {
    color: Colors.primary,
  },
  // Form fields
  fieldContainer: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  selectButtonText: {
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  selectPlaceholder: {
    color: Colors.textMuted,
  },
  optionsContainer: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    maxHeight: 200,
    ...Shadows.md,
  },
  optionsScroll: {
    maxHeight: 200,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionItemSelected: {
    backgroundColor: `${Colors.primary}10`,
  },
  optionText: {
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  fixedValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.background,
  },
  fixedValueText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  // Buttons
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.surface,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.surface,
  },
  // Review Screen
  previewCard: {
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  previewPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  previewNoPhoto: {
    width: '100%',
    aspectRatio: 16/9,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  previewNoPhotoText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  previewCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  previewCategoryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
  },
  previewTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  previewDetails: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  detailValue: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
  },
  previewBudget: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: `${Colors.success}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  previewBudgetLabel: {
    fontSize: FontSizes.md,
    color: Colors.success,
    fontWeight: FontWeights.medium,
  },
  previewBudgetValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  confirmText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
});
