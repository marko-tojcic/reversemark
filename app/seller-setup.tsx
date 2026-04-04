import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, FontWeights, BorderRadius } from '../constants/theme';
import { useSellerProfile } from '../lib/useSellerProfile';

const RADIUS_OPTIONS = [25, 50, 100, 200];

function splitList(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function SellerSetupScreen() {
  const router = useRouter();
  const { profileRow, isLoading, upsertProfile, isSaving } = useSellerProfile();

  const [clothing, setClothing] = useState(true);
  const [cosmetics, setCosmetics] = useState(true);
  const [brands, setBrands] = useState('');
  const [clothingSizes, setClothingSizes] = useState('');
  const [cosmeticTypes, setCosmeticTypes] = useState('');
  const [radiusKm, setRadiusKm] = useState(50);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!profileRow) return;
    const cats = profileRow.preferred_categories || [];
    setClothing(cats.some((c) => c.toLowerCase().includes('cloth')));
    setCosmetics(cats.some((c) => c.toLowerCase().includes('cosmetic')));
    setBrands((profileRow.preferred_brands || []).join(', '));
    setClothingSizes((profileRow.clothing_sizes || []).join(', '));
    setCosmeticTypes((profileRow.cosmetic_types || []).join(', '));
    setRadiusKm(profileRow.search_radius_km ?? 50);
    if (profileRow.lat != null && profileRow.lng != null) {
      setLat(profileRow.lat);
      setLng(profileRow.lng);
    }
  }, [profileRow]);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) {
          Alert.alert('Unavailable', 'Geolocation is not supported in this browser.');
          return;
        }
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLat(pos.coords.latitude);
              setLng(pos.coords.longitude);
              resolve();
            },
            reject,
            { enableHighAccuracy: true, timeout: 15000 }
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission', 'Location permission is required for nearby matching.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const onSave = async () => {
    if (!clothing && !cosmetics) {
      Alert.alert('Categories', 'Select at least Clothing or Cosmetics.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Location', 'Use your current location so we can rank nearby requests.');
      return;
    }
    const preferred_categories: string[] = [];
    if (clothing) preferred_categories.push('clothing');
    if (cosmetics) preferred_categories.push('cosmetics');

    try {
      await upsertProfile({
        preferred_categories,
        preferred_brands: splitList(brands),
        clothing_sizes: splitList(clothingSizes),
        cosmetic_types: splitList(cosmeticTypes),
        lat,
        lng,
        search_radius_km: radiusKm,
      });
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Error', (e as Error).message || 'Could not save profile');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>
            Tell us what you can sell and where you operate. This powers ranking on Home and Find.
          </Text>

          <Text style={styles.sectionLabel}>Categories you sell</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.chip, clothing && styles.chipOn]}
              onPress={() => setClothing(!clothing)}
            >
              <Text style={[styles.chipText, clothing && styles.chipTextOn]}>Clothing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, cosmetics && styles.chipOn]}
              onPress={() => setCosmetics(!cosmetics)}
            >
              <Text style={[styles.chipText, cosmetics && styles.chipTextOn]}>Cosmetics</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Brands you carry (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Nike, Zara"
            placeholderTextColor={Colors.textMuted}
            value={brands}
            onChangeText={setBrands}
          />

          <Text style={styles.sectionLabel}>Clothing sizes you stock (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. M, L, EU 42"
            placeholderTextColor={Colors.textMuted}
            value={clothingSizes}
            onChangeText={setClothingSizes}
          />

          <Text style={styles.sectionLabel}>Cosmetic types / shades (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Foundation, Ruby Woo"
            placeholderTextColor={Colors.textMuted}
            value={cosmeticTypes}
            onChangeText={setCosmeticTypes}
          />

          <Text style={styles.sectionLabel}>Search radius (km)</Text>
          <View style={styles.rowWrap}>
            {RADIUS_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, radiusKm === r && styles.chipOn]}
                onPress={() => setRadiusKm(r)}
              >
                <Text style={[styles.chipText, radiusKm === r && styles.chipTextOn]}>{r} km</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Your base location</Text>
          <TouchableOpacity
            style={styles.locBtn}
            onPress={useCurrentLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="location" size={22} color={Colors.primary} />
                <Text style={styles.locBtnText}>Use current location</Text>
              </>
            )}
          </TouchableOpacity>
          {lat != null && lng != null && (
            <Text style={styles.coords}>
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save & continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  lead: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  chipTextOn: {
    color: Colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  locBtnText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  coords: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  saveBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: Colors.surface,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
});
